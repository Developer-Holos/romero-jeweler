// Dropbox: dónde está el video de cada orden. Cada orden tiene su carpeta con el número de la orden pagada de
// Shopify (`1146/`) y, cuando la edición termina, el video se llama `1146_completo.mp4`.
//
// Endpoints de la API v2 (docs.dropboxapi.com, verificados el 2026-11-03):
//   POST /oauth2/token (grant_type=refresh_token)        → access token de vida corta
//   POST /2/users/get_current_account                    → root_info: si es de equipo, hay que mandar Dropbox-API-Path-Root
//   POST /2/files/get_metadata · /2/files/list_folder     → confirmar que algo existe (search tiene retraso de índice)
//   POST /2/files/search_v2 (filename_only)               → buscar la carpeta cuando no se conoce la raíz
//   POST /2/files/list_folder/get_latest_cursor · /continue → solo lo que cambió (lo avisa el webhook)
//   POST /2/sharing/create_shared_link_with_settings      → link permanente a la carpeta de la orden (get_temporary_link vence a las 4 h)
//   POST /2/sharing/list_shared_links · modify_shared_link_settings → el link que ya existía, abierto al público
import { createHmac, timingSafeEqual } from "node:crypto";

export type ArchivoDropbox = { ".tag": "file"; name: string; path_lower: string; path_display: string; size: number; server_modified: string; is_downloadable?: boolean };
type Entrada = ArchivoDropbox | { ".tag": "folder" | "deleted"; name: string; path_lower: string; path_display: string };

export class ErrorDropbox extends Error {
	status: number;
	resumen: string; // error_summary de Dropbox, p. ej. "path/not_found/.."
	constructor(mensaje: string, status: number, resumen = "") {
		super(mensaje);
		this.status = status;
		this.resumen = resumen;
	}
}

type Config = { api: string; appKey: string; appSecret: string; refreshToken: string; raiz: string };
let config: Config = { api: "https://api.dropboxapi.com", appKey: "", appSecret: "", refreshToken: "", raiz: "" };
let token: { valor: string; hasta: number } | null = null;
let raizEquipo: Promise<string | null> | null = null;

// La fija servicio.ts con las variables de entorno (y los tests, con un Dropbox falso).
export function configurarDropbox(c: Partial<Config>) {
	config = { ...config, ...c, api: (c.api || config.api).replace(/\/+$/, ""), raiz: normalizarRaiz(c.raiz ?? config.raiz) };
	token = null;
	raizEquipo = null;
}

export const dropboxConfigurado = () => !!(config.appKey && config.appSecret && config.refreshToken);

// "" es la raíz de Dropbox; si no, una ruta con "/" al principio y sin "/" al final.
const normalizarRaiz = (r: string) => (r.trim() ? "/" + r.trim().replace(/^\/+|\/+$/g, "") : "");

const ESPERA = 30_000;

async function pedir(url: string, init: RequestInit) {
	try {
		return await fetch(url, { ...init, signal: AbortSignal.timeout(ESPERA) });
	} catch (e) {
		if (e instanceof DOMException && e.name === "TimeoutError") throw new ErrorDropbox(`Dropbox no respondió en ${ESPERA / 1000} s (${new URL(url).pathname})`, 504);
		throw e;
	}
}

async function accessToken() {
	if (token && token.hasta > Date.now()) return token.valor;
	const res = await pedir(`${config.api}/oauth2/token`, {
		method: "POST",
		body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: config.refreshToken, client_id: config.appKey, client_secret: config.appSecret }),
	});
	if (!res.ok) throw new ErrorDropbox(`Dropbox no renovó el token (${res.status}): ${(await res.text()).slice(0, 200)}`, 502);
	const d = (await res.json()) as { access_token: string; expires_in: number };
	// Un minuto antes de que venza, se pide otro.
	token = { valor: d.access_token, hasta: Date.now() + (d.expires_in - 60) * 1000 };
	return token.valor;
}

async function llamar<T>(ruta: string, cuerpo: unknown, conRaiz = true): Promise<T> {
	const raiz = conRaiz ? await raizDelEquipo() : null;
	const res = await pedir(`${config.api}/2/${ruta}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${await accessToken()}`,
			"Content-Type": "application/json",
			...(raiz ? { "Dropbox-API-Path-Root": JSON.stringify({ ".tag": "root", root: raiz }) } : {}),
		},
		body: JSON.stringify(cuerpo),
	});
	if (res.ok) return (await res.json()) as T;
	const texto = await res.text();
	let resumen = "";
	try {
		resumen = (JSON.parse(texto) as { error_summary?: string }).error_summary ?? "";
	} catch {}
	throw new ErrorDropbox(`Dropbox respondió ${res.status} en /2/${ruta}: ${texto.slice(0, 300)}`, res.status, resumen);
}

