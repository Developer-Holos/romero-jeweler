import { defineEnvVars } from '@sveltejs/kit/env';

const opcional = (value: string | undefined) => value?.trim() || undefined;

export const variables = defineEnvVars({
  KOMMO_SUBDOMAIN: {},
  KOMMO_ACCESS_TOKEN: {},

  // API del widget de invoice (src/routes/api): PDF, IA, borradores y archivos en Kommo.
  WIDGET_KEY: { schema: opcional, description: 'Opcional. Si está, el widget debe mandarla en el header X-Widget-Key' },
  ADMIN_KEY: { schema: opcional, description: 'Solo Holos: cambiar el modelo de IA sin redesplegar (/api/admin/ia)' },
  ORIGENES: {
    schema: (v) => (opcional(v) ?? 'https://romerojeweler.kommo.com,http://localhost:4180').split(',').map((o) => o.trim()).filter(Boolean),
    description: 'Orígenes que pueden llamar a /api, separados por coma (la cuenta de Kommo)'
  },
  OPENAI_API_KEY: { schema: opcional, description: 'Sin clave, el invoice sale con el texto estándar' },
  OPENAI_MODEL: { schema: (v) => opcional(v) ?? 'gpt-5-mini', description: 'Modelo inicial; después se cambia con PUT /api/admin/ia' },
  DATABASE_URL: { schema: opcional, description: 'Postgres (Railway). Sin ella se usa PGlite en DATA_DIR' },
  DATA_DIR: { schema: (v) => opcional(v) ?? 'data', description: 'Carpeta de PGlite cuando no hay DATABASE_URL' },
  KOMMO_BASE_URL: { schema: opcional, description: 'Solo para probar con el Kommo simulado; por defecto https://KOMMO_SUBDOMAIN.kommo.com' },
  KOMMO_CAMPO_INVOICE: { schema: (v) => Number(opcional(v)) || undefined, description: 'Id del campo "Invoice" (archivo) del lead. Sin él, el PDF solo se descarga' },

  // Video del cliente en Dropbox (/api/videos). Sin las tres credenciales, la sección queda apagada.
  DROPBOX_APP_KEY: { schema: opcional, description: 'App key de la app de Dropbox (App Console)' },
  DROPBOX_APP_SECRET: { schema: opcional, description: 'App secret: renueva el token y firma el webhook' },
  DROPBOX_REFRESH_TOKEN: { schema: opcional, description: 'Refresh token (token_access_type=offline)' },
  DROPBOX_RAIZ: { schema: (v) => opcional(v) ?? '', description: 'Carpeta que contiene las carpetas de las órdenes. Vacía: se buscan por nombre en todo Dropbox' },
  DROPBOX_API_URL: { schema: opcional, description: 'Solo para probar con un Dropbox simulado' },
  KOMMO_BOT_VIDEO: { schema: (v) => Number(opcional(v)) || undefined, description: 'Id del Salesbot que manda el link del video. Sin él, solo se guarda el link y una nota' }
});
