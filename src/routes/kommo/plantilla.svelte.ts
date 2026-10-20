// Diseño del PDF del invoice: orden de los bloques, colores, tipografía y marca.
// Por ahora se guarda en el navegador (localStorage); se puede exportar e importar como JSON.

import type { Seccion } from "./invoice.svelte";

export type BloqueId = "datos" | "descripcion" | "precios" | "condPago" | "produccion" | "politicas" | "terminos" | "imagenes";
export type Bloque = { id: BloqueId; visible: boolean; titulo: string };

// `secs`: secciones del formulario que controlan el bloque; la primera es la que se abre al tocarlo.
export const BLOQUES: Record<BloqueId, { nombre: string; titulo: string; secs: Seccion[] }> = {
	datos: { nombre: "Datos de la factura", titulo: "Factura / Invoice", secs: ["cliente"] },
	descripcion: { nombre: "Descripción del artículo", titulo: "Descripción del artículo", secs: ["pieza"] },
	precios: { nombre: "Precios y depósitos", titulo: "", secs: ["pago"] },
	condPago: { nombre: "Condiciones de pago", titulo: "Condiciones de pago", secs: ["condiciones", "pago"] },
	produccion: { nombre: "Producción y entrega", titulo: "Producción y entrega", secs: ["entrega", "condiciones"] },
	politicas: { nombre: "Políticas", titulo: "Políticas", secs: ["condiciones"] },
	terminos: { nombre: "Términos y aceptación", titulo: "Términos y aceptación", secs: ["condiciones"] },
	imagenes: { nombre: "Imágenes del diseño", titulo: "Diseño de tu {pieza}", secs: ["imagenes"] },
};

export const FUENTES = {
	sans: { nombre: "Helvetica", css: "Helvetica, Arial, sans-serif" },
	serif: { nombre: "Georgia", css: "Georgia, 'Times New Roman', serif" },
	elegante: { nombre: "Garamond", css: "Garamond, 'EB Garamond', Georgia, serif" },
	moderna: { nombre: "Trebuchet", css: "'Trebuchet MS', 'Segoe UI', sans-serif" },
} as const;
export type Fuente = keyof typeof FUENTES;

export const ESPACIADOS = { compacto: 2, normal: 6, amplio: 14 } as const;

export function plantillaInicial() {
	return {
		colores: { primario: "#1c2150", acento: "#b08d57", suave: "#f5eee2", texto: "#1e293b" },
		fuenteTitulos: "sans" as Fuente,
		fuenteTexto: "sans" as Fuente,
		espaciado: "normal" as keyof typeof ESPACIADOS,
		encabezado: { visible: true, estilo: "banda" as "banda" | "claro", nombre: "ROMERO JEWELER", lema: "Más que una joya, un legado.", monograma: "RJ", logo: "" },
		precios: { estiloTotal: "banda" as "banda" | "linea", aviso: true },
		imagenes: { columnas: 2 as 1 | 2 | 3, nota: true },
		pie: { visible: true, texto: "Golden Rooster LLC, dba Romero Jeweler · Miami, FL · contact@yrjeweler.com", numero: true },
		bloques: (Object.keys(BLOQUES) as BloqueId[]).map((id): Bloque => ({ id, visible: true, titulo: BLOQUES[id].titulo })),
	};
}

export type Plantilla = ReturnType<typeof plantillaInicial>;

type Colores = Plantilla["colores"];
export const PALETAS: { nombre: string; colores: Colores }[] = [
	{ nombre: "Clásica", colores: plantillaInicial().colores },
	{ nombre: "Noche", colores: { primario: "#111111", acento: "#c9a86a", suave: "#f4f1ea", texto: "#1f1f1f" } },
	{ nombre: "Esmeralda", colores: { primario: "#0f3d33", acento: "#b8955a", suave: "#eef4ef", texto: "#1d2b27" } },
	{ nombre: "Rosa", colores: { primario: "#5b2a3a", acento: "#d29a8a", suave: "#f8ece8", texto: "#2e1f24" } },
	{ nombre: "Minimal", colores: { primario: "#2b2b2b", acento: "#8a8a8a", suave: "#f2f2f2", texto: "#222222" } },
];

const CLAVE = "rj-invoice-plantilla";

// Lo guardado se mezcla con los valores por defecto, así una versión vieja no rompe el invoice.
export function normalizar(dato: unknown): Plantilla {
	const base = plantillaInicial();
	if (!dato || typeof dato !== "object") return base;
	const g = dato as Partial<Plantilla>;
	const bloques = Array.isArray(g.bloques) ? g.bloques.filter((b): b is Bloque => !!b && b.id in BLOQUES) : [];
	const vistos = new Set(bloques.map((b) => b.id));
	return {
		...base,
		...g,
		colores: { ...base.colores, ...g.colores },
		encabezado: { ...base.encabezado, ...g.encabezado },
		precios: { ...base.precios, ...g.precios },
		imagenes: { ...base.imagenes, ...g.imagenes },
		pie: { ...base.pie, ...g.pie },
		fuenteTitulos: g.fuenteTitulos && g.fuenteTitulos in FUENTES ? g.fuenteTitulos : base.fuenteTitulos,
		fuenteTexto: g.fuenteTexto && g.fuenteTexto in FUENTES ? g.fuenteTexto : base.fuenteTexto,
		espaciado: g.espaciado && g.espaciado in ESPACIADOS ? g.espaciado : base.espaciado,
		bloques: [...bloques.filter((b, i) => bloques.findIndex((x) => x.id === b.id) === i), ...base.bloques.filter((b) => !vistos.has(b.id))],
	};
}

function cargar(): Plantilla {
	try {
		const guardada = localStorage.getItem(CLAVE);
		return normalizar(guardada ? JSON.parse(guardada) : null);
	} catch {
		return plantillaInicial();
	}
}

// Las rutas de /kommo no se renderizan en el servidor (+layout.ts), así que aquí siempre hay navegador.
export const plantilla: Plantilla = $state(cargar());

export function guardarPlantilla() {
	try {
		localStorage.setItem(CLAVE, JSON.stringify(plantilla));
		return true;
	} catch {
		return false; // modo privado o el logo no cabe en el almacenamiento
	}
}

export function moverBloque(desde: number, hasta: number) {
	if (desde === hasta || hasta < 0 || hasta >= plantilla.bloques.length) return;
	const [b] = plantilla.bloques.splice(desde, 1);
	plantilla.bloques.splice(hasta, 0, b);
}

// Variables CSS que usa la vista previa (ver @theme inline en layout.css).
export function variables(p: Plantilla) {
	return [
		`--pdf-primario: ${p.colores.primario}`,
		`--pdf-acento: ${p.colores.acento}`,
		`--pdf-suave: ${p.colores.suave}`,
		`--pdf-texto: ${p.colores.texto}`,
		`--pdf-fuente-titulos: ${FUENTES[p.fuenteTitulos].css}`,
		`--pdf-fuente-texto: ${FUENTES[p.fuenteTexto].css}`,
	].join("; ");
}
