import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { abrirDb, type Db } from "./db.ts";
import { asignarNumero, buscarInvoice, guardarAjuste, guardarBorrador, leerAjuste, leerBorrador, registrarInvoice } from "./datos.ts";

let db: Db;
before(async () => (db = await abrirDb({ dir: "memoria" })));
after(() => db.cerrar());

describe("correlativo", () => {
	it("numera por año, de a uno", async () => {
		assert.equal(await asignarNumero(db, 1, 2026), "RJ-2026-0001");
		assert.equal(await asignarNumero(db, 2, 2026), "RJ-2026-0002");
		assert.equal(await asignarNumero(db, 3, 2027), "RJ-2027-0001");
	});

	it("no repite números aunque se pidan a la vez", async () => {
		const numeros = await Promise.all(Array.from({ length: 25 }, (_, i) => asignarNumero(db, 100 + i, 2030)));
		assert.equal(new Set(numeros).size, 25);
		assert.deepEqual(numeros.map((n) => Number(n.slice(-4))).sort((a, b) => a - b), Array.from({ length: 25 }, (_, i) => i + 1));
	});

	it("registra el invoice con su lead y total", async () => {
		const numero = await asignarNumero(db, 31337, 2028);
		await registrarInvoice(db, numero, { total: 3850, datos: { pieza: "Anillo" } });
		const inv = await buscarInvoice(db, numero);
		assert.equal(Number(inv?.lead_id), 31337);
		assert.equal(Number(inv?.total), 3850);
	});
});

describe("borradores y ajustes", () => {
	it("guarda y reemplaza el borrador de un lead", async () => {
		assert.equal(await leerBorrador(db, 9), null);
		await guardarBorrador(db, 9, { pieza: "Aretes" });
		await guardarBorrador(db, 9, { pieza: "Collar" });
		assert.deepEqual((await leerBorrador(db, 9))?.datos, { pieza: "Collar" });
	});

	it("guarda ajustes como JSON", async () => {
		await guardarAjuste(db, "modelo_ia", "gpt-x");
		assert.equal(await leerAjuste(db, "modelo_ia"), "gpt-x");
		await guardarAjuste(db, "plantilla", { bloques: [] });
		assert.deepEqual(await leerAjuste(db, "plantilla"), { bloques: [] });
	});
});
