// Video de una orden en Dropbox. GET: cómo está, sin tocar nada (para el widget y para depurar).
// POST: lo revisa y, si está completo, avisa al lead (por si se perdió un webhook o el video ya estaba antes).
import { json } from "@sveltejs/kit";
import { dropboxConfigurado, ErrorDropbox, videoDeOrden } from "#lib/server/widget/dropbox.ts";
import { ErrorKommo } from "#lib/server/widget/kommo.ts";
import { db, env, fallo } from "#lib/server/widget/servicio.ts";
import { ordenValida, registroVideo, revisarVideo } from "#lib/server/widget/videos.ts";
import type { RequestHandler } from "./$types";

const conErrores = async (fn: () => Promise<Response>) => {
	try {
		return await fn();
	} catch (e) {
		if (e instanceof ErrorDropbox || e instanceof ErrorKommo) {
			console.error("[videos]", e.message);
			return fallo(e instanceof ErrorKommo ? e.aviso : `Dropbox respondió ${e.status}`, 502);
		}
		throw e;
	}
};

export const GET: RequestHandler = ({ params }) =>
	conErrores(async () => {
		if (!ordenValida(params.orden)) return fallo("Orden inválida", 400);
		if (!dropboxConfigurado()) return fallo("Dropbox no está configurado", 503);
		const registro = await registroVideo(await db(), params.orden);
		const { carpeta, videos } = await videoDeOrden(params.orden, registro?.carpeta);
		return json({
			orden: params.orden,
			carpeta,
			completo: videos.length > 0,
			videos: videos.map((v) => ({ nombre: v.name, tamano: v.size, modificado: v.server_modified })),
			lead: registro?.lead_id ? Number(registro.lead_id) : null,
			link: registro?.link ?? null,
			avisado: registro?.avisado ?? null,
			pendiente: !!registro?.carpeta && !registro.avisado,
		});
	});

export const POST: RequestHandler = ({ params }) =>
	conErrores(async () => {
		if (!ordenValida(params.orden)) return fallo("Orden inválida", 400);
		if (!dropboxConfigurado()) return fallo("Dropbox no está configurado", 503);
		return json(await revisarVideo(await db(), params.orden, { botId: env.KOMMO_BOT_VIDEO }));
	});
