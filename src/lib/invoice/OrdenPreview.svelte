<script lang="ts" module>
	import type { Borrador, Piedra } from "./invoice.svelte";

	// La orden va en inglés, como la ficha que usa producción.
	const CORTE_EN: Record<string, string> = { Redondo: "Round", Oval: "Oval", Pera: "Pear", Marquesa: "Marquise", Esmeralda: "Emerald", Princesa: "Princess", Cojín: "Cushion", Radiante: "Radiant" };
	const PIEDRA_EN: Record<string, string> = { Diamante: "Diamond", Esmeralda: "Emerald", Zafiro: "Sapphire", Rubí: "Ruby", Moissanita: "Moissanite", Morganita: "Morganite" };
	const METAL_EN: Record<string, string> = { amarillo: "Yellow", blanco: "White", rosa: "Rose" };
	const MESES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
	const ORDINALES = ["1st", "2nd", "3rd"];

	export const fechaOrden = (iso: string) => {
		if (!iso) return "";
		const [y, m, d] = iso.split("-");
		return `${MESES[Number(m) - 1]} ${d} ${y}`;
	};

	export const metalOrden = (d: Borrador) => (d.metal === "otro" ? d.metalOtro : d.metal === "platino" ? "Platinum" : `${d.kilates} ${METAL_EN[d.metal]}`);

	const piedraOrden = (p: Piedra, conTipo: boolean) =>
		[p.cantidad && p.cantidad !== "1" ? p.cantidad : "", p.corte ? `${CORTE_EN[p.corte] ?? p.corte}${conTipo ? " Cut" : ""}` : "", conTipo ? `${p.origen === "laboratorio" ? "Lab " : ""}${PIEDRA_EN[p.tipo] ?? p.tipo}` : "", p.tamano]
			.filter(Boolean)
			.join(" ");

	export const piedraCentral = (d: Borrador) => d.piedras.filter((p) => p.posicion === "central").map((p) => piedraOrden(p, true)).join("; ");
	export const piedrasHalo = (d: Borrador) => d.piedras.filter((p) => p.posicion !== "central").map((p) => piedraOrden(p, false)).join("; ");
</script>

<script lang="ts">
	import { money, tituloPieza, totales } from "./invoice.svelte";

	// Orden de producción con el formato de la ficha de producción de Romero (ej. orden 1146): una página con
	// los datos del pedido y otra por pieza con sus detalles CAD e imágenes. Todo sale del borrador del invoice.
	let { d, imagenes = [], elemento = $bindable() }: { d: Borrador; imagenes?: string[]; elemento?: HTMLElement } = $props();

	let t = $derived(totales(d));
	let pedido = $derived([
		["Order #", d.produccion.orden],
		["Invoice #", d.sinCliente ? "" : d.numero],
		["Date", fechaOrden(d.emision)],
		["Date Finish", fechaOrden(d.entregaHasta || d.entregaDesde)],
		["Customer", d.sinCliente ? "" : d.cliente],
		["# Rings", "1"],
		["Total", money(t.total)],
		...t.depositos.map((x, i) => [`${ORDINALES[i] ?? `${i + 1}th`} Payment`, money(x.montoCalc)]),
		["Video", d.origen ? "yes" : "no"],
		["Stuller O.#", d.produccion.stuller],
		["Nivoda O.#", d.produccion.nivoda],
	]);
	let pieza = $derived(
		[
			["Ring Type", tituloPieza(d)],
			["Size", d.tallaPorConfirmar ? "" : d.talla],
			["Width bottom", d.produccion.ancho],
			["Thickness", d.produccion.grosor],
			["Est.Weight", d.produccion.peso],
			["Metal", metalOrden(d)],
			["Head style", d.produccion.cabeza],
			["Halo Stones", piedrasHalo(d)],
			["Center Stone", piedraCentral(d)],
			["Engraving", d.grabado],
			["Notes", d.notas.trim()],
		].filter(([k, v]) => v || !["Head style", "Halo Stones", "Center Stone"].includes(k)),
	);
</script>

{#snippet tabla(filas: string[][], ancho: string)}
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
		<h1 class="mb-1 text-[16px] underline">Order Details</h1>
		{@render tabla(pedido, "90px")}
	</section>

	<section data-pagina class="border-t border-dashed border-slate-300 px-10 print:border-0 pt-10 pb-12" style="break-before: page">
		<h1 class="mb-1 text-[16px] underline">Cad Details Ring 1</h1>
		{@render tabla(pieza, "110px")}
		{#if imagenes.length}
			<div class="mt-4 grid grid-cols-2 gap-1">
				{#each imagenes as url, i (i)}
					<img src={url} alt="" class="aspect-square w-full object-cover" />
				{/each}
			</div>
		{/if}
	</section>
</article>
