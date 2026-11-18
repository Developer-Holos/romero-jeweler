// Video del cliente: cuando en Dropbox aparece `<orden>/Origen/<orden>_completo.mp4`, el lead con ese "Order #" recibe el
// link de la carpeta `Origen` (puede haber varios formatos; `Clip` y el resto de la orden son privados) en "Video (link)",
// una nota y el Salesbot que se lo manda.
// Se avisa con el primer `_completo`. Lo dispara el webhook, un repaso cada 10 min o POST /api/videos/:orden.
//
// Tabla `videos`: `avisado` se marca de forma atómica ANTES de lanzar el bot (dos réplicas nunca lo mandan dos veces) y
// se desmarca si algo falla. Una fila con `carpeta` y sin `avisado` es un aviso pendiente y se reintenta 30 días.
import { guardarAjuste, leerAjuste } from "./datos.ts";
import type { Db } from "./db.ts";
import { log } from "./log.ts";
import { carpetaDe, raizConfigurada, cursorInicial, linkCompartido, videoDeOrden, videosNuevos, type ArchivoDropbox } from "./dropbox.ts";
import { agregarNota, CAMPO_VIDEO, campoPorNombre, guardarTexto, lanzarBot, leadsPorOrden } from "./kommo.ts";

export const ordenValida = (orden: string) => /^[A-Za-z0-9_-]{1,40}$/.test(orden);

type Registro = { orden: string; lead_id: string | null; carpeta: string | null; link: string | null; avisado: Date | null; leads_notados: string | null };

export async function registroVideo(db: Db, orden: string) {
	const { rows } = await db.query<Registro>("select orden, lead_id, carpeta, link, avisado, leads_notados from videos where orden = $1", [orden.toLowerCase()]);
	return rows[0] ?? null;
}

// Deja el aviso pendiente (para reintentarlo) sin tocar una orden que ya se avisó.
async function guardarPendiente(db: Db, orden: string, carpeta: string, leadsNotados?: string) {
	await db.query(
		`insert into videos (orden, carpeta, leads_notados) values ($1, $2, $3)
		 on conflict (orden) do update set carpeta = excluded.carpeta, leads_notados = coalesce(excluded.leads_notados, videos.leads_notados), actualizado = now()
		 where videos.avisado is null`,
		[orden.toLowerCase(), carpeta, leadsNotados ?? null],
	);
}

// true si esta llamada se quedó con el envío; false si otra ya lo había hecho.
async function reclamar(db: Db, orden: string, lead: number, carpeta: string, link: string) {
	const { rows } = await db.query(
		`insert into videos (orden, lead_id, carpeta, link, avisado) values ($1, $2, $3, $4, now())
		 on conflict (orden) do update set lead_id = excluded.lead_id, carpeta = excluded.carpeta, link = excluded.link, avisado = now(), actualizado = now()
		 where videos.avisado is null
		 returning orden`,
		[orden.toLowerCase(), lead, carpeta, link],
	);
	return rows.length > 0;
}

export type Resultado =
	| { estado: "avisado"; lead: number; link: string; bot: boolean }
	| { estado: "ya_avisado"; lead: number | null; link: string | null; avisado: Date | null }
	| { estado: "sin_video"; carpeta: string | null }
	| { estado: "sin_lead" | "varios_leads"; leads: number[]; link: null }
	| { estado: "ignorado"; leads: number[]; servicio: string };

const yaAvisado = (r: Registro | null): Resultado => ({ estado: "ya_avisado", lead: r?.lead_id ? Number(r.lead_id) : null, link: r?.link ?? null, avisado: r?.avisado ?? null });

