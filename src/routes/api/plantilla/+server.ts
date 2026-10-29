import { json } from "@sveltejs/kit";
import { guardarAjuste, leerAjuste } from "#lib/server/widget/datos.ts";
import { db, fallo, leerJson, MB } from "#lib/server/widget/servicio.ts";
import type { RequestHandler } from "./$types";

const esPlantilla = (dato: unknown): dato is { bloques: unknown[] } =>
	!!dato && typeof dato === "object" && !Array.isArray(dato) && Array.isArray((dato as { bloques?: unknown }).bloques);

export const GET: RequestHandler = async () => json({ plantilla: await leerAjuste(await db(), "plantilla") });

// El logo viaja dentro de la plantilla como data URL; 2 MB alcanza de sobra.
export const PUT: RequestHandler = async ({ request }) => {
	const dato = await leerJson(request, 2 * MB);
	if (!esPlantilla(dato)) return fallo("La plantilla no tiene el formato esperado", 400);
	await guardarAjuste(await db(), "plantilla", dato);
	return json({ ok: true });
};
