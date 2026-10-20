<script lang="ts" module>
	import type { BloqueId } from "./plantilla.svelte";

	// Modo diseño: tocar un bloque lo selecciona y se puede arrastrar para cambiar el orden.
	export type Editor = {
		sel: BloqueId | null;
		arrastrando: BloqueId | null;
		destino: { id: BloqueId; antes: boolean } | null;
		onsel: (id: BloqueId) => void;
		// El arrastre lo maneja la pantalla de diseño; busca el destino por [data-bloque].
		oniniciar: (e: PointerEvent, id: BloqueId) => void;
	};
</script>

<script lang="ts">
	import { ARCHIVOS_LEAD, CLAUSULAS, fechaLarga, money, negritas, numeroFactura, pctTexto, textoClausula, totales, vinetas, type Borrador, type Seccion } from "./invoice.svelte";
	import { BLOQUES, ESPACIADOS, variables, type Bloque, type Plantilla } from "./plantilla.svelte";
	import Thumb from "./Thumb.svelte";

	let { d, p, activa = null, onpick, subidas = [], editor }: { d: Borrador; p: Plantilla; activa?: Seccion | null; onpick?: (s: Seccion) => void; subidas?: { id: string; url: string }[]; editor?: Editor } = $props();

	let t = $derived(totales(d));
	let lineas = $derived(vinetas(d));
	let imagenes = $derived(d.imagenes.map((id) => ({ id, tono: ARCHIVOS_LEAD.find((a) => a.id === id)?.tono ?? 0, url: subidas.find((s) => s.id === id)?.url ?? "" })));
	let clausulas = $derived(CLAUSULAS.filter((c) => d.clausulas[c.id].activa).map((c) => ({ ...c, texto: textoClausula(c.id, d) })));
	let politicas = $derived(clausulas.filter((c) => !["pago", "produccion", "terminos"].includes(c.id)));
	let anillo = $derived(d.pieza.toLowerCase().includes("anillo") ? "anillo" : "pieza");
	const clausula = (id: string) => clausulas.find((c) => c.id === id);

	// Un bloque sin contenido (cláusula desactivada) no aparece en el PDF; en el editor se avisa.
	const vacio = (id: BloqueId) => (({ condPago: !clausula("pago"), produccion: !clausula("produccion"), politicas: !politicas.length, terminos: !clausula("terminos") }) as Partial<Record<BloqueId, boolean>>)[id] ?? false;
	let visibles = $derived(p.bloques.filter((b) => b.visible && (editor || !vacio(b.id))));
	const titulo = (b: Bloque) => b.titulo.replaceAll("{pieza}", anillo);

	function resaltado(id: BloqueId, secs: Seccion[]) {
		if (editor) return editor.sel === id ? "outline-rj-gold bg-rj-gold-soft/40" : "outline-transparent hover:outline-slate-300";
		return activa && secs.includes(activa) ? "outline-rj-gold bg-rj-gold-soft/40" : "outline-transparent hover:outline-slate-200";
	}

	let raiz: HTMLElement;
	$effect(() => {
		const sec = editor ? editor.sel : activa;
		if (!sec) return;
		const el = raiz.querySelector<HTMLElement>(editor ? `[data-bloque="${sec}"]` : `[data-sec~="${sec}"]`);
		const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
		el?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
	});
</script>

