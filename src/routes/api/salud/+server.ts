import { json } from "@sveltejs/kit";
import { env } from "#lib/server/widget/servicio.ts";
import { dropboxConfigurado } from "#lib/server/widget/dropbox.ts";
import { kommoConfigurado } from "#lib/server/widget/kommo.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = () =>
	json({ ok: true, ia: !!env.OPENAI_API_KEY, kommo: kommoConfigurado() && !!env.KOMMO_CAMPO_INVOICE, dropbox: dropboxConfigurado(), botVideo: !!env.KOMMO_BOT_VIDEO, seguimientos: !!env.OPENAI_API_KEY });
