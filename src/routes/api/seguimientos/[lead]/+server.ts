// Para depurar un lead: el chat guardado y los seguimientos que tiene. Son conversaciones de clientes: pide la clave de
// Kommo (?clave=) aunque WIDGET_KEY no esté definida.
import { json } from "@sveltejs/kit";
import { leerConversacion } from "#lib/server/widget/mensajes.ts";
import { db, fallo, leadValido, rechazarWebhookKommo } from "#lib/server/widget/servicio.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, url }) => {
	const rechazo = rechazarWebhookKommo(url);
	if (rechazo) return rechazo;
	const lead = leadValido(params.lead);
	if (!lead) return fallo("Lead inválido", 400);
	const base = await db();
	const { mensajes, bytes } = await leerConversacion(base, lead);
	const { rows } = await base.query("select id, dia, fecha, estado, intentos, error, mensaje, creado from seguimientos where lead_id = $1 order by id desc limit 20", [lead]);
	return json({ lead, chat: { mensajes: mensajes.length, bytes, ultimos: mensajes.slice(-10) }, seguimientos: rows });
};
