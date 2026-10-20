// La API de punta a punta contra un Kommo falso (cuenta, Drive, leads y archivos) y una base PGlite en memoria.
import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import { after, before, describe, it } from "node:test";

const leer = async (req: IncomingMessage) => {
	const partes: Buffer[] = [];
	for await (const p of req) partes.push(p as Buffer);
	return Buffer.concat(partes);
};

// Kommo falso: guarda lo que se le sube para poder revisarlo.
const kommo = { archivos: new Map<string, { nombre: string; tipo: string; datos: Buffer }>(), lead: new Map<number, unknown>(), adjuntos: new Map<number, string[]>() };
const falso = createServer(async (req, res) => {
	const url = new URL(req.url!, "http://x");
	const base = `http://127.0.0.1:${(falso.address() as { port: number }).port}`;
	const json = (d: unknown, status = 200) => (res.writeHead(status, { "Content-Type": "application/json" }), res.end(JSON.stringify(d)));
	if (req.headers.authorization !== "Bearer token-kommo") return json({ title: "Unauthorized" }, 401);
	if (url.pathname === "/api/v4/account") return json({ drive_url: `${base}/drive` });
	if (url.pathname === "/drive/v1.0/sessions") {
		const { file_name, content_type } = JSON.parse((await leer(req)).toString());
		const id = `s${kommo.archivos.size}`;
		kommo.archivos.set(id, { nombre: file_name, tipo: content_type, datos: Buffer.alloc(0) });
		return json({ session_id: id, upload_url: `${base}/upload/${id}/0`, max_part_size: 4096 });
	}
	const subida = url.pathname.match(/^\/upload\/(\w+)\/(\d+)$/);
	if (subida) {
		const a = kommo.archivos.get(subida[1])!;
		const parte = await leer(req);
		a.datos = Buffer.concat([a.datos, parte]);
		if (parte.length === 4096) return json({ next_url: `${base}/upload/${subida[1]}/${+subida[2] + 1}` });
		return json({ uuid: `uuid-${subida[1]}`, version_uuid: `v-${subida[1]}`, name: a.nombre, size: a.datos.length });
	}
	const info = url.pathname.match(/^\/drive\/v1\.0\/files\/uuid-(\w+)$/);
	if (info) {
		const a = kommo.archivos.get(info[1])!;
		return json({ uuid: `uuid-${info[1]}`, name: a.nombre, metadata: { mime_type: a.tipo }, _links: { download: { href: `${base}/descargar/${info[1]}` } } });
	}
	const descarga = url.pathname.match(/^\/descargar\/(\w+)$/);
	if (descarga) {
		const a = kommo.archivos.get(descarga[1])!;
		res.writeHead(200, { "Content-Type": a.tipo });
		return res.end(a.datos);
	}
	const lead = url.pathname.match(/^\/api\/v4\/leads\/(\d+)(\/files)?$/);
	if (lead && !lead[2] && req.method === "PATCH") return (kommo.lead.set(+lead[1], JSON.parse((await leer(req)).toString())), json({ id: +lead[1] }));
	if (lead && lead[2] && req.method === "PUT") {
		const uuids = JSON.parse((await leer(req)).toString()).map((f: { file_uuid: string }) => f.file_uuid);
		kommo.adjuntos.set(+lead[1], [...(kommo.adjuntos.get(+lead[1]) ?? []), ...uuids]);
		return json({});
	}
	if (lead && lead[2] && req.method === "GET") {
		const uuids = kommo.adjuntos.get(+lead[1]) ?? [];
		if (!uuids.length) return (res.writeHead(204), res.end());
		return json({ _embedded: { files: uuids.map((u) => ({ file_uuid: u })) } });
	}
	json({ title: "Not found" }, 404);
});

let app: { request: (url: string, init?: RequestInit) => Response | Promise<Response> };
let db: { cerrar(): Promise<void> };

before(async () => {
	await new Promise<void>((ok) => falso.listen(0, "127.0.0.1", ok));
	Object.assign(process.env, {
		WIDGET_KEY: "clave-widget",
		ADMIN_KEY: "clave-admin",
		KOMMO_BASE_URL: `http://127.0.0.1:${(falso.address() as { port: number }).port}`,
		KOMMO_ACCESS_TOKEN: "token-kommo",
		KOMMO_CAMPO_INVOICE: "777",
		OPENAI_MODEL: "modelo-inicial",
	});
	const { abrirDb } = await import("./db.ts");
	const { crearApp } = await import("./app.ts");
	db = await abrirDb({ dir: "memoria" });
	app = crearApp(db as never);
});

