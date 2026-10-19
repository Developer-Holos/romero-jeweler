import type { Stage } from "#lib/kommo/kommo.ts"

type AppStage = {
  weight: number,
  name: string
}

const APP_STAGES: AppStage[] = [
  { name: "Diseño", weight: 0 },
  { name: "Aprobación de Diseño", weight: 1 },
  { name: "Lista de Espera", weight: 2 },
  { name: "Impresión 3D", weight: 3 },
  { name: "Fundición", weight: 4 },
  { name: "Trabajo en Metal", weight: 5 },
  { name: "Engaste", weight: 6 },
  { name: "Acabado", weight: 7 },
  { name: "Control de Calidad", weight: 8 },
  { name: "Listo para Entrega", weight: 9 },
  { name: "Entregado", weight: 10 },
  { name: "Pedido Cancelado", weight: 11 },
]

export function normalizeTrackingStatus(stage: Stage): AppStage {
  const found = APP_STAGES.find((s) => s.name === stage.name);

  if (found) return found;
  if (stage.name === "Lead Ganado") return APP_STAGES[10];
  if (stage.name === "Lead Perdido") return APP_STAGES[11];

  return APP_STAGES[0];
}
