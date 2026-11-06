// Webhook de Dropbox. No pide la clave del widget (lo llama Dropbox, no el navegador): lo protege la firma
// X-Dropbox-Signature. Dropbox espera respuesta en menos de 10 s, así que los cambios se procesan después.
import { dropboxConfigurado, firmaValida } from "#lib/server/widget/dropbox.ts";
import { db, env, fallo } from "#lib/server/widget/servicio.ts";
import { procesarCambios } from "#lib/server/widget/videos.ts";
import type { RequestHandler } from "./$types";

// Verificación al registrar la URL en el App Console: devolver el challenge tal cual.
export const GET: RequestHandler = ({ url }) =>
	new Response(url.searchParams.get("challenge") ?? "", { headers: { "Content-Type": "text/plain", "X-Content-Type-Options": "nosniff" } });

export const POST: RequestHandler = async ({ request }) => {
	if (!dropboxConfigurado()) return fallo("Dropbox no está configurado", 503);
	const cuerpo = await request.text();
	if (!firmaValida(cuerpo, request.headers.get("X-Dropbox-Signature"))) return fallo("Firma inválida", 403);
	const base = await db();
	procesarCambios(base, env.KOMMO_BOT_VIDEO).catch((e) => console.error("[videos] webhook:", e));
	return new Response(null, { status: 200 });
};
