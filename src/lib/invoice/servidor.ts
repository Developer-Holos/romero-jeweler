import type { CampoExtra, ListaCampo, ListaOpcion } from "./opciones";

// Cliente de la API del widget (src/routes/api de esta misma app): genera el PDF, redacta con IA
// y guarda la plantilla de diseño compartida. La URL viene del widget en Kommo (o es /api al probar
// fuera de Kommo), vía configurarServidor().

export type Redaccion = {
	titulo: string;
	vinetas: string[];
	clausulas: { id: string; nombre: string; texto: string }[];
	etiquetas: { clave: string; texto: string }[];
	descartadas: string[];
};

// La redacción de todo el invoice: una por pieza (título y viñetas), más las condiciones y etiquetas.
export type RedaccionInvoice = Omit<Redaccion, "titulo" | "vinetas"> & { piezas: { titulo: string; vinetas: string[] }[] };

let servidor = { url: "", clave: "" };

export function configurarServidor(url: string | undefined, clave: string | undefined) {
	servidor = { url: (url ?? "").trim().replace(/\/+$/, ""), clave: (clave ?? "").trim() };
}

export const hayServidor = () => !!servidor.url;

// Lo que la pestaña "Orden" del lead tiene guardado: los campos del pedido y los de cada grupo "*Anillo °N*"
// (por clave de campos.ts o de un campo extra). `cantidad`: el campo "N° de Anillos".
export type OrdenKommo = { cantidad: number; pedido: Record<string, string>; anillos: Record<string, string | string[]>[] };

// Lo que el widget de Kommo (widget/script.js) hace con la API de Kommo y la sesión del usuario: crear la
// pestaña "Orden", los grupos de cada anillo y sus campos, las opciones de los campos de selección, y leer o
// escribir sus valores. Fuera de Kommo no existe.
export type Kommo = {
	campoImagenLibre(leadId: number): PromiseLike<{ id: number; nombre: string }>;
	leerOrden(leadId: number): PromiseLike<OrdenKommo>;
	// Crea los grupos que falten, escribe los valores y "N° de Anillos". Devuelve el id del campo del PDF de la orden.
	guardarOrden(leadId: number, datos: OrdenKommo): PromiseLike<{ invoice?: number; pdf?: number }>;
	// Grupos "*Anillo °1…N*" con sus campos.
	asegurarAnillos(cantidad: number): PromiseLike<unknown>;
	agregarOpcion(lista: ListaOpcion, valor: string): PromiseLike<unknown>;
	crearCampo(donde: "anillo" | "pedido", clave: string, nombre: string): PromiseLike<unknown>;
};

export class ErrorServidor extends Error {
	constructor(mensaje: string, readonly status: number) {
		super(mensaje);
	}
}

async function pedir(ruta: string, init: RequestInit = {}) {
	if (!servidor.url) throw new ErrorServidor("Falta configurar la URL del servidor en los ajustes del widget", 0);
	let res: Response;
	try {
		res = await fetch(servidor.url + ruta, {
			...init,
			headers: { ...(servidor.clave ? { "X-Widget-Key": servidor.clave } : {}), ...(typeof init.body === "string" ? { "Content-Type": "application/json" } : {}), ...init.headers },
		});
	} catch {
		throw new ErrorServidor("No hay conexión con el servidor del widget", 0);
	}
	if (!res.ok) {
		// `error` lo mandan las rutas; `message`, los error() de SvelteKit (ej. 413).
		const { error, message } = await res.json().catch(() => ({ error: "" }));
		throw new ErrorServidor(error || message || (res.status === 401 ? "La clave del widget no es válida (ajustes del widget)" : `El servidor respondió ${res.status}`), res.status);
	}
	return res;
}

export async function leerPlantillaServidor(): Promise<unknown | null> {
	return (await (await pedir("/plantilla")).json()).plantilla;
}

export async function guardarPlantillaServidor(plantilla: unknown) {
	await pedir("/plantilla", { method: "PUT", body: JSON.stringify(plantilla) });
}

export async function leerBorradorServidor(leadId: number): Promise<unknown | null> {
	return (await (await pedir(`/borradores/${leadId}`)).json()).borrador;
}

export async function guardarBorradorServidor(leadId: number, borrador: unknown) {
	await pedir(`/borradores/${leadId}`, { method: "PUT", body: JSON.stringify(borrador) });
}

