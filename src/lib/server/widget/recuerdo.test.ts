import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recordar } from "./recuerdo.ts";

const DURACION = 120_000;
const MINIMO = 10_000;

// Un reloj que se mueve a mano y una lectura que cuenta cuántas veces se llamó (y que se puede hacer fallar).
function montar() {
	let reloj = 1_000_000;
	const estado = { llamadas: 0, falla: false };
	const lectura = recordar(
		async () => {
			estado.llamadas++;
			if (estado.falla) throw new Error("Kommo caído");
			return `lectura ${estado.llamadas}`;
		},
		{ duracion: DURACION, minimoParaReleer: MINIMO, ahora: () => reloj }
	);
	return { lectura, estado, pasar: (ms: number) => (reloj += ms) };
}

describe("recordar", () => {
	it("recuerda la lectura el tiempo indicado y después vuelve a leer", async () => {
		const { lectura, estado, pasar } = montar();
		assert.equal(await lectura(), "lectura 1");
		pasar(DURACION - 1);
		assert.equal(await lectura(), "lectura 1");
		pasar(1);
		assert.equal(await lectura(), "lectura 2");
		assert.equal(estado.llamadas, 2);
	});

	it("varios pedidos a la vez comparten la misma lectura, incluso si piden releer", async () => {
		const { lectura, estado } = montar();
		const todos = await Promise.all([lectura(), lectura(true), lectura()]);
		assert.deepEqual(todos, ["lectura 1", "lectura 1", "lectura 1"]);
		assert.equal(estado.llamadas, 1);
	});

	it("releer salta lo recordado, pero no antes del mínimo", async () => {
		const { lectura, estado, pasar } = montar();
		await lectura();
		pasar(MINIMO - 1);
		assert.equal(await lectura(true), "lectura 1");
		pasar(1);
		assert.equal(await lectura(), "lectura 1"); // sin pedir releer, sigue lo recordado
		assert.equal(await lectura(true), "lectura 2");
		assert.equal(estado.llamadas, 2);
	});

	it("los segundos se cuentan desde que terminó la lectura, no desde que empezó", async () => {
		let reloj = 0;
		let terminar!: () => void;
		const lectura = recordar(() => new Promise<string>((ok) => (terminar = () => ok("lista"))), { duracion: DURACION, minimoParaReleer: MINIMO, ahora: () => reloj });
		const primera = lectura();
		reloj = DURACION * 3; // Kommo tarda mucho
		terminar();
		await primera;
		reloj += DURACION - 1;
		assert.equal(await lectura(), "lista"); // sigue vigente: el tiempo corrió desde que terminó
	});

	it("si falla, no se recuerda: el siguiente pedido lo intenta otra vez", async () => {
		const { lectura, estado } = montar();
		estado.falla = true;
		await assert.rejects(lectura(), /Kommo caído/);
		estado.falla = false;
		assert.equal(await lectura(), "lectura 2");
	});

	it("si falla al releer, sigue sirviendo lo anterior en vez de dar error", async () => {
		const { lectura, estado, pasar } = montar();
		await lectura();
		pasar(MINIMO);
		estado.falla = true;
		assert.equal(await lectura(true), "lectura 1");
		// Y lo anterior sigue recordado con su hora original: sin releer no se vuelve a llamar.
		assert.equal(await lectura(), "lectura 1");
		assert.equal(estado.llamadas, 2);
		// Cuando Kommo vuelve, releer funciona (la lectura anterior ya tiene más de MINIMO).
		estado.falla = false;
		assert.equal(await lectura(true), "lectura 3");
	});

	it("si falla al releer y lo recordado ya venció, da el error", async () => {
		const { lectura, estado, pasar } = montar();
		await lectura();
		pasar(DURACION);
		estado.falla = true;
		await assert.rejects(lectura(true), /Kommo caído/);
	});
});
