// Borrador compartido por lead: lo retoma cualquier asesor, desde cualquier equipo.
import { json } from "@sveltejs/kit";
import { guardarBorrador, leerBorrador } from "#lib/server/widget/datos.ts";
import { db, fallo, leadValido, leerJson, MB } from "#lib/server/widget/servicio.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params }) => {
	const id = leadValido(params.lead);
	if (!id) return fallo("Lead inválido", 400);
	const b = await leerBorrador(await db(), id);
	return json({ borrador: b?.datos ?? null, actualizado: b?.actualizado ?? null });
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const id = leadValido(params.lead);
	const datos = await leerJson(request, MB);
	if (!id || !datos || typeof datos !== "object") return fallo("Borrador inválido", 400);
	return json({ actualizado: await guardarBorrador(await db(), id, datos) });
};
