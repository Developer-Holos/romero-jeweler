<script lang="ts">
	import OrdenProduccion from "#lib/invoice/OrdenProduccion.svelte";
	import { LEAD_EJEMPLO } from "#lib/invoice/invoice.svelte.ts";
</script>

<svelte:head><title>Orden de producción · Widget Kommo</title></svelte:head>

<OrdenProduccion lead={LEAD_EJEMPLO} />
