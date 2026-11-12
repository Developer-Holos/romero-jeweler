// La guardia (clave, solo en iframe de Kommo) está en hooks.server.ts.
import { error } from '@sveltejs/kit';
import { dev } from '$app/env';
import { ETAPAS_DEMO, USUARIOS_DEMO, leadsDemo } from '#lib/server/widget/entregas-demo.ts';
import { resumirEntregas, type ResumenEntregas } from '#lib/server/widget/entregas.ts';
import { leerEtapas, leerLeads, leerUsuarios, type LeadResumen } from '#lib/server/widget/kommo.ts';
import { env } from '#lib/server/widget/servicio.ts';

const resumir = (leads: LeadResumen[], etapas: Map<number, string>, usuarios: Map<number, string>) =>
	resumirEntregas(leads, { campo: env.KOMMO_CAMPO_ENTREGA, embudo: env.KOMMO_EMBUDO_ENTREGAS, etapas, usuarios });

// Kommo puede recargar el panel seguido; se recuerda 2 minutos para no recorrer los leads en cada carga. Mientras se lee,
// los demás pedidos esperan esa misma lectura en vez de empezar otra.
const RECORDAR = 120_000;
let recordado: { hasta: number; resumen: Promise<ResumenEntregas> } | null = null;

async function leer() {
	// Sin nombres de etapa o de asesor el panel sirve igual.
	const vacio = () => new Map<number, string>();
	const [leads, etapas, usuarios] = await Promise.all([leerLeads(env.KOMMO_EMBUDO_ENTREGAS), leerEtapas().catch(vacio), leerUsuarios().catch(vacio)]);
	const r = resumir(leads, etapas, usuarios);
	console.log(`[entregas] ${leads.length} leads, ${r.enCurso} en curso (${r.sinFecha.length} sin fecha)`);
	return r;
}

function resumen() {
	if (recordado && recordado.hasta > Date.now()) return recordado.resumen;
	const actual = { hasta: Date.now() + RECORDAR, resumen: leer() };
	recordado = actual;
	// Si falla, no se recuerda: el próximo pedido vuelve a intentar.
	actual.resumen.catch(() => recordado === actual && (recordado = null));
	return actual.resumen;
}

export const load = async ({ url }) => {
	const kommo = `https://${env.KOMMO_SUBDOMAIN}.kommo.com`;
	// `?demo` en `vite dev`: datos de ejemplo, para ver el panel sin Kommo. En producción no existe.
	if (dev && url.searchParams.has('demo')) return { resumen: resumir(leadsDemo(env.KOMMO_CAMPO_ENTREGA), ETAPAS_DEMO, USUARIOS_DEMO), kommo };
	try {
		return { resumen: await resumen(), kommo };
	} catch (e) {
		console.error('[entregas] no se pudo leer Kommo:', e);
		// En `vite dev` se ve la causa en la página; en producción, solo en el log.
		error(502, dev ? `No se pudo leer Kommo: ${e instanceof Error ? e.message : e}` : 'No se pudo leer Kommo');
	}
};
