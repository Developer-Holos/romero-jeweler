// API que usa el widget de invoice de Kommo. Todo, menos /salud y /admin, pide la clave del widget
// en el header X-Widget-Key (igual que los otros widgets de Kommo con proxy).
import { timingSafeEqual } from "node:crypto";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import type { Db } from "./db.ts";
import { asignarNumero, buscarInvoice, guardarAjuste, guardarBorrador, leerAjuste, leerBorrador, marcarSubidoAKommo, registrarInvoice } from "./datos.ts";
import { env } from "./env.ts";
import { redactar, type PedidoRedaccion } from "./ia.ts";
import { adjuntarALead, descargarArchivo, ErrorKommo, guardarEnCampo, imagenesDelLead, kommoConfigurado, subirArchivo } from "./kommo.ts";
import { htmlAPdf } from "./pdf.ts";

const MB = 1024 * 1024;

const iguales = (recibida: string | undefined, esperada: string) => {
	const a = Buffer.from(recibida ?? "");
	const b = Buffer.from(esperada);
	return a.length === b.length && timingSafeEqual(a, b);
};

const esPlantilla = (dato: unknown): dato is { bloques: unknown[] } =>
	!!dato && typeof dato === "object" && !Array.isArray(dato) && Array.isArray((dato as { bloques?: unknown }).bloques);

const leadId = (c: Context) => {
	const id = c.req.param("lead");
	return id && /^[1-9]\d{0,14}$/.test(id) ? Number(id) : null;
};

export const modeloIa = async (db: Db) => (await leerAjuste<string>(db, "modelo_ia")) ?? env.OPENAI_MODEL;

