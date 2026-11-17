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
		// Lo anterior sigue recordado: sin releer no se vuelve a llamar.
		assert.equal(await lectura(), "lectura 1");
		assert.equal(estado.llamadas, 2);
	});

	it("un releer fallido también cuenta para el mínimo: durante una caída no se llama a Kommo en cada clic", async () => {
		const { lectura, estado, pasar } = montar();
		await lectura();
		pasar(MINIMO);
		estado.falla = true;
		await lectura(true);
		await lectura(true);
		await lectura(true);
		assert.equal(estado.llamadas, 2); // la lectura buena y un solo intento fallido
		pasar(MINIMO);
		estado.falla = false;
		assert.equal(await lectura(true), "lectura 3"); // cuando pasó el mínimo y Kommo volvió, se lee
	});

	it("alFallarReleyendo decide qué se sirve y recibe el error", async () => {
		let visto: unknown;
		let reloj = 0;
		let falla = false;
		const lectura = recordar(async () => (falla ? Promise.reject(new Error("Kommo caído")) : "buena"), {
			duracion: DURACION,
			minimoParaReleer: MINIMO,
			ahora: () => reloj,
			alFallarReleyendo: (error, copia) => ((visto = error), `${copia} (vieja)`),
		});
		await lectura();
		reloj = MINIMO;
		falla = true;
		assert.equal(await lectura(true), "buena (vieja)");
		assert.match((visto as Error).message, /Kommo caído/);
		assert.equal(await lectura(), "buena"); // lo guardado no queda marcado
	});

	it("mientras se relee, los demás pedidos reciben la copia vigente sin esperar", async () => {
		let reloj = 0;
		let lecturas = 0;
		let terminar!: () => void;
		const lectura = recordar(
			() => {
				lecturas++;
				return lecturas === 1 ? Promise.resolve("vieja") : new Promise<string>((ok) => (terminar = () => ok("nueva")));
			},
			{ duracion: DURACION, minimoParaReleer: MINIMO, ahora: () => reloj }
		);
		await lectura();
		reloj = MINIMO;
		const releyendo = lectura(true); // lenta: sigue pendiente
		assert.equal(await lectura(), "vieja");
		assert.equal(await lectura(true), "vieja"); // otro clic mientras tanto: ni espera ni lee dos veces
		terminar();
		assert.equal(await releyendo, "nueva");
		assert.equal(await lectura(), "nueva");
		assert.equal(lecturas, 2);
	});

	it("si falla al releer y lo recordado ya venció, da el error", async () => {
		const { lectura, estado, pasar } = montar();
		await lectura();
		pasar(DURACION);
		estado.falla = true;
		await assert.rejects(lectura(true), /Kommo caído/);
	});
});
