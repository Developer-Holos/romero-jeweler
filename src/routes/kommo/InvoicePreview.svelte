<script lang="ts">
	import { ARCHIVOS_LEAD, CLAUSULAS, fechaLarga, money, negritas, numeroFactura, pctTexto, textoClausula, totales, vinetas, type Borrador, type Seccion } from "./invoice.svelte";
	import Thumb from "./Thumb.svelte";

	let { d, activa, onpick, subidas }: { d: Borrador; activa: Seccion | null; onpick: (s: Seccion) => void; subidas: { id: string; url: string }[] } = $props();

	let t = $derived(totales(d));
	let lineas = $derived(vinetas(d));
	let imagenes = $derived(d.imagenes.map((id) => ({ id, tono: ARCHIVOS_LEAD.find((a) => a.id === id)?.tono ?? 0, url: subidas.find((s) => s.id === id)?.url ?? "" })));
	let clausulas = $derived(CLAUSULAS.filter((c) => d.clausulas[c.id].activa).map((c) => ({ ...c, texto: textoClausula(c.id, d) })));
	let politicas = $derived(clausulas.filter((c) => !["pago", "produccion", "terminos"].includes(c.id)));
	const clausula = (id: string) => clausulas.find((c) => c.id === id);

	// Cada bloque del documento sabe qué secciones del formulario lo controlan.
	const bloque = (...secs: Seccion[]) => (activa && secs.includes(activa) ? "outline-rj-gold bg-rj-gold-soft/40" : "outline-transparent hover:outline-slate-200");

	let raiz: HTMLElement;
	$effect(() => {
		if (!activa) return;
		const el = raiz.querySelector<HTMLElement>(`[data-sec~="${activa}"]`);
		const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
		el?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
	});
</script>

