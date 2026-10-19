import { error, redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { KommoService } from '#lib/kommo/kommo.ts'
import { normalizeTrackingStatus } from '#lib/tracking/tracking.ts'


export const load: PageServerLoad = async ({ params, locals }) => {
  let kommoService = KommoService();

  // Validación real y correcta de parámetros (sin try/catch inútil)
  let leadId = parseInt(params.lead_id, 10);
  if (isNaN(leadId)) {
    throw redirect(404, '/not-exists');
  }

  let lead = await kommoService.getLead(leadId);
  if (!lead.success || !lead.data) {
    throw redirect(404, '/not-exists');
  }

  if (!kommoService.leadIsInProduction(lead.data)) {
    throw redirect(404, '/not-exists');
  }

  let stage = kommoService.getLeadProductionStage(lead.data);
  let status = normalizeTrackingStatus(stage);

  return { status };
}
