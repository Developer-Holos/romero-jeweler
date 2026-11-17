// Logs de una sola línea en JSON: Railway trata cada línea como un registro aparte, así que un stack en varias líneas
// (o un objeto con saltos) se parte en pedazos imposibles de filtrar. Sin imports, para probarlo con node:test.
export type Nivel = "info" | "warn" | "error";

// Nunca van al log: claves, tokens ni cabeceras de autenticación, vengan de donde vengan.
const SECRETO = /clave|key|token|secret|authorization|password|cookie/i;

type Plano = Record<string, unknown>;

// Un error como datos: nombre, mensaje, status/resumen/aviso si los trae (ErrorKommo, ErrorDropbox), causa y stack en una cadena.
export function errorComoDatos(e: unknown, profundidad = 0): Plano {
	if (!(e instanceof Error)) return { mensaje: String(e) };
	const x = e as Error & { status?: number; resumen?: string; aviso?: string };
	return {
		nombre: x.name,
		mensaje: x.message,
		...(x.status !== undefined && { status: x.status }),
		...(x.resumen && { resumen: x.resumen }),
		...(x.aviso && { aviso: x.aviso }),
		...(x.cause !== undefined && profundidad < 2 && { causa: errorComoDatos(x.cause, profundidad + 1) }),
		stack: x.stack?.split("\n").slice(1, 6).map((l) => l.trim()).join(" | "),
	};
}

function limpiar(v: unknown, clave = ""): unknown {
	if (SECRETO.test(clave)) return "<oculto>";
	if (v instanceof Error) return errorComoDatos(v);
	if (typeof v === "string") return v.length > 1000 ? `${v.slice(0, 1000)}… (${v.length} caracteres)` : v;
	if (Array.isArray(v)) return v.slice(0, 20).map((x) => limpiar(x));
	if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, limpiar(x, k)]));
	return v;
}

// `evento` es lo que se filtra en Railway (`peticion`, `invoice`, `videos`…); `datos`, el contexto para identificar el caso.
export function linea(nivel: Nivel, evento: string, datos: Plano = {}, ahora = () => new Date()): string {
	return JSON.stringify({ ts: ahora().toISOString(), nivel, evento, ...(limpiar(datos) as Plano) });
}

export function log(nivel: Nivel, evento: string, datos: Plano = {}) {
	// Las líneas de nivel error van a stderr, el resto a stdout.
	(nivel === "error" ? console.error : nivel === "warn" ? console.warn : console.log)(linea(nivel, evento, datos));
}
