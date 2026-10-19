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

// Ids y nombres reales de la cuenta romerojeweler (GET /api/v4/leads/pipelines, 2026-10-19).
// 142 y 143 son estados de sistema (ganado/perdido), iguales en todos los embudos.
export const PRODUCCION: Pipeline = {
  id: 14639515,
  stages: [
    { name: "Leads Entrantes", id: 113110619 },
    { name: "Diseño", id: 113110623 },
    { name: "Aprobación de diseño", id: 113110627 },
    { name: "En espera", id: 113110631 },
    { name: "Impresión 3D", id: 113110751 },
    { name: "Fundición", id: 113110755 },
    { name: "Trabajo en metal", id: 113110759 },
    { name: "Engaste", id: 113110763 },
    { name: "Acabado", id: 113110767 },
    { name: "Control de calidad", id: 113110771 },
    { name: "Listo para entrega", id: 113110775 },
    { name: "Entregado", id: 113110779 },
    { name: "Post-Entrega", id: 113110783 },
    { name: "Logrado con éxito", id: 142 },
    { name: "Ventas Perdidos", id: 143 },
  ]
}
