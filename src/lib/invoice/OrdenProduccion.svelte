<script lang="ts">
	import { cargarBorrador, draft as d, guardarBorrador, type Lead } from "./invoice.svelte";
	import OrdenPreview from "./OrdenPreview.svelte";
	import { generarOrden, hayServidor, htmlDelInvoice, urlImagen, type Kommo } from "./servidor";
	import { onMount, tick, untrack } from "svelte";

	// Orden de producción del lead. Usa el mismo borrador que el invoice (cliente, pieza, pagos, imágenes);
	// aquí solo se llena lo que el invoice no tiene. En Kommo eso queda en la pestaña "Orden de producción" del
	// lead, junto con el PDF (`kommo`: lo que el widget hace con la API de Kommo).
	let { lead, onclose, flotante = false, kommo }: { lead: Lead; onclose?: () => void; flotante?: boolean; kommo?: Kommo } = $props();

	let cargando = $state(true);
	let guardado: "ok" | "guardando" | "local" = $state("ok");
	let esperaGuardar: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const copia = JSON.stringify(d);
		if (untrack(() => cargando)) return;
		guardado = "guardando";
		clearTimeout(esperaGuardar);
		esperaGuardar = setTimeout(() => guardarBorrador(lead.id, JSON.parse(copia)).then(() => (guardado = "ok"), () => (guardado = "local")), 800);
	});

	let urls: Record<string, string> = $state({});
	let imagenes = $derived(d.imagenes.map((id) => urls[id]).filter(Boolean));

	onMount(() => {
		const leadId = untrack(() => lead.id);
		Promise.all([cargarBorrador(untrack(() => lead)), kommo?.valoresOrden(leadId)]).then(([{ borrador }, enKommo]) => {
			// Lo guardado en la pestaña del lead manda: se pudo haber cambiado a mano en Kommo.
			for (const [k, v] of Object.entries(enKommo ?? {})) if (v && k in borrador.produccion) borrador.produccion[k as keyof typeof borrador.produccion] = v;
			Object.assign(d, borrador);
			cargando = false;
			for (const id of borrador.imagenes) urlImagen(id).then((u) => (urls[id] = u), () => {});
		}, (e) => {
			error = `No se pudieron leer los datos del lead: ${e instanceof Error ? e.message : e}`;
			cargando = false;
		});
		return () => clearTimeout(esperaGuardar);
	});

	let articulo: HTMLElement | undefined = $state();
	let generando = $state(false);
	let error = $state("");
	let descargado = $state("");
	let avisoKommo = $state("");

	async function generar() {
		generando = true;
		error = descargado = avisoKommo = "";
		try {
			await tick();
			const nombre = `orden-${d.produccion.orden.trim() || lead.id}.pdf`;
			// En Kommo: los datos van a la pestaña "Orden de producción" del lead y el PDF a su campo archivo.
			const ids = kommo ? await kommo.guardarValoresOrden(lead.id, { ...d.produccion }) : undefined;
			const r = await generarOrden(await htmlDelInvoice(articulo!), nombre, lead.id, ids?.pdf);
			if (r.kommo === "error") avisoKommo = `No se pudo guardar el PDF en el lead (${r.detalle || "Kommo no respondió"}). Se descargó igual.`;
			const url = URL.createObjectURL(r.pdf);
			Object.assign(document.createElement("a"), { href: url, download: nombre }).click();
			setTimeout(() => URL.revokeObjectURL(url), 60_000);
			descargado = nombre;
		} catch (e) {
			error = e instanceof Error ? e.message : "No se pudo generar la orden";
		} finally {
			generando = false;
		}
	}

	const input = "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-xs outline-none transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-rj-navy focus:ring-3 focus:ring-rj-navy/15";
	const label = "mb-1 block text-xs font-semibold text-slate-600";
	const CAMPOS_PEDIDO = [
		["orden", "Número de orden (Order #)", "Ej. 1146"],
		["stuller", "Orden Stuller (Stuller O.#)", ""],
		["nivoda", "Orden Nivoda (Nivoda O.#)", ""],
	] as const;
	const CAMPOS_PIEZA = [
		["ancho", "Ancho inferior (Width bottom)", "Ej. 2mm"],
		["grosor", "Grosor (Thickness)", "Ej. 2mm"],
		["peso", "Peso estimado (Est. Weight)", ""],
		["cabeza", "Estilo de cabeza (Head style)", "Ej. Claw Prongs"],
	] as const;
</script>

<svelte:window onkeydown={(e) => flotante && e.key === "Escape" && !generando && onclose?.()} />

