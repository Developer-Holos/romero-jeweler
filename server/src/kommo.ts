// Archivos en Kommo: el PDF del invoice va al campo "Invoice" (tipo archivo) del lead y las imágenes de
// referencia se guardan como archivos del lead. Los archivos se suben a Kommo Drive.
//
// SIN VERIFICAR en la cuenta real (ver docs/DECISIONES.md, #1 y #8). Endpoints según la documentación de
// la API v4 de Kommo:
//   GET  /api/v4/account?with=drive_url        → URL de Drive de la cuenta
//   POST {drive}/v1.0/sessions                 → sesión de subida (upload_url, max_part_size)
//   POST {upload_url} (por partes)             → la última parte devuelve { uuid, version_uuid, ... }
//   PATCH /api/v4/leads/{id}                   → valor del campo archivo: { file_uuid, version_uuid, file_name, file_size }
//   PUT  /api/v4/leads/{id}/files              → adjunta archivos al lead
//   GET  /api/v4/leads/{id}/files              → archivos del lead
//   GET  {drive}/v1.0/files/{uuid}             → nombre, tipo y enlace de descarga
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

export async function adjuntarALead(leadId: number, uuid: string) {
	await api(`/api/v4/leads/${leadId}/files`, json({ method: "PUT", cuerpo: [{ file_uuid: uuid }] }));
}

type InfoDrive = { uuid: string; name: string; metadata?: { mime_type?: string; extension?: string }; _links?: { download?: { href: string } } };

async function infoArchivo(uuid: string): Promise<InfoDrive> {
	return (await (await pedir(`${await drive()}/v1.0/files/${encodeURIComponent(uuid)}`)).json()) as InfoDrive;
}

const esImagen = (info: InfoDrive) => /^image\//.test(info.metadata?.mime_type ?? "") || /^(png|jpe?g|webp|gif|heic)$/i.test(info.metadata?.extension ?? info.name.split(".").pop() ?? "");

// Imágenes que ya están en el lead (subidas desde el widget o a mano en Kommo).
export async function imagenesDelLead(leadId: number) {
	const res = await api(`/api/v4/leads/${leadId}/files`);
	if (res.status === 204) return [];
	const { _embedded } = (await res.json()) as { _embedded?: { files?: { file_uuid: string }[] } };
	const infos = await Promise.all((_embedded?.files ?? []).map((f) => infoArchivo(f.file_uuid).catch(() => null)));
	return infos.filter((i): i is InfoDrive => !!i && esImagen(i)).map((i) => ({ uuid: i.uuid, nombre: i.name }));
}

export async function descargarArchivo(uuid: string) {
	const info = await infoArchivo(uuid);
	const href = info._links?.download?.href;
	if (!href) throw new ErrorKommo("El archivo no tiene enlace de descarga en Kommo Drive", 404);
	const res = await pedir(href);
	return { datos: new Uint8Array(await res.arrayBuffer()), tipo: res.headers.get("content-type") ?? info.metadata?.mime_type ?? "application/octet-stream" };
}