export async function revisarVideo(db: Db, orden: string, opciones: { archivo?: ArchivoDropbox; botId?: number } = {}): Promise<Resultado> {
	const previo = await registroVideo(db, orden);
	if (previo?.avisado) return yaAvisado(previo);

	// Con la carpeta ya guardada (un pendiente) no se vuelve a buscar por nombre.
	const { carpeta, videos } = opciones.archivo ? { carpeta: carpetaDe(opciones.archivo), videos: [opciones.archivo] } : await videoDeOrden(orden, previo?.carpeta);
	if (!videos.length || !carpeta) return { estado: "sin_video", carpeta };

	try {
		const { leads, ignorados } = await leadsPorOrden(orden);
		if (!leads.length && ignorados.length) {
			// El lead de Producción no es del servicio Origen: no se avisa, no se deja nota ni pendiente y se detiene todo.
			const servicio = ignorados.map((i) => i.servicio || "(vacío)").join(", ");
			log(ignorados.some((i) => !i.servicio) ? "warn" : "info", "videos", { orden, aviso: `ignorada: el lead de Producción no es del servicio Origen (${servicio})`, leads: ignorados.map((i) => i.id) });
			await db.query("update videos set carpeta = null, actualizado = now() where orden = $1 and avisado is null", [orden.toLowerCase()]);
			return { estado: "ignorado", leads: ignorados.map((i) => i.id), servicio };
		}
		if (leads.length !== 1) {
			// Sin lead: queda pendiente hasta que alguien llene el Order #. Con varios no se adivina: se avisa en cada uno,
			// una sola vez por cada combinación de leads, para que lo resuelva un asesor.
			const ids = [...leads].sort((a, b) => a - b).join(",");
			if (leads.length > 1 && previo?.leads_notados !== ids)
				for (const lead of leads) await agregarNota(lead, `El video de la orden ${orden} está listo en Dropbox, pero hay ${leads.length} leads de Producción con ese Order #. No se envió.`);
			else if (!leads.length) log("warn", "videos", { orden, aviso: "el video está listo, pero ningún lead del embudo Producción tiene ese Order # (se reintenta)" });
			await guardarPendiente(db, orden, carpeta, leads.length > 1 ? ids : undefined);
			return { estado: leads.length ? "varios_leads" : "sin_lead", leads, link: null };
		}

		const [lead] = leads;
		// Se comparte `<orden>/Origen`, no el archivo (a veces hay varios formatos) ni la carpeta de la orden (tiene `Clip`).
		const link = await linkCompartido(carpeta);
		if (!(await reclamar(db, orden, lead, carpeta, link))) return yaAvisado(await registroVideo(db, orden));
		try {
			const campo = await campoPorNombre(CAMPO_VIDEO);
			if (campo) await guardarTexto(lead, campo.id, link);
			await agregarNota(lead, `Videos de la orden ${orden} listos: ${link}${opciones.botId ? "" : " (no hay Salesbot configurado: enviarlo a mano)"}`);
			if (opciones.botId) await lanzarBot(opciones.botId, lead);
		} catch (e) {
			// El bot no salió: se desmarca para reintentarlo. Si esto también falla, gana no mandarlo dos veces.
			await db.query("update videos set avisado = null where orden = $1", [orden.toLowerCase()]).catch(() => {});
			throw e;
		}
		return { estado: "avisado", lead, link, bot: !!opciones.botId };
	} catch (e) {
		await guardarPendiente(db, orden, carpeta).catch(() => {});
		throw e;
	}
}

// Si se borra o se mueve la carpeta de una orden ya enviada, el link del lead deja de abrir: se deja una nota. Un aviso
// pendiente cuya carpeta desapareció deja de reintentarse. (Borrar un solo video no rompe el link.)
async function carpetaBorrada(db: Db, ruta: string) {
	const { rows } = await db.query<Registro>(
		"select orden, lead_id, avisado from videos where carpeta is not null and (lower(carpeta) = $1 or left(lower(carpeta), length($1) + 1) = $1 || '/')",
		[ruta],
	);
	for (const r of rows) {
		if (r.avisado && r.lead_id) await agregarNota(Number(r.lead_id), `La carpeta de la orden ${r.orden} se borró o se movió en Dropbox: el link que se envió puede dejar de funcionar.`);
		await db.query("update videos set carpeta = null, actualizado = now() where orden = $1", [r.orden]);
	}
}

