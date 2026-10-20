// API que usa el widget de invoice de Kommo. Todo, menos /salud, pide la clave del widget.
import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { env } from "./env.ts";
import { redactar, type PedidoRedaccion } from "./ia.ts";
import { htmlAPdf } from "./pdf.ts";
import { esPlantilla, guardarPlantilla, leerPlantilla } from "./plantilla.ts";

const MB = 1024 * 1024;

export const app = new Hono();

app.use("*", cors({ origin: (o) => (env.ORIGENES.includes(o) ? o : null), allowHeaders: ["Authorization", "Content-Type"], allowMethods: ["GET", "PUT", "POST"], maxAge: 600 }));

app.get("/salud", (c) => c.json({ ok: true, ia: !!env.OPENAI_API_KEY }));

app.use("*", bearerAuth({ token: env.WIDGET_API_KEY }));

app.get("/plantilla", async (c) => c.json({ plantilla: await leerPlantilla() }));

// El logo viaja dentro de la plantilla como data URL; 2 MB alcanza de sobra.
app.put("/plantilla", bodyLimit({ maxSize: 2 * MB }), async (c) => {
	const dato = await c.req.json().catch(() => null);
	if (!esPlantilla(dato)) return c.json({ error: "La plantilla no tiene el formato esperado" }, 400);
	await guardarPlantilla(dato);
	return c.json({ ok: true });
});

app.post("/ia/redactar", bodyLimit({ maxSize: 256 * 1024 }), async (c) => {
	if (!env.OPENAI_API_KEY) return c.json({ error: "La IA no está configurada en el servidor" }, 503);
	const p = (await c.req.json().catch(() => null)) as PedidoRedaccion | null;
	if (!p || !Array.isArray(p.vinetas) || !Array.isArray(p.clausulas) || (p.idioma !== "es" && p.idioma !== "en")) return c.json({ error: "Pedido de redacción inválido" }, 400);
	try {
		return c.json(await redactar(p));
	} catch (e) {
		console.error("[ia]", e);
		return c.json({ error: "La IA no respondió, intenta de nuevo" }, 502);
	}
});

// Las imágenes del invoice vienen embebidas en el HTML, de ahí el límite alto.
app.post("/pdf", bodyLimit({ maxSize: 20 * MB }), async (c) => {
	const { html, nombre } = (await c.req.json().catch(() => ({}))) as { html?: unknown; nombre?: unknown };
	if (typeof html !== "string" || !html.includes("<")) return c.json({ error: "Falta el HTML del invoice" }, 400);
	const archivo = typeof nombre === "string" && /^[\w.-]{1,80}\.pdf$/.test(nombre) ? nombre : "invoice.pdf";
	try {
		const pdf = await htmlAPdf(html);
		return c.body(pdf as Uint8Array<ArrayBuffer>, 200, { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${archivo}"` });
	} catch (e) {
		console.error("[pdf]", e);
		return c.json({ error: "No se pudo generar el PDF" }, 500);
	}
});
