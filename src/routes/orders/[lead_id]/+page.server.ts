import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { KommoService } from '#lib/kommo/kommo.ts'
import { buildTracking } from '#lib/tracking/tracking.ts'

export const load: PageServerLoad = async ({ params }) => {
  const kommo = KommoService();

  // Solo dígitos: evita que /orders/0x10 o /orders/1e3 apunten a otros leads.
  if (!/^[1-9]\d{0,14}$/.test(params.lead_id)) error(404, 'Pedido no encontrado');
  const leadId = Number(params.lead_id);

  // ponytail: en serie a propósito; el historial solo se pide para pedidos que existen,
  // así probar ids al azar no gasta el rate limit de Kommo. Paralelo cuando el enlace use token.
  const lead = await kommo.getLead(leadId);
  if (!lead.success) {
    if (lead.status === 404) error(404, 'Pedido no encontrado');
    console.error(`[tracking] lead ${leadId}: ${lead.error}`);
    error(502, 'No pudimos consultar tu pedido, intenta de nuevo en unos minutos');
  }
  if (!lead.data) error(404, 'Pedido no encontrado'); // Kommo responde 204 si el lead no existe

  const stage = kommo.getLeadProductionStage(lead.data);
  if (!stage) error(404, 'Pedido no encontrado');

  // Sin historial la página se muestra igual, solo sin fechas.
  const changes = await kommo.getStageChanges(leadId);
  if (!changes.success) console.error(`[tracking] eventos del lead ${leadId}: ${changes.error}`);

  return { tracking: buildTracking(stage.name, changes.success ? changes.data : []) };
}
