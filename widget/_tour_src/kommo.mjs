// Kommo simulado: carga el widget real (script.js + app.js) como lo hace Kommo, con un lead de muestra.
// Hace de tres cosas a la vez:
//   - la página de Kommo (/lead, /ajustes) y su API para el widget (/api/v4/leads, /api/v4/contacts);
//   - un servidor del widget falso en /srv (para el tour, sin base ni Chromium);
//   - Kommo y Kommo Drive para la app real, apuntándole KOMMO_BASE_URL (prueba de punta a punta).
//   - Las pestañas y campos de los leads (con las opciones de los de selección), para ver cómo el widget arma la
//     pestaña "Orden" y sus grupos por anillo.
//
//   node widget/_tour_src/kommo.mjs     → http://localhost:4180/lead  y  /ajustes
//   …/lead?servidor=http://localhost:4173/api   → usa la API de la app (vite preview) en vez de /srv (más &clave=… si tiene WIDGET_KEY)
//
// El widget trae fija la URL del servidor de Railway (SERVIDOR_URL en script.js): al servir script.js se cambia
// por la de esta prueba, para no tocar el servidor de producción.
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
		window.widget = w; // para disparar callbacks a mano (ej. widget.callbacks.onSave(), como al instalar)
		w.get_settings = function () { return { path: "/widget", version: "tour", widget_code: "rjinvoice", widget_key: q.get("clave") || "" }; };
		w.render_template = function (o) { jQuery("#widget_rjinvoice .widget_body").html(o.render || o.body || ""); };
		jQuery.getJSON("/widget/i18n/${lang}.json", function (d) { w.i18n = function (k) { return d[k]; }; w.callbacks.init(); ${arranque} window.listo = true; });
	};
</script><script>document.write('<script src="/widget/script.js?servidor=' + encodeURIComponent(q.get("servidor") || location.origin + "/srv") + '"><\\/script>');</script></body></html>`;
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
	// Pestañas y campos de los leads, y lo que se guardó en los campos del lead (cada PATCH se suma). Arranca como
	// una cuenta sin la pestaña "Orden": solo "N° de Anillos" (283974, igual que en romerojeweler).
	const grupos = [];
	const campos = [{ id: 283974, name: "N° de Anillos", type: "numeric", group_id: null, sort: 6 }];
	let valores = [];
	let siguienteEnum = 9000;
	const conIds = (enums) => (enums ?? []).map((e) => ({ ...e, id: e.id ?? ++siguienteEnum }));
	const opcionesSrv = {};
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
		if (ruta === `/api/v4/leads/${LEAD_ID}` && req.method === "GET") return json({ ...lead, name: PAGINA[langPagina].lead, custom_fields_values: [...lead.custom_fields_values, ...valores] });
		if (ruta === `/api/v4/leads/${LEAD_ID}` && req.method === "PATCH") {
			const cambio = JSON.parse((await leer(req)).toString());
			camposArchivo.push(cambio);
			// Un valor de selección llega como enum_id: se guarda también su texto, como lo devuelve Kommo.
			const conTexto = cambio.custom_fields_values.map((v) => ({
				...v,
				values: v.values?.map((x) => (x.enum_id ? { ...x, value: campos.find((c) => c.id === v.field_id)?.enums?.find((e) => e.id === x.enum_id)?.value } : x)) ?? null,
			}));
			valores = [...valores.filter((v) => !conTexto.some((n) => n.field_id === v.field_id)), ...conTexto.filter((v) => v.values)];
			return json({ id: LEAD_ID });
		}
		if (ruta === "/api/v4/leads/custom_fields/groups" && req.method === "GET") return json({ _embedded: { custom_field_groups: grupos } });
		if (ruta === "/api/v4/leads/custom_fields/groups" && req.method === "POST") {
			const nuevos = JSON.parse((await leer(req)).toString()).map((g) => ({ id: `leads_${grupos.length + 1}`, name: g.name }));
			grupos.push(...nuevos);
			return json({ _embedded: { custom_field_groups: nuevos } });
		}
		if (ruta === "/api/v4/leads/custom_fields" && req.method === "GET") return json({ _embedded: { custom_fields: campos } });
		if (ruta === "/api/v4/leads/custom_fields" && req.method === "POST") {
			const nuevos = JSON.parse((await leer(req)).toString()).map((c, i) => ({ ...c, id: 140000 + campos.length + i, ...(c.enums ? { enums: conIds(c.enums) } : {}) }));
			campos.push(...nuevos);
			return json({ _embedded: { custom_fields: nuevos } });
		}
		if (ruta === "/api/v4/leads/custom_fields" && req.method === "PATCH") {
			const cambiados = JSON.parse((await leer(req)).toString()).map((c) => {
				const campo = campos.find((x) => x.id === c.id);
				Object.assign(campo, c, c.enums ? { enums: conIds(c.enums) } : {});
				return campo;
			});
			return json({ _embedded: { custom_fields: cambiados } });
		}
		const grupoBorrar = ruta.match(/^\/api\/v4\/leads\/custom_fields\/groups\/(.+)$/);
		if (grupoBorrar && req.method === "DELETE") {
			const i = grupos.findIndex((g) => g.id === grupoBorrar[1]);
			if (i !== -1) grupos.splice(i, 1);
			return (res.writeHead(204), res.end());
		}
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
		if (ruta === "/kommo/estado")
			return json({
				archivos: [...archivos].map(([uuid, a]) => ({ uuid, nombre: a.nombre, tipo: a.tipo, tamano: a.datos.length })),
				adjuntos,
				pestanas: grupos.map((g) => ({ ...g, campos: campos.filter((c) => c.group_id === g.id).sort((a, b) => a.sort - b.sort).map((c) => c.name) })),
				valores: valores.map((v) => {
					const valor = v.values?.[0]?.value;
					return { campo: campos.find((c) => c.id === v.field_id)?.name, valor: v.values?.length > 1 ? v.values.map((x) => x.value) : (valor?.file_name ?? valor ?? null) };
				}),
				opciones: Object.fromEntries(campos.filter((c) => c.enums).map((c) => [c.name, c.enums.map((e) => e.value)])),
			});

		// ─── Servidor del widget falso (/srv), para el tour ───
		if (ruta === "/srv/opciones" && req.method === "GET") return json({ opciones: opcionesSrv });
		if (ruta === "/srv/opciones" && req.method === "POST") {
			const { lista, valor } = JSON.parse((await leer(req)).toString());
			(opcionesSrv[lista] ??= []).push(typeof valor === "string" ? valor : { clave: `x_${valor.nombre.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`, nombre: valor.nombre });
			return json({ opciones: opcionesSrv });
		}
		if (ruta === "/srv/ia/traducir") return json({ textos: JSON.parse((await leer(req)).toString()).textos });
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
					let datos = await readFile(archivo);
					if (ruta === "/widget/script.js") datos = Buffer.from(datos.toString().replace(/var SERVIDOR_URL = '[^']*'/, `var SERVIDOR_URL = '${url.searchParams.get("servidor") ?? `${base}/srv`}'`));
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
