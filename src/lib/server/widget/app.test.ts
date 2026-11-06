// La API del widget (/api) de punta a punta: la app compilada (`vite build`, adapter-node) contra un Kommo falso
// (cuenta, Drive, leads y archivos) y una base PGlite en una carpeta temporal. Correr `vite build` antes.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

const leer = async (req: IncomingMessage) => {
	const partes: Buffer[] = [];
	for await (const p of req) partes.push(p as Buffer);
	return Buffer.concat(partes);
};

// Kommo falso: guarda lo que se le sube para poder revisarlo.
type ValorCampo = { field_id: number; values: { value: Record<string, unknown> }[] };
const kommo = {
	archivos: new Map<string, { nombre: string; tipo: string; datos: Buffer }>(),
	lead: new Map<number, ValorCampo[]>(), // valores de campos por lead (cada PATCH los va sumando)
	adjuntos: new Map<number, string[]>(),
	notas: [] as { entity_id: number; params: { text: string } }[],
	bots: [] as { bot_id: number; entity_id: number }[],
	grupos: [] as { id: string; name: string }[],
	campos: [{ id: 777, name: "Invoice", type: "file", group_id: null as string | null, sort: 1 }],
};
// Dropbox falso: archivos por ruta y la lista de cambios que devuelve list_folder/continue (cursor "cN" = desde N).
type ArchivoFalso = { ".tag": "file" | "deleted"; name: string; path_lower: string; path_display: string; size?: number; server_modified?: string };
const dropbox = { cambios: [] as ArchivoFalso[], links: new Map<string, string>() };
const subirADropbox = (ruta: string) => {
	const a: ArchivoFalso = { ".tag": "file", name: ruta.split("/").at(-1)!, path_lower: ruta.toLowerCase(), path_display: ruta, size: 1234, server_modified: "2026-11-03T12:00:00Z" };
	dropbox.cambios.push(a);
};
const borrarDeDropbox = (ruta: string) => dropbox.cambios.push({ ".tag": "deleted", name: ruta.split("/").at(-1)!, path_lower: ruta.toLowerCase(), path_display: ruta });
const padre = (ruta: string) => ruta.toLowerCase().split("/").slice(0, -1).join("/");

