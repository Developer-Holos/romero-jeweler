// Archivos en Kommo: el PDF del invoice va al campo "Invoice" (tipo archivo) del lead y las imágenes de
// referencia, a la pestaña "Imágenes de la pieza" del lead (un campo archivo por imagen, que se crean a medida
// que hacen falta). Los archivos se suben a Kommo Drive.
//
// Drive y el campo archivo están verificados con la cuenta real (docs/DECISIONES.md, #1 y #8). Endpoints de la
// API v4 de Kommo:
//   GET  /api/v4/account?with=drive_url        → URL de Drive de la cuenta
//   POST {drive}/v1.0/sessions                 → sesión de subida (upload_url, max_part_size)
//   POST {upload_url} (por partes)             → la última parte devuelve { uuid, version_uuid, ... }
//   PATCH /api/v4/leads/{id}                   → valor del campo archivo: { file_uuid, version_uuid, file_name, file_size }
//   PUT  /api/v4/leads/{id}/files              → adjunta archivos al lead
//   GET  /api/v4/leads/{id}/files              → archivos del lead
//   GET  {drive}/v1.0/files/{uuid}             → nombre, tipo y enlace de descarga
//   GET/POST /api/v4/leads/custom_fields/groups → pestañas de campos del lead
//   GET/POST /api/v4/leads/custom_fields        → campos (los de imágenes son de tipo "file")
import { env } from "./env.ts";

export type ArchivoKommo = { uuid: string; version_uuid: string; nombre: string; tamano: number; tipo: string };

export class ErrorKommo extends Error {
	constructor(mensaje: string, readonly status: number) {
		super(mensaje);
	}
}

export const kommoConfigurado = () => !!(env.KOMMO_BASE_URL && env.KOMMO_ACCESS_TOKEN);

const cabeceras = () => ({ Authorization: `Bearer ${env.KOMMO_ACCESS_TOKEN}` });

async function pedir(url: string, init: RequestInit = {}) {
	const res = await fetch(url, { ...init, headers: { ...cabeceras(), ...init.headers } });
	if (!res.ok) throw new ErrorKommo(`Kommo respondió ${res.status} en ${new URL(url).pathname}: ${(await res.text()).slice(0, 300)}`, res.status);
	return res;
}

const api = (ruta: string, init?: RequestInit) => pedir(env.KOMMO_BASE_URL + ruta, init);
const json = (init: RequestInit & { cuerpo?: unknown }) => ({ ...init, body: JSON.stringify(init.cuerpo), headers: { "Content-Type": "application/json" } });

let driveUrl: string | null = null;
async function drive() {
	driveUrl ??= ((await (await api("/api/v4/account?with=drive_url")).json()) as { drive_url: string }).drive_url.replace(/\/+$/, "");
	return driveUrl;
}

export async function subirArchivo(datos: Uint8Array, nombre: string, tipo: string): Promise<ArchivoKommo> {
	const d = await drive();
	const sesion = (await (await pedir(`${d}/v1.0/sessions`, json({ method: "POST", cuerpo: { file_name: nombre, file_size: datos.length, content_type: tipo } }))).json()) as {
		upload_url: string;
		max_part_size: number;
	};
	let url = sesion.upload_url;
	const parte = sesion.max_part_size || 512 * 1024;
	for (let desde = 0; ; desde += parte) {
		const res = (await (await pedir(url, { method: "POST", body: datos.slice(desde, desde + parte) })).json()) as { next_url?: string; uuid?: string; version_uuid?: string; size?: number };
		if (res.uuid) return { uuid: res.uuid, version_uuid: res.version_uuid ?? "", nombre, tamano: res.size ?? datos.length, tipo };
		if (!res.next_url) throw new ErrorKommo("Kommo Drive no devolvió el archivo al terminar la subida", 502);
		url = res.next_url;
	}
}

