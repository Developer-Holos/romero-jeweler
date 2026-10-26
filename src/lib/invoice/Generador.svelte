<script lang="ts">
	import { CLAUSULAS, CORTES, etiquetasInvoice, tituloPieza, vinetas, METALES, MOMENTOS_PAGO, PLANES, SECCIONES, TIPOS_PIEDRA, TIPOS_PIEZA, VENCIMIENTOS, borradorInicial, cargarBorrador, guardarBorrador, draft as d, money, nuevaPiedra, nuevoDeposito, pendientes, textoClausula, totales, type Borrador, type Deposito, type Lead, type Seccion } from "./invoice.svelte";
	import InvoicePreview from "./InvoicePreview.svelte";
	import { cargarPlantillaServidor, plantilla } from "./plantilla.svelte";
	import { ErrorServidor, generarCotizacion, generarInvoice, hayServidor, htmlDelInvoice, imagenesDelLead, pedirNumero, redactar, subirImagen, urlImagen, type ImagenKommo, type Kommo, type Redaccion } from "./servidor";
	import { onMount, tick, untrack } from "svelte";

	// `flotante`: ventana sobre la tarjeta del lead en Kommo. `disenoHref`: enlace al editor del diseño, si lo hay.
	// `kommo`: lo que el widget hace con la API de Kommo (elegir o crear el campo de cada imagen); fuera de Kommo no está.
	let { lead, onclose, flotante = false, disenoHref, kommo }: { lead: Lead; onclose?: () => void; flotante?: boolean; disenoHref?: string; kommo?: Kommo } = $props();

	// El borrador de cada lead vive en el servidor: cualquier asesor lo retoma desde cualquier equipo.
	// Mientras carga, el formulario no se muestra (el borrador en memoria puede ser de otro lead).
	let cargando = $state(true);
	let guardado: "ok" | "guardando" | "local" = $state("ok");
	let esperaGuardar: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const copia = JSON.stringify(d); // lee todo el borrador: cualquier cambio vuelve a guardar
		if (untrack(() => cargando)) return;
		guardado = "guardando";
		clearTimeout(esperaGuardar);
		esperaGuardar = setTimeout(() => guardarBorrador(lead.id, JSON.parse(copia)).then(() => (guardado = "ok"), () => (guardado = "local")), 800);
	});

	let activa: Seccion | null = $state(null);
	let vista: "form" | "preview" = $state("form"); // solo en pantallas angostas
	let generando = $state(false);
	let generada = $state(""); // copia de los datos con los que se generó el último PDF
	let paso = $state(0);

	// Imágenes: las del lead en Kommo, más las subidas sin Kommo en el servidor (solo duran en esta ventana).
	let enKommo: ImagenKommo[] = $state([]);
	let locales: { id: string; url: string }[] = $state([]);
	let urls: Record<string, string> = $state({});
	let subiendo = $state(0);
	let avisoImagenes = $state("");
	const mostrar = (uuid: string) => {
		if (!untrack(() => urls[uuid])) urlImagen(uuid).then((u) => (urls[uuid] = u), () => {});
	};
	$effect(() => d.imagenes.forEach((id) => !id.startsWith("local-") && mostrar(id)));
	let galeria = $derived([...enKommo.map((a) => ({ id: a.uuid, nombre: a.nombre, url: urls[a.uuid] ?? "" })), ...locales.map((a, i) => ({ ...a, nombre: `Imagen ${i + 1}` }))]);
	let subidas = $derived([...Object.entries(urls).map(([id, url]) => ({ id, url })), ...locales]);

	let t = $derived(totales(d));
	let faltan = $derived(pendientes(d));
	let bloqueantes = $derived(faltan.filter((p) => p.bloquea));
	let estado = $derived(Object.fromEntries(SECCIONES.map((s) => {
		const ps = faltan.filter((p) => p.sec === s.id);
		return [s.id, ps.some((p) => p.bloquea) ? "error" : ps.length ? "aviso" : "ok"];
	})) as Record<Seccion, "ok" | "aviso" | "error">);

	const PASOS = ["Asignando el número del invoice", "Redactando con IA", "Generando el PDF y guardándolo en el lead"];

	let articulo: HTMLElement | undefined = $state();
	let pdf: { url: string; nombre: string } | null = $state(null);
	let errorGenerar = $state("");
	let avisoIa = $state("");
	let avisoKommo = $state("");
	// La redacción de la IA vale mientras el borrador no cambie (el número no cuenta: se asigna al generar).
	const firmaDe = (b: Borrador) => JSON.stringify({ ...b, numero: "" });
	let redaccion = $state<{ para: string; texto: Redaccion } | null>(null);
	let redaccionVigente = $derived(redaccion && redaccion.para === firmaDe(d) ? redaccion.texto : null);

	onMount(() => {
		void cargarPlantillaServidor();
		cargarBorrador(untrack(() => lead)).then(({ borrador }) => {
			Object.assign(d, borrador);
			cargando = false;
		});
		if (hayServidor())
			imagenesDelLead(lead.id).then(
				(lista) => {
					enKommo = lista;
					lista.forEach((a) => mostrar(a.uuid));
				},
				(e) => (avisoImagenes = e instanceof ErrorServidor && e.status === 503 ? "" : "No se pudieron leer las imágenes del lead en Kommo."),
			);
		return () => clearTimeout(esperaGuardar);
	});

	let formEl: HTMLElement;
	function ir(sec: Seccion) {
		vista = "form";
		activa = sec;
		const el = formEl.querySelector<HTMLElement>(`#sec-${sec}`);
		const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
		el?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
		el?.querySelector<HTMLElement>("input:not([type=checkbox]):not([type=radio]), select, textarea")?.focus({ preventScroll: true });
	}

	async function generar() {
		if (bloqueantes.length) return ir(bloqueantes[0].sec);
		generando = true;
		errorGenerar = avisoIa = avisoKommo = "";
		try {
			// 1. Número correlativo. Se conserva si se vuelve a generar el mismo invoice; "Restablecer" lo libera.
			paso = 0;
			if (!d.sinCliente && !d.numero) d.numero = await pedirNumero(lead.id);

			// 2. IA: siempre se intenta; si falla, el invoice sale con el texto estándar.
			paso = 1;
			const firma = firmaDe(d);
			if (!redaccionVigente) {
				try {
					const activas = CLAUSULAS.filter((c) => d.clausulas[c.id].activa).map((c) => ({ id: c.id, nombre: c.nombre, texto: textoClausula(c.id, d) }));
					const texto = await redactar({ idioma: d.idioma, pieza: tituloPieza(d), vinetas: vinetas(d), notas: d.notas, instrucciones: d.instrucciones, clausulas: activas, etiquetas: d.idioma === "en" ? etiquetasInvoice(d) : [] });
					redaccion = { para: firma, texto };
					if (texto.descartadas.length) avisoIa = "La IA cambió alguna cifra o fecha, así que en esos textos se dejó el original en español.";
				} catch (e) {
					console.warn("[invoice] IA:", e);
					avisoIa = d.idioma === "en" ? "La IA no respondió: el invoice salió en español." : "La IA no respondió: se usó el texto estándar.";
				}
			}

			// 3. PDF. Con cliente, el servidor lo registra y lo guarda en el campo "Invoice" del lead.
			paso = 2;
			await tick(); // que la vista previa ya muestre el número y la redacción antes de copiarla
			const html = await htmlDelInvoice(articulo!);
			let blob: Blob;
			if (d.sinCliente) blob = await generarCotizacion(html);
			else {
				const r = await generarInvoice(d.numero, html, t.total, $state.snapshot(d));
				blob = r.pdf;
				if (r.kommo === "error") avisoKommo = `No se pudo guardar en el lead (${r.detalle || "Kommo no respondió"}). El PDF se descargó igual.`;
				else if (r.kommo === "desactivado") avisoKommo = "El servidor no tiene configurado el campo Invoice de Kommo: el PDF solo se descargó.";
			}
			const nombre = `${d.sinCliente ? "cotizacion" : d.numero}.pdf`;
			if (pdf) URL.revokeObjectURL(pdf.url);
			pdf = { url: URL.createObjectURL(blob), nombre };
			descargar();
			generada = JSON.stringify(d);
		} catch (e) {
			errorGenerar = e instanceof Error ? e.message : "No se pudo generar el invoice";
		} finally {
			generando = false;
		}
	}

	function descargar() {
		if (pdf) Object.assign(document.createElement("a"), { href: pdf.url, download: pdf.nombre }).click();
	}

	// El borrador es compartido: restablecerlo lo borra para todos los asesores (y libera el número).
	function restablecer() {
		if (!confirm("¿Empezar este invoice de cero? Se borra el borrador del lead para todos, y al generar se asigna un número nuevo.")) return;
		Object.assign(d, borradorInicial(lead));
		redaccion = null;
	}

	async function subir(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const archivos = [...(input.files ?? [])];
		input.value = "";
		avisoImagenes = "";
		for (const f of archivos) {
			subiendo++;
			try {
				if (!hayServidor()) throw new ErrorServidor("sin servidor", 503);
				// Cada imagen va a un campo "Imagen N" de la pestaña "Imágenes de la pieza" (el widget lo crea si falta).
				const campo = kommo ? await kommo.campoImagenLibre(lead.id) : undefined;
				const img = await subirImagen(lead.id, f, campo?.id);
				enKommo = [...enKommo, img];
				urls[img.uuid] = URL.createObjectURL(f);
				d.imagenes.push(img.uuid);
			} catch (err) {
				if (!(err instanceof ErrorServidor && err.status === 503)) avisoImagenes = `No se pudo subir ${f.name} a Kommo.`;
				else {
					// Sin Kommo en el servidor: la imagen sirve para este invoice, pero no queda guardada en el lead.
					const id = `local-${crypto.randomUUID()}`;
					locales.push({ id, url: URL.createObjectURL(f) });
					d.imagenes.push(id);
					avisoImagenes = "Kommo no está configurado en el servidor: las imágenes no quedan guardadas en el lead.";
				}
			} finally {
				subiendo--;
			}
		}
	}

	let abiertas: string[] = $state([]);
	function alternarClausula(id: string) {
		abiertas = abiertas.includes(id) ? abiertas.filter((x) => x !== id) : [...abiertas, id];
	}

	// Escribir un % o un monto fija ese depósito; los que siguen en automático se reparten el resto.
	function fijar(x: Deposito, modo: "pct" | "monto", e: Event) {
		const v = (e.currentTarget as HTMLInputElement).valueAsNumber;
		if (Number.isNaN(v)) return;
		x.modo = modo;
		x[modo] = v;
	}

	function aplicarPlan(depositos: Deposito[]) {
		d.depositos = depositos;
		d.cobrarAhora = depositos[0].id;
	}

	function quitarDeposito(i: number) {
		const [quitado] = d.depositos.splice(i, 1);
		if (quitado.id === d.cobrarAhora) d.cobrarAhora = d.depositos[0].id;
		if (!d.depositos.some((x) => x.modo === "auto")) d.depositos[d.depositos.length - 1].modo = "auto";
	}

	const TONOS_DEPOSITO = ["#b08d57", "#d4bc94", "#8a6a3a", "#e6d8bf"];
	const colorDeposito = (i: number, ahora: boolean) => (ahora ? "#1c2150" : TONOS_DEPOSITO[i % TONOS_DEPOSITO.length]);

	function alternar(id: string) {
		const i = d.imagenes.indexOf(id);
		if (i === -1) d.imagenes.push(id);
		else d.imagenes.splice(i, 1);
	}

	// Cualquier cambio después de generar deja el PDF desactualizado.
	let listo = $derived(!generando && generada === JSON.stringify(d));

	const input = "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-xs outline-none transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-rj-navy focus:ring-3 focus:ring-rj-navy/15 disabled:bg-slate-50 disabled:text-slate-400";
	const label = "mb-1 block text-xs font-semibold text-slate-600";
	const seg = "flex rounded-md border border-slate-300 bg-slate-50 p-0.5 text-sm";
	const segBtn = (on: boolean) => `flex-1 rounded px-2.5 py-1 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-rj-navy ${on ? "bg-white text-rj-navy shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800"}`;
