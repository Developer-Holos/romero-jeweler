// Invoice "sin datos del cliente" (cotización): PDF sin número, no se registra ni va a Kommo.
import { htmlAPdf } from "#lib/server/widget/pdf.ts";
import { fallo, leerJson, MB } from "#lib/server/widget/servicio.ts";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
	const { html } = (await leerJson<{ html?: unknown }>(request, 20 * MB)) ?? {};
	if (typeof html !== "string" || !html.includes("<")) return fallo("Falta el HTML del invoice", 400);
	try {
		return new Response((await htmlAPdf(html)) as Uint8Array<ArrayBuffer>, { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="cotizacion.pdf"' } });
	} catch (e) {
		console.error("[pdf]", e);
		return fallo("No se pudo generar el PDF", 500);
	}
};
