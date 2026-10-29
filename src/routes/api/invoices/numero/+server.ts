// El número se pide antes de armar el PDF, porque va impreso en él.
import { json } from "@sveltejs/kit";
import { asignarNumero } from "#lib/server/widget/datos.ts";
import { db, fallo, leerJson } from "#lib/server/widget/servicio.ts";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
	const { lead_id } = (await leerJson<{ lead_id?: unknown }>(request, 1024)) ?? {};
	if (typeof lead_id !== "number" || !Number.isSafeInteger(lead_id) || lead_id < 1) return fallo("Lead inválido", 400);
	return json({ numero: await asignarNumero(await db(), lead_id) });
};
