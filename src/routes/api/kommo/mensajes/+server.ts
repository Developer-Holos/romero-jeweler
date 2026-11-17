// Webhook de Kommo: cada mensaje del chat (del cliente y del asesor) se guarda comprimido para los seguimientos.
import { db, fallo } from "#lib/server/widget/servicio.ts";
import { log } from "#lib/server/widget/log.ts";
import { guardarMensajes, leerMensajesKommo } from "#lib/server/widget/mensajes.ts";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
	const mensajes = leerMensajesKommo(await request.text());
	try {
		await guardarMensajes(await db(), mensajes);
	} catch (e) {
		// 500: Kommo reintenta el webhook y los ids repetidos no se duplican.
		log("error", "mensajes", { motivo: "no se pudieron guardar", error: e });
		return fallo("No se pudieron guardar los mensajes", 500);
	}
	return new Response(null, { status: 200 });
};
