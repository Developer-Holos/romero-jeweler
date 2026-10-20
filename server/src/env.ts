// Variables de entorno del servidor del widget. Se cargan desde server/.env (ver .env.example).
import { resolve } from "node:path";

function requerida(nombre: string) {
	const valor = process.env[nombre]?.trim();
	if (!valor) throw new Error(`Falta la variable de entorno ${nombre} (ver server/.env.example)`);
	return valor;
}

export const env = {
	PORT: Number(process.env.PORT) || 8787,
	// Clave compartida con el widget (ajuste "Clave del widget" en Kommo): viaja en el header X-Widget-Key.
	WIDGET_KEY: requerida("WIDGET_KEY"),
	// Orígenes que pueden llamar al servidor (la cuenta de Kommo y el widget en desarrollo).
	ORIGENES: (process.env.ORIGENES ?? "https://romerojeweler.kommo.com,http://localhost:5173,http://localhost:4173").split(",").map((o) => o.trim()).filter(Boolean),
	// Sin clave de OpenAI el servidor arranca igual; /ia responde 503.
	OPENAI_API_KEY: process.env.OPENAI_API_KEY?.trim() || undefined,
	OPENAI_MODEL: process.env.OPENAI_MODEL?.trim() || "gpt-5-mini",
	// Relativa a la carpeta server/, sin importar desde dónde se arranque.
	DATA_DIR: resolve(import.meta.dirname, "..", process.env.DATA_DIR?.trim() || "data"),
};
