// Cliente del servidor externo del widget (carpeta server/): genera el PDF, redacta con IA
// y guarda la plantilla de diseño compartida.
import { SERVIDOR_KEY, SERVIDOR_URL } from "$app/env/public";

export type Redaccion = {
	titulo: string;
	vinetas: string[];
	clausulas: { id: string; nombre: string; texto: string }[];
	descartadas: string[];
};

export const hayServidor = !!SERVIDOR_URL;

export class ErrorServidor extends Error {
	constructor(mensaje: string, readonly status: number) {
		super(mensaje);
	}
}

async function pedir(ruta: string, init: RequestInit = {}) {
	if (!SERVIDOR_URL) throw new ErrorServidor("El widget no tiene configurada la URL del servidor", 0);
	let res: Response;
	try {
		res = await fetch(SERVIDOR_URL.replace(/\/$/, "") + ruta, {
			...init,
			headers: { Authorization: `Bearer ${SERVIDOR_KEY ?? ""}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
		});
	} catch {
		throw new ErrorServidor("No hay conexión con el servidor del widget", 0);
	}
	if (!res.ok) {
		const { error } = await res.json().catch(() => ({ error: "" }));
		throw new ErrorServidor(error || (res.status === 401 ? "La clave del widget no es válida" : `El servidor respondió ${res.status}`), res.status);
	}
	return res;
}

export async function leerPlantillaServidor(): Promise<unknown | null> {
	return (await (await pedir("/plantilla")).json()).plantilla;
}

export async function guardarPlantillaServidor(plantilla: unknown) {
	await pedir("/plantilla", { method: "PUT", body: JSON.stringify(plantilla) });
}

export async function redactar(pedido: { idioma: "es" | "en"; pieza: string; vinetas: string[]; notas: string; instrucciones: string; clausulas: { id: string; nombre: string; texto: string }[] }): Promise<Redaccion> {
	return (await pedir("/ia/redactar", { method: "POST", body: JSON.stringify(pedido) })).json();
}

export async function generarPdf(html: string, nombre: string): Promise<Blob> {
	return (await pedir("/pdf", { method: "POST", body: JSON.stringify({ html, nombre }) })).blob();
}

// Ancho de diseño de la vista previa; en el PDF se escala a una hoja carta (8.5 in = 816 px).
const ANCHO = 560;

// Copia la vista previa a un HTML autónomo: estilos en línea e imágenes subidas como data URLs,
// porque el servidor no tiene acceso a este navegador.
export async function htmlDelInvoice(articulo: HTMLElement) {
	const clon = articulo.cloneNode(true) as HTMLElement;
	clon.querySelectorAll("[data-no-pdf]").forEach((el) => el.remove());
	for (const img of clon.querySelectorAll("img")) {
		if (img.src.startsWith("blob:")) img.src = await aDataUrl(img.src);
	}
	const css = [...document.styleSheets]
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

async function aDataUrl(url: string) {
	const blob = await (await fetch(url)).blob();
	return new Promise<string>((ok, mal) => {
		const lector = new FileReader();
		lector.onload = () => ok(lector.result as string);
		lector.onerror = () => mal(lector.error);
		lector.readAsDataURL(blob);
	});
}
