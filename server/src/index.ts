import { serve } from "@hono/node-server";
import { crearApp, modeloIa } from "./app.ts";
import { abrirDb } from "./db.ts";
import { env } from "./env.ts";
import { kommoConfigurado } from "./kommo.ts";
import { cerrarNavegador } from "./pdf.ts";

const db = await abrirDb({ url: env.DATABASE_URL, dir: env.DATA_DIR });
const app = crearApp(db);

const server = serve({ fetch: app.fetch, port: env.PORT }, async (info) => {
	console.log(
		[
			`Servidor del widget en http://localhost:${info.port}`,
			`base: ${env.DATABASE_URL ? "Postgres (DATABASE_URL)" : `PGlite en ${env.DATA_DIR}`}`,
			`IA: ${env.OPENAI_API_KEY ? await modeloIa(db) : "desactivada (falta OPENAI_API_KEY)"}`,
			`Kommo: ${kommoConfigurado() ? (env.KOMMO_CAMPO_INVOICE ? `PDF al campo ${env.KOMMO_CAMPO_INVOICE}` : "sin KOMMO_CAMPO_INVOICE (el PDF solo se descarga)") : "desactivado"}`,
		].join(" · "),
	);
});

for (const senal of ["SIGINT", "SIGTERM"] as const) {
	process.on(senal, async () => {
		server.close();
		await cerrarNavegador();
		await db.cerrar();
		process.exit(0);
	});
}
