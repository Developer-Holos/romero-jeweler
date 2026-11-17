// La guardia (clave, solo en iframe de Kommo) está en hooks.server.ts.
import { error } from '@sveltejs/kit';
import { dev } from '$app/env';
import { ETAPAS_DEMO, USUARIOS_DEMO, leadsDemo } from '#lib/server/widget/entregas-demo.ts';
import { resumirEntregas, type ResumenEntregas } from '#lib/server/widget/entregas.ts';
import { MAX_RESULTADOS, leerEtapas, leerLeads, leerUsuarios, type LeadResumen } from '#lib/server/widget/kommo.ts';
import { recordar } from '#lib/server/widget/recuerdo.ts';
import { env } from '#lib/server/widget/servicio.ts';

const resumir = (leads: LeadResumen[], etapas: Map<number, string>, usuarios: Map<number, string>) =>
	resumirEntregas(leads, { campo: env.KOMMO_CAMPO_ENTREGA, embudo: env.KOMMO_EMBUDO_ENTREGAS, etapas, usuarios });

// Kommo puede recargar el panel seguido; se recuerda 2 minutos para no recorrer los leads en cada carga. Mientras se lee,
// los demás pedidos esperan esa misma lectura en vez de empezar otra. El botón "actualizar" (`?actualizar`) salta lo
// recordado, pero no más seguido que cada 10 s, y si esa lectura falla sigue sirviendo lo anterior.
type Lectura = { resumen: ResumenEntregas; incompleto: boolean };

async function leer() {
	// Sin nombres de etapa o de asesor el panel sirve igual.
	const vacio = () => new Map<number, string>();
	const [leads, etapas, usuarios] = await Promise.all([leerLeads(env.KOMMO_EMBUDO_ENTREGAS), leerEtapas().catch(vacio), leerUsuarios().catch(vacio)]);
	const resumen = resumir(leads, etapas, usuarios);
	console.log(`[entregas] ${leads.length} leads, ${resumen.enCurso} en curso (${resumen.sinFecha.length} sin fecha)`);
	return { resumen, incompleto: leads.length >= MAX_RESULTADOS };
}

const lectura = recordar<Lectura>(leer, { duracion: 120_000, minimoParaReleer: 10_000 });

export const load = async ({ url }) => {
	const kommo = `https://${env.KOMMO_SUBDOMAIN}.kommo.com`;
	// `?demo` en `vite dev`: datos de ejemplo, para ver el panel sin Kommo. En producción no existe.
	if (dev && url.searchParams.has('demo')) return { resumen: resumir(leadsDemo(env.KOMMO_CAMPO_ENTREGA), ETAPAS_DEMO, USUARIOS_DEMO), incompleto: false, kommo };
	try {
		return { ...(await lectura(url.searchParams.has('actualizar'))), kommo };
	} catch (e) {
		console.error('[entregas] no se pudo leer Kommo:', e);
		// En `vite dev` se ve la causa en la página; en producción, solo en el log.
		error(502, dev ? `No se pudo leer Kommo: ${e instanceof Error ? e.message : e}` : 'No se pudo leer Kommo');
	}
};
