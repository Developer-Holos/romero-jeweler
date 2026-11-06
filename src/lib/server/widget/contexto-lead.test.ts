import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { datosRelevantes } from "./contexto-lead.ts";
import type { LeadKommo } from "./kommo.ts";

const lead = (campos: LeadKommo["campos"], precio = 0): LeadKommo => ({ precio, campos });

describe("datos relevantes del lead", () => {
	it("deja solo los campos de la lista, sin importar mayúsculas ni acentos", () => {
		const datos = datosRelevantes(
			lead([
				{ nombre: "SERVICIO", tipo: "select", valores: ["Anillo de compromiso"] },
				{ nombre: "País", tipo: "select", valores: ["Colombia"] },
				{ nombre: "Order #", tipo: "text", valores: ["1146"] },
				{ nombre: "[V] - Mensaje Seguimiento", tipo: "textarea", valores: ["texto viejo"] },
			]),
		);
		assert.deepEqual(datos, [
			{ nombre: "SERVICIO", valor: "Anillo de compromiso" },
			{ nombre: "País", valor: "Colombia" },
		]);
	});

	it("los campos por anillo coinciden sin su prefijo, pero conservan el número en la etiqueta", () => {
		const datos = datosRelevantes(lead([{ nombre: "[2] Ring Type", tipo: "select", valores: ["Solitario"] }]));
		assert.deepEqual(datos, [{ nombre: "[2] Ring Type", valor: "Solitario" }]);
	});

	it("une las listas múltiples y descarta los campos vacíos", () => {
		const datos = datosRelevantes(
			lead([
				{ nombre: "[1] Piedra", tipo: "multiselect", valores: ["Diamante", "Zafiro"] },
				{ nombre: "Plazo espera", tipo: "select", valores: [] },
				{ nombre: "Servicio", tipo: "select", valores: [null, ""] },
			]),
		);
		assert.deepEqual(datos, [{ nombre: "[1] Piedra", valor: "Diamante, Zafiro" }]);
	});

	it("pone el presupuesto (el precio del lead) primero, y solo si hay uno", () => {
		const campos = [{ nombre: "Servicio", tipo: "select", valores: ["Reparación"] }];
		assert.deepEqual(datosRelevantes(lead(campos, 4500))[0], { nombre: "Presupuesto", valor: "4500" });
		assert.equal(datosRelevantes(lead(campos, 0)).length, 1);
	});

	it("escribe las fechas como AAAA-MM-DD", () => {
		const datos = datosRelevantes(lead([{ nombre: "Plazo espera", tipo: "date", valores: [1762400000] }]));
		assert.deepEqual(datos, [{ nombre: "Plazo espera", valor: "2025-11-06" }]);
	});
});
