<script lang="ts">
	import { CAMPOS_ANILLO, CAMPOS_PEDIDO, PEDIDO_EN_KOMMO, campoExtra, type CampoOrden } from "./campos";
	import { agregarCampo, aplicarKommo, cargarBorrador, cargarOpciones, draft as d, fechaLarga, guardarBorrador, money, nuevaPieza, opciones, ordenAKommo, tituloPieza, totales, valorAnillo, type Borrador, type Lead, type Pieza } from "./invoice.svelte";
	import { claveCampo } from "./opciones";
	import OrdenPreview, { type AnilloOrden, type Fila } from "./OrdenPreview.svelte";
	import { ErrorServidor, MAX_ARCHIVO, generarOrden, hayServidor, htmlDelInvoice, imagenesDelLead, paraKommo, subirImagen, traducir, urlImagen, type ImagenKommo, type Kommo } from "./servidor";
	import { onMount, tick, untrack } from "svelte";

	// Orden de producción del lead. Usa el mismo borrador que el invoice: cada pieza es un anillo, con su tabla
	// "Cad Details Ring" y sus imágenes. Aquí se llena lo que el invoice no tiene y se eligen las filas de cada
	// tabla. En Kommo todo queda en la pestaña "Orden" del lead (`kommo`: lo que el widget hace con su API).
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

	// Imágenes del lead (las mismas del invoice) y las URL para mostrarlas.
	let galeria: ImagenKommo[] = $state([]);
	let urls: Record<string, string> = $state({});
	let subiendo = $state(0);
	let avisoImagenes = $state("");
	const mostrar = (uuid: string) => {
		if (!untrack(() => urls[uuid]) && !uuid.startsWith("local-")) urlImagen(uuid).then((u) => (urls[uuid] = u), () => {});
	};
	$effect(() => d.piezas.forEach((p) => p.imagenes.forEach(mostrar)));

	onMount(() => {
		void cargarOpciones();
		const leadActual = untrack(() => lead);
		Promise.all([cargarBorrador(leadActual), kommo?.leerOrden(leadActual.id)]).then(([{ borrador }, enKommo]) => {
			// Lo guardado en la pestaña "Orden" del lead manda: se pudo haber cambiado a mano en Kommo.
			if (enKommo) aplicarKommo(borrador, enKommo);
			Object.assign(d, borrador);
			cargando = false;
		}, (e) => {
			error = `No se pudieron leer los datos del lead: ${e instanceof Error ? e.message : e}`;
			cargando = false;
		});
		if (hayServidor()) imagenesDelLead(leadActual.id).then((lista) => (galeria = lista), () => {});
		return () => clearTimeout(esperaGuardar);
	});

	// ─── Idioma: los nombres de las filas se traducen siempre; los valores, solo si se pide ──────────
	const MESES_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
	const ORDINALES = ["1st", "2nd", "3rd"];
	const fecha = (iso: string) => {
		if (!iso) return "";
		if (d.orden.idioma === "es") return fechaLarga(iso);
		const [y, m, dia] = iso.split("-").map(Number);
		return `${MESES_EN[m - 1]} ${dia}, ${y}`;
	};

	let traducciones: Record<string, string> = $state({});
	const tr = (texto: string) => traducciones[`${d.orden.idioma}|${texto}`] ?? texto;
	// Un valor que es solo cifras, montos o fechas armadas aquí no se manda a traducir.
	const traducible = (v: string) => /[a-záéíóúñ]{3,}/i.test(v) && !/^\$?[\d.,\s]+(USD)?$/.test(v);

	const catalogoAnillo = $derived([...CAMPOS_ANILLO, ...opciones.camposAnillo.map(campoExtra)]);
	const catalogoPedido = $derived([...CAMPOS_PEDIDO, ...opciones.camposPedido.map(campoExtra)]);
	// Un campo creado por un asesor se escribe en un idioma; para el otro se traduce con la IA.
	const nombre = (c: CampoOrden) => (c.clave.startsWith("x_") ? tr(c.en) : c[d.orden.idioma]);
	const campoDe = (catalogo: CampoOrden[], clave: string): CampoOrden => catalogo.find((c) => c.clave === clave) ?? { clave, en: clave, es: clave };

	let t = $derived(totales(d));

	// Lo que sale del invoice para cada fila del pedido (si el asesor no escribió otra cosa).
	function valorPedido(clave: string): string {
		const escrito = d.orden.valores[clave];
		if (escrito) return escrito;
		switch (clave) {
			case "invoice":
				return d.sinCliente ? "" : d.numero;
			case "fecha":
				return fecha(d.emision);
			case "entrega":
				return fecha(d.entregaHasta || d.entregaDesde);
			case "cliente":
				return d.sinCliente ? "" : d.cliente;
			case "anillos":
				return String(d.piezas.length);
			case "total":
				return money(t.total);
			case "video":
				return d.origen ? (d.orden.idioma === "es" ? "sí" : "yes") : "no";
		}
		return escrito ?? "";
	}
	const pago = (i: number) => (d.orden.idioma === "es" ? `Pago ${i + 1}` : `${ORDINALES[i] ?? `${i + 1}th`} Payment`);
	const valorFinal = (v: string) => (d.orden.traducirValores && traducible(v) ? tr(v) : v);

	let filasPedido = $derived(
		d.orden.campos.flatMap((clave): Fila[] =>
			clave === "pagos" ? t.depositos.map((x, i): Fila => [pago(i), money(x.montoCalc)]) : [[nombre(campoDe(catalogoPedido, clave)), valorFinal(valorPedido(clave))]],
		),
	);
	const tituloAnillo = (i: number) => (d.orden.idioma === "es" ? `Detalles CAD · Anillo ${i + 1}` : `Cad Details Ring ${i + 1}`);
	let anillos: AnilloOrden[] = $derived(
		d.piezas.map((p, i) => ({
			id: p.id,
			titulo: tituloAnillo(i),
			filas: p.orden.campos.map((clave): Fila => [nombre(campoDe(catalogoAnillo, clave)), valorFinal(valorAnillo(p, clave))]),
			imagenes: p.imagenes.map((id) => urls[id]).filter(Boolean),
		})),
	);

	// Pide a la IA lo que falte traducir (nombres de campos creados y, si se pidió, valores); queda en memoria.
	let traduciendo: Promise<void> | null = null;
	function pendientesDeTraducir() {
		const textos = new Set<string>();
		for (const c of [...catalogoPedido, ...catalogoAnillo]) if (c.clave.startsWith("x_")) textos.add(c.en);
		if (d.orden.traducirValores) {
			for (const clave of d.orden.campos) if (clave !== "pagos" && traducible(valorPedido(clave))) textos.add(valorPedido(clave));
			for (const p of d.piezas) for (const clave of p.orden.campos) if (traducible(valorAnillo(p, clave))) textos.add(valorAnillo(p, clave));
		}
		return [...textos].filter((x) => !(`${d.orden.idioma}|${x}` in traducciones));
	}
	function traducirPendientes() {
		const faltan = pendientesDeTraducir();
		if (!faltan.length || !hayServidor()) return Promise.resolve();
		const idioma = d.orden.idioma;
		traduciendo = traducir(idioma, faltan).then(
			(r) => faltan.forEach((x, i) => (traducciones[`${idioma}|${x}`] = r[i] ?? x)),
			() => faltan.forEach((x) => (traducciones[`${idioma}|${x}`] = x)),
		);
		return traduciendo;
	}
	let esperaTraducir: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		void JSON.stringify([d.orden, d.piezas.map((p) => p.orden), opciones.camposAnillo, opciones.camposPedido]);
		if (untrack(() => cargando)) return;
		clearTimeout(esperaTraducir);
		esperaTraducir = setTimeout(() => void traducirPendientes(), 700);
	});

	// ─── Filas: quitar, volver a agregar o crear un campo nuevo ───────────────
	let creando: string | null = $state(null); // "pedido" o el id de la pieza
	let nombreNuevo = $state("");
	let avisoCampos = $state("");

	function agregarFila(campos: string[], valor: string, donde: string) {
		if (valor === "__nuevo") {
			creando = donde;
			nombreNuevo = "";
		} else if (valor && !campos.includes(valor)) campos.push(valor);
	}

	// Un campo nuevo de anillo se crea en todos los grupos "*Anillo °N*" de Kommo y queda para elegir en cualquier
	// orden, pero solo se suma a este anillo.
	async function crearCampo(campos: string[], donde: "anillo" | "pedido") {
		const n = nombreNuevo.trim().replace(/\s+/g, " ");
		if (!n) return;
		const clave = claveCampo(n);
		if (!campos.includes(clave)) campos.push(clave);
		creando = null;
		avisoCampos = "";
		try {
			await agregarCampo(donde === "anillo" ? "camposAnillo" : "camposPedido", { clave, nombre: n });
		} catch (e) {
			avisoCampos = `El campo «${n}» quedó solo en esta orden: ${e instanceof Error ? e.message : e}`;
		}
		if (kommo) Promise.resolve(kommo.crearCampo(donde, clave, n)).catch((e) => (avisoCampos = `No se pudo crear «${n}» en Kommo: ${e}`));
	}

	const disponibles = (catalogo: CampoOrden[], campos: string[]) => catalogo.filter((c) => !campos.includes(c.clave));

	// ─── Anillos ──────────────────────────────────────────────────────────────
	let plegados: number[] = $state([]);
	function agregarAnillo() {
		const anterior = d.piezas.at(-1);
		const p = nuevaPieza({}, anterior?.orden.campos);
		d.piezas.push(p);
		if (kommo) Promise.resolve(kommo.asegurarAnillos(d.piezas.length)).catch((e) => (avisoCampos = `No se pudo crear el grupo del anillo ${d.piezas.length} en Kommo: ${e}`));
	}
	function quitarAnillo(i: number) {
		const [p] = d.piezas.splice(i, 1);
		quitado(`Quitaste el anillo ${i + 1} (también del invoice).`, () => d.piezas.splice(i, 0, p));
	}
	function quitarFila(campos: string[], i: number, nombreFila: string) {
		const [clave] = campos.splice(i, 1);
		quitado(`Quitaste ${nombreFila}.`, () => campos.splice(i, 0, clave));
	}

	// Quitar no pregunta: deja deshacerlo unos segundos (una pieza, una piedra, un depósito).
	let deshacer: { texto: string; restaurar: () => void } | null = $state(null);
	let esperaDeshacer: ReturnType<typeof setTimeout> | undefined;
	function quitado(texto: string, restaurar: () => void) {
		clearTimeout(esperaDeshacer);
		deshacer = { texto, restaurar };
		esperaDeshacer = setTimeout(() => (deshacer = null), 8000);
	}
	function hacerDeshacer() {
		deshacer?.restaurar();
		deshacer = null;
		clearTimeout(esperaDeshacer);
	}

	// Imágenes de cada anillo: se eligen de las del lead o se suben (van a Kommo, como en el invoice).
	let eligiendo: number | null = $state(null);
	function alternarImagen(p: Pieza, id: string) {
		const i = p.imagenes.indexOf(id);
		if (i === -1) p.imagenes.push(id);
		else p.imagenes.splice(i, 1);
	}
	async function subir(p: Pieza, e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const archivos = [...(input.files ?? [])];
		input.value = "";
		avisoImagenes = "";
		for (const original of archivos) {
			subiendo++;
			try {
				const f = await paraKommo(original);
				if (f.size > MAX_ARCHIVO) {
					avisoImagenes = `${original.name} no se pudo achicar a ${MAX_ARCHIVO / 1024 / 1024} MB.`;
					continue;
				}
				const campo = kommo ? await kommo.campoImagenLibre(lead.id) : undefined;
				const img = await subirImagen(lead.id, f, campo?.id);
				galeria = [...galeria, img];
				urls[img.uuid] = URL.createObjectURL(f);
				p.imagenes.push(img.uuid);
			} catch (err) {
				avisoImagenes = err instanceof ErrorServidor && err.status === 503 ? "Kommo no está configurado en la app: no se pueden subir imágenes." : `No se pudo subir ${original.name}: ${err instanceof Error ? err.message : err}`;
			} finally {
				subiendo--;
			}
		}
	}

	// ─── Generar ──────────────────────────────────────────────────────────────
	let articulo: HTMLElement | undefined = $state();
	let generando = $state(false);
	let error = $state("");
	let descargado = $state("");
	let avisoKommo = $state("");

	async function generar() {
		generando = true;
		error = descargado = avisoKommo = "";
		try {
			await traducirPendientes();
			await tick();
			const nombreArchivo = `orden-${(d.orden.valores.orden ?? "").trim().replace(/[^\w.-]/g, "") || lead.id}.pdf`;
			// En Kommo: el pedido y cada anillo van a la pestaña "Orden" del lead, y el PDF a su campo archivo.
			let campoPdf: number | undefined;
			if (kommo)
				try {
					campoPdf = (await kommo.guardarOrden(lead.id, ordenAKommo($state.snapshot(d) as Borrador))).pdf;
				} catch (e) {
					avisoKommo = `No se pudieron guardar los datos en la pestaña Orden del lead (${e}).`;
				}
			const r = await generarOrden(await htmlDelInvoice(articulo!), nombreArchivo, lead.id, campoPdf);
			if (r.kommo === "error") avisoKommo = `${avisoKommo} No se pudo guardar el PDF en el lead (${r.detalle || "Kommo no respondió"}). Se descargó igual.`.trim();
			const url = URL.createObjectURL(r.pdf);
			Object.assign(document.createElement("a"), { href: url, download: nombreArchivo }).click();
			setTimeout(() => URL.revokeObjectURL(url), 60_000);
			descargado = nombreArchivo;
		} catch (e) {
			error = e instanceof Error ? e.message : "No se pudo generar la orden";
		} finally {
			generando = false;
		}
	}

	const input = "w-full min-w-0 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-xs outline-none transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-rj-navy focus:ring-3 focus:ring-rj-navy/15";
	const seg = "flex rounded-md border border-slate-300 bg-slate-50 p-0.5 text-sm";
	const segBtn = (on: boolean) => `flex-1 rounded px-2.5 py-1 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-rj-navy ${on ? "bg-white text-rj-navy shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800"}`;
	const btnX = "grid size-7 shrink-0 place-items-center rounded text-slate-400 hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-red-600";