{#snippet ia(texto: string)}
	<span class="ml-1.5 inline-flex items-center gap-1 rounded-full bg-rj-gold-soft px-1.5 py-px align-middle text-[8.5px] font-semibold tracking-wide text-[#8a6a3a] uppercase">
		<svg class="size-2.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z" /></svg>
		{texto}
	</span>
{/snippet}

{#snippet rico(texto: string)}
	{#each negritas(texto) as [parte, b], i (i)}{#if b}<b class="text-slate-800">{parte}</b>{:else}{parte}{/if}{/each}
{/snippet}

{#snippet titulo(texto: string)}
	<h3 class="mt-3 mb-1 text-[11.5px] font-bold text-rj-navy first:mt-0">{texto}</h3>
{/snippet}

<article bind:this={raiz} class="mx-auto w-full max-w-[560px] bg-white text-[10.5px] leading-snug text-slate-800 shadow-[0_1px_2px_rgba(28,33,80,.08),0_12px_32px_-8px_rgba(28,33,80,.25)]" style="font-family: Helvetica, Arial, sans-serif" aria-label="Vista previa del invoice">
	<header class="flex items-center justify-between bg-rj-navy px-7 py-5 text-white">
		<div>
			<p class="text-[17px] font-bold tracking-wide">ROMERO JEWELER</p>
			<p class="text-[9px] text-white/70 italic">Más que una joya, un legado.</p>
		</div>
		<div class="grid size-10 place-items-center border border-rj-gold text-[13px] font-semibold tracking-tighter text-rj-gold" style="font-family: Georgia, serif">RJ</div>
	</header>

	<div class="space-y-1 px-5 py-5">
		<button type="button" data-sec="cliente" onclick={() => onpick("cliente")} class="block w-full rounded px-2 py-2 text-left outline-2 transition-colors {bloque('cliente')}">
			<h2 class="border-b-2 border-rj-gold pb-1.5 text-[16px] font-bold text-rj-navy">Factura / Invoice {#if d.idioma === "en"}{@render ia("se redactará en inglés")}{/if}</h2>
			<dl class="mt-3 grid grid-cols-2 gap-x-6 gap-y-2.5">
				{#each [["Factura No.", d.sinCliente ? "" : numeroFactura(d)], ["Facturado a", d.sinCliente ? "" : d.cliente], ["Fecha de emisión", fechaLarga(d.emision)], ["Correo del cliente", d.sinCliente ? "" : d.email], ["Fecha límite de pago", d.vencimiento], ["Preparado por", d.preparadoPor ? `${d.preparadoPor}, Romero Jeweler` : ""]] as [k, v] (k)}
					<div>
						<dt class="text-[8px] font-bold tracking-wider text-rj-gold uppercase">{k}</dt>
						<dd class="min-h-[14px] {v ? '' : 'mt-1 border-b border-dashed border-slate-300'}">{v}</dd>
					</div>
				{/each}
			</dl>
		</button>

		<button type="button" data-sec="pieza" onclick={() => onpick("pieza")} class="block w-full rounded px-2 py-2 text-left outline-2 transition-colors {bloque('pieza')}">
			<h3 class="mb-2 border-b border-slate-200 pb-1 text-[11.5px] font-bold text-rj-navy">Descripción del artículo {@render ia("la IA pule la redacción")}</h3>
			<div class="flex justify-between gap-4 font-bold text-rj-navy">
				<span>{d.pieza ? `${d.pieza}${d.aMedida && !d.pieza.toLowerCase().includes("medida") ? " a la medida" : ""}` : "Tipo de pieza pendiente"}</span>
				<span class="tabular-nums">{money(t.valor)}</span>
			</div>
			<ul class="mt-1 list-disc space-y-0.5 pl-5 text-[9.5px] text-slate-600">
				{#each lineas as l, i (i)}<li>{l}</li>{/each}
				{#if d.notas.trim()}
					<li class="mt-1.5 -ml-5 list-none rounded border border-dashed border-rj-gold/60 bg-rj-gold-soft/50 px-2 py-1 text-[9px] text-[#7a5d33] italic">De tus notas: «{d.notas.trim()}»</li>
				{/if}
			</ul>
		</button>

		<button type="button" data-sec="pago" onclick={() => onpick("pago")} class="block w-full rounded px-2 py-2 text-left outline-2 transition-colors {bloque('pago')}">
			<table class="w-full tabular-nums">
				<tbody class="[&_td]:border-b [&_td]:border-slate-100 [&_td]:py-1.5 [&_td:last-child]:text-right">
					<tr><td>{d.conTax ? "Valor de la pieza" : "Valor total de la pieza"}</td><td>{money(t.valor)}</td></tr>
					{#if d.conTax}
						<tr><td>Sales tax ({d.taxPct || 0}%)</td><td>{money(t.tax)}</td></tr>
						<tr class="font-bold"><td>Valor total</td><td>{money(t.total)}</td></tr>
					{/if}
					{#each t.depositos as x (x.id)}
						{@const ahora = x.id === t.ahoraDep?.id}
						<tr class={ahora ? "" : "text-slate-600"}>
							<td>
								{x.nombre}{t.depositos.length > 1 ? ` (${pctTexto(x.pctCalc)})` : ""}{ahora ? " - esta factura" : ""}
								{#if !ahora && x.fecha}<span class="text-[9px] text-slate-400"> · antes del {fechaLarga(x.fecha)}</span>{/if}
							</td>
							<td class={x.montoCalc < 0 ? "text-red-600" : ""}>{money(x.montoCalc)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if t.diferencia !== 0 && t.valor > 0}
				<p class="mt-1 text-right text-[9px] font-semibold text-red-600">Los depósitos no suman el total ({t.diferencia > 0 ? "faltan" : "sobran"} {money(Math.abs(t.diferencia))})</p>
			{/if}
			<div class="mt-3 flex items-center justify-between gap-4 bg-rj-navy px-4 py-2.5 font-bold text-white">
				<span class="text-[10px] uppercase">Total a pagar ahora ({t.ahoraDep?.nombre ?? "—"})</span>
				<span class="text-[13px] whitespace-nowrap tabular-nums">{money(t.ahora)} USD</span>
			</div>
			<p class="mt-2 bg-rj-gold-soft px-3 py-2 text-[9px] text-slate-700">
				Recibirás por separado un enlace de pago seguro {t.depositos.length > 1 ? "para cada depósito " : ""}({d.params.medios}). <b>Al realizar el pago, confirmas que has leído y aceptas todos los términos y condiciones de esta factura.</b>
			</p>
		</button>

		<button type="button" data-sec="condiciones entrega" onclick={() => onpick("condiciones")} class="block w-full rounded px-2 py-2 text-left text-[9.5px] text-slate-600 outline-2 transition-colors {bloque('condiciones', 'entrega')}">
			{#if clausula("pago")}{@render titulo("Condiciones de pago")}<p>{@render rico(clausula("pago")!.texto)}</p>{/if}
			{#if clausula("produccion")}{@render titulo("Producción y entrega")}<p>{@render rico(clausula("produccion")!.texto)}</p>{/if}
			{#if politicas.length}
				{@render titulo("Políticas")}
				<ul class="space-y-1">
					{#each politicas as c (c.id)}<li><b class="text-slate-800">{c.nombre}.</b> {@render rico(c.texto)}</li>{/each}
				</ul>
			{/if}
			{#if clausula("terminos")}
				<p class="mt-3 border-l-2 border-rj-gold bg-slate-50 px-3 py-2 text-[9px]"><b class="text-slate-800">Términos y aceptación.</b> {@render rico(clausula("terminos")!.texto)}</p>
			{/if}
			{#if clausulas.length === 0}
				<p class="rounded border border-dashed border-slate-300 py-4 text-center text-[9px] text-slate-400">Desactivaste todas las condiciones y políticas.</p>
			{/if}
			{#if d.instrucciones.trim()}
				<p class="mt-2 rounded border border-dashed border-rj-gold/60 bg-rj-gold-soft/50 px-2 py-1 text-[9px] text-[#7a5d33] italic">Indicación para la IA: «{d.instrucciones.trim()}»</p>
			{/if}
		</button>

		<button type="button" data-sec="imagenes" onclick={() => onpick("imagenes")} class="block w-full rounded px-2 py-2 text-left outline-2 transition-colors {bloque('imagenes')}">
			<h3 class="mb-2 text-[11.5px] font-bold text-rj-navy">Diseño de tu {d.pieza.toLowerCase().includes("anillo") ? "anillo" : "pieza"}</h3>
			{#if imagenes.length}
				<div class="grid gap-2 {imagenes.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}">
					{#each imagenes as img (img.id)}
						<div class="aspect-[4/3] overflow-hidden bg-slate-100">
							{#if img.url}<img src={img.url} alt="" class="size-full object-cover" />{:else}<Thumb tono={img.tono} />{/if}
						</div>
					{/each}
				</div>
				<p class="mt-1.5 text-[8.5px] text-slate-500 italic">Render de referencia del diseño. La pieza final puede presentar ligeras variaciones.</p>
			{:else}
				<p class="rounded border border-dashed border-slate-300 py-4 text-center text-[9px] text-slate-400">Esta sección no aparecerá si no eliges imágenes.</p>
			{/if}
		</button>
	</div>

	<footer class="flex justify-between border-t border-slate-200 px-7 py-3 text-[8px] text-slate-500">
		<span>Golden Rooster LLC, dba Romero Jeweler · Miami, FL · contact@yrjeweler.com</span>
		<span>{d.sinCliente ? "" : numeroFactura(d)}</span>
	</footer>
</article>
