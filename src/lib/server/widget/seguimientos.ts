// Seguimientos con IA. Un bot de Kommo avisa (webhook) que a un lead le toca seguimiento (día 3 o 7 en la etapa
// "Seguimiento"); la app arma el contexto (chat guardado, campos del lead y seguimientos anteriores), pide el mensaje
// a OpenAI, lo deja en el campo "[V] - Mensaje Seguimiento" y lanza el Salesbot que lo envía.
//
// Tabla `seguimientos`: una fila por lead, día y fecha (índice único: una señal repetida no envía dos veces). `intentos`
// sube al tomar la fila; con `tomado` ningún otro proceso la toma durante 10 min. Si algo falla queda pendiente con su
// `error` y se reintenta (señal repetida o repaso cada 5 min); a los 5 intentos pasa a `fallido` y se deja una nota en el
// lead. El mensaje generado se guarda en la fila: un reintento no vuelve a gastar OpenAI, y los siguientes seguimientos
// del lead lo ven como "seguimiento anterior".
import { datosRelevantes } from "./contexto-lead.ts";
import type { Db } from "./db.ts";
import { redactarSeguimiento, type ContextoSeguimiento, type SeguimientoPrevio } from "./ia.ts";
import { agregarNota, guardarTexto, lanzarBot, leerLead } from "./kommo.ts";
import { leerConversacion } from "./mensajes.ts";

export type ConfigSeguimiento = { campo: number; bot: number; apiKey?: string; modelo: string };

const MAX_INTENTOS = 5;
const MAX_PREVIOS = 5;
const REPASO = 5 * 60_000;

// El lead va en el formulario del webhook de Kommo: `leads[add][0][id]`, `leads[status][0][id]`…
export function leadDeLaSenal(cuerpo: string): number | null {
	const [, id] = [...new URLSearchParams(cuerpo)].find(([clave]) => /^leads\[\w+\]\[0\]\[id\]$/.test(clave)) ?? [];
	const lead = Number(id);
	return Number.isInteger(lead) && lead > 0 ? lead : null;
}

export async function registrarSeguimiento(db: Db, lead: number, dia: number) {
	const { rows } = await db.query<{ id: number }>("insert into seguimientos (lead_id, dia) values ($1, $2) on conflict (lead_id, dia, fecha) do nothing returning id", [lead, dia]);
	if (rows[0]) return { id: rows[0].id, estado: "pendiente", nuevo: true };
	const { rows: previo } = await db.query<{ id: number; estado: string }>("select id, estado from seguimientos where lead_id = $1 and dia = $2 and fecha = current_date", [lead, dia]);
	return { ...previo[0], nuevo: false };
}

// Los últimos seguimientos (de los últimos 30 días) que ya se enviaron a este lead, del más antiguo al más reciente.
async function seguimientosPrevios(db: Db, lead: number): Promise<SeguimientoPrevio[]> {
	const { rows } = await db.query<SeguimientoPrevio>(
		`select dia, to_char(fecha, 'YYYY-MM-DD') as fecha, mensaje from seguimientos
		 where lead_id = $1 and estado = 'enviado' and mensaje is not null and creado > now() - interval '30 days' order by id desc limit ${MAX_PREVIOS}`,
		[lead],
	);
	return rows.reverse();
}

async function armarContexto(db: Db, lead: number, dia: number): Promise<ContextoSeguimiento> {
	// Los campos del lead son un extra: si Kommo no los da, el seguimiento sale igual con el chat.
	const sinCampos = (e: unknown) => (console.warn(`[seguimientos] lead ${lead}: no se pudieron leer los campos, sigue sin ellos:`, e), { precio: 0, campos: [] });
	const [conversacion, datosLead, previos] = await Promise.all([leerConversacion(db, lead), leerLead(lead).catch(sinCampos), seguimientosPrevios(db, lead)]);
	return { dia, datos: datosRelevantes(datosLead), mensajes: conversacion.mensajes, previos };
}

type Fila = { id: number; lead_id: string; dia: number; intentos: number; mensaje: string | null };

// Nunca lanza: el resultado queda en la fila y en los logs.
export async function procesarSeguimiento(db: Db, id: number, config: ConfigSeguimiento) {
	const { rows } = await db.query<Fila>(
		`update seguimientos set intentos = intentos + 1, tomado = now(), actualizado = now()
		 where id = $1 and estado = 'pendiente' and (tomado is null or tomado < now() - interval '10 minutes')
		 returning id, lead_id, dia, intentos, mensaje`,
		[id],
	);
	const fila = rows[0];
	if (!fila) return; // otro proceso lo tiene, o ya terminó
	const lead = Number(fila.lead_id);
	const etiqueta = `lead ${lead} día ${fila.dia} (intento ${fila.intentos}/${MAX_INTENTOS})`;
	try {
		let mensaje = fila.mensaje;
		if (!mensaje) {
			if (!config.apiKey) throw new Error("OPENAI_API_KEY no está configurada");
			const contexto = await armarContexto(db, lead, fila.dia);
			mensaje = await redactarSeguimiento(contexto, config.modelo, config.apiKey);
			await db.query("update seguimientos set mensaje = $2 where id = $1", [id, mensaje]);
			console.log(`[seguimientos] ${etiqueta}: mensaje generado (${contexto.mensajes.length} mensajes del chat, ${contexto.previos.length} seguimientos previos, campos del lead: ${contexto.datos.map((d) => d.nombre).join(", ") || "ninguno"})`);
		}
		await guardarTexto(lead, config.campo, mensaje);
		await lanzarBot(config.bot, lead);
		await db.query("update seguimientos set estado = 'enviado', error = null, tomado = null, actualizado = now() where id = $1", [id]);
		console.log(`[seguimientos] ${etiqueta}: enviado`);
	} catch (e) {
		const error = e instanceof Error ? e.message : String(e);
		const fallido = fila.intentos >= MAX_INTENTOS;
		await db.query("update seguimientos set estado = $2, error = $3, tomado = null, actualizado = now() where id = $1", [id, fallido ? "fallido" : "pendiente", error.slice(0, 500)]).catch(() => {});
		console.error(`[seguimientos] ${etiqueta}: ${fallido ? "se rindió" : "falló, se reintenta"}:`, e);
		if (fallido) await agregarNota(lead, `No se pudo enviar el seguimiento del día ${fila.dia}: ${error.slice(0, 200)}`).catch((n) => console.error(`[seguimientos] ${etiqueta}: tampoco se pudo dejar la nota:`, n));
	}
}

async function reintentarPendientes(db: Db, config: () => Promise<ConfigSeguimiento>) {
	const { rows } = await db.query<{ id: number }>("select id from seguimientos where estado = 'pendiente' and creado > now() - interval '48 hours' order by id");
	if (rows.length) console.log(`[seguimientos] repaso: ${rows.length} pendientes`);
	for (const r of rows) await procesarSeguimiento(db, r.id, await config());
}

// Repaso periódico: recoge lo que quedó a medias (reinicio, Kommo u OpenAI caídos).
export function iniciarSeguimientos(db: Db, config: () => Promise<ConfigSeguimiento>) {
	setInterval(() => reintentarPendientes(db, config).catch((e) => console.error("[seguimientos] repaso:", e)), REPASO).unref();
}
