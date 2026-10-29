import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { claveCampo, mezclarOpciones } from "../../invoice/opciones.ts";

describe("opciones", () => {
	it("suma las agregadas a las de fábrica sin repetir", () => {
		const o = mezclarOpciones({ metales: ["Plata 925", "oro amarillo"], quilates: ["22k"], camposAnillo: [{ clave: "x_center_stones", nombre: "Center Stones" }, { clave: "x_center_stones", nombre: "Otra" }], piedras: [3] });
		assert.deepEqual(o.metales, ["Oro amarillo", "Oro blanco", "Oro rosa", "Platino", "Plata 925"]);
		assert.deepEqual(o.quilates, ["10k", "14k", "18k", "22k"]);
		assert.equal(o.camposAnillo.length, 1);
		assert.equal(o.piedras.length, 6);
	});

	it("arma la clave de un campo nuevo", () => {
		assert.equal(claveCampo("Center Stones"), "x_center_stones");
		assert.equal(claveCampo("Piedra  ´Central´ #2"), "x_piedra_central_2");
	});
});
