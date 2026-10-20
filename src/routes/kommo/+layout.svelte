<script lang="ts">
	// Páginas para probar el widget fuera de Kommo, con el servidor del .env.
	import { SERVIDOR_KEY, SERVIDOR_URL } from "$app/env/public";
	import { configurarServidor } from "#lib/invoice/servidor.ts";

	let { children } = $props();
	configurarServidor(SERVIDOR_URL, SERVIDOR_KEY);
</script>

<svelte:head>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

{@render children()}
