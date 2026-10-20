// Variables de entorno del servidor del widget. Se cargan desde server/.env (ver .env.example).
import { resolve } from "node:path";

const opcional = (nombre: string) => process.env[nombre]?.trim() || undefined;

const subdominio = opcional("KOMMO_SUBDOMAIN");

export const env = {
	PORT: Number(process.env.PORT) || 8787,
	// Opcional. Si está definida, el widget tiene que mandarla en el header X-Widget-Key (ajuste "Clave del
	// widget" en Kommo). Sin ella, cualquiera que tenga la URL del servidor puede usarlo.
	WIDGET_KEY: opcional("WIDGET_KEY"),
	// Clave aparte, solo para Holos: cambiar el modelo de IA sin redesplegar (/admin/ia).
	ADMIN_KEY: opcional("ADMIN_KEY"),
	// Orígenes que pueden llamar al servidor (la cuenta de Kommo y el widget en desarrollo).
	ORIGENES: (process.env.ORIGENES ?? "https://romerojeweler.kommo.com,http://localhost:5173,http://localhost:4173").split(",").map((o) => o.trim()).filter(Boolean),
	// Sin clave de OpenAI el servidor arranca igual: el invoice sale con el texto estándar.
	OPENAI_API_KEY: opcional("OPENAI_API_KEY"),
	// Modelo inicial; después se cambia con PUT /admin/ia y queda guardado en la base.
	OPENAI_MODEL: opcional("OPENAI_MODEL") ?? "gpt-5-mini",
	// Postgres (Railway). Sin DATABASE_URL se usa PGlite en DATA_DIR, para desarrollar en local.
	DATABASE_URL: opcional("DATABASE_URL"),
	// Relativa a la carpeta server/, sin importar desde dónde se arranque.
	DATA_DIR: resolve(import.meta.dirname, "..", opcional("DATA_DIR") ?? "data"),
	// Kommo: subir el PDF al campo "Invoice" y las imágenes al lead. Sin token, esas funciones se apagan.
	KOMMO_BASE_URL: (opcional("KOMMO_BASE_URL") ?? (subdominio ? `https://${subdominio}.kommo.com` : "")).replace(/\/+$/, ""),
	KOMMO_ACCESS_TOKEN: opcional("KOMMO_ACCESS_TOKEN"),
	// Id del campo "Invoice" (tipo archivo) de los leads. Sin él, el PDF solo se descarga.
	KOMMO_CAMPO_INVOICE: Number(opcional("KOMMO_CAMPO_INVOICE")) || undefined,
};
