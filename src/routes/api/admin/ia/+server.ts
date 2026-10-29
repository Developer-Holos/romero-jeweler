// Holos: cambiar el modelo de IA sin redesplegar. Pide ADMIN_KEY, que nunca va al widget.
// curl -X PUT -H "X-Admin-Key: …" -H "Content-Type: application/json" -d '{"modelo":"gpt-5-mini"}' https://…/api/admin/ia
import { json } from "@sveltejs/kit";
import { guardarAjuste } from "#lib/server/widget/datos.ts";
import { db, env, fallo, iguales, leerJson, modeloIa } from "#lib/server/widget/servicio.ts";
import type { RequestHandler } from "./$types";

const autorizado = (request: Request) => !!env.ADMIN_KEY && iguales(request.headers.get("X-Admin-Key"), env.ADMIN_KEY);

export const GET: RequestHandler = async ({ request }) => {
	if (!autorizado(request)) return fallo("Clave de administración inválida", 401);
	return json({ modelo: await modeloIa(), porDefecto: env.OPENAI_MODEL, activa: !!env.OPENAI_API_KEY });
};

export const PUT: RequestHandler = async ({ request }) => {
	if (!autorizado(request)) return fallo("Clave de administración inválida", 401);
	const { modelo } = (await leerJson<{ modelo?: unknown }>(request, 1024)) ?? {};
	if (typeof modelo !== "string" || !/^[\w.:-]{2,80}$/.test(modelo)) return fallo("Modelo inválido", 400);
	await guardarAjuste(await db(), "modelo_ia", modelo);
	return json({ modelo });
};