{#snippet ia(texto: string)}
	<span class="ml-1.5 inline-flex items-center gap-1 rounded-full bg-rj-gold-soft px-1.5 py-px align-middle font-sans text-[8.5px] font-semibold tracking-wide text-[#8a6a3a] uppercase">
		<svg class="size-2.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z" /></svg>
		{texto}
	</span>
{/snippet}

{#snippet rico(texto: string)}
	{#each negritas(texto) as [parte, b], i (i)}{#if b}<b class="text-pdf-texto">{parte}</b>{:else}{parte}{/if}{/each}
{/snippet}

{#snippet subtitulo(texto: string, linea = false)}
	{#if texto}<h3 class="mb-1 font-pdf-titulos text-[11.5px] font-bold text-pdf-primario {linea ? 'mb-2 border-b border-slate-200 pb-1' : ''}">{texto}</h3>{/if}
{/snippet}

{#snippet contenido(b: Bloque)}
	{#if b.id === "datos"}
		{#if b.titulo}<h2 class="border-b-2 border-pdf-acento pb-1.5 font-pdf-titulos text-[16px] font-bold text-pdf-primario">{titulo(b)} {#if d.idioma === "en"}{@render ia("se redactará en inglés")}{/if}</h2>{/if}
		<dl class="mt-3 grid grid-cols-2 gap-x-6 gap-y-2.5">
			{#each [["Factura No.", d.sinCliente ? "" : numeroFactura(d)], ["Facturado a", d.sinCliente ? "" : d.cliente], ["Fecha de emisión", fechaLarga(d.emision)], ["Correo del cliente", d.sinCliente ? "" : d.email], ["Fecha límite de pago", d.vencimiento], ["Preparado por", d.preparadoPor ? `${d.preparadoPor}, Romero Jeweler` : ""]] as [k, v] (k)}
				<div>
					<dt class="text-[8px] font-bold tracking-wider text-pdf-acento uppercase">{k}</dt>
					<dd class="min-h-[14px] {v ? '' : 'mt-1 border-b border-dashed border-slate-300'}">{v}</dd>
				</div>
			{/each}
		</dl>
	{:else if b.id === "descripcion"}
		{#if b.titulo}<h3 class="mb-2 border-b border-slate-200 pb-1 font-pdf-titulos text-[11.5px] font-bold text-pdf-primario">{titulo(b)} {#if !editor}{@render ia("la IA pule la redacción")}{/if}</h3>{/if}
		<div class="flex justify-between gap-4 font-bold text-pdf-primario">
			<span>{d.pieza ? `${d.pieza}${d.aMedida && !d.pieza.toLowerCase().includes("medida") ? " a la medida" : ""}` : "Tipo de pieza pendiente"}</span>
			<span class="tabular-nums">{money(t.valor)}</span>
		</div>
		<ul class="mt-1 list-disc space-y-0.5 pl-5 text-[9.5px] opacity-80">
			{#each lineas as l, i (i)}<li>{l}</li>{/each}
			{#if d.notas.trim() && !editor}
				<li class="mt-1.5 -ml-5 list-none rounded border border-dashed border-rj-gold/60 bg-rj-gold-soft/50 px-2 py-1 font-sans text-[9px] text-[#7a5d33] italic">De tus notas: «{d.notas.trim()}»</li>
			{/if}
		</ul>
	{:else if b.id === "precios"}
		{@render subtitulo(titulo(b), true)}
		<table class="w-full tabular-nums">
			<tbody class="[&_td]:border-b [&_td]:border-slate-100 [&_td]:py-1.5 [&_td:last-child]:text-right">
				<tr><td>{d.conTax ? "Valor de la pieza" : "Valor total de la pieza"}</td><td>{money(t.valor)}</td></tr>
				{#if d.conTax}
					<tr><td>Sales tax ({d.taxPct || 0}%)</td><td>{money(t.tax)}</td></tr>
					<tr class="font-bold"><td>Valor total</td><td>{money(t.total)}</td></tr>
				{/if}
				{#each t.depositos as x (x.id)}
					{@const ahora = x.id === t.ahoraDep?.id}
					<tr class={ahora ? "" : "opacity-75"}>
						<td>
							{x.nombre}{t.depositos.length > 1 ? ` (${pctTexto(x.pctCalc)})` : ""}{ahora ? " - esta factura" : ""}
							{#if !ahora && x.fecha}<span class="text-[9px] opacity-70"> · antes del {fechaLarga(x.fecha)}</span>{/if}
						</td>
						<td class={x.montoCalc < 0 ? "text-red-600" : ""}>{money(x.montoCalc)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		{#if t.diferencia !== 0 && t.valor > 0}
			<p class="mt-1 text-right text-[9px] font-semibold text-red-600">Los depósitos no suman el total ({t.diferencia > 0 ? "faltan" : "sobran"} {money(Math.abs(t.diferencia))})</p>
		{/if}
		<div class="mt-3 flex items-center justify-between gap-4 px-4 py-2.5 font-bold {p.precios.estiloTotal === 'banda' ? 'bg-pdf-primario text-white' : 'border-y-2 border-pdf-primario text-pdf-primario'}">
			<span class="text-[10px] uppercase">Total a pagar ahora ({t.ahoraDep?.nombre ?? "—"})</span>
			<span class="text-[13px] whitespace-nowrap tabular-nums">{money(t.ahora)} USD</span>
		</div>
		{#if p.precios.aviso}
			<p class="mt-2 bg-pdf-suave px-3 py-2 text-[9px]">
				Recibirás por separado un enlace de pago seguro {t.depositos.length > 1 ? "para cada depósito " : ""}({d.params.medios}). <b>Al realizar el pago, confirmas que has leído y aceptas todos los términos y condiciones de esta factura.</b>
			</p>
		{/if}
	{:else if b.id === "condPago" || b.id === "produccion"}
		{@const c = clausula(b.id === "condPago" ? "pago" : "produccion")}
		<div class="text-[9.5px]">
			{@render subtitulo(titulo(b))}
			{#if c}<p class="opacity-85">{@render rico(c.texto)}</p>{:else}{@render apagada()}{/if}
		</div>
	{:else if b.id === "politicas"}
		<div class="text-[9.5px]">
			{@render subtitulo(titulo(b))}
			{#if politicas.length}
				<ul class="space-y-1 opacity-85">
					{#each politicas as c (c.id)}<li><b class="text-pdf-texto">{c.nombre}.</b> {@render rico(c.texto)}</li>{/each}
				</ul>
			{:else}{@render apagada()}{/if}
		</div>
	{:else if b.id === "terminos"}
		{@const c = clausula("terminos")}
		{#if c}
			<p class="border-l-2 border-pdf-acento bg-pdf-suave/60 px-3 py-2 text-[9px]">{#if b.titulo}<b class="text-pdf-texto">{titulo(b)}.</b>{/if} {@render rico(c.texto)}</p>
		{:else}{@render apagada()}{/if}
	{:else if b.id === "imagenes"}
		{@render subtitulo(titulo(b), false)}
		{#if imagenes.length}
			<div class="mt-1 grid gap-2" style:grid-template-columns="repeat({Math.min(p.imagenes.columnas, imagenes.length)}, minmax(0, 1fr))">
				{#each imagenes as img (img.id)}
					<div class="aspect-[4/3] overflow-hidden bg-slate-100">
						{#if img.url}<img src={img.url} alt="" class="size-full object-cover" />{:else}<Thumb tono={img.tono} />{/if}
					</div>
				{/each}
			</div>
			{#if p.imagenes.nota}<p class="mt-1.5 text-[8.5px] italic opacity-70">Render de referencia del diseño. La pieza final puede presentar ligeras variaciones.</p>{/if}
		{:else}
			<p class="rounded border border-dashed border-slate-300 py-4 text-center font-sans text-[9px] text-slate-400">Esta sección no aparecerá si no eliges imágenes.</p>
		{/if}
	{/if}
{/snippet}

{#snippet apagada()}
	<p class="rounded border border-dashed border-slate-300 py-2 text-center font-sans text-[9px] text-slate-400">Las condiciones de este bloque están desactivadas en este invoice, así que no sale en el PDF.</p>
{/snippet}

<article bind:this={raiz} class="mx-auto w-full max-w-[560px] bg-white font-pdf-texto text-[10.5px] leading-snug text-pdf-texto shadow-[0_1px_2px_rgba(28,33,80,.08),0_12px_32px_-8px_rgba(28,33,80,.25)]" style={variables(p)} aria-label="Vista previa del invoice">
	{#if p.encabezado.visible}
		<header class="flex items-center justify-between gap-4 px-7 py-5 {p.encabezado.estilo === 'banda' ? 'bg-pdf-primario text-white' : 'border-b-2 border-pdf-acento text-pdf-primario'}">
			<div class="min-w-0">
				<p class="font-pdf-titulos text-[17px] font-bold tracking-wide">{p.encabezado.nombre}</p>
				{#if p.encabezado.lema}<p class="text-[9px] italic opacity-70">{p.encabezado.lema}</p>{/if}
			</div>
			{#if p.encabezado.logo}
				<img src={p.encabezado.logo} alt="" class="max-h-11 max-w-28 shrink-0 object-contain" />
			{:else if p.encabezado.monograma}
				<div class="grid size-10 shrink-0 place-items-center border border-pdf-acento text-[13px] font-semibold tracking-tighter text-pdf-acento" style="font-family: Georgia, serif">{p.encabezado.monograma}</div>
			{/if}
		</header>
	{/if}

	<div class="flex flex-col px-5 py-5" style:gap="{ESPACIADOS[p.espaciado]}px">
		{#each visibles as b (b.id)}
			{@const info = BLOQUES[b.id]}
			{@const linea = editor?.destino?.id === b.id && editor.arrastrando !== b.id ? (editor.destino.antes ? "before:-top-[3px]" : "before:-bottom-[3px]") : ""}
			<button
				type="button"
				data-sec={info.secs.join(" ")}
				data-bloque={b.id}
				onclick={() => (editor ? editor.onsel(b.id) : onpick?.(info.secs[0]))}
				onpointerdown={(e) => e.pointerType === "mouse" && editor?.oniniciar(e, b.id)}
				class="group relative block w-full rounded px-2 py-2 text-left outline-2 transition-[outline-color,background-color,opacity] {resaltado(b.id, info.secs)} {editor ? 'cursor-grab select-none' : ''} {editor?.arrastrando === b.id ? 'opacity-40' : ''} {linea ? `before:absolute before:inset-x-0 before:h-[3px] before:rounded-full before:bg-rj-navy ${linea}` : ''}"
			>
				{#if editor}
					<span class="pointer-events-none absolute -top-2.5 left-2 z-10 inline-flex items-center gap-1 rounded bg-rj-navy px-1.5 py-0.5 font-sans text-[10px] font-semibold text-white transition-opacity {editor.sel === b.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}">
						<svg class="size-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
						{info.nombre}
					</span>
				{/if}
				{@render contenido(b)}
			</button>
		{:else}
			<p class="rounded border border-dashed border-slate-300 py-6 text-center font-sans text-[10px] text-slate-400">Ocultaste todos los bloques.</p>
		{/each}
		{#if d.instrucciones.trim() && !editor}
			<p class="mx-2 rounded border border-dashed border-rj-gold/60 bg-rj-gold-soft/50 px-2 py-1 font-sans text-[9px] text-[#7a5d33] italic">Indicación para la IA: «{d.instrucciones.trim()}»</p>
		{/if}
	</div>

	{#if p.pie.visible}
		<footer class="flex justify-between gap-4 border-t border-slate-200 px-7 py-3 text-[8px] opacity-70">
			<span>{p.pie.texto}</span>
			{#if p.pie.numero}<span class="shrink-0">{d.sinCliente ? "" : numeroFactura(d)}</span>{/if}
		</footer>
	{/if}
</article>
