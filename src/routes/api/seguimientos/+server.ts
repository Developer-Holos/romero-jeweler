// Señal del bot de Kommo: "a este lead le toca seguimiento hoy". El lead va en el formulario del webhook y el día en la
// URL (?dia=3, ?dia=7). Responde enseguida y genera el mensaje después (OpenAI tarda más de lo que espera Kommo). Una
// señal repetida el mismo día no envía de nuevo, pero sí reintenta un seguimiento que quedó pendiente.
import { json } from "@sveltejs/kit";
import { db, fallo, seguimientoConfig } from "#lib/server/widget/servicio.ts";
import { leadDeLaSenal, procesarSeguimiento, registrarSeguimiento } from "#lib/server/widget/seguimientos.ts";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, url }) => {
	const dia = Number(url.searchParams.get("dia"));
	if (!Number.isInteger(dia) || dia <= 0) return fallo("Falta el día del seguimiento (?dia=3)", 400);
	const lead = leadDeLaSenal(await request.text());
	if (!lead) return fallo("El webhook no trae el lead (leads[…][0][id])", 400);
	const base = await db();
	const { id, estado, nuevo } = await registrarSeguimiento(base, lead, dia);
	console.log(`[seguimientos] señal: lead ${lead} día ${dia} → ${nuevo ? "nuevo" : `ya existía (${estado})`}`);
	if (estado === "pendiente") procesarSeguimiento(base, id, await seguimientoConfig()).catch((e) => console.error(`[seguimientos] lead ${lead}:`, e));
	return json({ id, estado }, { status: 202 });
};
