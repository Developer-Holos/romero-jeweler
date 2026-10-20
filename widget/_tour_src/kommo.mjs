// Kommo simulado: carga el widget real (script.js + app.js) como lo hace Kommo, con un lead de muestra.
// Hace de tres cosas a la vez:
//   - la página de Kommo (/lead, /ajustes) y su API para el widget (/api/v4/leads, /api/v4/contacts);
//   - un servidor del widget falso en /srv (para el tour, sin base ni Chromium);
//   - Kommo y Kommo Drive para el servidor real, apuntándole KOMMO_BASE_URL (prueba de punta a punta).
//
//   node widget/_tour_src/kommo.mjs     → http://localhost:4180/lead  y  /ajustes
//   …/lead?servidor=http://localhost:8787&clave=<WIDGET_KEY>   → usa el servidor real en vez de /srv
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const TIPOS = { ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".html": "text/html; charset=utf-8" };

export const LEAD_ID = 31337;

// Textos de la página falsa de Kommo (la tarjeta del lead), en el idioma de cada diapositiva.
const PAGINA = {
	es: { lead: "Anillo de compromiso · Daniela", etapa: "En Conversación", campos: [["Presupuesto", "$3,850"], ["Contacto", "Daniela Ortega"], ["Responsable", "Yan Romero"]], feed: ["Daniela: ¡Me encantó el diseño oval! ¿Cuánto sería el depósito?", "Yan: Te preparo el invoice ahora mismo 💍"] },
	en: { lead: "Engagement ring · Daniela", etapa: "In conversation", campos: [["Budget", "$3,850"], ["Contact", "Daniela Ortega"], ["Owner", "Yan Romero"]], feed: ["Daniela: I loved the oval design! How much is the deposit?", "Yan: I'm preparing your invoice right now 💍"] },
};