// El campo archivo guarda uno solo: el invoice nuevo reemplaza al anterior (el historial queda en la base).
export async function guardarEnCampo(leadId: number, campoId: number, archivo: ArchivoKommo) {
	await api(
		`/api/v4/leads/${leadId}`,
		json({
			method: "PATCH",
			cuerpo: { custom_fields_values: [{ field_id: campoId, values: [{ value: { file_uuid: archivo.uuid, version_uuid: archivo.version_uuid, file_name: archivo.nombre, file_size: archivo.tamano } }] }] },
		}),
	);
}

// ─── Pestaña de imágenes del lead ───────────────────────────────────────────
// Al instalar el widget se crea la pestaña con 3 campos archivo (Imagen 1…3). Si un lead ya los tiene
// ocupados, la próxima imagen crea "Imagen 4", "Imagen 5"…: no hay límite.
export const PESTANA_IMAGENES = "Imágenes de la pieza";
const PREFIJO_CAMPO = "Imagen ";
export const CAMPOS_INICIALES = 3;

type Campo = { id: number; name: string; type: string; group_id: string | null; sort: number };
type Grupo = { id: string; name: string };

async function todos<T>(ruta: string, clave: string): Promise<T[]> {
	const items: T[] = [];
	for (let pagina = 1; pagina <= 20; pagina++) {
		const res = await api(`${ruta}${ruta.includes("?") ? "&" : "?"}limit=250&page=${pagina}`);
		if (res.status === 204) break;
		const cuerpo = (await res.json()) as { _embedded?: Record<string, T[]>; _links?: { next?: unknown } };
		items.push(...(cuerpo._embedded?.[clave] ?? []));
		if (!cuerpo._links?.next) break;
	}
	return items;
}

const numeroDe = (c: Campo) => Number(c.name.slice(PREFIJO_CAMPO.length)) || 0;

// Crear campos va en serie: dos subidas a la vez no deben crear dos "Imagen 4".
let enCurso: Promise<unknown> = Promise.resolve();
const enSerie = <T>(fn: () => Promise<T>): Promise<T> => {
	const r = enCurso.then(fn, fn);
	enCurso = r.catch(() => {});
	return r;
};

// La pestaña y al menos `cantidad` campos "Imagen N" (tipo archivo), ordenados por número. Se recuerda un
// minuto, porque el listado de imágenes la consulta cada vez que se abre el generador.
let recordado: { hasta: number; grupo: string; campos: Campo[] } | null = null;
export function asegurarCamposImagenes(cantidad = CAMPOS_INICIALES): Promise<{ grupo: string; campos: Campo[] }> {
	return enSerie(async () => {
		if (recordado && recordado.hasta > Date.now() && recordado.campos.length >= cantidad) return recordado;
		const grupos = await todos<Grupo>("/api/v4/leads/custom_fields/groups", "custom_field_groups");
		let grupo = grupos.find((g) => g.name === PESTANA_IMAGENES)?.id;
		if (!grupo) {
			const res = await api("/api/v4/leads/custom_fields/groups", json({ method: "POST", cuerpo: [{ name: PESTANA_IMAGENES, sort: 100 }] }));
			grupo = ((await res.json()) as { _embedded: { custom_field_groups: Grupo[] } })._embedded.custom_field_groups[0].id;
		}
		const enGrupo = (await todos<Campo>("/api/v4/leads/custom_fields", "custom_fields"))
			.filter((c) => c.group_id === grupo && c.type === "file" && c.name.startsWith(PREFIJO_CAMPO))
			.sort((a, b) => numeroDe(a) - numeroDe(b));
		const ultimo = enGrupo.length ? numeroDe(enGrupo.at(-1)!) : 0;
		const faltan = Array.from({ length: Math.max(0, cantidad - enGrupo.length) }, (_, i) => ultimo + i + 1);
		if (faltan.length) {
			const res = await api(
				"/api/v4/leads/custom_fields",
				json({ method: "POST", cuerpo: faltan.map((n) => ({ name: `${PREFIJO_CAMPO}${n}`, type: "file", group_id: grupo, sort: 100 + n })) }),
			);
			enGrupo.push(...((await res.json()) as { _embedded: { custom_fields: Campo[] } })._embedded.custom_fields);
		}
		recordado = { hasta: Date.now() + 60_000, grupo, campos: enGrupo };
		return recordado;
	});
}