const falso = createServer(async (req, res) => {
	const url = new URL(req.url!, "http://x");
	const base = `http://127.0.0.1:${(falso.address() as { port: number }).port}`;
	const json = (d: unknown, status = 200) => (res.writeHead(status, { "Content-Type": "application/json" }), res.end(JSON.stringify(d)));
	if (url.pathname === "/oauth2/token") return json({ access_token: "token-dbx", expires_in: 14400 });
	if (url.pathname.startsWith("/2/")) {
		if (req.headers.authorization !== "Bearer token-dbx") return json({ error_summary: "invalid_access_token/" }, 401);
		const cuerpo = JSON.parse((await leer(req)).toString() || "null");
		const archivos = [...new Map(dropbox.cambios.map((a) => [a.path_lower, a])).values()].filter((a) => a[".tag"] === "file");
		switch (url.pathname) {
			case "/2/users/get_current_account":
				return json({ root_info: { ".tag": "user", root_namespace_id: "1", home_namespace_id: "1" } });
			case "/2/files/list_folder/get_latest_cursor":
				return json({ cursor: `c${dropbox.cambios.length}` });
			case "/2/files/list_folder/continue": {
				const desde = Number(String(cuerpo.cursor).slice(1));
				return json({ entries: dropbox.cambios.slice(desde), cursor: `c${dropbox.cambios.length}`, has_more: false });
			}
			case "/2/files/get_metadata": {
				const ruta = String(cuerpo.path).toLowerCase();
				const archivo = archivos.find((a) => a.path_lower === ruta);
				if (archivo) return json(archivo);
				if (!archivos.some((a) => padre(a.path_lower) === ruta)) return json({ error_summary: "path/not_found/." }, 409);
				return json({ ".tag": "folder", name: cuerpo.path.split("/").at(-1), path_lower: ruta, path_display: cuerpo.path });
			}
			case "/2/files/list_folder":
				return json({ entries: archivos.filter((a) => padre(a.path_lower) === String(cuerpo.path).toLowerCase()), cursor: "x", has_more: false });
			case "/2/sharing/create_shared_link_with_settings":
				if (dropbox.links.has(cuerpo.path)) return json({ error_summary: "shared_link_already_exists/.." }, 409);
				dropbox.links.set(cuerpo.path, `https://www.dropbox.com/s/falso/${encodeURIComponent(cuerpo.path.split("/").at(-1))}`);
				return json({ url: dropbox.links.get(cuerpo.path) });
			case "/2/sharing/list_shared_links":
				return json({ links: dropbox.links.has(cuerpo.path) ? [{ url: dropbox.links.get(cuerpo.path) }] : [] });
		}
		return json({ error_summary: "not_found" }, 404);
	}
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
	if (url.pathname === "/api/v4/leads/custom_fields/groups" && req.method === "GET") return json({ _embedded: { custom_field_groups: kommo.grupos } });
	if (url.pathname === "/api/v4/leads/custom_fields/groups" && req.method === "POST") {
		const nuevos = JSON.parse((await leer(req)).toString()).map((g: { name: string }) => ({ id: `leads_${kommo.grupos.length + 1}`, name: g.name }));
		kommo.grupos.push(...nuevos);
		return json({ _embedded: { custom_field_groups: nuevos } });
	}
	if (url.pathname === "/api/v4/leads/custom_fields" && req.method === "GET") return json({ _embedded: { custom_fields: kommo.campos } });
	if (url.pathname === "/api/v4/leads/custom_fields" && req.method === "POST") {
		const nuevos = JSON.parse((await leer(req)).toString()).map((c: { name: string; type: string; group_id: string; sort: number }, i: number) => ({ ...c, id: 1000 + kommo.campos.length + i }));
		kommo.campos.push(...nuevos);
		return json({ _embedded: { custom_fields: nuevos } });
	}
	const lead = url.pathname.match(/^\/api\/v4\/leads\/(\d+)(\/files)?$/);
	if (lead && !lead[2] && req.method === "GET") return json({ id: +lead[1], custom_fields_values: kommo.lead.get(+lead[1]) ?? null });
	if (lead && !lead[2] && req.method === "PATCH") {
		const { custom_fields_values } = JSON.parse((await leer(req)).toString()) as { custom_fields_values: ValorCampo[] };
		const valores = (kommo.lead.get(+lead[1]) ?? []).filter((v) => !custom_fields_values.some((n) => n.field_id === v.field_id));
		kommo.lead.set(+lead[1], [...valores, ...custom_fields_values]);
		return json({ id: +lead[1] });
	}
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
	if (url.pathname === "/api/v4/leads" && req.method === "GET") {
		// query: busca el texto en cualquier campo del lead (como Kommo).
		const q = url.searchParams.get("query") ?? "";
		const leads = [...kommo.lead].filter(([, vs]) => vs.some((v) => v.values.some((x) => String(x.value).includes(q)))).map(([id, vs]) => ({ id, custom_fields_values: vs }));
		if (!leads.length || url.searchParams.get("page") !== "1") return (res.writeHead(204), res.end());
		return json({ _embedded: { leads } });
	}
	if (url.pathname === "/api/v4/leads/notes" && req.method === "POST") {
		kommo.notas.push(...JSON.parse((await leer(req)).toString()));
		return json({});
	}
	if (url.pathname === "/api/v2/salesbot/run" && req.method === "POST") {
		kommo.bots.push(...JSON.parse((await leer(req)).toString()));
		return json({ success: true });
	}
	json({ title: "Not found" }, 404);
});

const PUERTO = 3917;
const app = { request: (ruta: string, init?: RequestInit) => fetch(`http://127.0.0.1:${PUERTO}/api${ruta}`, init) };
const datos = mkdtempSync(join(tmpdir(), "rj-api-"));
let proceso: ReturnType<typeof spawn>;

