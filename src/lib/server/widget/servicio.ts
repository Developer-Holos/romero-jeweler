// Lo que comparten las rutas de /api: variables de entorno, la base (se abre una vez) y respuestas comunes.
import { timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import { json } from "@sveltejs/kit";
import * as env from "$app/env/private";
import { leerAjuste } from "./datos.ts";
import { abrirDb, type Db } from "./db.ts";
import { configurarKommo } from "./kommo.ts";
import { cerrarNavegador } from "./pdf.ts";

export { env };

configurarKommo(env.KOMMO_BASE_URL ?? (env.KOMMO_SUBDOMAIN ? `https://${env.KOMMO_SUBDOMAIN}.kommo.com` : ""), env.KOMMO_ACCESS_TOKEN);

let abierta: Promise<Db> | null = null;
export function db() {
	// Si no abre (Postgres caído), el próximo pedido lo vuelve a intentar.
	abierta ??= abrirDb({ url: env.DATABASE_URL, dir: resolve(env.DATA_DIR) }).catch((e) => {
		abierta = null;
		throw e;
	});
	return abierta;
}

// adapter-node avisa antes de apagarse.
process.once("sveltekit:shutdown", async () => {
	await cerrarNavegador();
	await (await abierta)?.cerrar();
});

export const modeloIa = async () => (await leerAjuste<string>(await db(), "modelo_ia")) ?? env.OPENAI_MODEL;

export const iguales = (recibida: string | null, esperada: string) => {
	const a = Buffer.from(recibida ?? "");
	const b = Buffer.from(esperada);
	return a.length === b.length && timingSafeEqual(a, b);
};

export const MB = 1024 * 1024;

export const fallo = (error: string, status: number) => json({ error }, { status });

// El cuerpo en JSON, o null si no lo es o pasa del límite.
export async function leerJson<T = unknown>(request: Request, limite: number): Promise<T | null> {
	if (Number(request.headers.get("content-length")) > limite) return null;
	const texto = await request.text().catch(() => "");
	if (texto.length > limite) return null;
	try {
		return JSON.parse(texto) as T;
	} catch {
		return null;
	}
}

export const leadValido = (id: string) => (/^[1-9]\d{0,14}$/.test(id) ? Number(id) : null);