</script>

<svelte:window onkeydown={(e) => flotante && e.key === "Escape" && !generando && onclose?.()} />

{#snippet etiquetaKommo(texto = "Kommo")}
	<span class="ml-1.5 inline-flex items-center gap-1 rounded bg-sky-50 px-1.5 py-px text-[10px] font-semibold text-sky-700 ring-1 ring-sky-200" title="Dato tomado del lead en Kommo">
		<svg class="size-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M4 12h16M14 6l6 6-6 6" /></svg>{texto}
	</span>
{/snippet}

{#snippet check(checked: boolean, onchange: (v: boolean) => void, texto: string, ayuda = "")}
	<label class="flex cursor-pointer items-start gap-2.5 text-sm">
		<input type="checkbox" {checked} onchange={(e) => onchange(e.currentTarget.checked)} class="mt-0.5 size-4 shrink-0 accent-rj-navy" />
		<span><span class="font-medium text-slate-800">{texto}</span>{#if ayuda}<span class="block text-xs text-slate-500">{ayuda}</span>{/if}</span>
	</label>
{/snippet}

{#snippet seccion(id: Seccion, titulo: string, ayuda: string, cuerpo: import("svelte").Snippet)}
	<section id="sec-{id}" onfocusin={() => (activa = id)} class="scroll-mt-4 border-b border-slate-200 px-5 py-6 last:border-b-0 sm:px-7">
		<header class="mb-4">
			<h2 class="text-[15px] font-bold text-slate-900">{titulo}</h2>
			<p class="text-xs text-slate-500">{ayuda}</p>
		</header>
		{@render cuerpo()}
	</section>
{/snippet}

<main class="flex flex-col overflow-hidden p-0 text-slate-800 sm:p-4 lg:p-6 {flotante ? 'fixed inset-0 bg-[#0b0f2a]/50' : 'h-dvh bg-km-canvas'}" role={flotante ? "dialog" : undefined} aria-modal={flotante || undefined} aria-label="Invoice para el cliente">
	<div class="mx-auto flex min-h-0 w-full max-w-[1320px] flex-1 flex-col overflow-hidden bg-white shadow-xl sm:rounded-xl">
		<!-- Encabezado del modal del widget -->
		<header class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 px-5 py-3 sm:px-6">
			<div class="grid size-9 shrink-0 place-items-center rounded-md bg-rj-navy text-[13px] font-semibold text-rj-gold" style="font-family: Georgia, serif">RJ</div>
			<div class="min-w-0 flex-1">
				<h1 class="text-base leading-tight font-bold text-slate-900">Invoice para el cliente</h1>
				<p class="truncate text-xs text-slate-500">Lead #{lead.id} · {lead.nombre}</p>
			</div>
			{#if !cargando}
				<p class="hidden items-center gap-1.5 text-xs sm:flex {guardado === 'local' ? 'text-amber-700' : 'text-slate-500'}" aria-live="polite" title="El borrador es del lead: lo retoma cualquier asesor">
					{#if guardado === "guardando"}
						Guardando…
					{:else if guardado === "local"}
						Sin conexión: guardado solo en este equipo
					{:else}
						<svg class="size-3.5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>Borrador guardado en el lead
					{/if}
				</p>
			{/if}
			{#if onclose}
				<button type="button" onclick={onclose} disabled={generando} class="grid size-8 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-rj-navy disabled:opacity-40" aria-label="Cerrar" title="Cerrar (el borrador queda guardado)">
					<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
				</button>
			{/if}
		</header>

		<!-- Pestañas solo en pantallas angostas -->
		<div class="flex border-b border-slate-200 lg:hidden" role="tablist">
			{#each [["form", "Datos"], ["preview", "Vista previa"]] as [id, txt] (id)}
				<button type="button" role="tab" aria-selected={vista === id} onclick={() => (vista = id as typeof vista)} class="flex-1 py-2.5 text-sm font-semibold {vista === id ? 'text-rj-navy shadow-[inset_0_-2px_0] shadow-rj-navy' : 'text-slate-500'}">{txt}</button>
			{/each}
		</div>

		<div class="relative flex min-h-0 flex-1">
			<!-- Índice de secciones -->
			<nav class="hidden w-52 shrink-0 flex-col border-r border-slate-200 bg-slate-50/70 px-3 py-5 xl:flex" aria-label="Secciones del invoice">
				<ul class="space-y-0.5">
					{#each SECCIONES as s (s.id)}
						<li>
							<button type="button" onclick={() => ir(s.id)} class="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-rj-navy {activa === s.id ? 'bg-white font-semibold text-rj-navy shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white/70'}">
								{s.nombre}
								{#if estado[s.id] === "ok"}
									<svg class="size-3.5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-label="Completa"><path d="M20 6 9 17l-5-5" /></svg>
								{:else}
									<span class="size-2 rounded-full {estado[s.id] === 'error' ? 'bg-red-500' : 'bg-amber-400'}" aria-label={estado[s.id] === "error" ? "Falta un dato obligatorio" : "Revisar"}></span>
								{/if}
							</button>
						</li>
					{/each}
				</ul>
				<div class="mt-auto rounded-lg border border-rj-gold/40 bg-rj-gold-soft/60 p-3 text-xs text-[#6f5530]">
					<p class="mb-1 flex items-center gap-1 font-semibold">
						<svg class="size-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z" /></svg>Cómo funciona
					</p>
					Llena lo que sepas. La IA redacta la descripción y las condiciones, y el PDF se descarga en tu equipo.
				</div>
			</nav>

			<!-- Formulario -->
			{#if cargando}
				<div class="absolute inset-0 z-10 grid place-items-center bg-white/85 text-sm text-slate-500" aria-live="polite">Cargando el borrador del lead…</div>
			{/if}
			<div bind:this={formEl} class="relative min-h-0 flex-1 overflow-y-auto lg:max-w-[560px] lg:border-r lg:border-slate-200 {vista === 'form' ? '' : 'hidden lg:block'}">
				{#snippet cliente()}
					<div class="space-y-4">
						{@render check(d.sinCliente, (v) => (d.sinCliente = v), "Invoice sin datos del cliente", "Deja en blanco nombre, correo y número. Útil para cotizar antes de tener sus datos.")}
						{#if !d.sinCliente}
							<div class="grid gap-3 sm:grid-cols-2">
								<div>
									<label class={label} for="f-cliente">Facturado a {#if d.cliente === lead.contacto}{@render etiquetaKommo("Contacto")}{/if}</label>
									<input id="f-cliente" class={input} bind:value={d.cliente} placeholder="Nombre y apellido" />
								</div>
								<div>
									<label class={label} for="f-email">Correo del cliente {#if d.email === lead.email}{@render etiquetaKommo("Contacto")}{/if}</label>
									<input id="f-email" type="email" class={input} bind:value={d.email} placeholder="cliente@correo.com" />
								</div>
							</div>
						{/if}
						<div class="grid gap-3 sm:grid-cols-2">
							<div>
								<span class={label}>Número de factura</span>
								<p class="rounded-md bg-slate-100 px-2.5 py-1.5 text-sm text-slate-600 tabular-nums">{d.sinCliente ? "Sin número (cotización)" : d.numero || "Se asigna al generar"}</p>
							</div>
							<div>
								<label class={label} for="f-emision">Fecha de emisión</label>
								<input id="f-emision" type="date" class={input} bind:value={d.emision} />
							</div>
							<div>
								<label class={label} for="f-prep">Preparado por {#if d.preparadoPor === lead.responsable}{@render etiquetaKommo("Responsable")}{/if}</label>
								<input id="f-prep" class={input} bind:value={d.preparadoPor} />
							</div>
							<div class="sm:col-span-2">
								<label class={label} for="f-venc">Fecha límite de pago</label>
								<select id="f-venc" class={input} bind:value={d.vencimiento}>
									{#each VENCIMIENTOS as v (v)}<option>{v}</option>{/each}
								</select>
							</div>
						</div>
						<div>
							<span class={label}>Idioma del documento</span>
							<div class="{seg} w-48">
								<button type="button" class={segBtn(d.idioma === "es")} onclick={() => (d.idioma = "es")}>Español</button>
								<button type="button" class={segBtn(d.idioma === "en")} onclick={() => (d.idioma = "en")}>English</button>
							</div>
						</div>
					</div>
				{/snippet}
				{@render seccion("cliente", "Cliente y factura", "Los datos del contacto vienen del lead; puedes corregirlos aquí.", cliente)}

				{#snippet pieza()}
					<div class="space-y-5">
						<div>
							<label class={label} for="f-pieza">Tipo de pieza</label>
							<input id="f-pieza" class={input} bind:value={d.pieza} placeholder="Ej. Anillo de compromiso" />
							<div class="mt-2 flex flex-wrap gap-1.5">
								{#each TIPOS_PIEZA as tp (tp)}
									<button type="button" onclick={() => (d.pieza = tp)} class="rounded-full border px-2.5 py-0.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-rj-navy {d.pieza === tp ? 'border-rj-navy bg-rj-navy text-white' : 'border-slate-300 text-slate-600 hover:border-slate-400 hover:bg-slate-50'}">{tp}</button>
								{/each}
							</div>
							<div class="mt-3">{@render check(d.aMedida, (v) => (d.aMedida = v), "Hecha a la medida")}</div>
						</div>

						<fieldset>
							<legend class={label}>Metal {#if lead.producto?.metal}{@render etiquetaKommo("Lead")}{/if}</legend>
							<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
								{#each METALES as m (m.id)}
									<label class="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-rj-navy {d.metal === m.id ? 'border-rj-navy bg-rj-navy-soft font-semibold text-rj-navy' : 'border-slate-300 hover:border-slate-400'}">
										<input type="radio" name="metal" value={m.id} bind:group={d.metal} class="sr-only" />
										<span class="size-4 shrink-0 rounded-full ring-1 ring-black/10" style="background: radial-gradient(circle at 30% 30%, #fff8, transparent 60%), {m.color}"></span>
										{m.nombre}
									</label>
								{/each}
							</div>
							{#if d.metal === "otro"}
								<div class="mt-2.5">
									<label class="sr-only" for="f-metal-otro">Describe el metal</label>
									<!-- svelte-ignore a11y_autofocus -->
									<input id="f-metal-otro" class={input} bind:value={d.metalOtro} autofocus placeholder="Ej. Plata 925, oro bicolor de 18k, paladio…" />
									<p class="mt-1 text-xs text-slate-500">Se escribe tal cual en la descripción del invoice.</p>
								</div>
							{:else if d.metal !== "platino"}
								<div class="mt-2.5 flex flex-wrap items-center gap-4">
									<div class="{seg} w-44" role="radiogroup" aria-label="Kilates">
										{#each ["10k", "14k", "18k"] as k (k)}
											<button type="button" role="radio" aria-checked={d.kilates === k} class={segBtn(d.kilates === k)} onclick={() => (d.kilates = k)}>{k}</button>
										{/each}
									</div>
									{@render check(d.solido, (v) => (d.solido = v), "Oro sólido")}
								</div>
							{/if}
						</fieldset>

						<fieldset>
							<legend class={label}>Piedras {#if lead.producto?.piedra}{@render etiquetaKommo("Lead")}{/if}</legend>
							{#if d.piedras.length === 0}
								<p class="rounded-md border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500">La pieza es solo metal. Agrega una piedra si lleva alguna.</p>
							{/if}
							<ul class="space-y-2">
								{#each d.piedras as p, i (p.id)}
									<li class="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
										<div class="mb-2 flex items-center justify-between">
											<div class="{seg} text-xs" role="radiogroup" aria-label="Posición de la piedra {i + 1}">
												{#each [["central", "Central"], ["lateral", "Laterales"], ["pave", "Pavé"]] as [v, txt] (v)}
													<button type="button" role="radio" aria-checked={p.posicion === v} class={segBtn(p.posicion === v)} onclick={() => (p.posicion = v as typeof p.posicion)}>{txt}</button>
												{/each}
											</div>
											<button type="button" onclick={() => d.piedras.splice(i, 1)} class="rounded px-2 py-1 text-xs font-medium text-slate-500 hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-red-600">Quitar</button>
										</div>
										<div class="grid grid-cols-2 gap-2 sm:grid-cols-[1.2fr_1fr_1fr_.7fr]">
											<select class={input} bind:value={p.tipo} aria-label="Tipo de piedra">
												{#each TIPOS_PIEDRA as tp (tp)}<option>{tp}</option>{/each}
											</select>
											<select class={input} bind:value={p.corte} aria-label="Corte">
												{#each CORTES as c (c)}<option>{c}</option>{/each}
											</select>
											<input class={input} bind:value={p.tamano} placeholder="1 ct o 2 mm" aria-label="Tamaño" />
											<input class={input} bind:value={p.cantidad} placeholder="Cant." aria-label="Cantidad" />
										</div>
										<div class="mt-2 {seg} w-56 text-xs" role="radiogroup" aria-label="Origen">
											<button type="button" role="radio" aria-checked={p.origen === "natural"} class={segBtn(p.origen === "natural")} onclick={() => (p.origen = "natural")}>Natural</button>
											<button type="button" role="radio" aria-checked={p.origen === "laboratorio"} class={segBtn(p.origen === "laboratorio")} onclick={() => (p.origen = "laboratorio")}>Laboratorio</button>
										</div>
									</li>
								{/each}
							</ul>
							<button type="button" onclick={() => d.piedras.push(nuevaPiedra())} class="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-semibold text-rj-navy hover:bg-rj-navy-soft focus-visible:outline-2 focus-visible:outline-rj-navy">
								<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Agregar piedra
							</button>
						</fieldset>

						<div class="grid gap-3 sm:grid-cols-[auto_1fr] sm:gap-6">
							<div>
								<label class={label} for="f-talla">Talla {#if lead.producto?.talla}{@render etiquetaKommo("Lead")}{/if}</label>
								<div class="flex items-center gap-3">
									<input id="f-talla" class="{input} w-24" bind:value={d.talla} disabled={d.tallaPorConfirmar} placeholder="7" />
									{@render check(d.tallaPorConfirmar, (v) => (d.tallaPorConfirmar = v), "Por confirmar")}
								</div>
							</div>
							<div>
								<label class={label} for="f-grabado">Grabado <span class="font-normal text-slate-400">(opcional)</span></label>
								<input id="f-grabado" class={input} bind:value={d.grabado} placeholder="Ej. 12-20-2018" />
							</div>
						</div>

						{@render check(d.origen, (v) => (d.origen = v), "Incluir servicio Origen", "Video del proceso de banco de la pieza, entregado 7 a 15 días después.")}

						<div>
							<label class={label} for="f-notas">Notas para la IA</label>
							<textarea id="f-notas" rows="3" class={input} bind:value={d.notas} placeholder="Detalles que no caben arriba: forma de la banda, estilo, pedidos del cliente…"></textarea>
							<p class="mt-1 text-xs text-slate-500">La IA las convierte en viñetas de la descripción. No hace falta redactarlas bien.</p>
						</div>
					</div>
				{/snippet}
				{@render seccion("pieza", "Pieza", "Lo que se fabrica. Los campos arman la descripción; las notas la completan.", pieza)}

				{#snippet pago()}
					<div class="space-y-5">
						<div class="grid gap-3 sm:grid-cols-2">
							<div>
								<label class={label} for="f-valor">Valor de la pieza {#if d.valor === lead.presupuesto}{@render etiquetaKommo("Presupuesto")}{/if}</label>
								<div class="relative">
									<span class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-slate-400">$</span>
									<input id="f-valor" type="number" min="0" step="10" class="{input} pl-6 tabular-nums" bind:value={d.valor} />
								</div>
							</div>
							<div>
								<span class={label}>Sales tax</span>
								<div class="flex items-center gap-3">
									{@render check(d.conTax, (v) => (d.conTax = v), "Mostrar línea")}
									{#if d.conTax}
										<div class="relative w-24">
											<input type="number" min="0" max="20" step="0.5" class="{input} pr-6 tabular-nums" bind:value={d.taxPct} aria-label="Porcentaje de sales tax" />
											<span class="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-slate-400">%</span>
										</div>
									{/if}
								</div>
							</div>
						</div>

						<fieldset>
							<legend class={label}>Depósitos</legend>
							<div class="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
								<span class="text-slate-500">Empezar con:</span>
								{#each PLANES as plan (plan.nombre)}
									<button type="button" onclick={() => aplicarPlan(plan.crear())} class="rounded-full border border-slate-300 px-2.5 py-0.5 text-slate-600 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-rj-navy">{plan.nombre}</button>
								{/each}
							</div>
							<ol class="space-y-2">
								{#each d.depositos as x, i (x.id)}
									{@const c = t.depositos[i]}
									{@const ahora = t.ahoraDep?.id === x.id}
									<li class="rounded-lg border p-3 transition-colors {ahora ? 'border-rj-navy/50 bg-rj-navy-soft/50' : 'border-slate-200 bg-slate-50/60'}">
										<div class="flex items-center gap-2">
											<span class="size-2.5 shrink-0 rounded-full" style:background={colorDeposito(i, ahora)} aria-hidden="true"></span>
											<input class="{input} min-w-0 flex-1 font-semibold" bind:value={x.nombre} aria-label="Nombre del depósito {i + 1}" />
											{#if ahora}
												<span class="shrink-0 rounded-full bg-rj-navy px-2 py-0.5 text-[11px] font-semibold text-white">Se cobra ahora</span>
											{:else}
												<button type="button" onclick={() => (d.cobrarAhora = x.id)} class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium text-rj-navy ring-1 ring-rj-navy/30 hover:bg-rj-navy-soft focus-visible:outline-2 focus-visible:outline-rj-navy">Cobrar en este invoice</button>
											{/if}
											{#if d.depositos.length > 1}
												<button type="button" onclick={() => quitarDeposito(i)} class="grid size-7 shrink-0 place-items-center rounded text-slate-400 hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-red-600" aria-label="Quitar {x.nombre}">
													<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
												</button>
											{/if}
										</div>
										<div class="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-[5.5rem_8rem_1fr]">
											<div>
												<span class="mb-0.5 block text-[11px] text-slate-500">Porcentaje</span>
												<div class="relative">
													<input type="number" step="any" min="0" value={c.pctCalc} oninput={(e) => fijar(x, "pct", e)} class="{input} pr-6 tabular-nums" aria-label="Porcentaje de {x.nombre}" />
													<span class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-sm text-slate-400">%</span>
												</div>
											</div>
											<div>
												<span class="mb-0.5 block text-[11px] text-slate-500">Monto</span>
												<div class="relative">
													<span class="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-sm text-slate-400">$</span>
													<input type="number" step="any" min="0" value={c.montoCalc} oninput={(e) => fijar(x, "monto", e)} class="{input} pl-5 tabular-nums {c.montoCalc < 0 ? 'border-red-400 text-red-700' : ''}" aria-label="Monto de {x.nombre}" />
												</div>
											</div>
											<div class="col-span-2 flex items-end pb-1.5 sm:col-span-1">
												{#if x.modo === "auto"}
													<span class="text-[11px] text-slate-500" title="Se queda con lo que no cubren los depósitos fijados">Se calcula solo</span>
												{:else}
													<button type="button" onclick={() => (x.modo = "auto")} class="inline-flex items-center gap-1 text-[11px] font-medium text-rj-navy hover:underline focus-visible:outline-2 focus-visible:outline-rj-navy">
														<svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" /></svg>Volver a calcularlo solo
													</button>
												{/if}
											</div>
										</div>
										<div class="mt-2 grid gap-2 sm:grid-cols-[1fr_9.5rem]">
											<div>
												<span class="mb-0.5 block text-[11px] text-slate-500">Cuándo se paga</span>
												<input list="momentos-pago" class={input} bind:value={x.momento} aria-label="Cuándo se paga {x.nombre}" />
											</div>
											<div>
												<span class="mb-0.5 block text-[11px] text-slate-500">Fecha límite <span class="text-slate-400">(opcional)</span></span>
												<input type="date" class={input} bind:value={x.fecha} aria-label="Fecha límite de {x.nombre}" />
											</div>
										</div>
									</li>
								{/each}
							</ol>
							<datalist id="momentos-pago">{#each MOMENTOS_PAGO as m (m)}<option value={m}></option>{/each}</datalist>
							<button type="button" onclick={() => d.depositos.push(nuevoDeposito(d.depositos.length + 1))} class="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-semibold text-rj-navy hover:bg-rj-navy-soft focus-visible:outline-2 focus-visible:outline-rj-navy">
								<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Agregar depósito
							</button>
						</fieldset>

						<!-- Reparto del total entre depósitos -->
						<div class="rounded-lg border border-slate-200 p-3">
							<div class="flex h-2.5 gap-px overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
								{#each t.depositos as x, i (x.id)}
									<div class="transition-[width] duration-300" style:width="{t.total ? Math.max(0, (x.montoCalc / t.total) * 100) : 0}%" style:background={colorDeposito(i, t.ahoraDep?.id === x.id)}></div>
								{/each}
							</div>
							<div class="mt-2.5 flex flex-wrap items-baseline justify-between gap-2 text-sm tabular-nums">
								<p><span class="text-xs text-slate-500">Paga ahora</span> <b class="text-rj-navy">{money(t.ahora)}</b></p>
								{#if t.diferencia === 0}
									<p class="flex items-center gap-1 text-xs text-emerald-700">
										<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
										Los depósitos suman {money(t.total)}
									</p>
								{:else}
									<p class="text-xs text-red-700">
										Suman {money(t.suma)} de {money(t.total)}.
										<button type="button" onclick={() => (d.depositos[d.depositos.length - 1].modo = "auto")} class="font-semibold underline underline-offset-2">Ajustar el último depósito</button>
									</p>
								{/if}
							</div>
						</div>
						{#if d.clausulas.pago.texto !== null}
							<p class="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">Editaste a mano el texto de las condiciones de pago, así que no cambia con estos depósitos. Revísalo en Condiciones.</p>
						{/if}
					</div>
				{/snippet}
				{@render seccion("pago", "Precio y pagos", "Los montos se calculan solos; la IA no los toca.", pago)}

				{#snippet entrega()}
					<div class="space-y-4">
						<div class="grid gap-3 sm:grid-cols-2">
							<div>
								<label class={label} for="f-desde">Entrega estimada</label>
								<input id="f-desde" type="date" class={input} bind:value={d.entregaDesde} />
							</div>
							<div>
								<label class={label} for="f-hasta">Hasta <span class="font-normal text-slate-400">(si es un rango)</span></label>
								<input id="f-hasta" type="date" class={input} bind:value={d.entregaHasta} min={d.entregaDesde} />
							</div>
						</div>
						<div class="space-y-2.5">
							{@render check(d.envio, (v) => (d.envio = v), "Envío asegurado incluido", "Asegurado por el valor total, con firma requerida.")}
							{@render check(d.pickup, (v) => (d.pickup = v), `Pickup en ${d.params.ciudadPickup}`)}
						</div>
					</div>
				{/snippet}
				{@render seccion("entrega", "Entrega", "Una fecha o un rango. Si aún no la sabes, el invoice dirá «por definir».", entrega)}

				{#snippet imagenes()}
					<div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
						{#each galeria as a (a.id)}
							{@const sel = d.imagenes.includes(a.id)}
							<label class="group relative cursor-pointer overflow-hidden rounded-lg border-2 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-rj-navy {sel ? 'border-rj-navy' : 'border-transparent hover:border-slate-300'}">
								<input type="checkbox" checked={sel} onchange={() => alternar(a.id)} class="sr-only" />
								<div class="aspect-square bg-slate-100">
									{#if a.url}<img src={a.url} alt="" class="size-full object-cover" />{:else}<span class="grid size-full place-items-center text-[10px] text-slate-400">Cargando…</span>{/if}
								</div>
								<span class="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full text-[11px] font-bold {sel ? 'bg-rj-navy text-white' : 'bg-white/80 text-transparent ring-1 ring-slate-300'}">
									{sel ? d.imagenes.indexOf(a.id) + 1 : ""}
								</span>
								<span class="block truncate px-1.5 py-1 text-[11px] text-slate-600">{a.nombre}</span>
							</label>
						{/each}
						<label class="grid aspect-square cursor-pointer place-items-center rounded-lg border-2 border-dashed border-slate-300 text-center text-xs text-slate-500 transition-colors hover:border-rj-navy hover:text-rj-navy has-focus-visible:outline-2 has-focus-visible:outline-rj-navy">
							<input type="file" accept="image/*" multiple onchange={subir} class="sr-only" />
							<span><svg class="mx-auto mb-1 size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 16V4m0 0-4 4m4-4 4 4M4 20h16" /></svg>{subiendo ? "Subiendo…" : "Subir imagen"}</span>
						</label>
					</div>
					{#if avisoImagenes}<p class="mt-2 text-xs text-amber-800">{avisoImagenes}</p>{/if}
				{/snippet}
				{@render seccion("imagenes", "Imágenes de referencia", "Las imágenes del lead en Kommo. Las que subas se guardan en la pestaña «Imágenes de la pieza» del lead. El número indica el orden en el invoice.", imagenes)}

				{#snippet condiciones()}
					<div class="space-y-4">
						<ul class="space-y-2">
							{#each CLAUSULAS as c (c.id)}
								{@const cl = d.clausulas[c.id]}
								{@const abierta = abiertas.includes(c.id)}
								{@const texto = textoClausula(c.id, d)}
								<li class="rounded-lg border transition-colors {cl.activa ? 'border-slate-200 bg-white' : 'border-dashed border-slate-300 bg-slate-50'}">
									<div class="flex items-center gap-3 px-3 py-2.5">
										<label class="relative inline-flex shrink-0 cursor-pointer">
											<input type="checkbox" bind:checked={cl.activa} class="peer sr-only" aria-label="Incluir {c.nombre} en el invoice" />
											<span class="h-5 w-9 rounded-full bg-slate-300 transition-colors peer-checked:bg-rj-navy peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-rj-navy"></span>
											<span class="absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4"></span>
										</label>
										<button type="button" onclick={() => alternarClausula(c.id)} aria-expanded={abierta} aria-controls="cl-{c.id}" class="flex min-w-0 flex-1 items-center gap-3 rounded text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rj-navy">
											<span class="min-w-0 flex-1">
												<span class="flex items-center gap-2 text-sm font-medium {cl.activa ? 'text-slate-800' : 'text-slate-400'}">
													{c.nombre}
													{#if cl.texto !== null}<span class="rounded bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-800">Editado</span>{/if}
													{#if !cl.activa}<span class="text-[11px] font-normal">· no sale en el invoice</span>{/if}
												</span>
												{#if !abierta}<span class="block truncate text-xs text-slate-500">{texto.replaceAll("**", "")}</span>{/if}
											</span>
											<svg class="size-4 shrink-0 text-slate-400 transition-transform {abierta ? 'rotate-180' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
										</button>
									</div>
									{#if abierta}
										<div id="cl-{c.id}" class="space-y-3 border-t border-slate-100 px-3 pt-3 pb-3.5">
											{#if c.params.length}
												<div class="grid gap-2 sm:grid-cols-2">
													{#each c.params as p (p.k)}
														<div>
															<label class="mb-0.5 block text-[11px] text-slate-500" for="p-{p.k}">{p.label}</label>
															<div class="relative">
																{#if p.tipo === "money"}<span class="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-sm text-slate-400">$</span>{/if}
																<input id="p-{p.k}" type={p.tipo === "text" ? "text" : "number"} min="0" bind:value={d.params[p.k]} disabled={cl.texto !== null} class="{input} {p.tipo === 'money' ? 'pl-5' : ''} {p.sufijo ? 'pr-14' : ''}" />
																{#if p.sufijo}<span class="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-slate-400">{p.sufijo}</span>{/if}
															</div>
														</div>
													{/each}
												</div>
											{/if}
											{#if c.id === "produccion" || c.id === "pago"}
												<p class="text-xs text-slate-500">También usa los datos de {c.id === "pago" ? "Precio y pagos" : "Entrega"}.</p>
											{/if}
											<div>
												<label class="mb-0.5 block text-[11px] text-slate-500" for="t-{c.id}">Texto en el invoice</label>
												<textarea id="t-{c.id}" rows="4" value={texto} oninput={(e) => (cl.texto = e.currentTarget.value)} class="{input} leading-relaxed"></textarea>
												<div class="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
													<span>Escribe **así** para negrita.</span>
													{#if cl.texto !== null}
														<button type="button" onclick={() => (cl.texto = null)} class="font-semibold text-rj-navy hover:underline focus-visible:outline-2 focus-visible:outline-rj-navy">Restaurar texto estándar</button>
													{/if}
												</div>
												{#if cl.texto !== null && c.params.length}
													<p class="mt-1.5 text-xs text-amber-800">Como editaste el texto, los valores de arriba ya no lo cambian. Cámbialos directamente en el texto o restaura el estándar.</p>
												{/if}
											</div>
										</div>
									{/if}
								</li>
							{/each}
						</ul>
						<div>
							<label class={label} for="f-instr">Indicaciones extra para la IA <span class="font-normal text-slate-400">(opcional)</span></label>
							<textarea id="f-instr" rows="2" class={input} bind:value={d.instrucciones} placeholder="Ej. mencionar que el envío a Colombia tarda 5 días más."></textarea>
						</div>
					</div>
				{/snippet}
				{@render seccion("condiciones", "Condiciones y políticas", "Cada una trae el texto estándar de Romero Jeweler. Actívala, ajusta sus valores o edita el texto solo para este invoice.", condiciones)}
			</div>

			<!-- Vista previa en vivo -->
			<div class="relative min-h-0 flex-1 overflow-y-auto bg-[#e6e8ee] px-4 py-6 sm:px-8 {vista === 'preview' ? '' : 'hidden lg:block'}">
				<p class="mx-auto mb-3 flex max-w-[560px] items-center justify-between text-xs text-slate-500">
					<span class="font-semibold tracking-wide uppercase">Vista previa</span>
					<span class="flex items-center gap-3">
						<span class="hidden sm:inline">Toca un bloque para editarlo</span>
						{#if disenoHref}
						<a href={disenoHref} class="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 font-semibold text-rj-navy shadow-xs ring-1 ring-slate-300 hover:ring-slate-400 focus-visible:outline-2 focus-visible:outline-rj-navy">
							<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>Editar diseño
						</a>
						{/if}
					</span>
				</p>
				<div class="transition-opacity {generando ? 'opacity-40' : ''}">
					<InvoicePreview {d} p={plantilla} {activa} {subidas} onpick={ir} redaccion={redaccionVigente} bind:elemento={articulo} />
				</div>
			</div>
		</div>

		<!-- Barra de acciones -->
		<footer class="flex flex-wrap items-center gap-3 border-t border-slate-200 bg-white px-5 py-3 sm:px-6">
			<div class="min-w-0 basis-full text-sm sm:basis-auto sm:flex-1" aria-live="polite">
				{#if generando}
					<p class="flex items-center gap-2 font-medium text-rj-navy">
						<svg class="size-4 motion-safe:animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity=".2" stroke-width="3" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round" /></svg>
						{PASOS[Math.min(paso, PASOS.length - 1)]}… <span class="font-normal text-slate-400">({Math.min(paso + 1, PASOS.length)}/{PASOS.length})</span>
					</p>
				{:else if errorGenerar}
					<p class="text-red-700"><span class="font-semibold">No se generó el invoice.</span> {errorGenerar}</p>
				{:else if !hayServidor()}
					<p class="text-amber-700">Falta configurar la URL del servidor en los ajustes del widget.</p>
				{:else if listo && pdf}
					<p class="flex flex-wrap items-center gap-x-2 text-emerald-700">
						<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
						<span class="font-semibold">{d.sinCliente || avisoKommo ? `Descargaste ${pdf.nombre}` : `${d.numero} guardado en el lead y descargado`}</span>
						<button type="button" onclick={descargar} class="font-medium text-rj-navy underline underline-offset-2">Descargar de nuevo</button>
						{#if avisoKommo}<span class="basis-full text-xs text-amber-700">{avisoKommo}</span>{/if}
						{#if avisoIa}<span class="basis-full text-xs text-amber-700">{avisoIa}</span>{/if}
					</p>
				{:else if bloqueantes.length}
					<p class="text-red-700">
						Falta completar:
						{#each bloqueantes as b, i (b.msg)}<button type="button" onclick={() => ir(b.sec)} class="font-semibold underline underline-offset-2">{b.msg.replace(/^Falta (el |la )?/, "")}</button>{i < bloqueantes.length - 1 ? ", " : ""}{/each}
					</p>
				{:else if faltan.length}
					<p class="text-amber-700">
						Puedes generarlo ya. Para revisar:
						{#each faltan as f, i (f.msg)}<button type="button" onclick={() => ir(f.sec)} class="underline underline-offset-2">{f.msg.toLowerCase()}</button>{i < faltan.length - 1 ? ", " : ""}{/each}
					</p>
				{:else}
					<p class="text-slate-500">Todo listo. Total a pagar ahora: <b class="text-slate-800 tabular-nums">{money(t.ahora)}</b></p>
				{/if}
			</div>
			<button type="button" onclick={restablecer} disabled={generando || cargando} class="ml-auto rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-rj-navy disabled:opacity-50">Restablecer</button>
			<button type="button" onclick={generar} disabled={generando || cargando || !hayServidor()} aria-disabled={bloqueantes.length > 0} class="inline-flex items-center gap-2 rounded-md bg-rj-navy px-4 py-2 text-sm font-semibold text-white shadow-sm transition-[background-color,transform] hover:bg-[#262c66] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rj-navy active:scale-[.98] disabled:cursor-wait disabled:opacity-70 aria-disabled:bg-slate-400">
				<svg class="size-4 text-rj-gold" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z" /></svg>
				{generada && !listo ? "Generar de nuevo" : "Generar invoice"}
			</button>
		</footer>
	</div>
</main>
