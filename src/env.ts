import { defineEnvVars } from '@sveltejs/kit/env';

const opcional = (value: string | undefined) => value?.trim() || undefined;

export const variables = defineEnvVars({
  KOMMO_SUBDOMAIN: {},
  KOMMO_ACCESS_TOKEN: {},
  // Servidor externo del widget de invoice (server/): PDF, IA y plantilla compartida.
  // Sin URL el widget funciona igual, pero no genera el PDF y el diseño queda solo en el navegador.
  SERVIDOR_URL: { public: true, schema: opcional, description: 'URL del servidor del widget, ej. http://localhost:8787' },
  SERVIDOR_KEY: { public: true, schema: opcional, description: 'WIDGET_KEY del servidor (viaja al navegador)' }
});
