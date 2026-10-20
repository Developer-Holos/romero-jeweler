// Sin WIDGET_KEY el servidor arranca y atiende con solo la URL (en un proceso aparte de app.test.ts,
// que sí define la clave: env.ts se lee una vez al importar).
import assert from "node:assert/strict";
import { after, before, it } from "node:test";

delete process.env.WIDGET_KEY;
const { abrirDb } = await import("./db.ts");
const { crearApp } = await import("./app.ts");

let db: Awaited<ReturnType<typeof abrirDb>>;
let app: ReturnType<typeof crearApp>;
before(async () => {
	db = await abrirDb({ dir: "memoria" });
	app = crearApp(db);
});
after(() => db.cerrar());

it("atiende sin el header X-Widget-Key", async () => {
	const res = await app.request("/plantilla");
	assert.equal(res.status, 200);
	assert.deepEqual(await res.json(), { plantilla: null });
});

it("sigue pidiendo la clave de administración en /admin", async () => {
	assert.equal((await app.request("/admin/ia")).status, 401);
});