function pagina(lang, titulo, cuerpo, arranque) {
	return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${titulo}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js"></script>
<style>
	body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; background: #eef1f5; color: #2b2d33; }
	.card { display: flex; gap: 14px; padding: 14px; height: 100vh; box-sizing: border-box; }
	.main { flex: 1; display: flex; flex-direction: column; gap: 12px; }
	.head { background: #fff; border-radius: 8px; padding: 14px 18px; }
	.head b { font-size: 17px; } .chip { display: inline-block; margin-top: 8px; padding: 3px 10px; border-radius: 99px; background: #e3ecfb; color: #2b5cab; font-size: 12px; font-weight: 600; }
	.campos { background: #fff; border-radius: 8px; padding: 6px 18px; font-size: 13px; }
	.campos div { display: flex; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid #eef0f3; } .campos div:last-child { border: 0; }
	.campos span { color: #8a8f99; }
	.feed { flex: 1; background: #fff; border-radius: 8px; padding: 14px 18px; font-size: 13px; display: flex; flex-direction: column; gap: 10px; }
	.msg { max-width: 75%; padding: 9px 12px; border-radius: 10px; background: #f1f3f6; } .msg.yo { align-self: flex-end; background: #e3ecfb; }
	.side { width: 290px; } .widget { background: #fff; border-radius: 8px; padding: 14px 16px; } .widget h4 { margin: 0 0 10px; font-size: 13px; }
	.settings { padding: 18px; }
</style></head><body>${cuerpo}
<script>
	window.APP = { data: { is_card: true, current_entity: "leads", current_card: { id: ${LEAD_ID} } }, constant: function (k) { return k === "managers" ? { 7: { id: 7, title: "Yan Romero" } } : null; } };
	var q = new URLSearchParams(location.search);
	window.define = function (deps, factory) {
		var Widget = factory(jQuery), w = new Widget();
		w.get_settings = function () { return { path: "/widget", version: "tour", widget_code: "rjinvoice", proxy_url: q.get("servidor") || location.origin + "/srv", widget_key: q.get("clave") || "tour" }; };
		w.render_template = function (o) { jQuery("#widget_rjinvoice .widget_body").html(o.render || o.body || ""); };
		jQuery.getJSON("/widget/i18n/${lang}.json", function (d) { w.i18n = function (k) { return d[k]; }; w.callbacks.init(); ${arranque} window.listo = true; });
	};
</script><script src="/widget/script.js"></script></body></html>`;
}

const leer = async (req) => {
	const partes = [];
	for await (const p of req) partes.push(p);
	return Buffer.concat(partes);
};

export function iniciarKommo({ dirWidget, puerto = 0 }) {
	// Campos de producto llenos, para ver la precarga del invoice (docs/DECISIONES.md, #12).
	const lead = {
		id: LEAD_ID,
		price: 3850,
		responsible_user_id: 7,
		custom_fields_values: [
			{ field_id: 133508, field_name: "Metal de la pieza", values: [{ value: "Oro blanco" }] },
			{ field_id: 133510, field_name: "Quilates", values: [{ value: "14k" }] },
			{ field_id: 133562, field_name: "Piedra", values: [{ value: "Diamante" }] },
			{ field_id: 133564, field_name: "Talla", values: [{ value: "6" }] },
		],
		_embedded: { contacts: [{ id: 55, is_main: true }] },
	};
	const contacto = { id: 55, name: "Daniela Ortega", custom_fields_values: [{ field_code: "EMAIL", values: [{ value: "daniela.ortega@example.com" }] }] };
	let plantilla = null;
	const borradores = new Map();
	let langPagina = "es"; // el widget pide el lead sin idioma: se responde en el de la última página abierta

	// Kommo Drive en memoria: archivos subidos (por el servidor real o por el /srv falso) y adjuntos del lead.
	const archivos = new Map();
	const adjuntos = [];
	const camposArchivo = [];
	let siguiente = 0;
	const guardar = (nombre, tipo, datos) => {
		const uuid = `uuid-${++siguiente}`;
		archivos.set(uuid, { nombre, tipo, datos });
		return uuid;
	};

	const servidor = createServer(async (req, res) => {
		const url = new URL(req.url, "http://x");
		const lang = url.searchParams.get("lang") === "en" ? "en" : "es";
		const base = `http://${req.headers.host}`;
		const json = (d, status = 200) => (res.writeHead(status, { "Content-Type": "application/json" }), res.end(JSON.stringify(d)));
		const html = (h) => (res.writeHead(200, { "Content-Type": TIPOS[".html"] }), res.end(h));
		const ruta = url.pathname;

		// ─── API de Kommo (widget en el navegador y servidor real) ───
		if (ruta === `/api/v4/leads/${LEAD_ID}` && req.method === "GET") return json({ ...lead, name: PAGINA[langPagina].lead });
		if (ruta === `/api/v4/leads/${LEAD_ID}` && req.method === "PATCH") return (camposArchivo.push(JSON.parse((await leer(req)).toString())), json({ id: LEAD_ID }));
		if (ruta === `/api/v4/leads/${LEAD_ID}/files` && req.method === "PUT") return (adjuntos.push(...JSON.parse((await leer(req)).toString()).map((f) => f.file_uuid)), json({}));
		if (ruta === `/api/v4/leads/${LEAD_ID}/files`) return adjuntos.length ? json({ _embedded: { files: adjuntos.map((u) => ({ file_uuid: u })) } }) : (res.writeHead(204), res.end());
		if (ruta === "/api/v4/contacts/55") return json(contacto);
		if (ruta === "/api/v4/account") return json({ drive_url: `${base}/drive` });
		if (ruta === "/drive/v1.0/sessions") {
			const { file_name, content_type } = JSON.parse((await leer(req)).toString());
			return json({ upload_url: `${base}/drive/subir?nombre=${encodeURIComponent(file_name)}&tipo=${encodeURIComponent(content_type)}`, max_part_size: 10 * 1024 * 1024 });
		}
		if (ruta === "/drive/subir") {
			const datos = await leer(req);
			const uuid = guardar(url.searchParams.get("nombre"), url.searchParams.get("tipo"), datos);
			return json({ uuid, version_uuid: `v-${uuid}`, size: datos.length });
		}
		const info = ruta.match(/^\/drive\/v1\.0\/files\/(.+)$/);
		if (info && archivos.has(info[1])) {
			const a = archivos.get(info[1]);
			return json({ uuid: info[1], name: a.nombre, metadata: { mime_type: a.tipo }, _links: { download: { href: `${base}/drive/bajar/${info[1]}` } } });
		}
		const bajar = ruta.match(/^\/drive\/bajar\/(.+)$/);
		if (bajar && archivos.has(bajar[1])) {
			const a = archivos.get(bajar[1]);
			res.writeHead(200, { "Content-Type": a.tipo });
			return res.end(a.datos);
		}
		if (ruta === "/kommo/estado") return json({ archivos: [...archivos].map(([uuid, a]) => ({ uuid, nombre: a.nombre, tipo: a.tipo, tamano: a.datos.length })), adjuntos, camposArchivo });

		// ─── Servidor del widget falso (/srv), para el tour ───
		if (ruta === "/srv/plantilla" && req.method === "GET") return json({ plantilla });
		if (ruta === "/srv/plantilla" && req.method === "PUT") return ((plantilla = JSON.parse((await leer(req)).toString())), json({ ok: true }));
		const borr = ruta.match(/^\/srv\/borradores\/(\d+)$/);
		if (borr && req.method === "GET") return json({ borrador: borradores.get(borr[1]) ?? null });
		if (borr && req.method === "PUT") return (borradores.set(borr[1], JSON.parse((await leer(req)).toString())), json({ actualizado: new Date().toISOString() }));
		if (ruta === `/srv/leads/${LEAD_ID}/imagenes` && req.method === "GET") return json({ imagenes: adjuntos.filter((u) => archivos.get(u)?.tipo.startsWith("image/")).map((u) => ({ uuid: u, nombre: archivos.get(u).nombre })) });
		if (ruta === `/srv/leads/${LEAD_ID}/imagenes` && req.method === "POST") {
			const nombre = decodeURIComponent(req.headers["x-nombre-archivo"] ?? "imagen");
			const uuid = guardar(nombre, req.headers["content-type"], await leer(req));
			adjuntos.push(uuid);
			return json({ uuid, nombre });
		}
		const img = ruta.match(/^\/srv\/imagenes\/(.+)$/);
		if (img && archivos.has(img[1])) {
			const a = archivos.get(img[1]);
			res.writeHead(200, { "Content-Type": a.tipo });
			return res.end(a.datos);
		}

		// ─── Páginas de Kommo y archivos del widget ───
		if (ruta === "/lead" || ruta === "/ajustes") langPagina = lang;
		if (ruta === "/lead") {
			const t = PAGINA[lang];
			return html(pagina(lang, t.lead, `<div class="card"><div class="main">
				<div class="head"><b>${t.lead}</b><br><span class="chip">${t.etapa}</span></div>
				<div class="campos">${t.campos.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("")}</div>
				<div class="feed">${t.feed.map((m, i) => `<div class="msg ${i % 2 ? "yo" : ""}">${m}</div>`).join("")}</div>
			</div><div class="side"><div class="widget" id="widget_rjinvoice"><h4>${lang === "en" ? "Romero Jeweler Invoice" : "Invoice Romero Jeweler"}</h4><div class="widget_body"></div></div></div></div>`, "w.callbacks.render(); w.callbacks.bind_actions();"));
		}
		if (ruta === "/ajustes") return html(pagina(lang, "Ajustes", `<div class="settings"><div id="work-area-rjinvoice"></div></div>`, "w.callbacks.advancedSettings();"));
		if (ruta.startsWith("/widget/")) {
			const archivo = normalize(join(dirWidget, ruta.slice("/widget/".length)));
			if (archivo.startsWith(normalize(dirWidget))) {
				try {
					const datos = await readFile(archivo);
					res.writeHead(200, { "Content-Type": TIPOS[extname(archivo)] ?? "application/octet-stream" });
					return res.end(datos);
				} catch {}
			}
		}
		res.writeHead(404).end();
	});

	return new Promise((ok) => servidor.listen(puerto, "127.0.0.1", () => ok({ origen: `http://127.0.0.1:${servidor.address().port}`, cerrar: () => servidor.close() })));
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
	const { origen } = await iniciarKommo({ dirWidget: join(import.meta.dirname, ".."), puerto: 4180 });
	console.log(`Kommo simulado en ${origen.replace("127.0.0.1", "localhost")}/lead y /ajustes`);
}
