// Webhook de Kommo: cada mensaje del chat (del cliente y del asesor) se guarda comprimido para los seguimientos.
// Lo llama Kommo, no el navegador: lo protege la clave de la URL (?clave=…), no X-Widget-Key.
import { db, fallo, rechazarWebhookKommo } from "#lib/server/widget/servicio.ts";
import { guardarMensajes, leerMensajesKommo } from "#lib/server/widget/mensajes.ts";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, url }) => {
	const rechazo = rechazarWebhookKommo(url);
	if (rechazo) return rechazo;
	const mensajes = leerMensajesKommo(await request.text());
	try {
		await guardarMensajes(await db(), mensajes);
	} catch (e) {
		// 500: Kommo reintenta el webhook y los ids repetidos no se duplican.
		console.error("[mensajes] no se pudieron guardar:", e);
		return fallo("No se pudieron guardar los mensajes", 500);
	}
	return new Response(null, { status: 200 });
};
