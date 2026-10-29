// PDF del invoice: se genera, se registra y se guarda en el campo "Invoice" del lead. Si Kommo falla,
// el PDF se devuelve igual (para descargarlo) y X-Kommo-Estado lo avisa.
import { buscarInvoice, marcarSubidoAKommo, registrarInvoice } from "#lib/server/widget/datos.ts";
import { ErrorKommo, guardarEnCampo, kommoConfigurado, subirArchivo } from "#lib/server/widget/kommo.ts";
import { htmlAPdf } from "#lib/server/widget/pdf.ts";
import { db, env, fallo, leerJson, MB } from "#lib/server/widget/servicio.ts";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ params, request }) => {
	const base = await db();
	const inv = await buscarInvoice(base, params.numero);
	if (!inv) return fallo("Ese número de invoice no existe", 404);
	const { html, total, datos } = (await leerJson<{ html?: unknown; total?: unknown; datos?: unknown }>(request, 20 * MB)) ?? {};
	if (typeof html !== "string" || !html.includes("<")) return fallo("Falta el HTML del invoice", 400);

	let pdf: Uint8Array;
	try {
		pdf = await htmlAPdf(html);
	} catch (e) {
		console.error("[pdf]", e);
		return fallo("No se pudo generar el PDF", 500);
	}
	await registrarInvoice(base, inv.numero, { total: Number(total) || 0, datos: datos ?? null });

	let estado = "desactivado";
	let detalle = "";
	if (kommoConfigurado() && env.KOMMO_CAMPO_INVOICE) {
		try {
			const archivo = await subirArchivo(pdf, `${inv.numero}.pdf`, "application/pdf");
			await guardarEnCampo(Number(inv.lead_id), env.KOMMO_CAMPO_INVOICE, archivo);
			await marcarSubidoAKommo(base, inv.numero, archivo.uuid);
			estado = "guardado";
		} catch (e) {
			console.error(`[kommo] invoice ${inv.numero}:`, e);
			estado = "error";
			detalle = e instanceof ErrorKommo ? e.aviso : "No se pudo subir a Kommo";
		}
	}
	return new Response(pdf as Uint8Array<ArrayBuffer>, {
		headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${inv.numero}.pdf"`, "X-Kommo-Estado": estado, "X-Kommo-Detalle": detalle },
	});
};
