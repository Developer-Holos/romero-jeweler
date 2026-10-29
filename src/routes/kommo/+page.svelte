<script lang="ts">
	import Generador from "#lib/invoice/Generador.svelte";
	import { LEAD_EJEMPLO } from "#lib/invoice/invoice.svelte.ts";
</script>

<svelte:head><title>Invoice · Widget Kommo</title></svelte:head>

<Generador lead={LEAD_EJEMPLO} disenoHref="/kommo/diseno" />
