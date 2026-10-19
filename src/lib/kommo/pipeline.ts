/** Pipeline de producción en Kommo. Única fuente de las etapas: el tracking muestra estas mismas. */
export type Stage = {
  name: string,
  id: number
}

/** Entrada del lead a una etapa de PRODUCCION. at: unix en segundos. */
export type StageChange = { name: string; at: number }

export type Pipeline = {
  id: number,
  stages: Stage[]
}

// TODO: reemplazar los 0 con los ids reales de GET /api/v4/leads/pipelines.
// 142 (ganado) y 143 (perdido) son estados de sistema, iguales en todos los pipelines.
export const PRODUCCION: Pipeline = {
  id: 0,
  stages: [
    { name: "Diseño", id: 0 },
    { name: "Aprobación de Diseño", id: 0 },
    { name: "Lista de Espera", id: 0 },
    { name: "Impresión 3D", id: 0 },
    { name: "Fundición", id: 0 },
    { name: "Trabajo en Metal", id: 0 },
    { name: "Engaste", id: 0 },
    { name: "Acabado", id: 0 },
    { name: "Control de Calidad", id: 0 },
    { name: "Listo para Entrega", id: 0 },
    { name: "Entregado", id: 0 },
    { name: "Post-Entrega", id: 0 },
    { name: "Lead Ganado", id: 142 },
    { name: "Lead Perdido", id: 143 },
  ]
}