type ValorArchivo = { file_uuid: string; file_name?: string; is_deleted?: boolean };
type ValoresLead = { custom_fields_values?: { field_id: number; values?: { value?: ValorArchivo }[] }[] | null };

const archivoEn = (lead: ValoresLead, campoId: number) => {
	const v = lead.custom_fields_values?.find((c) => c.field_id === campoId)?.values?.[0]?.value;
	return v?.file_uuid && !v.is_deleted ? v : null;
};

// La imagen va al primer campo libre de la pestaña en ese lead; si están todos ocupados, se crea uno más.
export async function guardarImagenEnLead(leadId: number, archivo: ArchivoKommo) {
	let { campos } = await asegurarCamposImagenes();
	const lead = (await (await api(`/api/v4/leads/${leadId}`)).json()) as ValoresLead;
	let libre = campos.find((c) => !archivoEn(lead, c.id));
	if (!libre) {
		({ campos } = await asegurarCamposImagenes(campos.length + 1));
		libre = campos.find((c) => !archivoEn(lead, c.id))!;
	}
	await guardarEnCampo(leadId, libre.id, archivo);
	return libre.name;
}

type InfoDrive = { uuid: string; name: string; metadata?: { mime_type?: string; extension?: string }; _links?: { download?: { href: string } } };

async function infoArchivo(uuid: string): Promise<InfoDrive> {
	return (await (await pedir(`${await drive()}/v1.0/files/${encodeURIComponent(uuid)}`)).json()) as InfoDrive;
}

const esImagen = (info: InfoDrive) => /^image\//.test(info.metadata?.mime_type ?? "") || /^(png|jpe?g|webp|gif|heic)$/i.test(info.metadata?.extension ?? info.name.split(".").pop() ?? "");

// Imágenes del lead: las de la pestaña "Imágenes de la pieza" (en orden) y, después, las que estén adjuntas
// como archivos del lead (subidas a mano en Kommo o con versiones anteriores del widget).
export async function imagenesDelLead(leadId: number) {
	const [{ campos }, lead, adjuntos] = await Promise.all([
		asegurarCamposImagenes(),
		api(`/api/v4/leads/${leadId}`).then((r) => r.json() as Promise<ValoresLead>),
		api(`/api/v4/leads/${leadId}/files`).then(async (r) => (r.status === 204 ? [] : (((await r.json()) as { _embedded?: { files?: { file_uuid: string }[] } })._embedded?.files ?? []))),
	]);
	const enCampos = campos.map((c) => archivoEn(lead, c.id)).filter((v): v is ValorArchivo => !!v);
	const vistos = new Set(enCampos.map((v) => v.file_uuid));
	const infos = await Promise.all(adjuntos.filter((f) => !vistos.has(f.file_uuid)).map((f) => infoArchivo(f.file_uuid).catch(() => null)));
	return [
		...enCampos.map((v) => ({ uuid: v.file_uuid, nombre: v.file_name ?? "imagen" })),
		...infos.filter((i): i is InfoDrive => !!i && esImagen(i)).map((i) => ({ uuid: i.uuid, nombre: i.name })),
	];
}

export async function descargarArchivo(uuid: string) {
	const info = await infoArchivo(uuid);
	const href = info._links?.download?.href;
	if (!href) throw new ErrorKommo("El archivo no tiene enlace de descarga en Kommo Drive", 404);
	const res = await pedir(href);
	return { datos: new Uint8Array(await res.arrayBuffer()), tipo: res.headers.get("content-type") ?? info.metadata?.mime_type ?? "application/octet-stream" };
}
