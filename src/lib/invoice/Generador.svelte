<script lang="ts">
	import { CLAUSULAS, etiquetasInvoice, tituloPieza, vinetas, MOMENTOS_PAGO, PLANES, SECCIONES, VENCIMIENTOS, agregarOpcion, aplicarKommo, borradorInicial, cargarBorrador, cargarOpciones, colorMetal, desdeProducto, draft as d, esOro, guardarBorrador, metalCorto, money, nuevaPieza, nuevaPiedra, nuevoDeposito, opciones, ordenAKommo, pendientes, piezaDesdeKommo, textoClausula, totales, type Borrador, type Deposito, type Lead, type Pieza, type Seccion } from "./invoice.svelte";
	import InvoicePreview from "./InvoicePreview.svelte";
	import type { ListaOpcion } from "./opciones";
	import { cargarPlantillaServidor, plantilla } from "./plantilla.svelte";
	import { ErrorServidor, MAX_ARCHIVO, paraKommo, generarCotizacion, generarInvoice, hayServidor, htmlDelInvoice, imagenesDelLead, pedirNumero, redactar, subirImagen, urlImagen, type ImagenKommo, type Kommo, type OrdenKommo, type RedaccionInvoice } from "./servidor";
	import { onMount, tick, untrack } from "svelte";

	// `flotante`: ventana sobre la tarjeta del lead en Kommo. `disenoHref`: enlace al editor del diseño, si lo hay.
	// `kommo`: lo que el widget hace con la API de Kommo (campos, grupos de anillos, opciones); fuera de Kommo no está.
	let { lead, onclose, flotante = false, disenoHref, kommo }: { lead: Lead; onclose?: () => void; flotante?: boolean; disenoHref?: string; kommo?: Kommo } = $props();

	// El borrador de cada lead vive en la app: cualquier asesor lo retoma desde cualquier equipo.
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

	// Secciones plegadas, la barra de la izquierda, y qué piezas y piedras están abiertas.
	let plegadas: Seccion[] = $state([]);
	const CLAVE_NAV = "rj-invoice-nav-plegada";
	let navPlegada = $state((() => {
		try {
			return localStorage.getItem(CLAVE_NAV) === "1";
		} catch {
			return false;
		}
	})());
	$effect(() => {
		try {
			localStorage.setItem(CLAVE_NAV, navPlegada ? "1" : "0");
		} catch {
			// modo privado
		}
	});
	let piezasAbiertas: number[] = $state([]);
	let piedrasAbiertas: number[] = $state([]);
	const alternarEn = (lista: number[], id: number) => (lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);

	// Imágenes: las del lead en Kommo, más las subidas sin Kommo en la app (solo duran en esta ventana).
	let enKommo: ImagenKommo[] = $state([]);
	let locales: { id: string; url: string }[] = $state([]);
	let urls: Record<string, string> = $state({});
	let subiendo = $state(0);
	let avisoImagenes = $state("");
	let subirPara: number | null = $state(null);
	const mostrar = (uuid: string) => {
		if (!untrack(() => urls[uuid])) urlImagen(uuid).then((u) => (urls[uuid] = u), () => {});
	};
	$effect(() => d.piezas.forEach((p) => p.imagenes.forEach((id) => !id.startsWith("local-") && !id.startsWith("muestra-") && mostrar(id))));
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
	let avisoOpciones = $state("");
	// La redacción de la IA vale mientras el borrador no cambie (el número no cuenta: se asigna al generar).
	const firmaDe = (b: Borrador) => JSON.stringify({ ...b, numero: "" });
	let redaccion = $state<{ para: string; texto: RedaccionInvoice } | null>(null);
	let redaccionVigente = $derived(redaccion && redaccion.para === firmaDe(d) ? redaccion.texto : null);

	// Lo que la pestaña "Orden" del lead ya tiene (para la primera pieza, o si el invoice aún no tiene piezas).
	let enKommoOrden: OrdenKommo | null = null;

	onMount(() => {
		void cargarPlantillaServidor();
		void cargarOpciones();
		const leadActual = untrack(() => lead);
		Promise.all([cargarBorrador(leadActual), kommo ? Promise.resolve(kommo.leerOrden(leadActual.id)).catch((e) => (console.warn("[invoice] Kommo:", e), null)) : null]).then(([{ borrador }, orden]) => {
			enKommoOrden = orden;
			if (orden) aplicarKommo(borrador, orden);
			Object.assign(d, borrador);
			if (d.piezas.length === 1) piezasAbiertas = [d.piezas[0].id];
			cargando = false;
		});
		if (hayServidor())
			imagenesDelLead(leadActual.id).then(
				(lista) => {
					enKommo = lista;
					lista.forEach((a) => mostrar(a.uuid));
				},
				(e) => (avisoImagenes = e instanceof ErrorServidor && e.status === 503 ? "" : "No se pudieron leer las imágenes del lead en Kommo."),
			);
		return () => clearTimeout(esperaGuardar);
	});

	let formEl: HTMLElement;
	async function ir(sec: Seccion) {
		vista = "form";
		activa = sec;
		plegadas = plegadas.filter((s) => s !== sec);
		await tick();
		const el = formEl.querySelector<HTMLElement>(`#sec-${sec}`);
		const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
		el?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
		el?.querySelector<HTMLElement>(`#cuerpo-${sec} input:not([type=checkbox]):not([type=radio]), #cuerpo-${sec} select, #cuerpo-${sec} textarea`)?.focus({ preventScroll: true });
	}

	function alternarSeccion(sec: Seccion) {
		plegadas = plegadas.includes(sec) ? plegadas.filter((s) => s !== sec) : [...plegadas, sec];
	}

	// ─── Piezas ───────────────────────────────────────────────────────────────
	// La primera se precarga con lo que tenga el lead (grupo "Anillo °1" o los campos sueltos de producto);
	// las siguientes traen las mismas filas de la orden que la anterior.
	function agregarPieza() {
		const anterior = d.piezas.at(-1);
		const enKommo1 = enKommoOrden?.anillos[0];
		const p = anterior
			? nuevaPieza({}, anterior.orden.campos)
			: enKommo1 && Object.values(enKommo1).some((v) => (Array.isArray(v) ? v.length : String(v ?? "").trim()))
				? piezaDesdeKommo(enKommo1)
				: nuevaPieza(desdeProducto(lead.producto));
		d.piezas.push(p);
		piezasAbiertas = [p.id];
		// Si el lead aún no tiene el grupo de este anillo en Kommo, el widget lo crea.
		if (kommo) Promise.resolve(kommo.asegurarAnillos(d.piezas.length)).catch((e) => (avisoOpciones = `No se pudo crear el grupo del anillo ${d.piezas.length} en Kommo: ${e}`));
	}

	function quitarPieza(i: number) {
		const p = d.piezas[i];
		const conDatos = p.tipo || p.piedras.length || p.grabado || p.notas || p.imagenes.length;
		if (conDatos && !confirm(`¿Quitar la pieza ${i + 1} (${tituloPieza(p)})? También sale de la orden de producción.`)) return;
		d.piezas.splice(i, 1);
	}

	const resumenPieza = (p: Pieza) => [p.tipo, metalCorto(p), p.piedras.length ? `${p.piedras.length} ${p.piedras.length === 1 ? "piedra" : "piedras"}` : ""].filter(Boolean).join(" · ");

	// ─── Opciones personalizadas (metal, quilates, piedras…) ─────────────────
	// Quedan para todos los clientes (en la app) y como opción del campo de Kommo de cada anillo.
	let editandoOtra: string | null = $state(null);
	let textoOtra = $state("");
	function abrirOtra(clave: string) {
		editandoOtra = clave;
		textoOtra = "";
	}
	function confirmarOtra(lista: ListaOpcion, elegir: (v: string) => void) {
		const v = textoOtra.trim().replace(/\s+/g, " ");
		if (!v) return;
		elegir(opciones[lista].find((x) => x.toLowerCase() === v.toLowerCase()) ?? v);
		editandoOtra = null;
		avisoOpciones = "";
		agregarOpcion(lista, v).catch((e) => (avisoOpciones = `La opción «${v}» quedó solo en este invoice: ${e instanceof Error ? e.message : e}`));
		if (kommo) Promise.resolve(kommo.agregarOpcion(lista, v)).catch((e) => (avisoOpciones = `No se pudo agregar «${v}» a las opciones del campo en Kommo: ${e}`));
	}

	async function generar() {
		if (bloqueantes.length) return ir(bloqueantes[0].sec);
		generando = true;
		errorGenerar = avisoIa = avisoKommo = "";
		try {
			// 1. Número correlativo. Se conserva si se vuelve a generar el mismo invoice; "Restablecer" lo libera.
			paso = 0;
			if (!d.sinCliente && !d.numero) d.numero = await pedirNumero(lead.id);

			// 2. IA: una redacción por pieza (la primera lleva también las condiciones y las etiquetas). Siempre se
			// intenta; si falla, el invoice sale con el texto estándar.
			paso = 1;
			const firma = firmaDe(d);
			if (!redaccionVigente) {
				try {
					const activas = CLAUSULAS.filter((c) => d.clausulas[c.id].activa).map((c) => ({ id: c.id, nombre: c.nombre, texto: textoClausula(c.id, d) }));
					const textos = await Promise.all(
						d.piezas.map((p, i) => redactar({ idioma: d.idioma, pieza: tituloPieza(p), vinetas: vinetas(p), notas: p.notas, instrucciones: d.instrucciones, clausulas: i === 0 ? activas : [], etiquetas: i === 0 && d.idioma === "en" ? etiquetasInvoice(d) : [] })),
					);
					const texto: RedaccionInvoice = { ...textos[0], piezas: textos.map((x) => ({ titulo: x.titulo, vinetas: x.vinetas })), descartadas: textos.flatMap((x) => x.descartadas) };
					redaccion = { para: firma, texto };
					if (texto.descartadas.length) avisoIa = "La IA cambió alguna cifra o fecha, así que en esos textos se dejó el original en español.";
				} catch (e) {
					console.warn("[invoice] IA:", e);
					avisoIa = d.idioma === "en" ? "La IA no respondió: el invoice salió en español." : "La IA no respondió: se usó el texto estándar.";
				}
			}

			// 3. PDF. Con cliente, la API lo registra y lo guarda en el campo "Invoice" del lead. Las piezas van a
			// los grupos de anillos de la pestaña "Orden" y "N° de Anillos".
			paso = 2;
			await tick(); // que la vista previa ya muestre el número y la redacción antes de copiarla
			const html = await htmlDelInvoice(articulo!);
			let blob: Blob;
			if (d.sinCliente) blob = await generarCotizacion(html);
			else {
				const [r, enLead] = await Promise.all([
					generarInvoice(d.numero, html, t.total, $state.snapshot(d)),
					kommo ? Promise.resolve(kommo.guardarOrden(lead.id, ordenAKommo($state.snapshot(d) as Borrador))).then(() => "", (e) => String(e)) : "",
				]);
				blob = r.pdf;
				if (r.kommo === "error") avisoKommo = `No se pudo guardar en el lead (${r.detalle || "Kommo no respondió"}). El PDF se descargó igual.`;
				else if (r.kommo === "desactivado") avisoKommo = "La app no tiene configurado el campo Invoice de Kommo: el PDF solo se descargó.";
				if (enLead) avisoKommo = `${avisoKommo} No se pudieron guardar las piezas en la pestaña Orden del lead (${enLead}).`.trim();
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
		const destino = d.piezas.find((p) => p.id === subirPara) ?? d.piezas[0];
		for (const original of archivos) {
			subiendo++;
			try {
				// Kommo no acepta archivos de más de 9 MB: las fotos más pesadas se comprimen antes de subir.
				const f = await paraKommo(original);
				if (f.size > MAX_ARCHIVO) {
					avisoImagenes = `${original.name} pesa ${(original.size / 1024 / 1024).toFixed(1)} MB y no se pudo achicar a ${MAX_ARCHIVO / 1024 / 1024} MB.`;
					continue;
				}
				if (!hayServidor()) throw new ErrorServidor("sin servidor", 503);
				// Cada imagen va a un campo "Imagen N" de la pestaña "Imágenes de la pieza" (el widget lo crea si falta).
				const campo = kommo ? await kommo.campoImagenLibre(lead.id) : undefined;
				const img = await subirImagen(lead.id, f, campo?.id);
				enKommo = [...enKommo, img];
				urls[img.uuid] = URL.createObjectURL(f);
				destino?.imagenes.push(img.uuid);
			} catch (err) {
				if (!(err instanceof ErrorServidor && err.status === 503)) avisoImagenes = `No se pudo subir ${original.name} a Kommo${err instanceof Error && err.message ? `: ${err.message}` : ""}.`;
				else {
					// Sin Kommo en la app: la imagen sirve para este invoice, pero no queda guardada en el lead.
					const id = `local-${crypto.randomUUID()}`;
					locales.push({ id, url: URL.createObjectURL(original) });
					destino?.imagenes.push(id);
					avisoImagenes = "Kommo no está configurado en la app: las imágenes no quedan guardadas en el lead.";
				}
			} finally {
				subiendo--;
			}
		}
	}

	function alternarImagen(p: Pieza, id: string) {
		const i = p.imagenes.indexOf(id);
		if (i === -1) p.imagenes.push(id);
		else p.imagenes.splice(i, 1);
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

	// Cualquier cambio después de generar deja el PDF desactualizado.
	let listo = $derived(!generando && generada === JSON.stringify(d));

	// Un valor guardado que ya no está en la lista (de un borrador viejo) se sigue mostrando.
	const conActual = (lista: string[], actual: string) => (actual && !lista.includes(actual) ? [...lista, actual] : lista);

	const input = "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-xs outline-none transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-rj-navy focus:ring-3 focus:ring-rj-navy/15 disabled:bg-slate-50 disabled:text-slate-400";
	const label = "mb-1 block text-xs font-semibold text-slate-600";
	const seg = "flex rounded-md border border-slate-300 bg-slate-50 p-0.5 text-sm";
	const segBtn = (on: boolean) => `flex-1 rounded px-2.5 py-1 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-rj-navy ${on ? "bg-white text-rj-navy shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800"}`;
	const chip = (on: boolean) => `rounded-full border px-2.5 py-0.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-rj-navy ${on ? "border-rj-navy bg-rj-navy text-white" : "border-slate-300 text-slate-600 hover:border-slate-400 hover:bg-slate-50"}`;
	const btnTexto = "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-rj-navy hover:bg-rj-navy-soft focus-visible:outline-2 focus-visible:outline-rj-navy";
</script>

<svelte:window onkeydown={(e) => flotante && e.key === "Escape" && !generando && !editandoOtra && onclose?.()} />

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

{#snippet chevron(abierta: boolean)}
	<svg class="size-4 shrink-0 text-slate-400 transition-transform {abierta ? 'rotate-180' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
{/snippet}

{#snippet mas()}
	<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
{/snippet}

<!-- "+ Otro …": aparece un campo de texto; lo que se escribe queda como opción para todos. -->
{#snippet otra(clave: string, lista: ListaOpcion, texto: string, ejemplo: string, elegir: (v: string) => void)}
	{#if editandoOtra === clave}
		<form class="flex flex-wrap items-center gap-1.5" onsubmit={(e) => (e.preventDefault(), confirmarOtra(lista, elegir))}>
			<!-- svelte-ignore a11y_autofocus -->
			<input class="{input} w-48 min-w-0 flex-1" bind:value={textoOtra} placeholder={ejemplo} aria-label={texto} onkeydown={(e) => e.key === "Escape" && (e.stopPropagation(), (editandoOtra = null))} autofocus />
			<button type="submit" disabled={!textoOtra.trim()} class="rounded-md bg-rj-navy px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#262c66] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rj-navy disabled:opacity-50">Agregar</button>
			<button type="button" onclick={() => (editandoOtra = null)} class="rounded-md px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-rj-navy">Cancelar</button>
		</form>
	{:else}
		<button type="button" onclick={() => abrirOtra(clave)} class={btnTexto}>{@render mas()}{texto}</button>
	{/if}
{/snippet}

{#snippet seccion(id: Seccion, titulo: string, ayuda: string, cuerpo: import("svelte").Snippet)}
	{@const abierta = !plegadas.includes(id)}
	<section id="sec-{id}" onfocusin={() => (activa = id)} class="scroll-mt-4 border-b border-slate-200 last:border-b-0">
		<h2>
			<button type="button" onclick={() => alternarSeccion(id)} aria-expanded={abierta} aria-controls="cuerpo-{id}" class="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rj-navy sm:px-7">
				<span class="min-w-0 flex-1">
					<span class="block text-[15px] font-bold text-slate-900">{titulo}</span>
					<span class="block text-xs font-normal text-slate-500">{ayuda}</span>
				</span>
				{#if !abierta && estado[id] !== "ok"}
					<span class="size-2 shrink-0 rounded-full {estado[id] === 'error' ? 'bg-red-500' : 'bg-amber-400'}" title={estado[id] === "error" ? "Falta un dato obligatorio" : "Revisar"}></span>
				{/if}
				{@render chevron(abierta)}
			</button>
		</h2>
		{#if abierta}
			<div id="cuerpo-{id}" class="px-5 pb-6 sm:px-7">{@render cuerpo()}</div>
		{/if}
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
			<!-- Índice de secciones (se pliega para dar más espacio al formulario) -->
			<nav class="hidden shrink-0 flex-col border-r border-slate-200 bg-slate-50/70 py-3 xl:flex {navPlegada ? 'w-12 items-center px-1.5' : 'w-52 px-3'}" aria-label="Secciones del invoice">
				<button type="button" onclick={() => (navPlegada = !navPlegada)} aria-expanded={!navPlegada} class="mb-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-white hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-rj-navy {navPlegada ? '' : 'self-end'}" title={navPlegada ? "Mostrar el índice" : "Ocultar el índice"}>
					<svg class="size-4 transition-transform {navPlegada ? 'rotate-180' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
					<span class={navPlegada ? "sr-only" : ""}>{navPlegada ? "Mostrar el índice" : "Ocultar"}</span>
				</button>
				<ul class="space-y-0.5 {navPlegada ? 'w-full' : ''}">
					{#each SECCIONES as s, i (s.id)}
						<li>
							<button type="button" onclick={() => ir(s.id)} title={navPlegada ? s.nombre : undefined} class="flex w-full items-center rounded-md text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-rj-navy {navPlegada ? 'justify-center px-0 py-2' : 'justify-between px-3 py-2'} {activa === s.id ? 'bg-white font-semibold text-rj-navy shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white/70'}">
								{#if navPlegada}
									<span class="relative text-xs tabular-nums">{i + 1}<span class="absolute -top-0.5 -right-2 size-1.5 rounded-full {estado[s.id] === 'ok' ? 'bg-emerald-500' : estado[s.id] === 'error' ? 'bg-red-500' : 'bg-amber-400'}" aria-hidden="true"></span></span>
									<span class="sr-only">{s.nombre}</span>
								{:else}
									{s.nombre}
									{#if estado[s.id] === "ok"}
										<svg class="size-3.5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-label="Completa"><path d="M20 6 9 17l-5-5" /></svg>
									{:else}
										<span class="size-2 rounded-full {estado[s.id] === 'error' ? 'bg-red-500' : 'bg-amber-400'}" aria-label={estado[s.id] === "error" ? "Falta un dato obligatorio" : "Revisar"}></span>
									{/if}
								{/if}
							</button>
						</li>
					{/each}
				</ul>
				{#if !navPlegada}
					<div class="mt-auto rounded-lg border border-rj-gold/40 bg-rj-gold-soft/60 p-3 text-xs text-[#6f5530]">
						<p class="mb-1 flex items-center gap-1 font-semibold">
							<svg class="size-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z" /></svg>Cómo funciona
						</p>
						Llena lo que sepas. La IA redacta la descripción y las condiciones, y el PDF se descarga en tu equipo.
					</div>
				{/if}
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

				{#snippet piezas()}
					<div class="space-y-3">
						{#if !d.piezas.length}
							<p class="rounded-md border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-500">Todavía no hay piezas. Agrega la primera: cada pieza es un anillo de la orden de producción.</p>
						{/if}
						<ol class="space-y-3">
							{#each d.piezas as p, i (p.id)}
								{@const abierta = piezasAbiertas.includes(p.id)}
								<li class="rounded-lg border {abierta ? 'border-slate-300 shadow-sm' : 'border-slate-200'}">
									<div class="flex items-center gap-2 pr-2">
										<button type="button" onclick={() => (piezasAbiertas = alternarEn(piezasAbiertas, p.id))} aria-expanded={abierta} aria-controls="pieza-{p.id}" class="flex min-w-0 flex-1 items-center gap-3 rounded-l-lg px-3 py-2.5 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rj-navy">
											<span class="grid size-6 shrink-0 place-items-center rounded-full bg-rj-navy text-[11px] font-bold text-white">{i + 1}</span>
											<span class="min-w-0 flex-1">
												<span class="block text-sm font-semibold text-slate-900">Pieza {i + 1}</span>
												<span class="block truncate text-xs {p.tipo ? 'text-slate-500' : 'text-red-600'}">{resumenPieza(p) || "Falta el tipo de pieza"}</span>
											</span>
											{@render chevron(abierta)}
										</button>
										<button type="button" onclick={() => quitarPieza(i)} class="shrink-0 rounded px-2 py-1 text-xs font-medium text-slate-500 hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-red-600" aria-label="Quitar la pieza {i + 1}">Quitar</button>
									</div>
									{#if abierta}
										<div id="pieza-{p.id}" class="space-y-5 border-t border-slate-100 px-3 pt-4 pb-4">
											<fieldset>
												<legend class={label}>Tipo de pieza</legend>
												<div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo de la pieza {i + 1}">
													{#each conActual(opciones.tipos, p.tipo) as tp (tp)}
														<button type="button" role="radio" aria-checked={p.tipo === tp} onclick={() => (p.tipo = tp)} class={chip(p.tipo === tp)}>{tp}</button>
													{/each}
												</div>
											</fieldset>

											<fieldset>
												<legend class={label}>Metal {#if i === 0 && lead.producto?.metal}{@render etiquetaKommo("Lead")}{/if}</legend>
												<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
													{#each conActual(opciones.metales, p.metal) as m (m)}
														<label class="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-rj-navy {p.metal === m ? 'border-rj-navy bg-rj-navy-soft font-semibold text-rj-navy' : 'border-slate-300 hover:border-slate-400'}">
															<input type="radio" name="metal-{p.id}" value={m} bind:group={p.metal} class="sr-only" />
															<span class="size-4 shrink-0 rounded-full ring-1 ring-black/10" style="background: radial-gradient(circle at 30% 30%, #fff8, transparent 60%), {colorMetal(m)}"></span>
															<span class="min-w-0 truncate">{m}</span>
														</label>
													{/each}
												</div>
												<div class="mt-1.5">{@render otra(`metal-${p.id}`, "metales", "Otro metal", "Ej. Plata 925, paladio…", (v) => (p.metal = v))}</div>
												{#if esOro(p.metal)}
													<div class="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
														<div class="flex flex-wrap gap-1" role="radiogroup" aria-label="Quilates de la pieza {i + 1}">
															{#each conActual(opciones.quilates, p.kilates) as k (k)}
																<button type="button" role="radio" aria-checked={p.kilates === k} class={chip(p.kilates === k)} onclick={() => (p.kilates = k)}>{k}</button>
															{/each}
														</div>
														{@render check(p.solido, (v) => (p.solido = v), "Oro sólido")}
													</div>
													<div class="mt-1.5">{@render otra(`quilates-${p.id}`, "quilates", "Otro quilate", "Ej. 22k", (v) => (p.kilates = v))}</div>
												{/if}
											</fieldset>

											<fieldset>
												<legend class={label}>Piedras {#if i === 0 && lead.producto?.piedra}{@render etiquetaKommo("Lead")}{/if}</legend>
												{#if !p.piedras.length}
													<p class="rounded-md border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500">La pieza es solo metal. Agrega una piedra si lleva alguna.</p>
												{/if}
												<ul class="space-y-2">
													{#each p.piedras as x, j (x.id)}
														{@const piedraAbierta = piedrasAbiertas.includes(x.id)}
														<li class="rounded-lg border border-slate-200 bg-slate-50/60">
															<div class="flex items-center gap-2 pr-2">
																<button type="button" onclick={() => (piedrasAbiertas = alternarEn(piedrasAbiertas, x.id))} aria-expanded={piedraAbierta} aria-controls="piedra-{x.id}" class="flex min-w-0 flex-1 items-center gap-2 rounded-l-lg px-3 py-2 text-left text-sm hover:bg-slate-100/70 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rj-navy">
																	<span class="min-w-0 flex-1 truncate"><b class="font-semibold text-slate-800">{x.posicion}</b> <span class="text-slate-500">· {[x.cantidad !== "1" ? x.cantidad : "", x.tipo, x.corte, x.tamano].filter(Boolean).join(" · ")}</span></span>
																	{@render chevron(piedraAbierta)}
																</button>
																<button type="button" onclick={() => p.piedras.splice(j, 1)} class="shrink-0 rounded px-2 py-1 text-xs font-medium text-slate-500 hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-red-600" aria-label="Quitar la piedra {j + 1}">Quitar</button>
															</div>
															{#if piedraAbierta}
																<div id="piedra-{x.id}" class="space-y-3 border-t border-slate-200 px-3 pt-3 pb-3">
																	<div>
																		<span class="mb-1 block text-[11px] text-slate-500">Ubicación</span>
																		<div class="flex flex-wrap gap-1" role="radiogroup" aria-label="Ubicación de la piedra {j + 1}">
																			{#each conActual(opciones.posiciones, x.posicion) as pos (pos)}
																				<button type="button" role="radio" aria-checked={x.posicion === pos} class={chip(x.posicion === pos)} onclick={() => (x.posicion = pos)}>{pos}</button>
																			{/each}
																		</div>
																		<div class="mt-1">{@render otra(`posicion-${x.id}`, "posiciones", "Otra ubicación", "Ej. Halo, Hidden halo…", (v) => (x.posicion = v))}</div>
																	</div>
																	<div class="grid grid-cols-2 gap-2">
																		<div>
																			<label class="mb-0.5 block text-[11px] text-slate-500" for="pt-{x.id}">Tipo de piedra</label>
																			<select id="pt-{x.id}" class={input} bind:value={x.tipo}>
																				{#each conActual(opciones.piedras, x.tipo) as tp (tp)}<option>{tp}</option>{/each}
																			</select>
																			<div class="mt-1">{@render otra(`piedra-${x.id}`, "piedras", "Otro tipo", "Ej. Aguamarina", (v) => (x.tipo = v))}</div>
																		</div>
																		<div>
																			<label class="mb-0.5 block text-[11px] text-slate-500" for="pf-{x.id}">Forma</label>
																			<select id="pf-{x.id}" class={input} bind:value={x.corte}>
																				{#each conActual(opciones.formas, x.corte) as c (c)}<option>{c}</option>{/each}
																			</select>
																			<div class="mt-1">{@render otra(`forma-${x.id}`, "formas", "Otra forma", "Ej. Asscher", (v) => (x.corte = v))}</div>
																		</div>
																		<div>
																			<label class="mb-0.5 block text-[11px] text-slate-500" for="ps-{x.id}">Tamaño</label>
																			<input id="ps-{x.id}" class={input} bind:value={x.tamano} placeholder="1 ct o 2 mm" />
																		</div>
																		<div>
																			<label class="mb-0.5 block text-[11px] text-slate-500" for="pc-{x.id}">Cantidad</label>
																			<input id="pc-{x.id}" class={input} bind:value={x.cantidad} placeholder="1" />
																		</div>
																	</div>
																	<div class="{seg} w-56 text-xs" role="radiogroup" aria-label="Origen">
																		<button type="button" role="radio" aria-checked={x.origen === "natural"} class={segBtn(x.origen === "natural")} onclick={() => (x.origen = "natural")}>Natural</button>
																		<button type="button" role="radio" aria-checked={x.origen === "laboratorio"} class={segBtn(x.origen === "laboratorio")} onclick={() => (x.origen = "laboratorio")}>Laboratorio</button>
																	</div>
																</div>
															{/if}
														</li>
													{/each}
												</ul>
												<button
													type="button"
													onclick={() => {
														const nueva = nuevaPiedra(p.piedras.length ? "Laterales" : "Central");
														p.piedras.push(nueva);
														piedrasAbiertas = [...piedrasAbiertas, nueva.id];
													}}
													class="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-semibold text-rj-navy hover:bg-rj-navy-soft focus-visible:outline-2 focus-visible:outline-rj-navy"
												>
													{@render mas()}Agregar piedra
												</button>
											</fieldset>

											<div class="grid gap-3 sm:grid-cols-[auto_1fr] sm:gap-6">
												<div>
													<label class={label} for="f-talla-{p.id}">Talla {#if i === 0 && lead.producto?.talla}{@render etiquetaKommo("Lead")}{/if}</label>
													<div class="flex items-center gap-3">
														<input id="f-talla-{p.id}" class="{input} w-24" bind:value={p.talla} disabled={p.tallaPorConfirmar} placeholder="7" />
														{@render check(p.tallaPorConfirmar, (v) => (p.tallaPorConfirmar = v), "Por confirmar")}
													</div>
												</div>
												<div>
													<label class={label} for="f-grabado-{p.id}">Grabado <span class="font-normal text-slate-400">(opcional)</span></label>
													<input id="f-grabado-{p.id}" class={input} bind:value={p.grabado} placeholder="Ej. 12-20-2018" />
												</div>
											</div>

											<div>
												<label class={label} for="f-notas-{p.id}">Notas para la IA</label>
												<textarea id="f-notas-{p.id}" rows="3" class={input} bind:value={p.notas} placeholder="Detalles que no caben arriba: forma de la banda, estilo, pedidos del cliente…"></textarea>
												<p class="mt-1 text-xs text-slate-500">La IA las convierte en viñetas de la descripción. No hace falta redactarlas bien.</p>
											</div>
										</div>
									{/if}
								</li>
							{/each}
						</ol>
						<button type="button" onclick={agregarPieza} class="inline-flex items-center gap-1.5 rounded-md border border-dashed border-rj-navy/40 px-3 py-2 text-sm font-semibold text-rj-navy hover:bg-rj-navy-soft focus-visible:outline-2 focus-visible:outline-rj-navy">
							{@render mas()}{d.piezas.length ? "Agregar otra pieza" : "Agregar la primera pieza"}
						</button>
						{#if avisoOpciones}<p class="text-xs text-amber-800" aria-live="polite">{avisoOpciones}</p>{/if}
					</div>
				{/snippet}
				{@render seccion("pieza", "Piezas", "Lo que se fabrica. Cada pieza queda como un anillo en la pestaña Orden del lead.", piezas)}

				{#snippet pago()}
					<div class="space-y-5">
						<div class="grid gap-3 sm:grid-cols-2">
							<div>
								<label class={label} for="f-valor">Valor {d.piezas.length > 1 ? "de las piezas" : "de la pieza"} {#if d.valor === lead.presupuesto}{@render etiquetaKommo("Presupuesto")}{/if}</label>
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
								{@render mas()}Agregar depósito
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
							{@render check(d.origen, (v) => (d.origen = v), "Incluir servicio Origen", "Video del proceso de banco de la pieza, entregado 7 a 15 días después.")}
						</div>
					</div>
				{/snippet}
				{@render seccion("entrega", "Entrega", "Una fecha o un rango. Si aún no la sabes, el invoice dirá «por definir».", entrega)}

				{#snippet imagenes()}
					<div class="space-y-3">
						{#if d.piezas.length > 1}
							<p class="text-xs text-slate-500">Toca los números de cada imagen para elegir en qué pieza va. El orden en que las eliges es el orden en el invoice.</p>
						{/if}
						<div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
							{#each galeria as a (a.id)}
								{@const usada = d.piezas.some((p) => p.imagenes.includes(a.id))}
								<div class="overflow-hidden rounded-lg border-2 transition-colors {usada ? 'border-rj-navy' : 'border-transparent'}">
									{#if d.piezas.length === 1}
										{@const p = d.piezas[0]}
										{@const sel = p.imagenes.includes(a.id)}
										<label class="relative block cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-rj-navy">
											<input type="checkbox" checked={sel} onchange={() => alternarImagen(p, a.id)} class="sr-only" aria-label="Usar {a.nombre} en el invoice" />
											<div class="aspect-square bg-slate-100">
												{#if a.url}<img src={a.url} alt="" class="size-full object-cover" />{:else}<span class="grid size-full place-items-center text-[10px] text-slate-400">Cargando…</span>{/if}
											</div>
											<span class="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full text-[11px] font-bold {sel ? 'bg-rj-navy text-white' : 'bg-white/80 text-transparent ring-1 ring-slate-300'}">{sel ? p.imagenes.indexOf(a.id) + 1 : ""}</span>
										</label>
									{:else}
										<div class="aspect-square bg-slate-100">
											{#if a.url}<img src={a.url} alt="" class="size-full object-cover" />{:else}<span class="grid size-full place-items-center text-[10px] text-slate-400">Cargando…</span>{/if}
										</div>
										{#if d.piezas.length}
											<div class="flex flex-wrap gap-1 px-1.5 pt-1" role="group" aria-label="Piezas que usan {a.nombre}">
												{#each d.piezas as p, i (p.id)}
													{@const sel = p.imagenes.includes(a.id)}
													<button type="button" aria-pressed={sel} onclick={() => alternarImagen(p, a.id)} title="{sel ? 'Quitar de' : 'Usar en'} la pieza {i + 1}" class="grid size-6 place-items-center rounded-full text-[11px] font-bold focus-visible:outline-2 focus-visible:outline-rj-navy {sel ? 'bg-rj-navy text-white' : 'text-slate-500 ring-1 ring-slate-300 hover:ring-slate-400'}">{i + 1}</button>
												{/each}
											</div>
										{/if}
									{/if}
									<span class="block truncate px-1.5 py-1 text-[11px] text-slate-600">{a.nombre}</span>
								</div>
							{/each}
							<label class="grid aspect-square cursor-pointer place-items-center rounded-lg border-2 border-dashed border-slate-300 text-center text-xs text-slate-500 transition-colors hover:border-rj-navy hover:text-rj-navy has-focus-visible:outline-2 has-focus-visible:outline-rj-navy">
								<input type="file" accept="image/*" multiple onchange={subir} class="sr-only" />
								<span><svg class="mx-auto mb-1 size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 16V4m0 0-4 4m4-4 4 4M4 20h16" /></svg>{subiendo ? "Subiendo…" : "Subir imagen"}</span>
							</label>
						</div>
						{#if d.piezas.length > 1}
							<div class="flex items-center gap-2 text-xs">
								<label for="f-subir-para" class="text-slate-500">Las que subas van a</label>
								<select id="f-subir-para" class="{input} w-auto py-1 text-xs" value={subirPara ?? d.piezas[0].id} onchange={(e) => (subirPara = Number(e.currentTarget.value))}>
									{#each d.piezas as p, i (p.id)}<option value={p.id}>Pieza {i + 1}{p.tipo ? ` · ${p.tipo}` : ""}</option>{/each}
								</select>
							</div>
						{/if}
						{#if avisoImagenes}<p class="text-xs text-amber-800">{avisoImagenes}</p>{/if}
					</div>
				{/snippet}
				{@render seccion("imagenes", "Imágenes de referencia", "Las imágenes del lead en Kommo. Las que subas se guardan en la pestaña «Imágenes de la pieza» del lead.", imagenes)}

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
											{@render chevron(abierta)}
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
						{#each bloqueantes as b, i (b.msg)}<button type="button" onclick={() => ir(b.sec)} class="font-semibold underline underline-offset-2">{b.msg.replace(/^Falta (agregar )?(el |la |una )?/, "")}</button>{i < bloqueantes.length - 1 ? ", " : ""}{/each}
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
