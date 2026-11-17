import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { errorComoDatos, linea } from "./log.ts";

const fecha = () => new Date("2026-11-17T12:00:00Z");

describe("log", () => {
	it("es una sola línea JSON con ts, nivel y evento", () => {
		const l = linea("info", "peticion", { ruta: "/api/x", ms: 12 }, fecha);
		assert.equal(l.includes("\n"), false);
		assert.deepEqual(JSON.parse(l), { ts: "2026-11-17T12:00:00.000Z", nivel: "info", evento: "peticion", ruta: "/api/x", ms: 12 });
	});

	it("oculta claves y tokens, también anidados", () => {
		const o = JSON.parse(linea("info", "x", { clave: "abc", cabeceras: { Authorization: "Bearer zzz", origen: "https://a" }, widget_key: "k" }, fecha));
		assert.equal(o.clave, "<oculto>");
		assert.equal(o.cabeceras.Authorization, "<oculto>");
		assert.equal(o.cabeceras.origen, "https://a");
		assert.equal(o.widget_key, "<oculto>");
	});

	it("un error con stack sale en una línea, con status, resumen y causa", () => {
		const causa = new Error("raíz");
		const e = Object.assign(new Error("Dropbox respondió 409", { cause: causa }), { status: 409, resumen: "path/not_found/" });
		const l = linea("error", "videos", { error: e }, fecha);
		assert.equal(l.includes("\n"), false);
		const o = JSON.parse(l).error;
		assert.equal(o.status, 409);
		assert.equal(o.resumen, "path/not_found/");
		assert.equal(o.causa.mensaje, "raíz");
		assert.ok(!o.stack.includes("\n"));
	});

	it("recorta textos enormes (un HTML de invoice no debe llenar el log)", () => {
		const o = JSON.parse(linea("info", "x", { html: "a".repeat(5000) }, fecha));
		assert.ok(o.html.length < 1100);
		assert.match(o.html, /5000 caracteres/);
	});

	it("tapa tokens que vengan dentro de un texto (cuerpos de error de Kommo o Dropbox)", () => {
		const jwt = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.firma-larga_abc";
		const e = new Error(`Kommo respondió 401: Bearer ${jwt} en https://x/panel?clave=secreto123&a=1 con sl.AbCdEfGhIjKlMnOpQrStUv123`);
		const l = linea("error", "x", { error: e, nota: `token ${jwt}` }, fecha);
		for (const secreto of [jwt, "secreto123", "AbCdEfGhIjKlMnOpQrStUv123"]) assert.equal(l.includes(secreto), false, secreto);
		assert.match(l, /clave=<oculto>&a=1/);
	});

	it("errorComoDatos acepta lo que no es un Error", () => {
		assert.deepEqual(errorComoDatos("texto"), { mensaje: "texto" });
	});
});
