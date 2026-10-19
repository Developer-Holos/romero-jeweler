import { PRODUCCION, type StageChange } from "#lib/kommo/pipeline.ts"

const NAMES = PRODUCCION.stages.map((s) => s.name)

/** Etapas que ve el cliente, en orden: las de PRODUCCION hasta "Entregado". */
const STEPS = NAMES.slice(0, NAMES.indexOf("Entregado") + 1)
const LAST = STEPS.length - 1

const DELIVERED = ["Entregado", "Post-Entrega", "Lead Ganado"]
const CANCELLED = "Lead Perdido"

// Falla al arrancar, no en cada visita, si pipeline.ts tiene una etapa que el tracking no sabe mostrar
// (también si falta "Entregado": STEPS queda vacío y todas las etapas sobran).
const unknown = NAMES.filter((n) => !STEPS.includes(n) && !DELIVERED.includes(n) && n !== CANCELLED)
if (unknown.length) throw new Error(`tracking.ts no sabe mostrar estas etapas de PRODUCCION: ${unknown.join(", ")}`)

export type StepState = "done" | "current" | "pending"

export type Tracking = {
  steps: { name: string; date?: number; state: StepState }[];
  percent: number;
  label: string;
  cancelled: boolean;
}

function stepIndex(name: string): number {
  if (DELIVERED.includes(name)) return LAST
  const i = STEPS.indexOf(name)
  if (i < 0) throw new Error(`Etapa de producción desconocida: ${name}`)
  return i
}

/** stageName: etapa actual del lead en Kommo. changes: historial de cambios de etapa, en cualquier orden. */
export function buildTracking(stageName: string, changes: StageChange[] = []): Tracking {
  const cancelled = stageName === CANCELLED
  const current = cancelled ? -1 : stepIndex(stageName)

  // Recorre el historial en orden. Volver a una etapa borra las fechas de las posteriores,
  // así cada paso muestra su fecha de la pasada actual y la línea de tiempo queda ordenada.
  // Empates en el mismo segundo (bots): gana el avance, la etapa más adelantada va después.
  const rank = (name: string) => (name === CANCELLED ? STEPS.length : stepIndex(name))
  const dates: Record<number, number> = {}
  for (const change of [...changes].sort((a, b) => a.at - b.at || rank(a.name) - rank(b.name))) {
    if (change.name === CANCELLED) continue
    const i = stepIndex(change.name)
    for (let k = i + 1; k <= LAST; k++) delete dates[k]
    // Entregado → Post-Entrega → Ganado: la fecha de entrega es la primera.
    dates[i] = i === LAST ? (dates[LAST] ?? change.at) : change.at
  }

  return {
    steps: STEPS.map((name, i) => ({
      name,
      date: i <= current ? dates[i] : undefined,
      state: i < current || current === LAST ? "done" : i === current ? "current" : "pending",
    })),
    percent: cancelled ? 0 : Math.round((current / LAST) * 100),
    label: cancelled ? "Pedido cancelado" : current === LAST ? "Pieza entregada" : STEPS[current],
    cancelled,
  }
}
