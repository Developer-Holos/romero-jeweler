<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { dev } from '$app/env';

	// Dentro del panel de Kommo: corto, sin la página de clientes del tracking. Se reintenta solo.
	onMount(() => {
		const t = setTimeout(() => location.reload(), 120_000);
		return () => clearTimeout(t);
	});
</script>

<main class="grid min-h-screen place-items-center bg-white p-6 text-center text-[#1c2150]">
	<div>
		<p class="text-sm font-semibold">{page.status === 502 ? 'No se pudo leer Kommo' : 'No se pudo cargar el panel'}</p>
		<p class="mt-1 text-xs text-[#5b6178]">Se vuelve a intentar solo en 2 minutos.</p>
		{#if dev && page.error?.message}<p class="mt-3 max-w-md font-mono text-[11px] break-words text-[#a3213a]">{page.error.message}</p>{/if}
	</div>
</main>
