// Señal del bot de Kommo: "a este lead le toca seguimiento hoy" (?dia=3 o ?dia=7). Responde enseguida y genera el
// mensaje después (OpenAI tarda más de lo que espera Kommo). Una señal repetida el mismo día no envía de nuevo, pero
// sí reintenta un seguimiento que quedó pendiente.
import { json } from "@sveltejs/kit";
import { db, fallo, rechazarWebhookKommo, seguimientoConfig } from "#lib/server/widget/servicio.ts";
import { leadDeLaSenal, procesarSeguimiento, registrarSeguimiento } from "#lib/server/widget/seguimientos.ts";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, url }) => {
	const rechazo = rechazarWebhookKommo(url);
	if (rechazo) return rechazo;
	const lead = leadDeLaSenal(url, await request.text());
	if (!lead) return fallo("Falta el lead (?lead=, lead_id o leads[…][0][id])", 400);
	const dia = Number(url.searchParams.get("dia")) || null;
	const base = await db();
	const { id, estado, nuevo } = await registrarSeguimiento(base, lead, dia);
	console.log(`[seguimientos] señal: lead ${lead} día ${dia ?? "?"} → ${nuevo ? "nuevo" : `ya existía (${estado})`}`);
	if (estado === "pendiente") procesarSeguimiento(base, id, await seguimientoConfig());
	return json({ id, estado }, { status: 202 });
};
