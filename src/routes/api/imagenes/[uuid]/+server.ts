// El widget no puede pedirle archivos a Kommo Drive directo (necesita el token): pasan por aquí.
import { descargarArchivo, kommoConfigurado } from "#lib/server/widget/kommo.ts";
import { fallo } from "#lib/server/widget/servicio.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params }) => {
	if (!kommoConfigurado()) return fallo("Kommo no está configurado en el servidor", 503);
	try {
		const { datos, tipo } = await descargarArchivo(params.uuid);
		return new Response(datos as Uint8Array<ArrayBuffer>, { headers: { "Content-Type": tipo, "Cache-Control": "private, max-age=3600" } });
	} catch (e) {
		console.error("[kommo]", e);
		return fallo("Kommo no respondió", 502);
	}
};