<main class="flex flex-col overflow-hidden p-0 text-slate-800 sm:p-4 lg:p-6 {flotante ? 'fixed inset-0 bg-[#0b0f2a]/50' : 'h-dvh bg-km-canvas'}" role={flotante ? "dialog" : undefined} aria-modal={flotante || undefined} aria-label="Orden de producción">
	<div class="mx-auto flex min-h-0 w-full max-w-[1320px] flex-1 flex-col overflow-hidden bg-white shadow-xl sm:rounded-xl">
		<header class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 px-5 py-3 sm:px-6">
			<div class="grid size-9 shrink-0 place-items-center rounded-md bg-rj-navy text-[13px] font-semibold text-rj-gold" style="font-family: Georgia, serif">RJ</div>
			<div class="min-w-0 flex-1">
				<h1 class="text-base leading-tight font-bold text-slate-900">Orden de producción</h1>
				<p class="truncate text-xs text-slate-500">Lead #{lead.id} · {lead.nombre}</p>
			</div>
			{#if !cargando}
				<p class="hidden text-xs sm:block {guardado === 'local' ? 'text-amber-700' : 'text-slate-500'}" aria-live="polite">
					{guardado === "guardando" ? "Guardando…" : guardado === "local" ? "Sin conexión: guardado solo en este equipo" : "Guardado en el lead"}
				</p>
			{/if}
			{#if onclose}
				<button type="button" onclick={onclose} disabled={generando} class="grid size-8 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-rj-navy disabled:opacity-40" aria-label="Cerrar">
					<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
				</button>
			{/if}
		</header>

		<div class="relative flex min-h-0 flex-1">
			{#if cargando}
				<div class="absolute inset-0 z-10 grid place-items-center bg-white/85 text-sm text-slate-500" aria-live="polite">Cargando los datos del lead…</div>
			{/if}
			<div class="min-h-0 w-full overflow-y-auto px-5 py-6 sm:px-7 lg:max-w-[420px] lg:border-r lg:border-slate-200">
				<p class="mb-5 rounded-md bg-rj-gold-soft/70 px-3 py-2 text-xs text-[#6f5530]">
					Cliente, pieza, metal, talla, piedras, grabado, notas, pagos e imágenes salen del <b>invoice</b> de este lead. Aquí solo se llena lo que el invoice no tiene; al generar, queda en la pestaña <b>Orden de producción</b> del lead, junto con el PDF.
				</p>
				{#if !cargando && !d.pieza.trim()}
					<p class="mb-5 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">Este lead todavía no tiene la pieza cargada en el invoice.</p>
				{/if}
				<h2 class="mb-3 text-[15px] font-bold text-slate-900">Pedido</h2>
				<div class="space-y-3">
					{#each CAMPOS_PEDIDO as [k, texto, ejemplo] (k)}
						<div>
							<label class={label} for="o-{k}">{texto}</label>
							<input id="o-{k}" class={input} bind:value={d.produccion[k]} placeholder={ejemplo} />
						</div>
					{/each}
				</div>
				<h2 class="mt-6 mb-3 text-[15px] font-bold text-slate-900">Pieza (Ring 1)</h2>
				<div class="grid gap-3 sm:grid-cols-2">
					{#each CAMPOS_PIEZA as [k, texto, ejemplo] (k)}
						<div>
							<label class={label} for="o-{k}">{texto}</label>
							<input id="o-{k}" class={input} bind:value={d.produccion[k]} placeholder={ejemplo} />
						</div>
					{/each}
				</div>
			</div>

			<div class="hidden min-h-0 flex-1 overflow-y-auto bg-[#e6e8ee] px-4 py-6 sm:px-8 lg:block">
				<p class="mx-auto mb-3 max-w-[560px] text-xs font-semibold tracking-wide text-slate-500 uppercase">Vista previa</p>
				<OrdenPreview {d} {imagenes} bind:elemento={articulo} />
			</div>
		</div>

		<footer class="flex flex-wrap items-center gap-3 border-t border-slate-200 bg-white px-5 py-3 sm:px-6">
			<p class="min-w-0 flex-1 text-sm" aria-live="polite">
				{#if error}<span class="text-red-700"><b>No se generó la orden.</b> {error}</span>
				{:else if descargado}<span class="text-emerald-700">{kommo && !avisoKommo ? `${descargado} guardado en el lead y descargado` : `Descargaste ${descargado}`}</span>
					{#if avisoKommo}<span class="block text-xs text-amber-700">{avisoKommo}</span>{/if}
				{:else if !hayServidor()}<span class="text-amber-700">Falta configurar el servidor del widget.</span>{/if}
			</p>
			<button type="button" onclick={generar} disabled={generando || cargando || !hayServidor()} class="inline-flex items-center gap-2 rounded-md bg-rj-navy px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#262c66] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rj-navy disabled:cursor-wait disabled:opacity-70">
				{generando ? "Generando…" : "Generar orden de producción"}
			</button>
		</footer>
	</div>
</main>
