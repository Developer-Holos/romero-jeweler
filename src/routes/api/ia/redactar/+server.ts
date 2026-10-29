import { json } from "@sveltejs/kit";
import { redactar, type PedidoRedaccion } from "#lib/server/widget/ia.ts";
import { env, fallo, leerJson, modeloIa } from "#lib/server/widget/servicio.ts";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
	if (!env.OPENAI_API_KEY) return fallo("La IA no está configurada en el servidor", 503);
	const p = await leerJson<PedidoRedaccion>(request, 256 * 1024);
	if (!p || !Array.isArray(p.vinetas) || !Array.isArray(p.clausulas) || (p.idioma !== "es" && p.idioma !== "en")) return fallo("Pedido de redacción inválido", 400);
	try {
		return json(await redactar(p, await modeloIa(), env.OPENAI_API_KEY));
	} catch (e) {
		console.error("[ia]", e);
		return fallo("La IA no respondió", 502);
	}
};
