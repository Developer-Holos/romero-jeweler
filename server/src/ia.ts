// Redacción con OpenAI: pule las viñetas de la descripción (sumando las notas del asesor) y, si el
// invoice va en inglés, traduce todo: condiciones y etiquetas del documento. Nunca decide montos.
import OpenAI from "openai";
import { env } from "./env.ts";

export type PedidoRedaccion = {
	idioma: "es" | "en";
	pieza: string;
	vinetas: string[];
	notas: string;
	instrucciones: string;
	clausulas: { id: string; nombre: string; texto: string }[];
	// Textos fijos del documento ("Factura No.", "Total a pagar ahora", títulos de bloques…), solo si va en inglés.
	etiquetas?: { clave: string; texto: string }[];
};

export type Redaccion = {
	titulo: string;
	vinetas: string[];
	clausulas: { id: string; nombre: string; texto: string }[];
	etiquetas: { clave: string; texto: string }[];
	// Bloques en los que la IA cambió una cifra o una fecha y se dejó el texto original.
	descartadas: string[];
};

type Respuesta = Omit<Redaccion, "descartadas">;

const ESQUEMA = {
	type: "object",
	additionalProperties: false,
	required: ["titulo", "vinetas", "clausulas", "etiquetas"],
	properties: {
		titulo: { type: "string" },
		vinetas: { type: "array", items: { type: "string" } },
		clausulas: {
			type: "array",
			items: { type: "object", additionalProperties: false, required: ["id", "nombre", "texto"], properties: { id: { type: "string" }, nombre: { type: "string" }, texto: { type: "string" } } },
		},
		etiquetas: {
			type: "array",
			items: { type: "object", additionalProperties: false, required: ["clave", "texto"], properties: { clave: { type: "string" }, texto: { type: "string" } } },
		},
	},
} as const;

const INSTRUCCIONES = `Eres redactor de Romero Jeweler, una joyería de piezas a la medida en Miami.
Recibes en JSON los datos de un invoice y devuelves el texto pulido para el cliente.

- "titulo": el nombre de la pieza tal como va en el invoice.
- "vinetas": la descripción del artículo en viñetas cortas, claras y elegantes. Integra en ellas la información útil de "notas" sin inventar nada. No repitas datos.
- "clausulas": las mismas cláusulas que recibes, con el mismo "id" y en el mismo orden. Si el idioma es "es", devuélvelas sin cambios. Si es "en", tradúcelas al inglés con tono profesional, incluido "nombre".
- "etiquetas": los textos fijos del documento, con la misma "clave" y en el mismo orden. Si el idioma es "en", tradúcelos al inglés como irían en un invoice profesional ("Factura No." → "Invoice No."); las fechas van en formato de Estados Unidos ("20 de octubre de 2026" → "October 20, 2026"). Si es "es" o no hay etiquetas, devuelve una lista vacía.
- Idioma de salida: español si "idioma" es "es", inglés si es "en".
- Nunca cambies, redondees ni agregues cifras: montos, porcentajes, fechas, días, tallas y quilates se copian exactamente igual.
- Conserva las marcas **negrita** sobre el mismo contenido.
- Sigue las "instrucciones" del asesor si las hay, siempre que no contradigan estas reglas.`;

// Todas las cifras del texto original deben seguir en el texto nuevo, en la misma cantidad.
const cifras = (s: string) => (s.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/[.,](?=\d{3}\b)/g, "")).sort();
export const mismasCifras = (antes: string, despues: string) => cifras(antes).join("|") === cifras(despues).join("|");

// Una fecha traducida debe nombrar el mismo mes: las cifras solas no distinguen "octubre" de "November".
const MESES: [RegExp, string][] = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"].map((m, i) => [
	new RegExp(`\\b${m}\\b`, "i"),
	["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"][i],
]);
export const mismosMeses = (antes: string, despues: string, idioma: "es" | "en") =>
	idioma === "es" || MESES.every(([es, en]) => !es.test(antes) || despues.toLowerCase().includes(en));

const fiel = (antes: string, despues: string, idioma: "es" | "en") => mismasCifras(antes, despues) && mismosMeses(antes, despues, idioma);

let cliente: OpenAI | null = null;

// `modelo`: el de la base (PUT /admin/ia) o, si no hay, OPENAI_MODEL.
export async function redactar(p: PedidoRedaccion, modelo: string): Promise<Redaccion> {
	if (!env.OPENAI_API_KEY) throw new Error("sin OPENAI_API_KEY");
	cliente ??= new OpenAI({ apiKey: env.OPENAI_API_KEY });
	const res = await cliente.responses.create({
		model: modelo,
		instructions: INSTRUCCIONES,
		input: JSON.stringify(p),
		text: { format: { type: "json_schema", name: "redaccion", strict: true, schema: ESQUEMA } },
	});
	return validar(p, JSON.parse(res.output_text) as Respuesta);
}

export function validar(p: PedidoRedaccion, r: Respuesta): Redaccion {
	const descartadas: string[] = [];
	const original = [p.pieza, ...p.vinetas].join(" ");
	const nuevas = [r.titulo, ...r.vinetas].join(" ");
	// Las notas pueden aportar cifras nuevas (ej. "talla 7"), así que solo se exige no perder las de los campos.
	const descripcionOk = cifras(original).every((c) => cifras(nuevas).includes(c));
	if (!descripcionOk) descartadas.push("descripcion");
	const clausulas = p.clausulas.map((c) => {
		const nueva = r.clausulas.find((x) => x.id === c.id);
		if (nueva && fiel(c.texto, nueva.texto, p.idioma)) return { id: c.id, nombre: nueva.nombre || c.nombre, texto: nueva.texto };
		descartadas.push(c.id);
		return c;
	});
	// Etiqueta por etiqueta: si la IA tocó una cifra o un mes, queda la original (en español).
	const etiquetas = (p.idioma === "en" ? (p.etiquetas ?? []) : []).map((e) => {
		const nueva = r.etiquetas?.find((x) => x.clave === e.clave);
		if (nueva?.texto && fiel(e.texto, nueva.texto, p.idioma)) return { clave: e.clave, texto: nueva.texto };
		descartadas.push(`etiqueta:${e.clave}`);
		return e;
	});
	return {
		titulo: descripcionOk ? r.titulo : p.pieza,
		vinetas: descripcionOk ? r.vinetas : p.vinetas,
		clausulas,
		etiquetas,
		descartadas,
	};
}