before(async () => {
	await new Promise<void>((ok) => falso.listen(0, "127.0.0.1", ok));
	proceso = spawn(process.execPath, ["build"], {
		env: {
			...process.env,
			PORT: String(PUERTO),
			HOST: "127.0.0.1",
			DATA_DIR: datos,
			DATABASE_URL: "",
			OPENAI_API_KEY: "",
			ORIGENES: "https://romerojeweler.kommo.com",
			WIDGET_KEY: "clave-widget",
			ADMIN_KEY: "clave-admin",
			KOMMO_SUBDOMAIN: "x",
			KOMMO_BASE_URL: `http://127.0.0.1:${(falso.address() as { port: number }).port}`,
			KOMMO_ACCESS_TOKEN: "token-kommo",
			KOMMO_CAMPO_INVOICE: "777",
			OPENAI_MODEL: "modelo-inicial",
			DROPBOX_APP_KEY: "app-dbx",
			DROPBOX_APP_SECRET: "secreto-dbx",
			DROPBOX_REFRESH_TOKEN: "refresh-dbx",
			DROPBOX_RAIZ: "/Ordenes",
			DROPBOX_API_URL: `http://127.0.0.1:${(falso.address() as { port: number }).port}`,
			KOMMO_BOT_VIDEO: "4242",
		},
		stdio: ["ignore", "pipe", "inherit"],
	});
	await new Promise<void>((ok, mal) => {
		proceso.stdout!.on("data", (d) => String(d).includes("Listening") && ok());
		proceso.once("exit", (c) => mal(new Error(`la app salió con ${c} (¿falta vite build?)`)));
	});
});

after(async () => {
	proceso.kill();
	falso.close();
	await new Promise((ok) => setTimeout(ok, 300));
	rmSync(datos, { recursive: true, force: true });
});

const W = { "X-Widget-Key": "clave-widget", "Content-Type": "application/json" };

