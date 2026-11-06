import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { configurarDropbox, esVideoCompleto, firmaValida, mismaOrden } from "./dropbox.ts";

describe("video completo", () => {
	it("solo cuenta <orden>_completo.<video> dentro de la carpeta de esa orden", () => {
		assert.ok(esVideoCompleto("1146_completo.mp4", "1146"));
		assert.ok(esVideoCompleto("1146_COMPLETO.MOV", "1146"));
		assert.ok(!esVideoCompleto("1146_completo_v2.mp4", "1146"));
		assert.ok(!esVideoCompleto("1146.mp4", "1146"));
		assert.ok(!esVideoCompleto("1146_borrador.mp4", "1146"));
		assert.ok(!esVideoCompleto("1147_completo.mp4", "1146"));
		assert.ok(!esVideoCompleto("1146_completo.jpg", "1146"));
	});

	it("'#1146' y '1146' son la misma orden", () => {
		assert.ok(mismaOrden("#1146", "1146"));
		assert.ok(!mismaOrden("11460", "1146"));
	});
});

describe("firma del webhook", () => {
	it("acepta la HMAC-SHA256 del cuerpo con el app secret y nada más", () => {
		configurarDropbox({ appSecret: "secreto" });
		const cuerpo = '{"list_folder":{"accounts":["dbid:1"]}}';
		const firma = createHmac("sha256", "secreto").update(cuerpo).digest("hex");
		assert.ok(firmaValida(cuerpo, firma));
		assert.ok(!firmaValida(cuerpo + " ", firma));
		assert.ok(!firmaValida(cuerpo, null));
		assert.ok(!firmaValida(cuerpo, "abc"));
	});
});
