<script lang="ts">
	// Páginas para probar el widget fuera de Kommo, contra la API de esta misma app (/api).
	import { configurarServidor } from "#lib/invoice/servidor.ts";

	let { children } = $props();
	configurarServidor("/api", "");
</script>

<svelte:head>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

{@render children()}
