// /api es la API del widget de invoice, que la llama desde la cuenta de Kommo (otro origen): CORS y, si
// WIDGET_KEY está definida, el header X-Widget-Key (menos /api/salud, /api/admin, que tiene su propia clave, y el
// webhook de Dropbox, que va firmado).
import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { dropboxConfigurado } from '#lib/server/widget/dropbox.ts';
import { db, env, fallo, iguales, seguimientoConfig } from '#lib/server/widget/servicio.ts';
import { iniciarSeguimientos } from '#lib/server/widget/seguimientos.ts';
import { iniciarVideos } from '#lib/server/widget/videos.ts';

// El cursor de Dropbox se toma al arrancar: si esperara al primer webhook, el video que lo dispara se perdería.
export const init: ServerInit = async () => {
  // Los seguimientos pendientes se reintentan cada 5 min (no dependen de Dropbox).
  if (env.KOMMO_WEBHOOK_KEY) {
    try {
      iniciarSeguimientos(await db(), seguimientoConfig);
    } catch (e) {
      console.error('[seguimientos] no se pudo iniciar:', e);
    }
  }
  if (!dropboxConfigurado()) return;
  // Si falla (Postgres o Dropbox caídos), la app arranca igual: el cursor se toma con el primer aviso.
  try {
    await iniciarVideos(await db(), env.KOMMO_BOT_VIDEO);
  } catch (e) {
    console.error('[videos] no se pudo iniciar:', e);
  }
};

const CORS = {
  'Access-Control-Allow-Headers': 'X-Widget-Key, Content-Type, X-Nombre-Archivo, X-Campo-Imagen',
  'Access-Control-Allow-Methods': 'GET, PUT, POST',
  'Access-Control-Expose-Headers': 'X-Kommo-Estado, X-Kommo-Detalle',
  'Access-Control-Max-Age': '600'
};

export const handle: Handle = async ({ event, resolve }) => {
  // Se decide con la ruta que SvelteKit reconoció (ya decodificada), no con la URL tal como llega:
  // `/%61pi/borradores/1` llega al handler de /api/borradores/[lead] y tiene que pasar por la misma guardia.
  const ruta: string = event.route.id ?? '';
  if (!ruta.startsWith('/api/')) return resolve(event);

  const origen = event.request.headers.get('Origin');
  const cors: Record<string, string> = origen && env.ORIGENES.includes(origen) ? { ...CORS, 'Access-Control-Allow-Origin': origen, Vary: 'Origin' } : {};
  if (event.request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const libre = ruta === '/api/salud' || ruta === '/api/videos/webhook' || ruta === '/api/kommo/mensajes' || ruta === '/api/seguimientos' || ruta.startsWith('/api/admin/');
  const res = !libre && env.WIDGET_KEY && !iguales(event.request.headers.get('X-Widget-Key'), env.WIDGET_KEY)
    ? fallo('Clave del widget inválida', 401)
    : await resolve(event);
  for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
  return res;
};
