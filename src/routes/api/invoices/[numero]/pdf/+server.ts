// PDF del invoice: se genera, se registra y se guarda en el campo "Invoice" del lead. Si Kommo falla,
// el PDF se devuelve igual (para descargarlo) y X-Kommo-Estado lo avisa.
import { buscarInvoice, marcarSubidoAKommo, registrarInvoice } from "#lib/server/widget/datos.ts";
import { ErrorKommo, guardarEnCampo, kommoConfigurado, subirArchivo } from "#lib/server/widget/kommo.ts";
import { htmlAPdf } from "#lib/server/widget/pdf.ts";
import { log } from "#lib/server/widget/log.ts";
import { db, env, fallo, leerJson, MB } from "#lib/server/widget/servicio.ts";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ params, request }) => {
	const base = await db();
	const inv = await buscarInvoice(base, params.numero);
	if (!inv) return fallo("Ese número de invoice no existe", 404);
	const { html, total, datos, campo_id } = (await leerJson<{ html?: unknown; total?: unknown; datos?: unknown; campo_id?: unknown }>(request, 20 * MB)) ?? {};
	// El campo "Invoice" de la pestaña "Orden" lo indica el widget; KOMMO_CAMPO_INVOICE queda de respaldo.
	const delWidget = Number.isSafeInteger(campo_id) && (campo_id as number) > 0;
	const campo = delWidget ? (campo_id as number) : env.KOMMO_CAMPO_INVOICE;
	const contexto = { numero: inv.numero, lead: Number(inv.lead_id), campo, origen_campo: delWidget ? "widget" : "env", campo_recibido: campo_id ?? null };
	if (typeof html !== "string" || !html.includes("<")) return fallo("Falta el HTML del invoice", 400);

	let pdf: Uint8Array;
	try {
		pdf = await htmlAPdf(html);
	} catch (e) {
		log("error", "pdf", { ...contexto, tipo: "invoice", error: e });
		return fallo("No se pudo generar el PDF", 500);
	}
	await registrarInvoice(base, inv.numero, { total: Number(total) || 0, datos: datos ?? null });

	let estado = "desactivado";
	let detalle = "";
	if (kommoConfigurado() && campo) {
		try {
			const archivo = await subirArchivo(pdf, `${inv.numero}.pdf`, "application/pdf");
			await guardarEnCampo(Number(inv.lead_id), campo, archivo);
			await marcarSubidoAKommo(base, inv.numero, archivo.uuid);
			estado = "guardado";
			log("info", "invoice", { ...contexto, estado, bytes_pdf: pdf.length });
		} catch (e) {
			log("error", "invoice", { ...contexto, estado: "error", bytes_pdf: pdf.length, error: e });
			estado = "error";
			detalle = e instanceof ErrorKommo ? e.aviso : "No se pudo subir a Kommo";
		}
	}
	if (estado === "desactivado") log("warn", "invoice", { ...contexto, estado, motivo: kommoConfigurado() ? "sin campo Invoice (ni campo_id ni KOMMO_CAMPO_INVOICE)" : "Kommo no configurado" });
	return new Response(pdf as Uint8Array<ArrayBuffer>, {
		headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${inv.numero}.pdf"`, "X-Kommo-Estado": estado, "X-Kommo-Detalle": detalle },
	});
};
