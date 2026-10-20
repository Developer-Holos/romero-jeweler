// Kommo simulado para las capturas del tour: carga el widget real (script.js + app.js) como lo hace
// Kommo, con un lead de muestra, la API de leads/contactos y el servidor del widget falseados.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

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
	window.define = function (deps, factory) {
		var Widget = factory(jQuery), w = new Widget();
		w.get_settings = function () { return { path: "/widget", version: "tour", widget_code: "rjinvoice", proxy_url: location.origin + "/srv", widget_key: "tour" }; };
		w.render_template = function (o) { jQuery("#widget_rjinvoice .widget_body").html(o.render || o.body || ""); };
		jQuery.getJSON("/widget/i18n/${lang}.json", function (d) { w.i18n = function (k) { return d[k]; }; w.callbacks.init(); ${arranque} window.listo = true; });
	};
</script><script src="/widget/script.js"></script></body></html>`;
}

export function iniciarKommo({ dirWidget, puerto = 0 }) {
	const lead = { id: LEAD_ID, name: "", price: 3850, responsible_user_id: 7, _embedded: { contacts: [{ id: 55, is_main: true }] } };
	const contacto = { id: 55, name: "Daniela Ortega", custom_fields_values: [{ field_code: "EMAIL", values: [{ value: "daniela.ortega@example.com" }] }] };
	let plantilla = null;
	let langPagina = "es"; // el widget pide el lead sin idioma: se responde en el de la última página abierta

	const servidor = createServer(async (req, res) => {
		const url = new URL(req.url, "http://x");
		const lang = url.searchParams.get("lang") === "en" ? "en" : "es";
		const json = (d) => (res.writeHead(200, { "Content-Type": "application/json" }), res.end(JSON.stringify(d)));
		const html = (h) => (res.writeHead(200, { "Content-Type": TIPOS[".html"] }), res.end(h));

		if (url.pathname === `/api/v4/leads/${LEAD_ID}`) return json({ ...lead, name: PAGINA[langPagina].lead });
		if (url.pathname === "/api/v4/contacts/55") return json(contacto);
		if (url.pathname === "/srv/plantilla" && req.method === "GET") return json({ plantilla });
		if (url.pathname === "/srv/plantilla" && req.method === "PUT") {
			let cuerpo = "";
			for await (const c of req) cuerpo += c;
			plantilla = JSON.parse(cuerpo);
			return json({ ok: true });
		}
		if (url.pathname === "/lead" || url.pathname === "/ajustes") langPagina = lang;
		if (url.pathname === "/lead") {
			const t = PAGINA[lang];
			return html(pagina(lang, t.lead, `<div class="card"><div class="main">
				<div class="head"><b>${t.lead}</b><br><span class="chip">${t.etapa}</span></div>
				<div class="campos">${t.campos.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("")}</div>
				<div class="feed">${t.feed.map((m, i) => `<div class="msg ${i % 2 ? "yo" : ""}">${m}</div>`).join("")}</div>
			</div><div class="side"><div class="widget" id="widget_rjinvoice"><h4>${lang === "en" ? "Romero Jeweler Invoice" : "Invoice Romero Jeweler"}</h4><div class="widget_body"></div></div></div></div>`, "w.callbacks.render(); w.callbacks.bind_actions();"));
		}
		if (url.pathname === "/ajustes") return html(pagina(lang, "Ajustes", `<div class="settings"><div id="work-area-rjinvoice"></div></div>`, "w.callbacks.advancedSettings();"));
		if (url.pathname.startsWith("/widget/")) {
			const archivo = normalize(join(dirWidget, url.pathname.slice("/widget/".length)));
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
