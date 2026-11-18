import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { comoVideo, completoFueraDeOrigen, configurarDropbox, esVideoCompleto, firmaValida, mismaOrden } from "./dropbox.ts";

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

	it("solo cuenta lo que está en <orden>/Origen", () => {
		const f = (ruta: string) => ({ ".tag": "file" as const, name: ruta.split("/").at(-1)!, path_lower: ruta.toLowerCase(), path_display: ruta, size: 1, server_modified: "" });
		configurarDropbox({ raiz: "/Ordenes" });
		assert.equal(comoVideo(f("/Ordenes/1146/Origen/1146_completo.mp4"))?.orden, "1146");
		assert.equal(comoVideo(f("/Ordenes/1146/origen/1146_completo.mov"))?.orden, "1146");
		assert.equal(comoVideo(f("/Ordenes/1146/Clip/1146_completo.mp4")), null);
		assert.equal(comoVideo(f("/Ordenes/1146/1146_completo.mp4")), null);
		assert.equal(comoVideo(f("/Ordenes/1146/Origen/Reel.mp4")), null);
		assert.equal(comoVideo(f("/Otra/1146/Origen/1146_completo.mp4")), null);
		configurarDropbox({ raiz: "" });
		assert.equal(comoVideo(f("/Otra/1146/Origen/1146_completo.mp4"))?.orden, "1146");
	});

	it("detecta un _completo que quedó fuera de Origen", () => {
		const f = (ruta: string) => ({ ".tag": "file" as const, name: ruta.split("/").at(-1)!, path_lower: ruta.toLowerCase(), path_display: ruta, size: 1, server_modified: "" });
		configurarDropbox({ raiz: "/Ordenes" });
		assert.equal(completoFueraDeOrigen(f("/Ordenes/1146/1146_completo.mp4")), "1146");
		assert.equal(completoFueraDeOrigen(f("/Ordenes/1146/Clip/1146_completo.mp4")), "1146");
		assert.equal(completoFueraDeOrigen(f("/Ordenes/1146/Origen/1146_completo.mp4")), null);
		assert.equal(completoFueraDeOrigen(f("/Ordenes/1146/Clip/Clip.mp4")), null);
		assert.equal(completoFueraDeOrigen(f("/Ordenes/1146/1146_borrador.mp4")), null);
		assert.equal(completoFueraDeOrigen(f("/Otra/1146/1146_completo.mp4")), null);
		configurarDropbox({ raiz: "" });
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
