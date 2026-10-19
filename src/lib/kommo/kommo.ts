/** Handles requests from Kommo **/
import type { Result } from '#lib';
import { standardFetcher } from '#lib/fetcher.ts';
import { KOMMO_SUBDOMAIN, KOMMO_ACCESS_TOKEN } from '$app/env/private';
import { PRODUCCION, type Stage, type StageChange } from '#lib/kommo/pipeline.ts';

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

  /** Historial de entradas del lead a etapas de PRODUCCION. */
  async function getStageChanges(leadId: number): Promise<Result<StageChange[]>> {
    const changes: StageChange[] = []
    // ponytail: tope de 10 páginas (1000 cambios de etapa), de sobra para un pedido.
    for (let page = 1; ; page++) {
      const res = await fetcher.request<KommoEvents | null>({
        method: "GET",
        endpoint: `/api/v4/events?filter[entity]=lead&filter[entity_id]=${leadId}&filter[type]=lead_status_changed&limit=100&page=${page}`,
        headers
      })
      if (!res.success) return res
      const events = res.data?._embedded?.events ?? [] // 204 = no hay más eventos
      for (const event of events) {
        const status = event.value_after[0]?.lead_status
        const stage = status?.pipeline_id === PRODUCCION.id && PRODUCCION.stages.find((s) => s.id === status.id)
        if (stage) changes.push({ name: stage.name, at: event.created_at })
      }
      if (events.length < 100) break
      if (page === 10) {
        console.warn(`[tracking] lead ${leadId}: más de 1000 cambios de etapa, historial truncado`)
        break
      }
    }
    return { success: true, data: changes }
  }

  function getLeadProductionStage(lead: KommoLead): Stage | undefined {
    if (lead.pipeline_id !== PRODUCCION.id) return undefined
    return PRODUCCION.stages.find((stage) => stage.id === lead.status_id)
  }

  return { getLead, getStageChanges, getLeadProductionStage }
}
