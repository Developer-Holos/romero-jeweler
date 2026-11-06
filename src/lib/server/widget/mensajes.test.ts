import assert from "node:assert/strict";
import { brotliCompressSync } from "node:zlib";
import { describe, it } from "node:test";
import { abrirDb } from "./db.ts";
import { guardarMensajes, leerConversacion, leerMensajesKommo } from "./mensajes.ts";

describe("mensajes guardados", () => {
	it("sigue leyendo y ampliando conversaciones guardadas con otra calidad de brotli", async () => {
		const db = await abrirDb({ dir: "memoria" });
		// Como se guardaba antes: calidad 11 (la de por defecto).
		const viejo = brotliCompressSync(JSON.stringify([[1762400000, "c", "Hola, quiero un anillo", "a1"]]));
		await db.query("insert into conversaciones (lead_id, datos, cantidad) values ($1, $2, 1)", [77, viejo]);

		await guardarMensajes(db, [{ id: "a2", lead: 77, cliente: false, texto: "Con gusto, ¿qué talla?", fecha: 1762400060 }]);
		const { mensajes } = await leerConversacion(db, 77);
		assert.deepEqual(mensajes.map((m) => [m.cliente, m.texto]), [[true, "Hola, quiero un anillo"], [false, "Con gusto, ¿qué talla?"]]);
		await db.cerrar();
	});

	it("lee el formulario de Kommo: solo mensajes de leads, con adjuntos como [tipo]", () => {
		const cuerpo = new URLSearchParams({
			"message[add][0][id]": "m1", "message[add][0][entity_id]": "5", "message[add][0][entity_type]": "lead", "message[add][0][type]": "incoming", "message[add][0][text]": "hola",
			"message[add][1][id]": "m2", "message[add][1][entity_id]": "5", "message[add][1][entity_type]": "lead", "message[add][1][type]": "outgoing", "message[add][1][attachment][type]": "picture",
			"message[add][2][id]": "m3", "message[add][2][entity_id]": "9", "message[add][2][entity_type]": "contact", "message[add][2][text]": "de un contacto",
		}).toString();
		assert.deepEqual(leerMensajesKommo(cuerpo).map((m) => [m.id, m.lead, m.cliente, m.texto]), [["m1", 5, true, "hola"], ["m2", 5, false, "[picture]"]]);
	});
});
