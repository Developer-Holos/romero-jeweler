import { serve } from "@hono/node-server";
import { app } from "./app.ts";
import { env } from "./env.ts";
import { cerrarNavegador } from "./pdf.ts";

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
	console.log(`Servidor del widget en http://localhost:${info.port} · IA ${env.OPENAI_API_KEY ? `con ${env.OPENAI_MODEL}` : "desactivada (falta OPENAI_API_KEY)"}`);
});

for (const senal of ["SIGINT", "SIGTERM"] as const) {
	process.on(senal, async () => {
		server.close();
		await cerrarNavegador();
		process.exit(0);
	});
}