// Opciones compartidas (opciones.ts): las de fábrica más las que agregaron los asesores.
export async function leerOpcionesServidor(): Promise<unknown> {
	return (await (await pedir("/opciones")).json()).opciones;
}

export async function agregarOpcionServidor(lista: ListaOpcion | ListaCampo, valor: string | CampoExtra): Promise<unknown> {
	return (await (await pedir("/opciones", { method: "POST", body: JSON.stringify({ lista, valor }) })).json()).opciones;
}

// Traduce textos cortos (nombres de campos de la orden y, si se pide, sus valores). Si la IA no responde o
// cambia una cifra, queda el original.
export async function traducir(idioma: "es" | "en", textos: string[]): Promise<string[]> {
	if (!textos.length) return [];
	return (await (await pedir("/ia/traducir", { method: "POST", body: JSON.stringify({ idioma, textos }) })).json()).textos;
}

type Texto = { clave?: string; id?: string; nombre?: string; texto: string };
export async function redactar(pedido: { idioma: "es" | "en"; pieza: string; vinetas: string[]; notas: string; instrucciones: string; clausulas: Texto[]; etiquetas: Texto[] }): Promise<Redaccion> {
	return (await pedir("/ia/redactar", { method: "POST", body: JSON.stringify(pedido) })).json();
}

// Correlativo RJ-AAAA-NNNN. Se pide antes de armar el PDF porque va impreso en él.
export async function pedirNumero(leadId: number): Promise<string> {
	return (await (await pedir("/invoices/numero", { method: "POST", body: JSON.stringify({ lead_id: leadId }) })).json()).numero;
}

// `kommo`: si el PDF quedó en el campo "Invoice" del lead ("guardado"), si falló ("error") o si el
// servidor no tiene Kommo configurado ("desactivado").
// `campoId`: el campo "Invoice" de la pestaña "Orden" del lead (lo indica el widget); sin él, KOMMO_CAMPO_INVOICE.
export async function generarInvoice(numero: string, html: string, total: number, datos: unknown, campoId?: number) {
	const res = await pedir(`/invoices/${encodeURIComponent(numero)}/pdf`, { method: "POST", body: JSON.stringify({ html, total, datos, campo_id: campoId }) });
	return { pdf: await res.blob(), kommo: (res.headers.get("X-Kommo-Estado") ?? "desactivado") as "guardado" | "error" | "desactivado", detalle: res.headers.get("X-Kommo-Detalle") ?? "" };
}

// Orden de producción: con `campoId`, la API guarda el PDF en ese campo del lead (pestaña "Orden").
export async function generarOrden(html: string, nombre: string, leadId?: number, campoId?: number) {
	const res = await pedir("/ordenes/pdf", { method: "POST", body: JSON.stringify({ html, nombre, lead_id: leadId, campo_id: campoId }) });
	return { pdf: await res.blob(), kommo: (res.headers.get("X-Kommo-Estado") ?? "desactivado") as "guardado" | "error" | "desactivado", detalle: res.headers.get("X-Kommo-Detalle") ?? "" };
}

// Invoice "sin datos del cliente" (cotización): PDF sin número, no se registra ni se guarda en Kommo.
export async function generarCotizacion(html: string): Promise<Blob> {
	return (await pedir("/pdf", { method: "POST", body: JSON.stringify({ html }) })).blob();
}

// ─── Imágenes de referencia: viven en Kommo, como archivos del lead ──────
export type ImagenKommo = { uuid: string; nombre: string };

export async function imagenesDelLead(leadId: number): Promise<ImagenKommo[]> {
	return (await (await pedir(`/leads/${leadId}/imagenes`)).json()).imagenes;
}

// `campoId`: campo "Imagen N" del lead donde guardarla (lo elige el widget); sin él, se adjunta al lead.
// Tope por archivo para subir a Kommo; el widget lo revisa antes de mandar y la API otra vez.
export const MAX_ARCHIVO = 9 * 1024 * 1024;

export async function subirImagen(leadId: number, archivo: File, campoId?: number): Promise<ImagenKommo> {
	const headers: Record<string, string> = { "Content-Type": archivo.type || "image/jpeg", "X-Nombre-Archivo": encodeURIComponent(archivo.name) };
	if (campoId) headers["X-Campo-Imagen"] = String(campoId);
	return (await pedir(`/leads/${leadId}/imagenes`, { method: "POST", body: archivo, headers })).json();
}

