/** Handles requests from Kommo **/
import type { Result } from '#lib';
import { standardFetcher } from '#lib/fetcher.ts';
import { KOMMO_SUBDOMAIN, KOMMO_ACCESS_TOKEN } from '$app/env/private';

export type Stage = {
  name: string,
  id: number
}

export type Pipeline = {
  id: number,
  stages: Stage[]
}

// TODO: reemplazar los 0 con los ids reales de GET /api/v4/leads/pipelines.
// 142 (ganado) y 143 (perdido) son estados de sistema, iguales en todos los pipelines.
const PRODUCCION: Pipeline = {
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

export type KommoServiceArgs = {
  subdomain: string,
  token: string
}

export type KommoLead = {
  id: number;
  name: string;
  price: number;
  responsible_user_id: number;
  status_id: number;
  pipeline_id: number;
  created_at: number;
  updated_at: number;
  closed_at: number | null;
  custom_fields_values: Array<{
    field_id: number;
    field_name: string;
    field_type: string;
    values: Array<{ value: unknown; enum_id?: number; enum_code?: string }>;
  }> | null;
  _embedded?: {
    contacts?: Array<{ id: number; is_main: boolean }>;
  };
}

type KommoEvents = {
  _embedded: {
    events: Array<{
      created_at: number;
      value_after: Array<{ lead_status?: { id: number; pipeline_id: number } }>;
    }>;
  };
};

export function KommoService({ subdomain, token }: KommoServiceArgs = { subdomain: KOMMO_SUBDOMAIN, token: KOMMO_ACCESS_TOKEN }) {
  const fetcher = standardFetcher({ base: `https://${subdomain}.kommo.com` })
  const headers = { 'Accept': 'application/json', 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }

  function getLead(leadId: number): Promise<Result<KommoLead>> {
    return fetcher.request<KommoLead>({ method: "GET", endpoint: `/api/v4/leads/${leadId}`, headers })
  }

  /** Fecha (unix s) en que el lead entró a cada etapa de producción, por nombre de etapa. */
  async function getStageDates(leadId: number): Promise<Record<string, number>> {
    // ponytail: una sola página de 100 eventos; de sobra para un pedido.
    const res = await fetcher.request<KommoEvents | null>({
      method: "GET",
      endpoint: `/api/v4/events?filter[entity]=lead&filter[entity_id]=${leadId}&filter[type]=lead_status_changed&limit=100`,
      headers
    })
    const dates: Record<string, number> = {}
    if (!res.success || !res.data) return dates // sin eventos (204) o error: la página se muestra sin fechas
    for (const event of res.data._embedded.events) {
      const status = event.value_after[0]?.lead_status
      const stage = status?.pipeline_id === PRODUCCION.id && PRODUCCION.stages.find((s) => s.id === status.id)
      if (stage) dates[stage.name] = Math.max(dates[stage.name] ?? 0, event.created_at)
    }
    return dates
  }

  function getLeadProductionStage(lead: KommoLead): Stage | undefined {
    if (lead.pipeline_id !== PRODUCCION.id) return undefined
    return PRODUCCION.stages.find((stage) => stage.id === lead.status_id)
  }

  return { getLead, getStageDates, getLeadProductionStage }
}
