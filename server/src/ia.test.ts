import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.WIDGET_KEY ??= "test";
const { mismasCifras, mismosMeses, validar } = await import("./ia.ts");

const pedido = {
	idioma: "en" as const,
	pieza: "Anillo de boda para hombre a la medida",
	vinetas: ["Oro amarillo sólido de 14k", "6–7 diamantes naturales en pavé, corte redondo, 2 mm"],
	notas: "talla 10",
	instrucciones: "",
	clausulas: [
		{ id: "pago", nombre: "Condiciones de pago", texto: "El **Depósito 1 (50%)** de $1,070.00 se paga para iniciar la producción." },
		{ id: "garantia", nombre: "Garantía", texto: "**1 año** en engaste." },
	],
};

describe("mismasCifras", () => {
	it("acepta una traducción que conserva las cifras", () => {
		assert.equal(mismasCifras("de $1,070.00 el 5 de noviembre de 2026", "of $1,070.00 on November 5, 2026"), true);
	});
	it("rechaza un monto cambiado o perdido", () => {
		assert.equal(mismasCifras("de $1,070.00", "of $1,700.00"), false);
		assert.equal(mismasCifras("50% de $1,070.00", "half of $1,070.00"), false);
	});
});

describe("mismosMeses", () => {
	it("exige el mismo mes al traducir una fecha", () => {
		assert.equal(mismosMeses("1 al 8 de diciembre de 2026", "December 1–8, 2026", "en"), true);
		assert.equal(mismosMeses("1 al 8 de diciembre de 2026", "November 1–8, 2026", "en"), false);
		assert.equal(mismosMeses("Sin fechas", "No dates", "en"), true);
	});
});

describe("validar", () => {
	it("usa la redacción cuando respeta las cifras", () => {
		const r = validar(pedido, {
			titulo: "Custom men's wedding band",
			vinetas: ["14k solid yellow gold", "6–7 natural pavé diamonds, round cut, 2 mm", "Size 10"],
			clausulas: [
				{ id: "pago", nombre: "Payment terms", texto: "**Deposit 1 (50%)** of $1,070.00 is due to start production." },
				{ id: "garantia", nombre: "Warranty", texto: "**1 year** on setting." },
			],
			etiquetas: [],
		});
		assert.deepEqual(r.descartadas, []);
		assert.equal(r.clausulas[0].nombre, "Payment terms");
	});

	it("deja el texto original del bloque donde la IA tocó una cifra", () => {
		const r = validar(pedido, {
			titulo: "Custom men's wedding band",
			vinetas: ["18k solid yellow gold", "6–7 natural pavé diamonds, round cut, 2 mm"],
			clausulas: [
				{ id: "pago", nombre: "Payment terms", texto: "**Deposit 1 (50%)** of $1,000.00 is due." },
				{ id: "garantia", nombre: "Warranty", texto: "**1 year** on setting." },
			],
			etiquetas: [],
		});
		assert.deepEqual(r.descartadas, ["descripcion", "pago"]);
		assert.deepEqual(r.vinetas, pedido.vinetas);
		assert.deepEqual(r.clausulas[0], pedido.clausulas[0]);
		assert.equal(r.clausulas[1].nombre, "Warranty");
	});

	it("traduce las etiquetas y deja la original donde cambió una fecha", () => {
		const conEtiquetas = { ...pedido, clausulas: [], etiquetas: [{ clave: "factura_no", texto: "Factura No." }, { clave: "emision", texto: "20 de octubre de 2026" }, { clave: "total_ahora", texto: "Total a pagar ahora" }] };
		const r = validar(conEtiquetas, {
			titulo: "x",
			vinetas: pedido.vinetas,
			clausulas: [],
			etiquetas: [{ clave: "factura_no", texto: "Invoice No." }, { clave: "emision", texto: "November 20, 2026" }],
		});
		assert.deepEqual(r.etiquetas, [{ clave: "factura_no", texto: "Invoice No." }, { clave: "emision", texto: "20 de octubre de 2026" }, { clave: "total_ahora", texto: "Total a pagar ahora" }]);
		assert.deepEqual(r.descartadas, ["etiqueta:emision", "etiqueta:total_ahora"]);
	});

	it("conserva una cláusula que la IA omitió", () => {
		const r = validar(pedido, { titulo: "x", vinetas: pedido.vinetas, clausulas: [], etiquetas: [] });
		assert.deepEqual(r.clausulas, pedido.clausulas);
		assert.deepEqual(r.descartadas, ["pago", "garantia"]);
	});
});
