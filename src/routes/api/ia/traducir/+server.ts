// Nombres de los campos de la orden (y, si se pide, sus valores) al idioma del documento.
import { json } from "@sveltejs/kit";
import { traducir } from "#lib/server/widget/ia.ts";
import { log } from "#lib/server/widget/log.ts";
import { env, fallo, leerJson, modeloIa } from "#lib/server/widget/servicio.ts";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
	const { idioma, textos } = (await leerJson<{ idioma?: unknown; textos?: unknown }>(request, 64 * 1024)) ?? {};
	if ((idioma !== "es" && idioma !== "en") || !Array.isArray(textos) || textos.length > 200 || !textos.every((t) => typeof t === "string")) return fallo("Pedido de traducción inválido", 400);
	// Sin IA (o si falla) los textos vuelven tal cual: la orden sale igual.
	if (!env.OPENAI_API_KEY || !textos.length) return json({ textos });
	try {
		return json({ textos: await traducir(idioma, textos, await modeloIa(), env.OPENAI_API_KEY) });
	} catch (e) {
		log("error", "ia", { operacion: "traducir", error: e });
		return json({ textos });
	}
};