async function reintentarPendientes(db: Db, botId: number | undefined, hechas: Set<string>) {
	const { rows } = await db.query<{ orden: string }>(
		"select orden from videos where avisado is null and carpeta is not null and creado > now() - interval '30 days'",
	);
	for (const r of rows) {
		if (hechas.has(r.orden)) continue;
		try {
			const res = await revisarVideo(db, r.orden, { botId });
			// Sin carpeta ya no hay nada que enviar: deja de reintentarse.
			if (res.estado === "sin_video" && !res.carpeta) await db.query("update videos set carpeta = null, actualizado = now() where orden = $1 and avisado is null", [r.orden]);
		} catch (e) {
			log("error", "videos", { orden: r.orden, aviso: "falló el reintento", error: e });
		}
	}
}

// Los cambios de Dropbox desde el último cursor: avisa los videos nuevos y guarda el cursor nuevo. `hechas` recibe las órdenes
// ya revisadas, para que los pendientes no las repitan en la misma pasada.
async function aplicarCambios(db: Db, botId: number | undefined, hechas: Set<string>) {
	const cursor = await leerAjuste<string>(db, "dropbox_cursor");
	if (!cursor) {
		// No se creó al arrancar (Dropbox no respondió): lo que cambió antes de ahora no se ve.
		log("warn", "videos_cursor", { aviso: "no había cursor de Dropbox: se crea ahora" });
		await guardarAjuste(db, "dropbox_cursor", await cursorInicial());
		return;
	}
	const { videos, borrados, cursor: nuevo } = await videosNuevos(cursor);
	for (const ruta of borrados) await carpetaBorrada(db, ruta).catch((e) => log("error", "videos", { ruta, aviso: "falló al registrar el borrado", error: e }));
	for (const v of videos) {
		hechas.add(v.orden.toLowerCase());
		// Si falla, revisarVideo lo deja pendiente: el cursor puede avanzar sin perderlo.
		await revisarVideo(db, v.orden, { archivo: v.archivo, botId }).catch((e) => log("error", "videos", { orden: v.orden, error: e }));
	}
	await guardarAjuste(db, "dropbox_cursor", nuevo);
}

// Una pasada: los cambios desde el último cursor y después los avisos pendientes. Una sola a la vez en este proceso;
// entre réplicas lo cuida `reclamar`. Si leer los cambios falla (Dropbox caído, raíz inexistente…), los pendientes se
// reintentan igual, se atienden los avisos que llegaron mientras tanto y el error de la última pasada se lanza al final.
let procesando: Promise<void> | null = null;
let otraVez = false;
export function procesarCambios(db: Db, botId?: number): Promise<void> {
	if (procesando) {
		otraVez = true; // llegó otro aviso mientras tanto: una pasada más al terminar
		return procesando;
	}
	procesando = (async () => {
		let falloCambios: unknown;
		do {
			otraVez = false;
			falloCambios = undefined;
			const hechas = new Set<string>();
			await aplicarCambios(db, botId, hechas).catch((e) => (falloCambios = e));
			await reintentarPendientes(db, botId, hechas);
		} while (otraVez);
		if (falloCambios) throw falloCambios;
	})().finally(() => (procesando = null));
	return procesando;
}

// Al arrancar: el cursor desde ahora (para que el primer video subido ya cuente) y el repaso periódico, que reintenta
// los pendientes aunque Dropbox no avise (p. ej. cuando un asesor llena el Order # después).
const REPASO = 10 * 60_000;
export async function iniciarVideos(db: Db, botId?: number) {
	setInterval(() => procesarCambios(db, botId).catch((e) => log("error", "videos_repaso", { error: e })), REPASO).unref();
	const cursor = await leerAjuste<string>(db, "dropbox_cursor");
	log("info", "videos_inicio", { raiz: raizConfigurada() || "(todo Dropbox)", cursor: cursor ? `${cursor.slice(0, 8)}…` : "(no había)" });
	if (!cursor) await guardarAjuste(db, "dropbox_cursor", await cursorInicial());
}
