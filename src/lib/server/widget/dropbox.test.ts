import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { espacioRaiz } from "./dropbox.ts";

describe("espacioRaiz", () => {
	it("cuenta personal: mismo espacio raíz y personal, no hace falta el header", () => {
		assert.equal(espacioRaiz({ ".tag": "user", root_namespace_id: "1", home_namespace_id: "1" }), null);
	});

	it("cuenta de equipo declarada `team`: usa el espacio raíz", () => {
		assert.equal(espacioRaiz({ ".tag": "team", root_namespace_id: "2", home_namespace_id: "1" }), "2");
	});

	it("cuenta que responde `user` pero con un espacio raíz distinto del personal (la de Holos): también", () => {
		assert.equal(espacioRaiz({ ".tag": "user", root_namespace_id: "13908283553", home_namespace_id: "13907448129" }), "13908283553");
	});
});