// Las imágenes de Kommo pasan por el servidor (con la clave en el header), así que se piden con fetch
// y se muestran como blob: URL. Se guardan para no pedirlas de nuevo.
const urls = new Map<string, Promise<string>>();
export function urlImagen(uuid: string) {
	if (!urls.has(uuid)) {
		const p = pedir(`/imagenes/${encodeURIComponent(uuid)}`).then(async (r) => URL.createObjectURL(await r.blob()));
		p.catch(() => urls.delete(uuid));
		urls.set(uuid, p);
	}
	return urls.get(uuid)!;
}

// Ancho de diseño de la vista previa; en el PDF se escala a una hoja carta (8.5 in = 816 px).
const ANCHO = 560;

// Copia la vista previa a un HTML autónomo: estilos en línea e imágenes subidas como data URLs,
// porque el servidor no tiene acceso a este navegador.
export async function htmlDelInvoice(articulo: HTMLElement) {
	const clon = articulo.cloneNode(true) as HTMLElement;
	clon.querySelectorAll("[data-no-pdf]").forEach((el) => el.remove());
	// Las fotos van achicadas: a su tamaño en la hoja 1600 px sobran, y el PDF tiene que entrar en Kommo (9 MB).
	for (const img of clon.querySelectorAll("img")) {
		if (img.src.startsWith("blob:")) img.src = await aDataUrl(await achicar(await (await fetch(img.src)).blob(), 1600, 0.82));
	}
	// Dentro de Kommo la vista previa vive en un Shadow DOM con sus propias hojas de estilo.
	const raiz = articulo.getRootNode() as Document | ShadowRoot;
	const css = [...raiz.styleSheets, ...raiz.adoptedStyleSheets]
		.map((hoja) => {
			try {
				return [...hoja.cssRules].map((r) => r.cssText).join("\n");
			} catch {
				return ""; // hojas de otro origen
			}
		})
		.join("\n");
	// La primera hoja empieza con el encabezado a sangre; las siguientes llevan margen arriba y abajo.
	const impresion = `@page { size: Letter; margin: 0.45in 0 } @page :first { margin-top: 0 } html, body { margin: 0; background: #fff }
		article { width: ${ANCHO}px !important; max-width: none !important; margin: 0 !important; box-shadow: none !important; zoom: ${816 / ANCHO} }
		[data-bloque] { outline: none !important; background: transparent !important; break-inside: avoid }`;
	return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${css}</style><style>${impresion}</style></head><body>${clon.outerHTML}</body></html>`;
}

// La imagen como JPEG de `lado` px como máximo (fondo blanco por si tenía transparencia). Si no se puede
// leer (formato que el navegador no abre), queda la original.
export async function achicar(blob: Blob, lado: number, calidad: number): Promise<Blob> {
	let bmp: ImageBitmap;
	try {
		bmp = await createImageBitmap(blob);
	} catch {
		return blob;
	}
	const escala = Math.min(1, lado / Math.max(bmp.width, bmp.height));
	const lienzo = document.createElement("canvas");
	lienzo.width = Math.round(bmp.width * escala);
	lienzo.height = Math.round(bmp.height * escala);
	const ctx = lienzo.getContext("2d")!;
	ctx.fillStyle = "#fff";
	ctx.fillRect(0, 0, lienzo.width, lienzo.height);
	ctx.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
	bmp.close();
	const jpeg = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/jpeg", calidad));
	return jpeg && jpeg.size < blob.size ? jpeg : blob;
}

// Una imagen de más de 9 MB no entra en Kommo: se comprime (cada vez más chica) hasta que entre.
export async function paraKommo(archivo: File): Promise<File> {
	if (archivo.size <= MAX_ARCHIVO) return archivo;
	for (const [lado, calidad] of [[4000, 0.9], [3000, 0.85], [2000, 0.8]] as const) {
		const jpeg = await achicar(archivo, lado, calidad);
		if (jpeg.size <= MAX_ARCHIVO) return new File([jpeg], archivo.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
	}
	return archivo;
}

async function aDataUrl(blob: Blob) {
	return new Promise<string>((ok, mal) => {
		const lector = new FileReader();
		lector.onload = () => ok(lector.result as string);
		lector.onerror = () => mal(lector.error);
		lector.readAsDataURL(blob);
	});
}
