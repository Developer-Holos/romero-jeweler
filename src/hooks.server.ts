// /api es la API del widget de invoice, que la llama desde la cuenta de Kommo (otro origen): CORS y, si
// WIDGET_KEY está definida, el header X-Widget-Key (menos /api/salud, /api/admin, que tiene su propia clave, el
// webhook de Dropbox, que va firmado, y los de Kommo —mensajes y señal de seguimiento—, que no pueden mandar el header).
// /panel (panel de control de Kommo) va aparte: pide `?clave=` (ver `panel` abajo).
import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { dev } from '$app/env';
import { dropboxConfigurado } from '#lib/server/widget/dropbox.ts';
import { log } from '#lib/server/widget/log.ts';
import { db, env, fallo, iguales, seguimientoConfig } from '#lib/server/widget/servicio.ts';
import { iniciarSeguimientos } from '#lib/server/widget/seguimientos.ts';
import { iniciarVideos } from '#lib/server/widget/videos.ts';

// El cursor de Dropbox se toma al arrancar: si esperara al primer webhook, el video que lo dispara se perdería.
export const init: ServerInit = async () => {
  // Los seguimientos pendientes se reintentan cada 5 min (no dependen de Dropbox).
  try {
    iniciarSeguimientos(await db(), seguimientoConfig);
  } catch (e) {
    console.error('[seguimientos] no se pudo iniciar:', e);
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

// /panel: páginas para el panel de control de Kommo (un iframe con la URL que se configura allí). Privadas: piden
// `?clave=` (PANEL_KEY; sin ella, 404 como si no existieran), el navegador solo las muestra dentro de un iframe de la
// cuenta de Kommo (frame-ancestors) y, si se abren directo en una pestaña (Sec-Fetch-Dest: document), se rechazan.
const panel: Handle = async ({ event, resolve }) => {
  if (!env.PANEL_KEY || !iguales(event.url.searchParams.get('clave'), env.PANEL_KEY)) return new Response('Not found', { status: 404 });
  const destino = event.request.headers.get('Sec-Fetch-Dest');
  // `document` es abrirla en una pestaña; `iframe` (Kommo) y `empty` (la recarga de datos de la página) pasan. En `vite dev`
  // se deja abrir directo, para trabajar en la página.
  if (!dev && destino === 'document') return new Response('Esta página solo se ve desde el panel de control de Kommo.', { status: 403 });
  const res = await resolve(event);
  res.headers.set('Content-Security-Policy', `frame-ancestors ${env.ORIGENES.join(' ')}`);
  res.headers.set('Referrer-Policy', 'no-referrer'); // la clave va en la URL
  res.headers.set('X-Robots-Tag', 'noindex');
  res.headers.set('Cache-Control', 'private, no-store');
  return res;
};

const manejar: Handle = async ({ event, resolve }) => {
  // Se decide con la ruta que SvelteKit reconoció (ya decodificada), no con la URL tal como llega:
  // `/%61pi/borradores/1` llega al handler de /api/borradores/[lead] y tiene que pasar por la misma guardia.
  const ruta: string = event.route.id ?? '';
  if (ruta.startsWith('/panel/')) return panel({ event, resolve });
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

// Una línea por petición a /api y /panel: ruta, parámetros, estado y duración. Nunca la URL completa (el panel lleva
// `?clave=`) ni el cuerpo; `log` oculta además cualquier clave o token que aparezca en los datos.
const SIN_LOG = new Set(['/api/salud']);
const LENTA_MS = 5000;
export const handle: Handle = async ({ event, resolve }) => {
  const ruta = event.route.id ?? '';
  if (event.request.method === 'OPTIONS' || SIN_LOG.has(ruta) || !(ruta.startsWith('/api/') || ruta.startsWith('/panel/'))) return manejar({ event, resolve });
  const inicio = Date.now();
  let estado = 500; // si manejar lanza, la petición termina en 500
  try {
    const res = await manejar({ event, resolve });
    estado = res.status;
    return res;
  } finally {
    const ms = Date.now() - inicio;
    log(estado >= 500 ? 'error' : estado >= 400 || ms > LENTA_MS ? 'warn' : 'info', 'peticion', {
      metodo: event.request.method,
      ruta,
      parametros: event.params,
      consulta: Object.fromEntries(event.url.searchParams),
      estado,
      ms,
      origen: event.request.headers.get('Origin') ?? undefined,
      bytes: Number(event.request.headers.get('Content-Length')) || undefined
    });
  }
};

// Errores que nadie capturó (`unknown`: los 404 y los `error()` del código ya quedan en la línea de la petición), con la
// ruta y el método y el stack en una sola línea. Sin devolver nada: SvelteKit conserva su respuesta de siempre.
export const handleError: HandleServerError = ({ kind, error, event }) => {
  if (kind !== 'unknown') return;
  log('error', 'error_no_controlado', { metodo: event.request.method, ruta: event.route.id, parametros: event.params, error });
};
