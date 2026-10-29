// /api es la API del widget de invoice, que la llama desde la cuenta de Kommo (otro origen): CORS y, si
// WIDGET_KEY está definida, el header X-Widget-Key (menos /api/salud y /api/admin, que tiene su propia clave).
import type { Handle } from '@sveltejs/kit/hooks';
import { env, fallo, iguales } from '#lib/server/widget/servicio.ts';

const CORS = {
  'Access-Control-Allow-Headers': 'X-Widget-Key, Content-Type, X-Nombre-Archivo, X-Campo-Imagen',
  'Access-Control-Allow-Methods': 'GET, PUT, POST',
  'Access-Control-Expose-Headers': 'X-Kommo-Estado, X-Kommo-Detalle',
  'Access-Control-Max-Age': '600'
};

export const handle: Handle = async ({ event, resolve }) => {
  const ruta = event.url.pathname;
  if (ruta !== '/api' && !ruta.startsWith('/api/')) return resolve(event);

  const origen = event.request.headers.get('Origin');
  const cors: Record<string, string> = origen && env.ORIGENES.includes(origen) ? { ...CORS, 'Access-Control-Allow-Origin': origen, Vary: 'Origin' } : {};
  if (event.request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const libre = ruta === '/api/salud' || ruta.startsWith('/api/admin/');
  const res = !libre && env.WIDGET_KEY && !iguales(event.request.headers.get('X-Widget-Key'), env.WIDGET_KEY)
    ? fallo('Clave del widget inválida', 401)
    : await resolve(event);
  for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
  return res;
};
