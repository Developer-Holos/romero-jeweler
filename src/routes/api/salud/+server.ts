import { json } from "@sveltejs/kit";
import { env } from "#lib/server/widget/servicio.ts";
import { kommoConfigurado } from "#lib/server/widget/kommo.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = () => json({ ok: true, ia: !!env.OPENAI_API_KEY, kommo: kommoConfigurado() && !!env.KOMMO_CAMPO_INVOICE });
