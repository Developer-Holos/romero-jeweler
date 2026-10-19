import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { KommoService } from '#lib/kommo/kommo.ts'
import { buildTracking } from '#lib/tracking/tracking.ts'

export const load: PageServerLoad = async ({ params }) => {
  const kommo = KommoService();

  const leadId = Number(params.lead_id);
  if (!Number.isInteger(leadId)) error(404, 'Pedido no encontrado');

  const lead = await kommo.getLead(leadId);
  if (!lead.success || !lead.data) error(404, 'Pedido no encontrado');

  const stage = kommo.getLeadProductionStage(lead.data);
  if (!stage) error(404, 'Pedido no encontrado');

  return {
    name: lead.data.name,
    tracking: buildTracking(stage.name, await kommo.getStageDates(leadId)),
  };
}
