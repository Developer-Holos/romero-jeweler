// Imágenes de referencia: viven en Kommo, en la pestaña "Imágenes de la pieza" del lead. El widget elige (o crea)
// el campo libre y lo manda en X-Campo-Imagen; sin él, la imagen se adjunta al lead.
import { json } from "@sveltejs/kit";
import { adjuntarALead, guardarEnCampo, imagenesDelLead, kommoConfigurado, subirArchivo } from "#lib/server/widget/kommo.ts";
import { fallo, leadValido, MB } from "#lib/server/widget/servicio.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params }) => {
	const id = leadValido(params.lead);
	if (!id) return fallo("Lead inválido", 400);
	if (!kommoConfigurado()) return fallo("Kommo no está configurado en el servidor", 503);
	try {
		return json({ imagenes: await imagenesDelLead(id) });
	} catch (e) {
		console.error("[kommo]", e);
		return fallo("Kommo no respondió", 502);
	}
};

export const POST: RequestHandler = async ({ params, request }) => {
	const id = leadValido(params.lead);
	const tipo = request.headers.get("Content-Type") ?? "";
	const nombre = decodeURIComponent(request.headers.get("X-Nombre-Archivo") ?? "imagen").replace(/[^\w. -]/g, "_").slice(0, 100) || "imagen";
	if (!id || !tipo.startsWith("image/")) return fallo("Manda una imagen", 400);
	if (Number(request.headers.get("content-length")) > 15 * MB) return fallo("La imagen pesa más de 15 MB", 413);
	if (!kommoConfigurado()) return fallo("Kommo no está configurado en el servidor", 503);
	try {
		const archivo = await subirArchivo(new Uint8Array(await request.arrayBuffer()), nombre, tipo);
		const campo = Number(request.headers.get("X-Campo-Imagen")) || null;
		if (campo) await guardarEnCampo(id, campo, archivo);
		else await adjuntarALead(id, archivo.uuid);
		return json({ uuid: archivo.uuid, nombre, campo });
	} catch (e) {
		console.error("[kommo]", e);
		return fallo("Kommo no respondió", 502);
	}
};
