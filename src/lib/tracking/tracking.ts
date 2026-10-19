/** Etapas que ve el cliente, en orden. Los nombres coinciden con las etapas de PRODUCCION en Kommo. */
const STEPS = [
  "Diseño",
  "Aprobación de Diseño",
  "Lista de Espera",
  "Impresión 3D",
  "Fundición",
  "Trabajo en Metal",
  "Engaste",
  "Acabado",
  "Control de Calidad",
  "Listo para Entrega",
  "Entregado",
]

const DELIVERED = ["Entregado", "Post-Entrega", "Lead Ganado"]

export type StepState = "done" | "current" | "pending"

export type Tracking = {
  steps: { name: string; date?: number; state: StepState }[];
  percent: number;
  label: string;
  cancelled: boolean;
}

/** stageName: etapa actual del lead en Kommo. dates: fecha de entrada a cada etapa, por nombre. */
export function buildTracking(stageName: string, dates: Record<string, number> = {}): Tracking {
  const cancelled = stageName === "Lead Perdido"
  const last = STEPS.length - 1
  const current = cancelled ? -1 : DELIVERED.includes(stageName) ? last : Math.max(STEPS.indexOf(stageName), 0)

  return {
    steps: STEPS.map((name, i) => ({
      name,
      date: i <= current ? dates[name] : undefined,
      state: i < current || current === last ? "done" : i === current ? "current" : "pending",
    })),
    percent: cancelled ? 0 : Math.round((current / last) * 100),
    label: cancelled ? "Pedido cancelado" : current === last ? "Pieza entregada" : STEPS[current],
    cancelled,
  }
}
