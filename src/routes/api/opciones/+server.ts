// Opciones que agregan los asesores (metales, quilates, piedras, formas, ubicaciones y campos extra de la orden):
// quedan para todos los clientes. Se guarda solo lo agregado; las de fábrica están en opciones.ts.
import { json } from "@sveltejs/kit";
import { claveCampo, incluye, LISTAS_OPCION, mezclarOpciones, type CampoExtra } from "#lib/invoice/opciones.ts";
import { guardarAjuste, leerAjuste } from "#lib/server/widget/datos.ts";
import { db, fallo, leerJson } from "#lib/server/widget/servicio.ts";
import type { RequestHandler } from "./$types";

type Guardadas = Partial<Record<string, unknown[]>>;

export const GET: RequestHandler = async () => json({ opciones: mezclarOpciones(await leerAjuste(await db(), "opciones")) });

export const POST: RequestHandler = async ({ request }) => {
	const { lista, valor } = (await leerJson<{ lista?: unknown; valor?: unknown }>(request, 4096)) ?? {};
	const base = await db();
	const guardadas: Guardadas = (await leerAjuste<Guardadas>(base, "opciones")) ?? {};
	const actuales = mezclarOpciones(guardadas);
	if (typeof lista === "string" && (LISTAS_OPCION as string[]).includes(lista)) {
		const v = typeof valor === "string" ? valor.trim().replace(/\s+/g, " ") : "";
		if (!v || v.length > 60) return fallo("Opción inválida", 400);
		if (!incluye(actuales[lista as keyof typeof actuales] as string[], v)) guardadas[lista] = [...(guardadas[lista] ?? []), v];
	} else if (lista === "camposAnillo" || lista === "camposPedido") {
		const nombre = typeof (valor as CampoExtra)?.nombre === "string" ? (valor as CampoExtra).nombre.trim().replace(/\s+/g, " ") : "";
		if (!nombre || nombre.length > 40) return fallo("Campo inválido", 400);
		const campo = { clave: claveCampo(nombre), nombre };
		if (!actuales[lista].some((c) => c.clave === campo.clave)) guardadas[lista] = [...(guardadas[lista] ?? []), campo];
	} else return fallo("Lista inválida", 400);
	await guardarAjuste(base, "opciones", guardadas);
	return json({ opciones: mezclarOpciones(guardadas) });
};
