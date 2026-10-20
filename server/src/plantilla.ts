// Plantilla de diseño compartida por todos los asesores. Por ahora un archivo JSON en DATA_DIR;
// el widget la normaliza al cargarla, así que aquí solo se valida la forma básica.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "./env.ts";

const archivo = () => join(env.DATA_DIR, "plantilla.json");

export async function leerPlantilla(): Promise<unknown | null> {
	try {
		return JSON.parse(await readFile(archivo(), "utf8"));
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw e;
	}
}

export function esPlantilla(dato: unknown): dato is { bloques: unknown[] } {
	return !!dato && typeof dato === "object" && !Array.isArray(dato) && Array.isArray((dato as { bloques?: unknown }).bloques);
}

export async function guardarPlantilla(dato: unknown) {
	await mkdir(env.DATA_DIR, { recursive: true });
	// Escribe en un temporal y renombra: un corte a mitad de escritura no deja el archivo roto.
	const tmp = `${archivo()}.tmp`;
	await writeFile(tmp, JSON.stringify(dato));
	await rename(tmp, archivo());
}