after(async () => {
	const { cerrarNavegador } = await import("./pdf.ts");
	await cerrarNavegador();
	await db.cerrar();
	falso.close();
});

const W = { "X-Widget-Key": "clave-widget", "Content-Type": "application/json" };

describe("claves", () => {
	it("pide la clave del widget y la de administración por separado", async () => {
		assert.equal((await app.request("/plantilla")).status, 401);
		assert.equal((await app.request("/admin/ia", { headers: W })).status, 401);
		assert.equal((await app.request("/salud")).status, 200);
	});
});

describe("modelo de IA", () => {
	it("se cambia sin reiniciar y queda en la base", async () => {
		const A = { "X-Admin-Key": "clave-admin", "Content-Type": "application/json" };
		assert.equal((await (await app.request("/admin/ia", { headers: A })).json()).modelo, "modelo-inicial");
		await app.request("/admin/ia", { method: "PUT", headers: A, body: JSON.stringify({ modelo: "gpt-otro" }) });
		assert.equal((await (await app.request("/admin/ia", { headers: A })).json()).modelo, "gpt-otro");
	});
});

describe("borradores", () => {
	it("los comparte por lead", async () => {
		assert.equal((await (await app.request("/borradores/55", { headers: W })).json()).borrador, null);
		await app.request("/borradores/55", { method: "PUT", headers: W, body: JSON.stringify({ pieza: "Dije" }) });
		assert.deepEqual((await (await app.request("/borradores/55", { headers: W })).json()).borrador, { pieza: "Dije" });
	});
});

describe("invoice", () => {
	it("numera, genera el PDF y lo guarda en el campo Invoice del lead", async () => {
		const { numero } = await (await app.request("/invoices/numero", { method: "POST", headers: W, body: JSON.stringify({ lead_id: 31337 }) })).json();
		assert.match(numero, /^RJ-\d{4}-0001$/);

		const res = await app.request(`/invoices/${numero}/pdf`, { method: "POST", headers: W, body: JSON.stringify({ html: "<h1>Invoice</h1>", total: 3850, datos: {} }) });
		assert.equal(res.status, 200);
		assert.equal(res.headers.get("X-Kommo-Estado"), "guardado");
		const pdf = Buffer.from(await res.arrayBuffer());
		assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");

		// El archivo que llegó a Kommo es el mismo PDF, subido por partes, y quedó en el campo 777.
		const subido = [...kommo.archivos.values()].find((a) => a.nombre === `${numero}.pdf`)!;
		assert.ok(subido.datos.equals(pdf));
		const cambio = kommo.lead.get(31337) as { custom_fields_values: { field_id: number; values: { value: { file_name: string } }[] }[] };
		assert.equal(cambio.custom_fields_values[0].field_id, 777);
		assert.equal(cambio.custom_fields_values[0].values[0].value.file_name, `${numero}.pdf`);

		const { numero: siguiente } = await (await app.request("/invoices/numero", { method: "POST", headers: W, body: JSON.stringify({ lead_id: 99 }) })).json();
		assert.match(siguiente, /-0002$/);
	});

	it("no genera PDF para un número que no se asignó", async () => {
		assert.equal((await app.request("/invoices/RJ-1999-0001/pdf", { method: "POST", headers: W, body: JSON.stringify({ html: "<p>x</p>" }) })).status, 404);
	});
});

describe("imágenes del lead", () => {
	it("sube, lista y descarga desde Kommo", async () => {
		const png = Buffer.from("89504e470d0a1a0a", "hex");
		const subida = await app.request("/leads/31337/imagenes", { method: "POST", headers: { "X-Widget-Key": "clave-widget", "Content-Type": "image/png", "X-Nombre-Archivo": encodeURIComponent("render frontal.png") }, body: png });
		const { uuid, nombre } = await subida.json();
		assert.equal(nombre, "render frontal.png");

		const { imagenes } = await (await app.request("/leads/31337/imagenes", { headers: W })).json();
		assert.deepEqual(imagenes, [{ uuid, nombre: "render frontal.png" }]); // el PDF del invoice no es imagen: no aparece

		const descarga = await app.request(`/imagenes/${uuid}`, { headers: W });
		assert.equal(descarga.headers.get("Content-Type"), "image/png");
		assert.ok(Buffer.from(await descarga.arrayBuffer()).equals(png));
	});
});