// En una cuenta de equipo, sin Dropbox-API-Path-Root las carpetas del equipo no se ven.
function raizDelEquipo() {
	raizEquipo ??= llamar<{ root_info: { ".tag": string; root_namespace_id: string } }>("users/get_current_account", null, false)
		.then((c) => (c.root_info[".tag"] === "team" ? c.root_info.root_namespace_id : null))
		.catch((e) => {
			raizEquipo = null;
			throw e;
		});
	return raizEquipo;
}

const noExiste = (e: unknown) => e instanceof ErrorDropbox && e.status === 409 && /not_found/.test(e.resumen);

// ─── El video de una orden ──────────────────────────────────────────────────
const EXTENSIONES = ["mp4", "mov", "m4v", "avi", "mkv"];

// `1146_completo.mp4` dentro de la carpeta `1146`. Otro sufijo (`_completo_v2`, `_borrador`) no cuenta.
export function esVideoCompleto(nombre: string, carpeta: string) {
	const m = /^(.+)_completo\.([a-z0-9]+)$/i.exec(nombre);
	return !!m && EXTENSIONES.includes(m[2].toLowerCase()) && m[1].toLowerCase() === carpeta.toLowerCase();
}

// "#1146" (como lo muestra Shopify) y "1146" son la misma orden.
export const mismaOrden = (a: string, b: string) => a.trim().replace(/^#/, "").toLowerCase() === b.trim().replace(/^#/, "").toLowerCase();

// Carpeta de la orden: directa si se conoce la raíz (DROPBOX_RAIZ), si no buscándola por nombre.
export async function carpetaDeOrden(orden: string): Promise<string | null> {
	if (config.raiz) {
		try {
			const m = await llamar<Entrada>("files/get_metadata", { path: `${config.raiz}/${orden}` });
			return m[".tag"] === "folder" ? m.path_display : null;
		} catch (e) {
			if (noExiste(e)) return null;
			throw e;
		}
	}
	const r = await llamar<{ matches: { metadata: { metadata: Entrada } }[] }>("files/search_v2", {
		query: orden,
		options: { filename_only: true, file_status: "active", max_results: 100 },
	});
	const carpetas = r.matches.map((x) => x.metadata.metadata).filter((m) => m[".tag"] === "folder" && m.name.toLowerCase() === orden.toLowerCase());
	return carpetas[0]?.path_display ?? null;
}

const listo = (a: ArchivoDropbox) => a.size > 0 && a.is_downloadable !== false;

// Lo que hay en una carpeta, o null si ya no existe.
async function archivosDe(carpeta: string): Promise<Entrada[] | null> {
	try {
		let r = await llamar<{ entries: Entrada[]; cursor: string; has_more: boolean }>("files/list_folder", { path: carpeta });
		const archivos = [...r.entries];
		while (r.has_more) {
			r = await llamar("files/list_folder/continue", { cursor: r.cursor });
			archivos.push(...r.entries);
		}
		return archivos;
	} catch (e) {
		if (noExiste(e)) return null;
		throw e;
	}
}

// Todos los formatos que ya están (mp4, mov…) de la orden; el primero es el que dispara el aviso. `guardada` es la
// carpeta con la que ya se avisó o quedó pendiente: se usa tal cual: buscar por nombre podría elegir otra si hay
// dos carpetas iguales, o no encontrarla aún por el retraso del índice. Solo si ya no existe se vuelve a buscar.
export async function videoDeOrden(orden: string, guardada?: string | null): Promise<{ carpeta: string | null; videos: ArchivoDropbox[] }> {
	let carpeta = guardada || (await carpetaDeOrden(orden));
	let archivos = carpeta ? await archivosDe(carpeta) : null;
	if (!archivos && guardada) {
		carpeta = await carpetaDeOrden(orden);
		archivos = carpeta ? await archivosDe(carpeta) : null;
	}
	if (!carpeta || !archivos) return { carpeta: null, videos: [] };
	return { carpeta, videos: archivos.filter((e): e is ArchivoDropbox => e[".tag"] === "file" && esVideoCompleto(e.name, orden) && listo(e)) };
}

// ─── Cambios (webhook) ──────────────────────────────────────────────────────
// Un archivo es el video de una orden si se llama `<orden>_completo.<video>`, está dentro de la carpeta `<orden>` y
// ya se puede descargar. Con DROPBOX_RAIZ, la carpeta tiene que estar justo en la raíz (lo mismo que mira
// carpetaDeOrden); sin ella, a cualquier profundidad.
export function comoVideo(e: Entrada): { orden: string; archivo: ArchivoDropbox } | null {
	if (e[".tag"] !== "file") return null;
	const carpeta = carpetaDe(e);
	const orden = carpeta.split("/").at(-1) ?? "";
	if (config.raiz && carpeta.slice(0, -orden.length - 1).toLowerCase() !== config.raiz.toLowerCase()) return null;
	return esVideoCompleto(e.name, orden) && listo(e) ? { orden, archivo: e } : null;
}

// La carpeta de la orden, que es lo que se comparte con el cliente (puede haber varios formatos del video).
export const carpetaDe = (archivo: ArchivoDropbox) => archivo.path_display.split("/").slice(0, -1).join("/");

// El webhook no trae los cambios: hay que pedirlos con el cursor guardado.
export async function cursorInicial() {
	return (await llamar<{ cursor: string }>("files/list_folder/get_latest_cursor", { path: config.raiz, recursive: true })).cursor;
}

// Videos completos que aparecieron desde el cursor, lo que se borró o movió (path_lower) y el cursor nuevo.
export async function videosNuevos(cursor: string): Promise<{ videos: { orden: string; archivo: ArchivoDropbox }[]; borrados: string[]; cursor: string }> {
	const videos: { orden: string; archivo: ArchivoDropbox }[] = [];
	const borrados: string[] = [];
	let r: { entries: Entrada[]; cursor: string; has_more: boolean };
	try {
		r = await llamar("files/list_folder/continue", { cursor });
	} catch (e) {
		if (!(e instanceof ErrorDropbox && e.status === 409 && /reset/.test(e.resumen))) throw e;
		// Dropbox invalidó el cursor: lo que cambió entre medio no se puede recuperar. Los videos de ese lapso se
		// pasan a mano con POST /api/videos/:orden.
		console.warn("[videos] Dropbox reinició el cursor: los cambios desde el último aviso se perdieron");
		return { videos, borrados, cursor: await cursorInicial() };
	}
	for (;;) {
		for (const e of r.entries) {
			if (e[".tag"] === "deleted") borrados.push(e.path_lower);
			const v = comoVideo(e);
			if (v) videos.push(v);
		}
		if (!r.has_more) return { videos, borrados, cursor: r.cursor };
		r = await llamar("files/list_folder/continue", { cursor: r.cursor });
	}
}

// ─── Link para el cliente ───────────────────────────────────────────────────
type Link = { url: string; link_permissions?: { resolved_visibility?: { ".tag": string }; effective_audience?: { ".tag": string } } };
const PUBLICO = { audience: "public", access: "viewer", allow_download: true };

// En una cuenta de equipo, la política puede dejar el link solo para el equipo: el cliente no lo podría abrir.
function publico(l: Link, path: string) {
	const p = l.link_permissions;
	const quien = p?.effective_audience?.[".tag"] ?? p?.resolved_visibility?.[".tag"];
	if (quien && quien !== "public") throw new ErrorDropbox(`El link de ${path} no es público (${quien}): revisar la política de links del equipo en Dropbox`, 502);
	return l.url;
}

export async function linkCompartido(path: string): Promise<string> {
	try {
		return publico(await llamar<Link>("sharing/create_shared_link_with_settings", { path, settings: PUBLICO }), path);
	} catch (e) {
		if (!(e instanceof ErrorDropbox && /shared_link_already_exists/.test(e.resumen))) throw e;
	}
	const r = await llamar<{ links: Link[] }>("sharing/list_shared_links", { path, direct_only: true });
	const link = r.links[0];
	if (!link) throw new ErrorDropbox(`Dropbox dice que ${path} ya tiene link, pero no lo devuelve`, 502);
	try {
		return publico(link, path);
	} catch {
		// Alguien lo había compartido solo con el equipo: se abre al público.
		return publico(await llamar<Link>("sharing/modify_shared_link_settings", { url: link.url, settings: PUBLICO }), path);
	}
}

// X-Dropbox-Signature: HMAC-SHA256 (hex) del cuerpo crudo con el app secret.
export function firmaValida(cuerpo: string, firma: string | null) {
	if (!config.appSecret || !firma) return false;
	const esperada = Buffer.from(createHmac("sha256", config.appSecret).update(cuerpo).digest("hex"));
	const recibida = Buffer.from(firma);
	return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}
