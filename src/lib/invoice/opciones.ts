// Opciones de los selectores del invoice y de la orden (metales, quilates, piedras…) y los campos extra de la
// orden. Las de fábrica están aquí; las que agregan los asesores se guardan en la app (/api/opciones) y quedan
// para todos los clientes. El widget también las agrega como opciones de los campos de Kommo.
// Sin imports: lo usan el navegador, las rutas de /api y los tests de Node.

export type CampoExtra = { clave: string; nombre: string };

export const OPCIONES_BASE = {
	tipos: ["Anillo de compromiso para mujer", "Anillo de compromiso para hombre", "Anillo de bodas para mujer", "Anillo de bodas para hombre", "Anillo a la medida"],
	metales: ["Oro amarillo", "Oro blanco", "Oro rosa", "Platino"],
	quilates: ["10k", "14k", "18k"],
	piedras: ["Diamante", "Esmeralda", "Zafiro", "Rubí", "Moissanita", "Morganita"],
	formas: ["Redondo", "Oval", "Pera", "Marquesa", "Esmeralda", "Princesa", "Cojín", "Radiante"],
	posiciones: ["Central", "Laterales", "Pavé"],
	// Campos que se pueden sumar a la orden, además de los de siempre (ver CAMPOS_ANILLO / CAMPOS_PEDIDO).
	camposAnillo: [] as CampoExtra[],
	camposPedido: [] as CampoExtra[],
};

export type Opciones = typeof OPCIONES_BASE;
export type ListaOpcion = Exclude<keyof Opciones, "camposAnillo" | "camposPedido">;
export type ListaCampo = "camposAnillo" | "camposPedido";
export const LISTAS_OPCION: ListaOpcion[] = ["tipos", "metales", "quilates", "piedras", "formas", "posiciones"];

// "Center Stones" → "x_center_stones": la clave de un campo creado por un asesor.
export const claveCampo = (nombre: string) =>
	"x_" +
	nombre
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_|_$/g, "")
		.slice(0, 40);

const igual = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
export const incluye = (lista: string[], valor: string) => lista.some((x) => igual(x, valor));

// Lo guardado sobre las de fábrica, sin repetir (sin importar mayúsculas).
export function mezclarOpciones(guardadas: unknown): Opciones {
	const g = (guardadas && typeof guardadas === "object" ? guardadas : {}) as Partial<Record<keyof Opciones, unknown>>;
	const textos = (base: string[], extra: unknown) => [...base, ...(Array.isArray(extra) ? extra : []).filter((x): x is string => typeof x === "string" && !!x.trim() && !incluye(base, x))].filter((x, i, a) => a.findIndex((y) => igual(x, y)) === i);
	const campos = (extra: unknown) =>
		(Array.isArray(extra) ? extra : [])
			.filter((c): c is CampoExtra => !!c && typeof c.clave === "string" && typeof c.nombre === "string" && !!c.nombre.trim())
			.filter((c, i, a) => a.findIndex((x) => x.clave === c.clave) === i);
	return {
		tipos: textos(OPCIONES_BASE.tipos, g.tipos),
		metales: textos(OPCIONES_BASE.metales, g.metales),
		quilates: textos(OPCIONES_BASE.quilates, g.quilates),
		piedras: textos(OPCIONES_BASE.piedras, g.piedras),
		formas: textos(OPCIONES_BASE.formas, g.formas),
		posiciones: textos(OPCIONES_BASE.posiciones, g.posiciones),
		camposAnillo: campos(g.camposAnillo),
		camposPedido: campos(g.camposPedido),
	};
}
