// La guardia (clave, solo en iframe de Kommo) está en hooks.server.ts.
import { error } from '@sveltejs/kit';
import { dev } from '$app/env';
import { ETAPAS_DEMO, USUARIOS_DEMO, leadsDemo } from '#lib/server/widget/entregas-demo.ts';
import { resumirEntregas, type ResumenEntregas } from '#lib/server/widget/entregas.ts';
import { leerEtapas, leerLeads, leerUsuarios } from '#lib/server/widget/kommo.ts';
import { env } from '#lib/server/widget/servicio.ts';

// Kommo puede recargar el panel seguido; se recuerda 2 minutos para no recorrer todos los leads en cada carga.
const RECORDAR = 120_000;
let recordado: { hasta: number; resumen: ResumenEntregas } | null = null;

async function resumen() {
  if (recordado && recordado.hasta > Date.now()) return recordado.resumen;
  // Sin nombres de etapa o de asesor el panel sirve igual.
  const vacio = () => new Map<number, string>();
  const [leads, etapas, usuarios] = await Promise.all([leerLeads(), leerEtapas().catch(vacio), leerUsuarios().catch(vacio)]);
  const r = resumirEntregas(leads, { campo: env.KOMMO_CAMPO_ENTREGA, embudo: env.KOMMO_EMBUDO_ENTREGAS, etapas, usuarios });
  recordado = { hasta: Date.now() + RECORDAR, resumen: r };
  console.log(`[entregas] ${leads.length} leads, ${r.enCurso} en curso con fecha, ${r.sinFecha.length} sin fecha`);
  return r;
}

export const load = async ({ url }) => {
  // `?demo` en `vite dev`: datos de ejemplo, para ver el panel sin Kommo. En producción no existe.
  if (dev && url.searchParams.has('demo'))
    return { resumen: resumirEntregas(leadsDemo(env.KOMMO_CAMPO_ENTREGA), { campo: env.KOMMO_CAMPO_ENTREGA, embudo: env.KOMMO_EMBUDO_ENTREGAS, etapas: ETAPAS_DEMO, usuarios: USUARIOS_DEMO }), kommo: `https://${env.KOMMO_SUBDOMAIN}.kommo.com` };
  try {
    return { resumen: await resumen(), kommo: `https://${env.KOMMO_SUBDOMAIN}.kommo.com` };
  } catch (e) {
    console.error('[entregas] no se pudo leer Kommo:', e);
    // En `vite dev` se ve la causa en la página; en producción, solo en el log.
    error(502, dev ? `No se pudo leer Kommo: ${e instanceof Error ? e.message : e}` : 'No se pudo leer Kommo');
  }
};