export function crearApp(db: Db) {
	const app = new Hono();

	app.use(
		"*",
		cors({
			origin: (o) => (env.ORIGENES.includes(o) ? o : null),
			allowHeaders: ["X-Widget-Key", "Content-Type", "X-Nombre-Archivo"],
			allowMethods: ["GET", "PUT", "POST"],
			exposeHeaders: ["X-Kommo-Estado", "X-Kommo-Detalle"],
			maxAge: 600,
		}),
	);

	app.get("/salud", (c) => c.json({ ok: true, ia: !!env.OPENAI_API_KEY, kommo: kommoConfigurado() && !!env.KOMMO_CAMPO_INVOICE }));

	// ─── Administración (Holos): modelo de IA sin redesplegar ─────────────────
	// curl -X PUT -H "X-Admin-Key: …" -H "Content-Type: application/json" -d '{"modelo":"gpt-5-mini"}' https://…/admin/ia
	app.use("/admin/*", async (c, next) => {
		if (!env.ADMIN_KEY || !iguales(c.req.header("X-Admin-Key"), env.ADMIN_KEY)) return c.json({ error: "Clave de administración inválida" }, 401);
		await next();
	});
	app.get("/admin/ia", async (c) => c.json({ modelo: await modeloIa(db), porDefecto: env.OPENAI_MODEL, activa: !!env.OPENAI_API_KEY }));
	app.put("/admin/ia", async (c) => {
		const { modelo } = (await c.req.json().catch(() => ({}))) as { modelo?: unknown };
		if (typeof modelo !== "string" || !/^[\w.:-]{2,80}$/.test(modelo)) return c.json({ error: "Modelo inválido" }, 400);
		await guardarAjuste(db, "modelo_ia", modelo);
		return c.json({ modelo });
	});

	// ─── Widget ───────────────────────────────────────────────────────────────
	app.use("*", async (c, next) => {
		if (!iguales(c.req.header("X-Widget-Key"), env.WIDGET_KEY)) return c.json({ error: "Clave del widget inválida" }, 401);
		await next();
	});

	app.get("/plantilla", async (c) => c.json({ plantilla: await leerAjuste(db, "plantilla") }));

	// El logo viaja dentro de la plantilla como data URL; 2 MB alcanza de sobra.
	app.put("/plantilla", bodyLimit({ maxSize: 2 * MB }), async (c) => {
		const dato = await c.req.json().catch(() => null);
		if (!esPlantilla(dato)) return c.json({ error: "La plantilla no tiene el formato esperado" }, 400);
		await guardarAjuste(db, "plantilla", dato);
		return c.json({ ok: true });
	});

	// Borrador compartido por lead: lo retoma cualquier asesor, desde cualquier equipo.
	app.get("/borradores/:lead", async (c) => {
		const id = leadId(c);
		if (!id) return c.json({ error: "Lead inválido" }, 400);
		const b = await leerBorrador(db, id);
		return c.json({ borrador: b?.datos ?? null, actualizado: b?.actualizado ?? null });
	});

	app.put("/borradores/:lead", bodyLimit({ maxSize: MB }), async (c) => {
		const id = leadId(c);
		const datos = await c.req.json().catch(() => null);
		if (!id || !datos || typeof datos !== "object") return c.json({ error: "Borrador inválido" }, 400);
		return c.json({ actualizado: await guardarBorrador(db, id, datos) });
	});

	app.post("/ia/redactar", bodyLimit({ maxSize: 256 * 1024 }), async (c) => {
		if (!env.OPENAI_API_KEY) return c.json({ error: "La IA no está configurada en el servidor" }, 503);
		const p = (await c.req.json().catch(() => null)) as PedidoRedaccion | null;
		if (!p || !Array.isArray(p.vinetas) || !Array.isArray(p.clausulas) || (p.idioma !== "es" && p.idioma !== "en")) return c.json({ error: "Pedido de redacción inválido" }, 400);
		try {
			return c.json(await redactar(p, await modeloIa(db)));
		} catch (e) {
			console.error("[ia]", e);
			return c.json({ error: "La IA no respondió" }, 502);
		}
	});

	// ─── Invoices ─────────────────────────────────────────────────────────────
	// El número se pide antes de armar el PDF, porque va impreso en él.
	app.post("/invoices/numero", async (c) => {
		const { lead_id } = (await c.req.json().catch(() => ({}))) as { lead_id?: unknown };
		if (typeof lead_id !== "number" || !Number.isSafeInteger(lead_id) || lead_id < 1) return c.json({ error: "Lead inválido" }, 400);
		return c.json({ numero: await asignarNumero(db, lead_id) });
	});

	// PDF del invoice: se genera, se registra y se guarda en el campo "Invoice" del lead. Si Kommo falla,
	// el PDF se devuelve igual (para descargarlo) y X-Kommo-Estado lo avisa.
	app.post("/invoices/:numero/pdf", bodyLimit({ maxSize: 20 * MB }), async (c) => {
		const inv = await buscarInvoice(db, c.req.param("numero"));
		if (!inv) return c.json({ error: "Ese número de invoice no existe" }, 404);
		const { html, total, datos } = (await c.req.json().catch(() => ({}))) as { html?: unknown; total?: unknown; datos?: unknown };
		if (typeof html !== "string" || !html.includes("<")) return c.json({ error: "Falta el HTML del invoice" }, 400);

		let pdf: Uint8Array;
		try {
			pdf = await htmlAPdf(html);
		} catch (e) {
			console.error("[pdf]", e);
			return c.json({ error: "No se pudo generar el PDF" }, 500);
		}
		await registrarInvoice(db, inv.numero, { total: Number(total) || 0, datos: datos ?? null });

		let estado = "desactivado";
		let detalle = "";
		if (kommoConfigurado() && env.KOMMO_CAMPO_INVOICE) {
			try {
				const archivo = await subirArchivo(pdf, `${inv.numero}.pdf`, "application/pdf");
				await guardarEnCampo(Number(inv.lead_id), env.KOMMO_CAMPO_INVOICE, archivo);
				await marcarSubidoAKommo(db, inv.numero, archivo.uuid);
				estado = "guardado";
			} catch (e) {
				console.error(`[kommo] invoice ${inv.numero}:`, e);
				estado = "error";
				detalle = e instanceof ErrorKommo ? `Kommo respondió ${e.status}` : "No se pudo subir a Kommo";
			}
		}
		return c.body(pdf as Uint8Array<ArrayBuffer>, 200, {
			"Content-Type": "application/pdf",
			"Content-Disposition": `inline; filename="${inv.numero}.pdf"`,
			"X-Kommo-Estado": estado,
			"X-Kommo-Detalle": detalle,
		});
	});

	// Invoice "sin datos del cliente" (cotización): PDF sin número, no se registra ni va a Kommo.
	app.post("/pdf", bodyLimit({ maxSize: 20 * MB }), async (c) => {
		const { html } = (await c.req.json().catch(() => ({}))) as { html?: unknown };
		if (typeof html !== "string" || !html.includes("<")) return c.json({ error: "Falta el HTML del invoice" }, 400);
		try {
			return c.body((await htmlAPdf(html)) as Uint8Array<ArrayBuffer>, 200, { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="cotizacion.pdf"' });
		} catch (e) {
			console.error("[pdf]", e);
			return c.json({ error: "No se pudo generar el PDF" }, 500);
		}
	});

	// ─── Imágenes de referencia: viven en Kommo, como archivos del lead ──────
	const sinKommo = (c: Context) => c.json({ error: "Kommo no está configurado en el servidor" }, 503);
	const errorKommo = (c: Context, e: unknown) => {
		console.error("[kommo]", e);
		return c.json({ error: "Kommo no respondió" }, 502);
	};

	app.get("/leads/:lead/imagenes", async (c) => {
		const id = leadId(c);
		if (!id) return c.json({ error: "Lead inválido" }, 400);
		if (!kommoConfigurado()) return sinKommo(c);
		try {
			return c.json({ imagenes: await imagenesDelLead(id) });
		} catch (e) {
			return errorKommo(c, e);
		}
	});

	app.post("/leads/:lead/imagenes", bodyLimit({ maxSize: 15 * MB }), async (c) => {
		const id = leadId(c);
		const tipo = c.req.header("Content-Type") ?? "";
		const nombre = decodeURIComponent(c.req.header("X-Nombre-Archivo") ?? "imagen").replace(/[^\w. -]/g, "_").slice(0, 100) || "imagen";
		if (!id || !tipo.startsWith("image/")) return c.json({ error: "Manda una imagen" }, 400);
		if (!kommoConfigurado()) return sinKommo(c);
		try {
			const archivo = await subirArchivo(new Uint8Array(await c.req.arrayBuffer()), nombre, tipo);
			await adjuntarALead(id, archivo.uuid);
			return c.json({ uuid: archivo.uuid, nombre });
		} catch (e) {
			return errorKommo(c, e);
		}
	});

	// El widget no puede pedirle archivos a Kommo Drive directo (necesita el token): pasan por aquí.
	app.get("/imagenes/:uuid", async (c) => {
		if (!kommoConfigurado()) return sinKommo(c);
		try {
			const { datos, tipo } = await descargarArchivo(c.req.param("uuid"));
			return c.body(datos as Uint8Array<ArrayBuffer>, 200, { "Content-Type": tipo, "Cache-Control": "private, max-age=3600" });
		} catch (e) {
			return errorKommo(c, e);
		}
	});

	return app;
}