</script>

<svelte:window onkeydown={(e) => flotante && e.key === "Escape" && !generando && !creando && onclose?.()} />

{#snippet x()}
	<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
{/snippet}

{#snippet mas()}
	<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
{/snippet}

<!-- Fila editable: el nombre en el idioma de la orden, el valor (lo del invoice como sugerencia) y la x para quitarla. -->
{#snippet fila(c: CampoOrden, valor: string, sugerido: string, escribir: (v: string) => void, quitar: () => void, soloLectura = false)}
	<li class="grid grid-cols-[8.5rem_1fr_auto] items-center gap-2">
		<span class="flex min-w-0 flex-col text-xs font-semibold text-slate-600" title={nombre(c)}>
			<span class="truncate">{nombre(c)}</span>
			{#if sugerido && !valor}<span class="w-fit rounded bg-sky-50 px-1 text-[10px] font-semibold text-sky-700 ring-1 ring-sky-200">del invoice</span>{/if}
		</span>
		{#if soloLectura}
			<p class="truncate rounded-md bg-slate-100 px-2.5 py-1.5 text-sm text-slate-600">{sugerido || "—"}</p>
		{:else}
			<input class="{input} placeholder:text-slate-600" value={valor} placeholder={sugerido} oninput={(e) => escribir(e.currentTarget.value)} aria-label={nombre(c)} />
		{/if}
		<button type="button" onclick={quitar} class={btnX} aria-label="Quitar {nombre(c)} de la orden" title="Quitar de esta orden">{@render x()}</button>
	</li>
{/snippet}

<!-- "+ Agregar otro campo": uno ya configurado, o uno nuevo para todos los anillos (o para el pedido). -->
{#snippet agregar(catalogo: CampoOrden[], campos: string[], donde: string, tipo: "anillo" | "pedido")}
	{#if creando === donde}
		<form class="mt-2 flex flex-wrap items-center gap-1.5" onsubmit={(e) => (e.preventDefault(), crearCampo(campos, tipo))}>
			<!-- svelte-ignore a11y_autofocus -->
			<input class="{input} w-48 flex-1" bind:value={nombreNuevo} placeholder="Ej. Center Stones" aria-label="Nombre del campo nuevo" onkeydown={(e) => e.key === "Escape" && (e.stopPropagation(), (creando = null))} autofocus />
			<button type="submit" disabled={!nombreNuevo.trim()} class="rounded-md bg-rj-navy px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#262c66] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rj-navy disabled:opacity-50">Crear</button>
			<button type="button" onclick={() => (creando = null)} class="rounded-md px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100">Cancelar</button>
			<p class="basis-full text-[11px] text-slate-500">{tipo === "anillo" ? "Se crea en todos los anillos (en Kommo también) y queda para elegir en cualquier orden." : "Se crea en la pestaña Orden del lead y queda para elegir en cualquier orden."}</p>
		</form>
	{:else}
		<label class="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-rj-navy">
			{@render mas()}
			<span class="sr-only">Agregar otro campo</span>
			<select class="rounded-md border border-dashed border-rj-navy/40 bg-white px-2 py-1 text-xs font-semibold text-rj-navy hover:bg-rj-navy-soft focus-visible:outline-2 focus-visible:outline-rj-navy" value="" onchange={(e) => (agregarFila(campos, e.currentTarget.value, donde), (e.currentTarget.value = ""))}>
				<option value="" disabled>Agregar otro campo</option>
				{#each disponibles(catalogo, campos) as c (c.clave)}<option value={c.clave}>{nombre(c)}</option>{/each}
				<option value="__nuevo">+ Crear campo nuevo…</option>
			</select>
		</label>
	{/if}
{/snippet}

<main class="flex flex-col overflow-hidden p-0 text-slate-800 sm:p-4 lg:p-6 {flotante ? 'fixed inset-0 bg-[#0b0f2a]/50' : 'h-dvh bg-km-canvas'}" role={flotante ? "dialog" : undefined} aria-modal={flotante || undefined} aria-label="Orden de producción">
	<div class="relative mx-auto flex min-h-0 w-full max-w-[1320px] flex-1 flex-col overflow-hidden bg-white shadow-xl sm:rounded-xl">
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
			<div class="min-h-0 w-full overflow-y-auto px-5 py-5 sm:px-7 lg:max-w-[520px] lg:border-r lg:border-slate-200">
				<div class="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
					<div>
						<span class="mb-1 block text-xs font-semibold text-slate-600">Idioma de la orden</span>
						<div class="{seg} w-48">
							<button type="button" class={segBtn(d.orden.idioma === "en")} onclick={() => (d.orden.idioma = "en")}>English</button>
							<button type="button" class={segBtn(d.orden.idioma === "es")} onclick={() => (d.orden.idioma = "es")}>Español</button>
						</div>
					</div>
					<label class="flex cursor-pointer items-start gap-2 pt-4 text-sm">
						<input type="checkbox" bind:checked={d.orden.traducirValores} class="mt-0.5 size-4 shrink-0 accent-rj-navy" />
						<span><span class="font-medium text-slate-800">Traducir también los valores</span><span class="block text-xs text-slate-500">Si no, solo se traducen los nombres de los campos.</span></span>
					</label>
				</div>
				<p class="mb-5 rounded-md bg-rj-gold-soft/70 px-3 py-2 text-xs text-[#6f5530]">
					Lo marcado <b>del invoice</b> ya está lleno; escribe encima solo si la orden debe decir otra cosa. Al generar, todo queda en la pestaña <b>Orden</b> del lead.
				</p>

				<!-- Order Details -->
				<section class="rounded-lg border border-slate-200 p-4">
					<h2 class="mb-3 text-[15px] font-bold text-slate-900">{d.orden.idioma === "es" ? "Detalles de la orden" : "Order Details"}</h2>
					<ul class="space-y-2">
						{#each d.orden.campos as clave, i (clave)}
							{@const c = campoDe(catalogoPedido, clave)}
							{@const quitar = () => quitarFila(d.orden.campos, i, nombre(c))}
							{#if clave === "pagos"}
								{@render fila(c, "", t.depositos.map((x, j) => `${pago(j)}: ${money(x.montoCalc)}`).join(" · "), () => {}, quitar, true)}
							{:else}
								{@render fila(c, d.orden.valores[clave] ?? "", PEDIDO_EN_KOMMO.includes(clave) || clave.startsWith("x_") ? "" : valorPedido(clave), (v) => (d.orden.valores[clave] = v), quitar)}
							{/if}
						{/each}
					</ul>
					{@render agregar(catalogoPedido, d.orden.campos, "pedido", "pedido")}
				</section>

				<!-- Cad Details Ring N -->
				{#each d.piezas as p, i (p.id)}
					{@const abierto = !plegados.includes(p.id)}
					<section class="mt-4 rounded-lg border border-slate-200">
						<div class="flex items-center gap-2 pr-2">
							<button type="button" onclick={() => (plegados = abierto ? [...plegados, p.id] : plegados.filter((x) => x !== p.id))} aria-expanded={abierto} aria-controls="anillo-{p.id}" class="flex min-w-0 flex-1 items-center gap-3 rounded-l-lg px-4 py-3 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rj-navy">
								<span class="min-w-0 flex-1">
									<span class="block text-[15px] font-bold text-slate-900">{tituloAnillo(i)}</span>
									<span class="block truncate text-xs text-slate-500">{tituloPieza(p)}</span>
								</span>
								<svg class="size-4 shrink-0 text-slate-400 transition-transform {abierto ? 'rotate-180' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
							</button>
							<button type="button" onclick={() => quitarAnillo(i)} class="rounded px-2 py-1 text-xs font-medium text-slate-500 hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-red-600" aria-label="Quitar el anillo {i + 1}">Quitar</button>
						</div>
						{#if abierto}
							<div id="anillo-{p.id}" class="border-t border-slate-100 px-4 pt-3 pb-4">
								<ul class="space-y-2">
									{#each p.orden.campos as clave, j (clave)}
										{@render fila(campoDe(catalogoAnillo, clave), p.orden.valores[clave] ?? "", ["tipo", "size", "metal", "grabado", "notas", "halo", "central"].includes(clave) ? valorAnillo({ ...p, orden: { ...p.orden, valores: {} } }, clave) : "", (v) => (p.orden.valores[clave] = v), () => quitarFila(p.orden.campos, j, nombre(campoDe(catalogoAnillo, clave))))}
									{/each}
								</ul>
								{@render agregar(catalogoAnillo, p.orden.campos, String(p.id), "anillo")}

								<div class="mt-4">
									<span class="mb-1.5 block text-xs font-semibold text-slate-600">Imágenes de este anillo</span>
									<div class="grid grid-cols-4 gap-2">
										{#each p.imagenes as id (id)}
											<div class="group relative aspect-square overflow-hidden rounded-md bg-slate-100">
												{#if urls[id]}<img src={urls[id]} alt="" class="size-full object-cover" />{/if}
												<button type="button" onclick={() => alternarImagen(p, id)} class="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-white/90 text-slate-600 shadow hover:text-red-700 focus-visible:outline-2 focus-visible:outline-red-600" aria-label="Quitar la imagen de este anillo">{@render x()}</button>
											</div>
										{/each}
										<button type="button" onclick={() => {
											eligiendo = eligiendo === p.id ? null : p.id;
											galeria.forEach((a) => mostrar(a.uuid));
										}} aria-expanded={eligiendo === p.id} class="grid aspect-square place-items-center rounded-md border-2 border-dashed border-slate-300 text-center text-[11px] text-slate-500 hover:border-rj-navy hover:text-rj-navy focus-visible:outline-2 focus-visible:outline-rj-navy">
											<span>{@render mas()}<span class="mt-0.5 block">Agregar otra imagen</span></span>
										</button>
									</div>
									{#if eligiendo === p.id}
										<div class="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2">
											<p class="mb-1.5 text-[11px] text-slate-500">Elige de las imágenes del lead o sube una nueva.</p>
											<div class="grid grid-cols-5 gap-1.5">
												{#each galeria as a (a.uuid)}
													{@const sel = p.imagenes.includes(a.uuid)}
													<button type="button" aria-pressed={sel} onclick={() => (mostrar(a.uuid), alternarImagen(p, a.uuid))} title={a.nombre} class="aspect-square overflow-hidden rounded border-2 focus-visible:outline-2 focus-visible:outline-rj-navy {sel ? 'border-rj-navy' : 'border-transparent hover:border-slate-300'}">
														{#if urls[a.uuid]}<img src={urls[a.uuid]} alt={a.nombre} class="size-full object-cover" />{:else}<span class="grid size-full place-items-center p-0.5 text-[9px] break-all text-slate-400">{a.nombre}</span>{/if}
													</button>
												{/each}
												<label class="grid aspect-square cursor-pointer place-items-center rounded border-2 border-dashed border-slate-300 text-[10px] text-slate-500 hover:border-rj-navy hover:text-rj-navy has-focus-visible:outline-2 has-focus-visible:outline-rj-navy">
													<input type="file" accept="image/*" multiple onchange={(e) => subir(p, e)} class="sr-only" />
													{subiendo ? "Subiendo…" : "Subir"}
												</label>
											</div>
										</div>
									{/if}
								</div>
							</div>
						{/if}
					</section>
				{/each}

				<button type="button" onclick={agregarAnillo} class="mt-4 inline-flex items-center gap-1.5 rounded-md border border-dashed border-rj-navy/40 px-3 py-2 text-sm font-semibold text-rj-navy hover:bg-rj-navy-soft focus-visible:outline-2 focus-visible:outline-rj-navy">
					{@render mas()}Agregar otro anillo
				</button>
				{#if avisoCampos}<p class="mt-2 text-xs text-amber-800">{avisoCampos}</p>{/if}
				{#if avisoImagenes}<p class="mt-2 text-xs text-amber-800">{avisoImagenes}</p>{/if}
			</div>

			<div class="hidden min-h-0 flex-1 overflow-y-auto bg-[#e6e8ee] px-4 py-6 sm:px-8 lg:block">
				<p class="mx-auto mb-3 max-w-[560px] text-xs font-semibold tracking-wide text-slate-500 uppercase">Vista previa</p>
				<OrdenPreview titulo={d.orden.idioma === "es" ? "Detalles de la orden" : "Order Details"} pedido={filasPedido} {anillos} bind:elemento={articulo} />
			</div>
		</div>

		{#if deshacer}
			<div class="pointer-events-none absolute inset-x-0 bottom-16 z-20 flex justify-center px-4" aria-live="polite">
				<p class="pointer-events-auto flex items-center gap-3 rounded-lg bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg">
					{deshacer.texto}
					<button type="button" onclick={hacerDeshacer} class="rounded px-1.5 py-0.5 font-semibold text-rj-gold hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-rj-gold">Deshacer</button>
				</p>
			</div>
		{/if}

		<footer class="flex flex-wrap items-center gap-3 border-t border-slate-200 bg-white px-5 py-3 sm:px-6">
			<p class="min-w-0 flex-1 text-sm" aria-live="polite">
				{#if error}<span class="text-red-700"><b>No se generó la orden.</b> {error}</span>
				{:else if descargado}<span class="text-emerald-700">{kommo && !avisoKommo ? `${descargado} guardado en el lead y descargado` : `Descargaste ${descargado}`}</span>
					{#if avisoKommo}<span class="block text-xs text-amber-700">{avisoKommo}</span>{/if}
				{:else if !d.piezas.length && !cargando}<span class="text-amber-700">La orden no tiene anillos: agrega el primero.</span>
				{:else if !hayServidor()}<span class="text-amber-700">Falta configurar el servidor del widget.</span>{/if}
			</p>
			<button type="button" onclick={generar} disabled={generando || cargando || !hayServidor()} class="inline-flex items-center gap-2 rounded-md bg-rj-navy px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#262c66] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rj-navy disabled:cursor-wait disabled:opacity-70">
				{generando ? "Generando…" : "Generar orden de producción"}
			</button>
		</footer>
	</div>
</main>