describe("claves y CORS", () => {
	it("pide la clave del widget y la de administración por separado", async () => {
		assert.equal((await app.request("/plantilla")).status, 401);
		assert.equal((await app.request("/admin/ia", { headers: W })).status, 401);
		assert.equal((await app.request("/salud")).status, 200);
	});

	it("no se salta codificando la ruta", async () => {
		const res = await fetch(`http://127.0.0.1:${PUERTO}/%61pi/plantilla`);
		assert.equal(res.status, 401);
	});

	it("deja llamar a la API desde la cuenta de Kommo", async () => {
		const res = await app.request("/plantilla", { method: "OPTIONS", headers: { Origin: "https://romerojeweler.kommo.com", "Access-Control-Request-Headers": "x-widget-key" } });
		assert.equal(res.status, 204);
		assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://romerojeweler.kommo.com");
		const otro = await app.request("/plantilla", { headers: { ...W, Origin: "https://otro.com" } });
		assert.equal(otro.headers.get("Access-Control-Allow-Origin"), null);
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

	it("rechaza uno demasiado grande con 413 y un mensaje claro", async () => {
		const res = await app.request("/borradores/55", { method: "PUT", headers: W, body: JSON.stringify({ x: "a".repeat(2 * 1024 * 1024) }) });
		assert.equal(res.status, 413);
		assert.match((await res.json()).message, /más de 1 MB/);
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
		const enCampo = kommo.lead.get(31337)?.find((v) => v.field_id === 777);
		assert.equal(enCampo?.values[0].value.file_name, `${numero}.pdf`);

		const { numero: siguiente } = await (await app.request("/invoices/numero", { method: "POST", headers: W, body: JSON.stringify({ lead_id: 99 }) })).json();
		assert.match(siguiente, /-0002$/);
	});

	it("no genera PDF para un número que no se asignó", async () => {
		assert.equal((await app.request("/invoices/RJ-1999-0001/pdf", { method: "POST", headers: W, body: JSON.stringify({ html: "<p>x</p>" }) })).status, 404);
	});
});

describe("pestaña de imágenes (la crea el widget)", () => {
	before(() => {
		// Lo que el widget dejó creado en la cuenta: la pestaña y sus campos.
		kommo.grupos.push({ id: "leads_img", name: "Imágenes de la pieza" });
		kommo.campos.push(...[1, 2, 3].map((n) => ({ id: 900 + n, name: `Imagen ${n}`, type: "file", group_id: "leads_img" as string | null, sort: n })));
	});

	it("guarda cada foto en el campo que indica el widget y las lista en orden", async () => {
		const png = Buffer.from("89504e470d0a1a0a", "hex");
		for (const n of [2, 1]) {
			const r = await (await app.request("/leads/500/imagenes", { method: "POST", headers: { ...W, "Content-Type": "image/png", "X-Nombre-Archivo": `foto${n}.png`, "X-Campo-Imagen": String(900 + n) }, body: png })).json();
			assert.equal(r.campo, 900 + n);
		}
		assert.deepEqual(kommo.lead.get(500)?.map((v) => v.field_id).sort(), [901, 902]);
		const { imagenes } = await (await app.request("/leads/500/imagenes", { headers: W })).json();
		assert.deepEqual(imagenes.map((x: { nombre: string }) => x.nombre), ["foto1.png", "foto2.png"]);
		assert.equal(kommo.campos.length, 4); // el servidor no creó campos
	});
});

describe("orden de producción", () => {
	it("genera el PDF y lo guarda en el campo que indica el widget", async () => {
		const res = await app.request("/ordenes/pdf", { method: "POST", headers: W, body: JSON.stringify({ html: "<h1>Order Details</h1>", lead_id: 31337, campo_id: 950, nombre: "orden-1146.pdf" }) });
		assert.equal(res.status, 200);
		assert.equal(res.headers.get("X-Kommo-Estado"), "guardado");
		const pdf = Buffer.from(await res.arrayBuffer());
		assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
		const valor = kommo.lead.get(31337)?.find((v) => v.field_id === 950)?.values[0].value;
		assert.equal(valor?.file_name, "orden-1146.pdf");
	});

	it("sin campo, solo devuelve el PDF", async () => {
		const res = await app.request("/ordenes/pdf", { method: "POST", headers: W, body: JSON.stringify({ html: "<p>x</p>" }) });
		assert.equal(res.headers.get("X-Kommo-Estado"), "desactivado");
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

		const grande = await app.request("/leads/31337/imagenes", { method: "POST", headers: { "X-Widget-Key": "clave-widget", "Content-Type": "image/png" }, body: Buffer.alloc(9 * 1024 * 1024 + 1) });
		assert.equal(grande.status, 413);
		assert.match((await grande.json()).error, /más de 9 MB/);

		const descarga = await app.request(`/imagenes/${uuid}`, { headers: W });
		assert.equal(descarga.headers.get("Content-Type"), "image/png");
		assert.ok(Buffer.from(await descarga.arrayBuffer()).equals(png));
	});
});

describe("opciones compartidas", () => {
	it("suma las que agregan los asesores, sin repetir, y las devuelve con las de fábrica", async () => {
		const agregar = (lista: string, valor: unknown) => app.request("/opciones", { method: "POST", headers: W, body: JSON.stringify({ lista, valor }) });
		await agregar("metales", "Plata 925");
		await agregar("metales", "plata 925");
		await agregar("camposAnillo", { nombre: "Center Stones" });
		const { opciones } = await (await app.request("/opciones", { headers: W })).json();
		assert.deepEqual(opciones.metales.slice(-2), ["Platino", "Plata 925"]);
		assert.deepEqual(opciones.camposAnillo, [{ clave: "x_center_stones", nombre: "Center Stones" }]);
		assert.equal((await agregar("cualquiera", "x")).status, 400);
	});

	it("sin IA, la traducción devuelve los textos tal cual", async () => {
		const res = await app.request("/ia/traducir", { method: "POST", headers: W, body: JSON.stringify({ idioma: "es", textos: ["Width", "2 mm"] }) });
		assert.deepEqual((await res.json()).textos, ["Width", "2 mm"]);
	});
});

describe("campo Invoice que indica el widget", () => {
	it("guarda el PDF en ese campo en vez de KOMMO_CAMPO_INVOICE", async () => {
		const { numero } = await (await app.request("/invoices/numero", { method: "POST", headers: W, body: JSON.stringify({ lead_id: 4242 }) })).json();
		const res = await app.request(`/invoices/${numero}/pdf`, { method: "POST", headers: W, body: JSON.stringify({ html: "<p>x</p>", total: 1, campo_id: 288076 }) });
		assert.equal(res.headers.get("X-Kommo-Estado"), "guardado");
		const valores = kommo.lead.get(4242) ?? [];
		assert.equal(valores.find((v) => v.field_id === 288076)?.values[0].value.file_name, `${numero}.pdf`);
		assert.equal(valores.some((v) => v.field_id === 777), false);
	});
});

describe("video del cliente (Dropbox)", () => {
	const firmar = (cuerpo: string) => createHmac("sha256", "secreto-dbx").update(cuerpo).digest("hex");
	const aviso = '{"list_folder":{"accounts":["dbid:1"]}}';
	// Dropbox manda JSON. Con text/plain, SvelteKit lo cortaría antes (CSRF: "Cross-site POST form submissions").
	const webhook = (firma = firmar(aviso)) => app.request("/videos/webhook", { method: "POST", headers: { "Content-Type": "application/json", "X-Dropbox-Signature": firma }, body: aviso });
	const pausa = (ms = 400) => new Promise((ok) => setTimeout(ok, ms));
	const esperar = async (listo: () => boolean) => {
		for (let i = 0; i < 60 && !listo(); i++) await new Promise((ok) => setTimeout(ok, 50));
		assert.ok(listo(), "no llegó a tiempo");
	};

	before(() => {
		// Los campos de la pestaña Orden (Video (link) se crea a mano) y el lead con su Order #.
		kommo.campos.push({ id: 801, name: "Order #", type: "text", group_id: null, sort: 10 }, { id: 802, name: "Video (link)", type: "url", group_id: null, sort: 16 });
		kommo.lead.set(7001, [{ field_id: 801, values: [{ value: "1146" as never }] }]);
	});

	it("responde el challenge de Dropbox y rechaza un aviso sin firma válida", async () => {
		const res = await app.request("/videos/webhook?challenge=abc123");
		assert.equal(await res.text(), "abc123");
		assert.equal(res.headers.get("Content-Type"), "text/plain");
		assert.equal(res.headers.get("X-Content-Type-Options"), "nosniff");
		assert.equal((await webhook("firma-mala")).status, 403);
	});

	it("cuando aparece <orden>_completo, guarda el link, deja una nota y lanza el Salesbot una sola vez", async () => {
		// El cursor se tomó al arrancar: el primer aviso ya trae el video.
		subirADropbox("/Ordenes/1146/1146_borrador.mp4");
		subirADropbox("/Ordenes/1146/1146_completo.mp4");
		assert.equal((await webhook()).status, 200);
		await esperar(() => kommo.bots.length === 1);
		assert.deepEqual(kommo.bots[0], { bot_id: 4242, entity_type: 2, entity_id: 7001 });
		const link = kommo.lead.get(7001)?.find((v) => v.field_id === 802)?.values[0].value as unknown as string;
		assert.equal(link, "https://www.dropbox.com/s/falso/1146"); // el link es el de la carpeta, no el del archivo
		assert.ok(kommo.notas.some((n) => n.entity_id === 7001 && n.params.text.includes(link)));

		// El mismo archivo vuelve a cambiar (o el aviso llega dos veces): no se manda de nuevo.
		subirADropbox("/Ordenes/1146/1146_completo.mp4");
		await webhook();
		await pausa();
		assert.equal(kommo.bots.length, 1);
	});

	it("otro formato del mismo video no se vuelve a enviar y queda en la carpeta compartida", async () => {
		const enviados = kommo.bots.length;
		subirADropbox("/Ordenes/1146/1146_completo.mov");
		await webhook();
		await pausa();
		assert.equal(kommo.bots.length, enviados);
		const estado = await (await app.request("/videos/1146", { headers: W })).json();
		assert.deepEqual(estado.videos.map((v: { nombre: string }) => v.nombre).sort(), ["1146_completo.mov", "1146_completo.mp4"]);

		// Borrar el video que se envió no rompe el link de la carpeta: sin nota. (Se vuelve a subir para los demás tests.)
		const notas = kommo.notas.length;
		borrarDeDropbox("/Ordenes/1146/1146_completo.mp4");
		await webhook();
		await pausa();
		assert.equal(kommo.notas.length, notas);
		subirADropbox("/Ordenes/1146/1146_completo.mp4");
		await webhook();
		await pausa();
		assert.equal(kommo.bots.length, enviados);
	});

	it("GET dice cómo está el video sin tocar nada", async () => {
		const notas = kommo.notas.length;
		const estado = await (await app.request("/videos/1146", { headers: W })).json();
		assert.equal(estado.completo, true);
		assert.equal(estado.carpeta, "/Ordenes/1146");
		assert.ok(estado.videos.some((v: { nombre: string }) => v.nombre === "1146_completo.mp4"));
		assert.equal(estado.lead, 7001);
		assert.ok(estado.avisado);
		assert.equal(kommo.notas.length, notas);
		assert.equal((await (await app.request("/videos/9999", { headers: W })).json()).completo, false);
		assert.equal((await app.request("/videos/1146")).status, 401); // fuera del webhook pide la clave
	});

	it("con dos leads con el mismo Order # no manda nada y avisa en los dos", async () => {
		kommo.lead.set(7002, [{ field_id: 801, values: [{ value: "1147" as never }] }]);
		kommo.lead.set(7003, [{ field_id: 801, values: [{ value: "#1147" as never }] }]);
		dropbox.cambios.push({ ".tag": "file", name: "1147_completo.mov", path_lower: "/ordenes/1147/1147_completo.mov", path_display: "/Ordenes/1147/1147_completo.mov", size: 99, server_modified: "2026-11-03T12:00:00Z" });
		const r = await (await app.request("/videos/1147", { method: "POST", headers: W })).json();
		assert.equal(r.estado, "varios_leads");
		assert.deepEqual(r.leads.sort(), [7002, 7003]);
		assert.equal(kommo.bots.length, 1);
		assert.ok([7002, 7003].every((id) => kommo.notas.some((n) => n.entity_id === id && n.params.text.includes("2 leads"))));

		// Volver a revisarlo (otro aviso, el repaso) no repite las notas mientras sigan siendo los mismos leads.
		const notas = kommo.notas.length;
		await app.request("/videos/1147", { method: "POST", headers: W });
		await webhook();
		await pausa();
		assert.equal(kommo.notas.length, notas);
	});

	it("un video sin lead queda pendiente y se envía cuando aparece el Order #", async () => {
		subirADropbox("/Ordenes/1148/1148_completo.mp4");
		await webhook();
		await pausa();
		assert.equal((await (await app.request("/videos/1148", { headers: W })).json()).pendiente, true);
		assert.equal(kommo.bots.length, 1);

		kommo.lead.set(7004, [{ field_id: 801, values: [{ value: "1148" as never }] }]);
		await webhook(); // sin cambios nuevos: lo levanta el reintento
		await esperar(() => kommo.bots.some((b) => b.entity_id === 7004));
	});

	it("con DROPBOX_RAIZ solo cuentan las carpetas que están en la raíz", async () => {
		kommo.lead.set(7005, [{ field_id: 801, values: [{ value: "1149" as never }] }]);
		subirADropbox("/Ordenes/viejas/1149/1149_completo.mp4");
		subirADropbox("/Otra/1149/1149_completo.mp4");
		await webhook();
		await pausa();
		assert.ok(!kommo.bots.some((b) => b.entity_id === 7005));
	});

	it("si se borra la carpeta de una orden ya enviada, deja una nota en el lead", async () => {
		borrarDeDropbox("/Ordenes/1146");
		await webhook();
		await esperar(() => kommo.notas.some((n) => n.entity_id === 7001 && n.params.text.includes("La carpeta de la orden 1146 se borró o se movió")));
	});
});
