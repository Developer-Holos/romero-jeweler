// Orden de producción: PDF al campo archivo de la pestaña "Orden de producción" (el widget manda su id).
// Si Kommo falla, el PDF se devuelve igual y X-Kommo-Estado lo avisa.
import { ErrorKommo, guardarEnCampo, kommoConfigurado, subirArchivo } from "#lib/server/widget/kommo.ts";
import { htmlAPdf } from "#lib/server/widget/pdf.ts";
import { fallo, leerJson, MB } from "#lib/server/widget/servicio.ts";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
	const { html, lead_id, campo_id, nombre } = (await leerJson<{ html?: unknown; lead_id?: unknown; campo_id?: unknown; nombre?: unknown }>(request, 20 * MB)) ?? {};
	if (typeof html !== "string" || !html.includes("<")) return fallo("Falta el HTML de la orden", 400);
	const archivoNombre = typeof nombre === "string" && /^[\w.-]{1,80}\.pdf$/.test(nombre) ? nombre : "orden.pdf";
	let pdf: Uint8Array;
	try {
		pdf = await htmlAPdf(html);
	} catch (e) {
		console.error("[pdf]", e);
		return fallo("No se pudo generar el PDF", 500);
	}
	let estado = "desactivado";
	let detalle = "";
	if (kommoConfigurado() && Number.isSafeInteger(lead_id) && Number.isSafeInteger(campo_id)) {
		try {
			await guardarEnCampo(lead_id as number, campo_id as number, await subirArchivo(pdf, archivoNombre, "application/pdf"));
			estado = "guardado";
		} catch (e) {
			console.error(`[kommo] orden del lead ${lead_id}:`, e);
			estado = "error";
			detalle = e instanceof ErrorKommo ? `Kommo respondió ${e.status}` : "No se pudo subir a Kommo";
		}
	}
	return new Response(pdf as Uint8Array<ArrayBuffer>, {
		headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${archivoNombre}"`, "X-Kommo-Estado": estado, "X-Kommo-Detalle": detalle },
	});
};
