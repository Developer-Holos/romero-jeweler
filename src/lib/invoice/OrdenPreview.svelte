<script lang="ts" module>
	export type Fila = [clave: string, valor: string];
	export type AnilloOrden = { id: number; titulo: string; filas: Fila[]; imagenes: string[] };
</script>

<script lang="ts">
	// Orden de producción con el formato de la ficha de producción de Romero (ej. orden 1146): una página con los
	// datos del pedido y una por anillo con su tabla de detalles CAD y sus imágenes. Las filas llegan ya armadas
	// y traducidas (OrdenProduccion.svelte); aquí solo se dibujan.
	let { titulo, pedido, anillos, elemento = $bindable() }: { titulo: string; pedido: Fila[]; anillos: AnilloOrden[]; elemento?: HTMLElement } = $props();
</script>

{#snippet tabla(filas: Fila[], ancho: string)}
	<table class="w-full border-collapse text-[11px]">
		<tbody>
			{#each filas as [k, v], i (i)}
				<tr>
					<td class="border border-black px-1.5 py-1 align-top" style:width={ancho}>{k}</td>
					<td class="border border-black px-1.5 py-1 align-top whitespace-pre-line">{v}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/snippet}

<article bind:this={elemento} class="mx-auto w-full max-w-[560px] bg-white text-black shadow-[0_1px_2px_rgba(28,33,80,.08),0_12px_32px_-8px_rgba(28,33,80,.25)]" style="font-family: Arial, Helvetica, sans-serif" aria-label="Vista previa de la orden de producción">
	<section class="px-10 pt-10 pb-12">
		<h1 class="mb-1 text-[16px] underline">{titulo}</h1>
		{@render tabla(pedido, "90px")}
	</section>

	{#each anillos as a (a.id)}
		<section class="border-t border-dashed border-slate-300 px-10 pt-10 pb-12 print:border-0" style="break-before: page">
			<h1 class="mb-1 text-[16px] underline">{a.titulo}</h1>
			{@render tabla(a.filas, "110px")}
			{#if a.imagenes.length}
				<div class="mt-4 grid grid-cols-2 gap-1">
					{#each a.imagenes as url, i (i)}
						<img src={url} alt="" class="aspect-square w-full object-cover" />
					{/each}
				</div>
			{/if}
		</section>
	{/each}
</article>
