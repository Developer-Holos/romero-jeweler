// Mensajes del chat de cada lead, para que la IA escriba los seguimientos. Kommo los manda por webhook (formulario); se
// guardan en UNA fila por lead, como JSON compacto comprimido con brotli. Comprimir cada mensaje por separado no sirve
// (un texto corto crece); toda la conversación junta ocupa mucho menos.
import { promisify } from "node:util";
import { brotliCompress, brotliCompressSync, brotliDecompress, constants } from "node:zlib";
import type { Db } from "./db.ts";

// [fecha en segundos, "c" (cliente) | "a" (asesor), texto, id del mensaje en Kommo]
type Entrada = [number, "c" | "a", string, string];
export type Mensaje = { id: string; lead: number; cliente: boolean; texto: string; fecha: number };

const MAX_MENSAJES = 200; // los más recientes de cada lead
const MAX_TEXTO = 2000;

// Asíncrono (hilos de Node, no el principal): con muchos clientes escribiendo a la vez el servidor sigue respondiendo.
// Calidad 5 en vez de la 11 por defecto: comprime varias veces más rápido y el tamaño casi no cambia.
const brotliAsync = promisify(brotliCompress);
const desbrotliAsync = promisify(brotliDecompress);
const comprimir = (e: Entrada[]) => brotliAsync(JSON.stringify(e), { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } });
const descomprimir = async (datos: Uint8Array) => JSON.parse((await desbrotliAsync(datos)).toString()) as Entrada[];
// Para crear la fila si no existe (una vez, al cargar el módulo: son 5 bytes).
const CONVERSACION_VACIA = brotliCompressSync("[]");

// Kommo manda `message[add][0][text]=…&message[add][0][entity_id]=…`. Solo cuentan los mensajes de un lead; un adjunto
// sin texto queda como "[imagen]", "[audio]"…
export function leerMensajesKommo(cuerpo: string): Mensaje[] {
	const campos = new Map<string, Record<string, string>>();
	for (const [clave, valor] of new URLSearchParams(cuerpo)) {
		const m = clave.match(/^message\[add\]\[(\d+)\]\[(.+)\]$/);
		if (m) campos.set(m[1], { ...campos.get(m[1]), [m[2].replace(/\]\[/g, ".")]: valor });
	}
	const mensajes: Mensaje[] = [];
	for (const c of campos.values()) {
		const lead = Number(c.entity_id ?? c.element_id);
		const esLead = c.entity_type === "lead" || c.element_type === "2";
		if (!c.id || !esLead || !Number.isInteger(lead) || lead <= 0) continue;
		const texto = (c.text?.trim() || (c["attachment.type"] ? `[${c["attachment.type"]}]` : "")).slice(0, MAX_TEXTO);
		if (!texto) continue;
		mensajes.push({ id: c.id, lead, cliente: c.type !== "outgoing", texto, fecha: Number(c.created_at) || Math.floor(Date.now() / 1000) });
	}
	return mensajes;
}

// Agrega los mensajes a la conversación de su lead sin repetir ids (Kommo reintenta los webhooks). El `for update`
// evita que dos webhooks del mismo lead, a la vez, se pisen.
export async function guardarMensajes(db: Db, mensajes: Mensaje[]) {
	const porLead = Map.groupBy(mensajes, (m) => m.lead);
	for (const [lead, nuevos] of porLead) {
		const { total, bytes, agregados } = await db.transaccion(async (tx) => {
			await tx.query("insert into conversaciones (lead_id, datos) values ($1, $2) on conflict (lead_id) do nothing", [lead, CONVERSACION_VACIA]);
			const { rows } = await tx.query<{ datos: Uint8Array }>("select datos from conversaciones where lead_id = $1 for update", [lead]);
			const actual = await descomprimir(rows[0].datos);
			const vistos = new Set(actual.map((e) => e[3]));
			const sumar = nuevos.filter((m) => !vistos.has(m.id));
			const todo = [...actual, ...sumar.map((m): Entrada => [m.fecha, m.cliente ? "c" : "a", m.texto, m.id])].sort((a, b) => a[0] - b[0]).slice(-MAX_MENSAJES);
			const datos = await comprimir(todo);
			await tx.query("update conversaciones set datos = $2, cantidad = $3, actualizado = now() where lead_id = $1", [lead, datos, todo.length]);
			return { total: todo.length, bytes: datos.length, agregados: sumar.length };
		});
		console.log(`[mensajes] lead ${lead}: +${agregados} (total ${total}, ${bytes} bytes)`);
	}
}

export async function leerConversacion(db: Db, lead: number) {
	const { rows } = await db.query<{ datos: Uint8Array; actualizado: Date }>("select datos, actualizado from conversaciones where lead_id = $1", [lead]);
	if (!rows[0]) return { mensajes: [] as Mensaje[], bytes: 0 };
	const datos = Buffer.from(rows[0].datos);
	return { mensajes: (await descomprimir(datos)).map(([fecha, quien, texto, id]): Mensaje => ({ fecha, cliente: quien === "c", texto, id, lead })), bytes: datos.length };
}
