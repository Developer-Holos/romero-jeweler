// Panel de entregas para el panel de control de Kommo (/panel/entregas): piezas por fecha de entrega estimada.
// La fecha es aproximada y sujeta a cambio; sale de un campo fecha del lead (544152 por defecto).
// Solo funciones puras (se prueban sin servidor); la lectura de Kommo está en la ruta.
import { idEtapa } from "#lib/kommo/pipeline.ts";
import type { LeadResumen } from "./kommo.ts";

// Romero está en Miami: "hoy" y los días que faltan se cuentan en su hora, no en la del servidor.
export const ZONA = "America/New_York";
const idsDeEtapas = (nombres: string[]) => new Set(nombres.map(idEtapa));
// Ya no esperan entrega: entregadas, en post-entrega, ganadas (142) o perdidas (143).
const CERRADOS = idsDeEtapas(["Entregado", "Post-Entrega", "Logrado con éxito", "Ventas Perdidos"]);
// Para que el asesor reconozca la pieza aunque el lead se llame "Lead #123".
const CAMPO_ORDEN = "order #";

// En riesgo: se entrega pronto y todavía no pasó a fundición. Es la regla inicial; la ajusta el taller.
export const DIAS_RIESGO = 14;
// La página arma el texto del aviso con esta misma lista.
export const ETAPAS_RIESGO = ["Diseño", "Aprobación de diseño", "En espera", "Impresión 3D"];
export const ETAPAS_TEMPRANAS = idsDeEtapas(ETAPAS_RIESGO);

export type Pieza = {
	id: number;
	nombre: string;
	orden: string;
	etapa: string;
	asesorId: number; // responsable del lead (el filtro va por id: dos asesores pueden llamarse igual)
	asesor: string; // su nombre
	fecha: string | null;
	dias: number | null;
	riesgo: boolean;
};

// Rangos sin solaparse: los totales, la regla y las listas usan los mismos (la página los recibe con el resumen). Para
// cambiarlos, basta con esta lista: en orden, con `hasta` en días, incluido; `desde` es el `hasta` anterior + 1.
const LIMITES = [
	{ clave: "atrasadas", nombre: "Atrasadas", hasta: -1 },
	{ clave: "semana", nombre: "0–7 días", hasta: 7 },
	{ clave: "mes", nombre: "8–30 días", hasta: 30 },
	{ clave: "dos-meses", nombre: "31–60 días", hasta: 60 },
	{ clave: "tres-meses", nombre: "61–90 días", hasta: 90 },
	{ clave: "despues", nombre: "+90 días", hasta: Infinity },
];
export const RANGOS = LIMITES.map((r, i) => ({ ...r, desde: i ? LIMITES[i - 1].hasta + 1 : -Infinity }));

// "AAAA-MM-DD" de un momento, en la zona de Romero.
export const diaLocal = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(ms);
const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000);

// Kommo guarda la fecha como segundos unix (a veces como texto); cualquier otra cosa se descarta.
function fechaDelCampo(lead: LeadResumen, campo: number) {
	const valor = lead.valores.find((v) => v.campo === campo)?.valores[0];
	const segundos = typeof valor === "number" ? valor : /^\d+$/.test(String(valor ?? "")) ? Number(valor) : NaN;
	return Number.isFinite(segundos) && segundos > 0 ? diaLocal(segundos * 1000) : null;
}

const ordenDe = (lead: LeadResumen) => String(lead.valores.find((v) => v.nombre.trim().toLowerCase() === CAMPO_ORDEN)?.valores[0] ?? "").trim();

export type OpcionesEntregas = {
	campo: number; // campo fecha de la entrega estimada
	embudo?: number; // solo los leads de este embudo (Producción); sin él, todos
	etapas: Map<number, string>;
	usuarios: Map<number, string>;
};

export function resumirEntregas(leads: LeadResumen[], { campo, embudo, etapas, usuarios }: OpcionesEntregas, ahora = Date.now()) {
	const hoy = diaLocal(ahora);
	const rangos = RANGOS.map((r) => ({ ...r, piezas: [] as Pieza[] }));
	const sinFecha: Pieza[] = [];
	for (const l of leads) {
		if (CERRADOS.has(l.etapa) || (embudo && l.embudo !== embudo)) continue;
		const fecha = fechaDelCampo(l, campo);
		const dias = fecha ? diasEntre(hoy, fecha) : null;
		const riesgo = dias !== null && dias >= 0 && dias <= DIAS_RIESGO && ETAPAS_TEMPRANAS.has(l.etapa);
		const pieza: Pieza = { id: l.id, nombre: l.nombre, orden: ordenDe(l), etapa: etapas.get(l.etapa) ?? "", asesorId: l.responsable, asesor: usuarios.get(l.responsable) ?? "", fecha, dias, riesgo };
		if (dias === null) sinFecha.push(pieza);
		else rangos[RANGOS.findIndex((r) => dias <= r.hasta)].piezas.push(pieza);
	}
	for (const r of rangos) r.piezas.sort((a, b) => a.dias! - b.dias! || a.id - b.id);
	sinFecha.sort((a, b) => a.id - b.id);
	return { hoy, zona: ZONA, actualizado: ahora, diasRiesgo: DIAS_RIESGO, etapasRiesgo: ETAPAS_RIESGO, enCurso: rangos.reduce((n, r) => n + r.piezas.length, sinFecha.length), rangos, sinFecha };
}

export type ResumenEntregas = ReturnType<typeof resumirEntregas>;
