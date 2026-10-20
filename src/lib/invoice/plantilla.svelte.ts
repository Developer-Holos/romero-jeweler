// Diseño del PDF del invoice: orden de los bloques, colores, tipografía, marca, y los textos legales y
// valores por defecto de Romero Jeweler (los edita Romero en el diseñador, sin tocar código).
// Se comparte entre asesores a través del servidor del widget; el navegador guarda una copia
// para abrir al instante y para funcionar sin servidor. También se exporta e importa como JSON.

import type { Seccion } from "./invoice.svelte";
import { guardarPlantillaServidor, hayServidor, leerPlantillaServidor } from "./servidor";

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

// Textos del invoice. {marcador} se reemplaza al armar el documento; **texto** sale en negrita.
// PENDIENTE: Romero debe confirmarlos antes de producción (docs/TEXTOS_PARA_ROMERO.md).
export const TEXTOS = {
	pago_deposito: { nombre: "Condiciones de pago · cada depósito", marcadores: ["deposito", "monto", "momento", "fecha_limite"], texto: "El **{deposito}** de {monto} se paga {momento}{fecha_limite}." },
	pago_fecha_limite: { nombre: "Condiciones de pago · fecha límite de un depósito", marcadores: ["fecha"], texto: ", a más tardar el {fecha}" },
	pago_saldo: { nombre: "Condiciones de pago · saldo (si hay más de un depósito)", marcadores: ["diasSaldo"], texto: "Una vez notificada la finalización de la pieza, el cliente cuenta con **{diasSaldo} días** para pagar el saldo. La pieza se entrega únicamente al recibir el pago completo." },
	pago_medios: { nombre: "Condiciones de pago · métodos de pago", marcadores: ["medios"], texto: "Métodos de pago aceptados: {medios}, a través de un enlace de pago seguro." },
	aviso_pago: { nombre: "Aviso bajo el total a pagar", marcadores: ["para_cada", "medios"], texto: "Recibirás por separado un enlace de pago seguro{para_cada} ({medios}). **Al realizar el pago, confirmas que has leído y aceptas todos los términos y condiciones de esta factura.**" },
	produccion: { nombre: "Producción y entrega", marcadores: ["entrega", "pieza"], texto: "Fecha estimada de entrega: **{entrega}**. Al ser una pieza hecha a la medida, los tiempos pueden variar ligeramente. Recibirás un enlace de seguimiento para ver en qué etapa de producción se encuentra tu {pieza}." },
	produccion_envio: { nombre: "Producción y entrega · envío incluido", marcadores: [], texto: "El envío está incluido y va asegurado por el valor total de la pieza, con firma requerida." },
	produccion_pickup: { nombre: "Producción y entrega · pickup", marcadores: ["ciudadPickup"], texto: "También puedes recoger tu pieza en persona en {ciudadPickup} (pickup)." },
	produccion_origen: { nombre: "Producción y entrega · servicio Origen", marcadores: ["diasOrigen"], texto: "El video Origen se entrega completo entre {diasOrigen} días después de finalizada la joya." },
	cambios: { nombre: "Cambios de diseño", marcadores: [], texto: "El diseño CAD incluye modificaciones sin costo, siempre que se mantenga la misma estructura del diseño. Un cambio total del diseño, o cualquier cambio después de que el cliente apruebe el CAD, tiene un costo adicional y puede modificar la fecha estimada de entrega." },
	talla: { nombre: "Ajuste de talla", marcadores: ["costoTalla", "diasAjuste"], texto: "El primer ajuste es gratis, ya sea para reducir o agrandar. Después del primero, cada talla adicional para agrandar cuesta **{costoTalla}**; reducir no tiene costo. El ajuste tiene un tiempo de espera mínimo de **{diasAjuste} días**. No todos los diseños permiten ajuste de talla." },
	garantia: { nombre: "Garantía", marcadores: ["garantia"], texto: "**{garantia}** en engaste y defectos de fabricación. No cubre golpes, desgaste normal, mal uso ni piezas reparadas o modificadas por otro joyero." },
	variaciones: { nombre: "Variaciones", marcadores: [], texto: "Las imágenes y renders del diseño son una referencia. Por tratarse de una pieza artesanal, pueden existir ligeras variaciones en el peso del metal, las proporciones y la apariencia final respecto al render, sin que esto se considere un defecto." },
	terminos: { nombre: "Términos y aceptación", marcadores: [], texto: "Por tratarse de una pieza hecha a la medida, no se aceptan devoluciones ni cancelaciones, y los depósitos no son reembolsables en ningún caso. Ante cualquier inconformidad, el cliente se compromete a contactar primero a Romero Jeweler para buscar una solución antes de iniciar una disputa con su banco o procesador de pago." },
	nota_imagenes: { nombre: "Nota bajo las imágenes", marcadores: [], texto: "Render de referencia del diseño. La pieza final puede presentar ligeras variaciones." },
	vineta_origen: { nombre: "Viñeta del servicio Origen", marcadores: [], texto: "Incluye el servicio Origen (video del proceso de banco de tu anillo)" },
} as const;
export type TextoId = keyof typeof TEXTOS;

// Valores por defecto de cada invoice nuevo (el asesor los puede cambiar en ese invoice).
export const VALORES = {
	diasSaldo: { nombre: "Plazo para pagar el saldo", tipo: "num", sufijo: "días", valor: 15 },
	medios: { nombre: "Métodos de pago", tipo: "text", valor: "tarjeta de crédito, tarjeta de débito o PayPal" },
	ciudadPickup: { nombre: "Ciudad de pickup", tipo: "text", valor: "Miami" },
	diasOrigen: { nombre: "Entrega del video Origen", tipo: "text", sufijo: "días", valor: "7 y 15" },
	costoTalla: { nombre: "Costo por talla adicional", tipo: "money", valor: 100 },
	diasAjuste: { nombre: "Espera mínima del ajuste de talla", tipo: "num", sufijo: "días", valor: 60 },
	mesesGarantia: { nombre: "Duración de la garantía", tipo: "num", sufijo: "meses", valor: 12 },
} as const;
export type ValorId = keyof typeof VALORES;

const mapa = <K extends string, V>(o: Record<K, V>, f: (v: V) => unknown) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v as V)]));

// "a {x} b" + { x: 1 } → "a 1 b". Un marcador desconocido queda tal cual, para que se note.
export const rellenar = (texto: string, vars: Record<string, string | number>) => texto.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

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
		textos: mapa(TEXTOS, (t) => t.texto) as Record<TextoId, string>,
		valores: mapa(VALORES, (v) => v.valor) as { [K in ValorId]: (typeof VALORES)[K]["valor"] extends number ? number : string },
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
		textos: { ...base.textos, ...g.textos },
		valores: { ...base.valores, ...g.valores },
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

// Trae la plantilla compartida. Si el servidor aún no tiene ninguna, se queda la local.
export async function cargarPlantillaServidor() {
	if (!hayServidor()) return;
	try {
		const remota = await leerPlantillaServidor();
		if (remota) Object.assign(plantilla, normalizar(remota));
	} catch (e) {
		console.warn("[plantilla] no se pudo leer del servidor:", e);
	}
}

export async function subirPlantilla() {
	await guardarPlantillaServidor($state.snapshot(plantilla));
}

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
