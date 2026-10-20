<script lang="ts">
	import { draft as d } from "../invoice.svelte";
	import InvoicePreview, { type Editor } from "../InvoicePreview.svelte";
	import { onMount, untrack } from "svelte";
	import { hayServidor } from "../servidor";
	import { BLOQUES, ESPACIADOS, FUENTES, PALETAS, cargarPlantillaServidor, guardarPlantilla, moverBloque, subirPlantilla, normalizar, plantilla as p, plantillaInicial, type BloqueId, type Fuente } from "../plantilla.svelte";

	type Pestana = "bloques" | "estilo" | "marca";
	let pestana: Pestana = $state("bloques");
	let vista: "ajustes" | "preview" = $state("ajustes"); // solo en pantallas angostas
	let sel: BloqueId | null = $state(null);
	let arrastrando: BloqueId | null = $state(null);
	let destino: { id: BloqueId; antes: boolean } | null = $state(null);
	let aviso = $state("");

	// Guardado automático: JSON.stringify lee toda la plantilla, así que cualquier cambio vuelve a guardar.
	// En el navegador al instante; en el servidor (compartido) un momento después de dejar de editar.
	let guardado = $state(true);
	let remoto: "cargando" | "guardando" | "ok" | "error" = $state(hayServidor ? "cargando" : "ok");
	let espera: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		guardado = guardarPlantilla();
		if (untrack(() => remoto) === "cargando") return; // no subir lo local antes de leer lo compartido
		remoto = "guardando";
		clearTimeout(espera);
		espera = setTimeout(() => subirPlantilla().then(() => (remoto = "ok"), () => (remoto = "error")), 800);
	});
	onMount(() => {
		cargarPlantillaServidor().then(() => (remoto = "ok"));
		return () => clearTimeout(espera);
	});

	const indice = (id: BloqueId) => p.bloques.findIndex((b) => b.id === id);

	function soltar() {
		if (arrastrando && destino && destino.id !== arrastrando) {
			const desde = indice(arrastrando);
			let hasta = indice(destino.id) + (destino.antes ? 0 : 1);
			if (desde < hasta) hasta--;
			moverBloque(desde, hasta);
		}
		arrastrando = null;
		destino = null;
	}

	// Arrastre con eventos de puntero (el drag & drop nativo falla sobre botones y en pantallas táctiles).
	// No empieza hasta moverse unos píxeles, así un toque sigue siendo un clic.
	let inicio: { id: BloqueId; x: number; y: number } | null = null;

	function iniciar(e: PointerEvent, id: BloqueId) {
		if (e.button !== 0) return;
		inicio = { id, x: e.clientX, y: e.clientY };
		addEventListener("pointermove", mover);
		addEventListener("pointerup", terminar);
		addEventListener("pointercancel", terminar);
	}

	function mover(e: PointerEvent) {
		if (!inicio) return;
		if (!arrastrando) {
			if (Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) < 6) return;
			arrastrando = inicio.id;
		}
		const bajo = document.elementFromPoint(e.clientX, e.clientY);
		// Cerca del borde de la lista o de la vista previa, se desplaza sola.
		const scroll = bajo?.closest<HTMLElement>("[data-scroll]");
		if (scroll) {
			const r = scroll.getBoundingClientRect();
			if (e.clientY < r.top + 48) scroll.scrollBy(0, -12);
			else if (e.clientY > r.bottom - 48) scroll.scrollBy(0, 12);
		}
		const el = bajo?.closest<HTMLElement>("[data-bloque]");
		if (!el) return;
		const r = el.getBoundingClientRect();
		destino = { id: el.dataset.bloque as BloqueId, antes: e.clientY < r.top + r.height / 2 };
	}

	function terminar(e: PointerEvent) {
		removeEventListener("pointermove", mover);
		removeEventListener("pointerup", terminar);
		removeEventListener("pointercancel", terminar);
		inicio = null;
		if (!arrastrando) return;
		if (e.type === "pointerup") soltar();
		else arrastrando = destino = null;
		// El clic que sigue al soltar no debe seleccionar ni abrir nada.
		const tragar = (c: Event) => (c.stopPropagation(), c.preventDefault());
		addEventListener("click", tragar, { capture: true, once: true });
		setTimeout(() => removeEventListener("click", tragar, { capture: true }));
	}

	function seleccionar(id: BloqueId) {
		sel = sel === id && pestana === "bloques" ? null : id;
		pestana = "bloques";
	}

	const editor: Editor = $derived({ sel, arrastrando, destino, onsel: (id) => ((sel = id), (pestana = "bloques"), (vista = "ajustes")), oniniciar: iniciar });

	function restablecer() {
		if (!confirm("¿Volver al diseño original de Romero Jeweler? Se pierden los cambios de esta pantalla.")) return;
		Object.assign(p, plantillaInicial());
		sel = null;
	}

	function exportar() {
		const url = URL.createObjectURL(new Blob([JSON.stringify(p, null, 2)], { type: "application/json" }));
		const a = Object.assign(document.createElement("a"), { href: url, download: "diseno-invoice.json" });
		a.click();
		URL.revokeObjectURL(url);
	}

	async function importar(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const f = input.files?.[0];
		input.value = "";
		if (!f) return;
		try {
			Object.assign(p, normalizar(JSON.parse(await f.text())));
			aviso = `Diseño importado de ${f.name}.`;
		} catch {
			aviso = `${f.name} no es un diseño válido.`;
		}
	}

	// El logo se reduce antes de guardarlo para que quepa en el almacenamiento del navegador.
	function subirLogo(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const f = input.files?.[0];
		input.value = "";
		if (!f) return;
		const img = new Image();
		img.onload = () => {
			const escala = Math.min(1, 480 / img.width, 160 / img.height);
			const c = Object.assign(document.createElement("canvas"), { width: Math.round(img.width * escala), height: Math.round(img.height * escala) });
			c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
			p.encabezado.logo = c.toDataURL("image/png");
			URL.revokeObjectURL(img.src);
		};
		img.onerror = () => (aviso = `No se pudo leer ${f.name} como imagen.`);
		img.src = URL.createObjectURL(f);
	}

	const COLORES: { k: keyof typeof p.colores; nombre: string; ayuda: string }[] = [
		{ k: "primario", nombre: "Principal", ayuda: "Encabezado, títulos y total" },
		{ k: "acento", nombre: "Acento", ayuda: "Líneas y etiquetas" },
		{ k: "suave", nombre: "Fondo suave", ayuda: "Avisos y términos" },
		{ k: "texto", nombre: "Texto", ayuda: "Cuerpo del documento" },
	];
	const COLUMNAS = [1, 2, 3] as const;
	const TIPOGRAFIAS = [["fuenteTitulos", "Tipografía de títulos"], ["fuenteTexto", "Tipografía del texto"]] as const;
	const paletaActiva = (c: typeof p.colores) => PALETAS.find((x) => (Object.keys(c) as (keyof typeof c)[]).every((k) => x.colores[k].toLowerCase() === c[k].toLowerCase()))?.nombre;

	const input = "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-xs outline-none transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-rj-navy focus:ring-3 focus:ring-rj-navy/15";
	const label = "mb-1 block text-xs font-semibold text-slate-600";
	const seg = "flex rounded-md border border-slate-300 bg-slate-50 p-0.5 text-sm";
	const segBtn = (on: boolean) => `flex-1 rounded px-2.5 py-1 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-rj-navy ${on ? "bg-white text-rj-navy shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800"}`;
	const iconBtn = "grid size-7 shrink-0 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-rj-navy disabled:opacity-30 disabled:hover:bg-transparent";
	const accion = "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-rj-navy";
</script>

<svelte:head>
	<title>Diseño del invoice · Widget Kommo</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#snippet check(checked: boolean, onchange: (v: boolean) => void, texto: string, ayuda = "")}
	<label class="flex cursor-pointer items-start gap-2.5 text-sm">
		<input type="checkbox" {checked} onchange={(e) => onchange(e.currentTarget.checked)} class="mt-0.5 size-4 shrink-0 accent-rj-navy" />
		<span><span class="font-medium text-slate-800">{texto}</span>{#if ayuda}<span class="block text-xs text-slate-500">{ayuda}</span>{/if}</span>
	</label>
{/snippet}

{#snippet ojo(visible: boolean, onclick: () => void, nombre: string)}
	<button type="button" {onclick} class={iconBtn} aria-pressed={!visible} aria-label="{visible ? 'Ocultar' : 'Mostrar'} {nombre}" title={visible ? "Ocultar en el PDF" : "Mostrar en el PDF"}>
		{#if visible}
			<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
		{:else}
			<svg class="size-4 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6A17.4 17.4 0 0 0 2 12s3.6 7 10 7a10.6 10.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
		{/if}
	</button>
{/snippet}

{#snippet fijo(nombre: string, ayuda: string, visible: boolean, alternar: () => void)}
	<li class="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2">
		<svg class="size-4 shrink-0 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
		<button type="button" onclick={() => (pestana = "marca")} class="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-rj-navy">
			<span class="block text-sm font-medium {visible ? 'text-slate-700' : 'text-slate-400 line-through'}">{nombre}</span>
			<span class="block text-[11px] text-slate-500">{ayuda}</span>
		</button>
		{@render ojo(visible, alternar, nombre)}
	</li>
{/snippet}

{#snippet bloques()}
	<p class="mb-3 text-xs text-slate-500">Arrastra los bloques, aquí o en la vista previa, para cambiar el orden. El ojo los oculta del PDF.</p>
	<ul class="space-y-1.5">
		{@render fijo("Encabezado", "Siempre arriba · se edita en Marca", p.encabezado.visible, () => (p.encabezado.visible = !p.encabezado.visible))}
		{#each p.bloques as b, i (b.id)}
			{@const info = BLOQUES[b.id]}
			{@const abierto = sel === b.id}
			{@const linea = destino?.id === b.id && arrastrando !== b.id ? (destino.antes ? "before:-top-1" : "before:-bottom-1") : ""}
			<li
				data-bloque={b.id}
				class="relative rounded-lg border bg-white transition-[border-color,box-shadow,opacity] {abierto ? 'border-rj-navy/50 shadow-sm ring-1 ring-rj-navy/20' : 'border-slate-200 hover:border-slate-300'} {arrastrando === b.id ? 'opacity-40' : ''} {linea ? `before:absolute before:inset-x-1 before:h-[3px] before:rounded-full before:bg-rj-navy ${linea}` : ''}"
			>
				<div class="flex items-center gap-1 py-1.5 pr-1.5 pl-1 select-none" role="presentation" onpointerdown={(e) => (e.pointerType === "mouse" || (e.target as Element).closest("[data-asa]")) && iniciar(e, b.id)}>
					<span data-asa class="grid size-7 shrink-0 cursor-grab touch-none place-items-center text-slate-400" aria-hidden="true">
						<svg class="size-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
					</span>
					<button type="button" onclick={() => seleccionar(b.id)} aria-expanded={abierto} aria-controls="op-{b.id}" class="min-w-0 flex-1 rounded py-1 text-left focus-visible:outline-2 focus-visible:outline-rj-navy">
						<span class="block truncate text-sm font-medium {b.visible ? 'text-slate-800' : 'text-slate-400 line-through'}">{info.nombre}</span>
						{#if b.titulo !== info.titulo}<span class="block truncate text-[11px] text-slate-500">Título: {b.titulo || "sin título"}</span>{/if}
					</button>
					<button type="button" class={iconBtn} disabled={i === 0} onclick={() => moverBloque(i, i - 1)} aria-label="Subir {info.nombre}">
						<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="m18 15-6-6-6 6" /></svg>
					</button>
					<button type="button" class={iconBtn} disabled={i === p.bloques.length - 1} onclick={() => moverBloque(i, i + 1)} aria-label="Bajar {info.nombre}">
						<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
					</button>
					{@render ojo(b.visible, () => (b.visible = !b.visible), info.nombre)}
				</div>
				{#if abierto}
					<div id="op-{b.id}" class="space-y-3 border-t border-slate-100 px-3 pt-3 pb-3.5">
						<div>
							<label class={label} for="t-{b.id}">Título</label>
							<input id="t-{b.id}" class={input} bind:value={b.titulo} placeholder="Sin título" />
							<div class="mt-1 flex flex-wrap justify-between gap-2 text-[11px] text-slate-500">
								<span>{b.id === "imagenes" ? "{pieza} se cambia por «anillo» o «pieza»." : "Déjalo vacío para no mostrar título."}</span>
								{#if b.titulo !== info.titulo}<button type="button" onclick={() => (b.titulo = info.titulo)} class="font-semibold text-rj-navy hover:underline">Restaurar</button>{/if}
							</div>
						</div>
						{#if b.id === "precios"}
							<div>
								<span class={label}>Barra del total a pagar</span>
								<div class="{seg} w-56">
									<button type="button" class={segBtn(p.precios.estiloTotal === "banda")} onclick={() => (p.precios.estiloTotal = "banda")}>Rellena</button>
									<button type="button" class={segBtn(p.precios.estiloTotal === "linea")} onclick={() => (p.precios.estiloTotal = "linea")}>Con líneas</button>
								</div>
							</div>
							{@render check(p.precios.aviso, (v) => (p.precios.aviso = v), "Aviso del enlace de pago", "Incluye la aceptación de términos al pagar.")}
						{:else if b.id === "imagenes"}
							<div>
								<span class={label}>Columnas</span>
								<div class="{seg} w-40">
									{#each COLUMNAS as n (n)}<button type="button" class={segBtn(p.imagenes.columnas === n)} onclick={() => (p.imagenes.columnas = n)}>{n}</button>{/each}
								</div>
							</div>
							{@render check(p.imagenes.nota, (v) => (p.imagenes.nota = v), "Nota de variaciones bajo las imágenes")}
						{:else if b.id !== "datos" && b.id !== "descripcion"}
							<p class="text-xs text-slate-500">El texto de este bloque se edita en Condiciones, dentro de cada invoice.</p>
						{/if}
					</div>
				{/if}
			</li>
		{/each}
		{@render fijo("Pie de página", "Siempre abajo · se edita en Marca", p.pie.visible, () => (p.pie.visible = !p.pie.visible))}
	</ul>
{/snippet}

{#snippet estilo()}
	<div class="space-y-6">
		<div>
			<span class={label}>Paleta</span>
			<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
				{#each PALETAS as pal (pal.nombre)}
					{@const on = paletaActiva(p.colores) === pal.nombre}
					<button type="button" onclick={() => Object.assign(p.colores, pal.colores)} aria-pressed={on} class="rounded-lg border p-2 text-left text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-rj-navy {on ? 'border-rj-navy bg-rj-navy-soft text-rj-navy' : 'border-slate-200 text-slate-600 hover:border-slate-300'}">
						<span class="mb-1.5 flex h-5 overflow-hidden rounded ring-1 ring-black/5" aria-hidden="true">
							<span class="flex-[3]" style:background={pal.colores.primario}></span>
							<span class="flex-1" style:background={pal.colores.acento}></span>
							<span class="flex-1" style:background={pal.colores.suave}></span>
						</span>
						{pal.nombre}
					</button>
				{/each}
			</div>
		</div>

		<div>
			<span class={label}>Colores</span>
			<div class="grid gap-2 sm:grid-cols-2">
				{#each COLORES as c (c.k)}
					<label class="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 p-2 hover:border-slate-300 has-focus-visible:outline-2 has-focus-visible:outline-rj-navy">
						<input type="color" bind:value={p.colores[c.k]} class="size-8 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0" />
						<span class="min-w-0">
							<span class="block text-sm font-medium text-slate-800">{c.nombre} <span class="font-normal text-slate-400 uppercase tabular-nums">{p.colores[c.k]}</span></span>
							<span class="block truncate text-[11px] text-slate-500">{c.ayuda}</span>
						</span>
					</label>
				{/each}
			</div>
		</div>

		{#each TIPOGRAFIAS as [k, nombre] (k)}
			<div>
				<span class={label}>{nombre}</span>
				<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
					{#each Object.entries(FUENTES) as [id, f] (id)}
						<button type="button" onclick={() => (p[k] = id as Fuente)} aria-pressed={p[k] === id} class="rounded-md border px-2 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-rj-navy {p[k] === id ? 'border-rj-navy bg-rj-navy-soft text-rj-navy' : 'border-slate-200 text-slate-700 hover:border-slate-300'}" style:font-family={f.css}>{f.nombre}</button>
					{/each}
				</div>
			</div>
		{/each}

		<div class="grid gap-4">
			<div>
				<span class={label}>Espacio entre bloques</span>
				<div class="{seg} max-w-72">
					{#each Object.keys(ESPACIADOS) as e (e)}<button type="button" class="{segBtn(p.espaciado === e)} capitalize" onclick={() => (p.espaciado = e as typeof p.espaciado)}>{e}</button>{/each}
				</div>
			</div>
			<div>
				<span class={label}>Encabezado</span>
				<div class="{seg} max-w-72">
					<button type="button" class={segBtn(p.encabezado.estilo === "banda")} onclick={() => (p.encabezado.estilo = "banda")}>Banda de color</button>
					<button type="button" class={segBtn(p.encabezado.estilo === "claro")} onclick={() => (p.encabezado.estilo = "claro")}>Claro</button>
				</div>
			</div>
		</div>
	</div>
{/snippet}

{#snippet marca()}
	<div class="space-y-5">
		<fieldset class="space-y-3">
			<legend class="mb-2 text-sm font-bold text-slate-900">Encabezado</legend>
			{@render check(p.encabezado.visible, (v) => (p.encabezado.visible = v), "Mostrar encabezado")}
			<div class="grid gap-3 sm:grid-cols-2">
				<div>
					<label class={label} for="m-nombre">Nombre</label>
					<input id="m-nombre" class={input} bind:value={p.encabezado.nombre} />
				</div>
				<div>
					<label class={label} for="m-lema">Lema <span class="font-normal text-slate-400">(opcional)</span></label>
					<input id="m-lema" class={input} bind:value={p.encabezado.lema} />
				</div>
			</div>
			<div>
				<span class={label}>Logo</span>
				<div class="flex flex-wrap items-center gap-3">
					{#if p.encabezado.logo}
						<div class="grid h-14 w-28 place-items-center rounded-md border border-slate-200 p-1.5" style:background={p.encabezado.estilo === "banda" ? p.colores.primario : "#fff"}>
							<img src={p.encabezado.logo} alt="Logo actual" class="max-h-full max-w-full object-contain" />
						</div>
						<button type="button" onclick={() => (p.encabezado.logo = "")} class="text-sm font-medium text-slate-500 hover:text-red-700">Quitar logo</button>
					{:else}
						<div class="w-28">
							<label class="sr-only" for="m-mono">Monograma</label>
							<input id="m-mono" class="{input} text-center" maxlength="4" bind:value={p.encabezado.monograma} placeholder="RJ" style="font-family: Georgia, serif" />
						</div>
						<span class="text-xs text-slate-400">o</span>
					{/if}
					<label class="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-semibold text-rj-navy ring-1 ring-slate-300 hover:ring-slate-400 has-focus-visible:outline-2 has-focus-visible:outline-rj-navy">
						<input type="file" accept="image/*" onchange={subirLogo} class="sr-only" />
						<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 16V4m0 0-4 4m4-4 4 4M4 20h16" /></svg>
						{p.encabezado.logo ? "Cambiar" : "Subir logo"}
					</label>
				</div>
				<p class="mt-1 text-xs text-slate-500">Sin logo se usa el monograma. Mejor un PNG o SVG con fondo transparente.</p>
			</div>
		</fieldset>

		<fieldset class="space-y-3 border-t border-slate-200 pt-5">
			<legend class="mb-2 text-sm font-bold text-slate-900">Pie de página</legend>
			{@render check(p.pie.visible, (v) => (p.pie.visible = v), "Mostrar pie de página")}
			<div>
				<label class={label} for="m-pie">Texto</label>
				<textarea id="m-pie" rows="2" class={input} bind:value={p.pie.texto}></textarea>
			</div>
			{@render check(p.pie.numero, (v) => (p.pie.numero = v), "Número de factura a la derecha")}
		</fieldset>
	</div>
{/snippet}

<main class="flex h-dvh flex-col overflow-hidden bg-km-canvas p-0 text-slate-800 sm:p-4 lg:p-6 {arrastrando ? 'cursor-grabbing select-none [&_*]:cursor-grabbing' : ''}">
	<div class="mx-auto flex min-h-0 w-full max-w-[1320px] flex-1 flex-col overflow-hidden bg-white shadow-xl sm:rounded-xl">
		<header class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 px-5 py-3 sm:px-6">
			<a href="/kommo" class="grid size-9 shrink-0 place-items-center rounded-md text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-rj-navy" aria-label="Volver al invoice">
				<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
			</a>
			<div class="min-w-0 flex-1">
				<h1 class="text-base leading-tight font-bold text-slate-900">Diseño del invoice</h1>
				<p class="truncate text-xs text-slate-500">Se aplica a todos los invoices. La vista previa usa el borrador abierto.</p>
			</div>
			<p class="hidden items-center gap-1.5 text-xs sm:flex {!guardado || remoto === 'error' ? 'text-red-700' : 'text-slate-500'}" aria-live="polite">
				{#if !guardado}
					No se pudo guardar. Prueba con un logo más liviano.
				{:else if remoto === "error"}
					No se pudo guardar en el servidor; queda en este navegador.
				{:else if remoto === "cargando"}
					Cargando el diseño compartido…
				{:else if remoto === "guardando"}
					Guardando…
				{:else}
					<svg class="size-3.5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>{hayServidor ? "Guardado para todos los asesores" : "Guardado en este navegador"}
				{/if}
			</p>
			<div class="flex items-center gap-1">
				<button type="button" onclick={exportar} class={accion} title="Descargar el diseño como archivo">
					<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 4v12m0 0-4-4m4 4 4-4M4 20h16" /></svg>Exportar
				</button>
				<label class="{accion} cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-rj-navy" title="Cargar un diseño exportado">
					<input type="file" accept="application/json,.json" onchange={importar} class="sr-only" />
					<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 16V4m0 0-4 4m4-4 4 4M4 20h16" /></svg>Importar
				</label>
				<button type="button" onclick={restablecer} class={accion}>Restablecer</button>
			</div>
		</header>

		{#if aviso}
			<p class="flex items-center justify-between gap-3 border-b border-slate-200 bg-rj-navy-soft/60 px-6 py-2 text-sm text-rj-navy" role="status">
				{aviso}
				<button type="button" onclick={() => (aviso = "")} class="text-xs font-semibold hover:underline">Cerrar</button>
			</p>
		{/if}

		<!-- Pestañas solo en pantallas angostas -->
		<div class="flex border-b border-slate-200 lg:hidden" role="tablist">
			{#each [["ajustes", "Ajustes"], ["preview", "Vista previa"]] as [id, txt] (id)}
				<button type="button" role="tab" aria-selected={vista === id} onclick={() => (vista = id as typeof vista)} class="flex-1 py-2.5 text-sm font-semibold {vista === id ? 'text-rj-navy shadow-[inset_0_-2px_0] shadow-rj-navy' : 'text-slate-500'}">{txt}</button>
			{/each}
		</div>

		<div class="flex min-h-0 flex-1">
			<div class="min-h-0 flex-1 flex-col lg:max-w-[440px] lg:border-r lg:border-slate-200 {vista === 'ajustes' ? 'flex' : 'hidden lg:flex'}">
				<div class="flex gap-1 border-b border-slate-200 px-4 pt-3" role="tablist" aria-label="Ajustes del diseño">
					{#each [["bloques", "Bloques"], ["estilo", "Estilo"], ["marca", "Marca"]] as [id, txt] (id)}
						<button type="button" role="tab" aria-selected={pestana === id} onclick={() => (pestana = id as Pestana)} class="-mb-px rounded-t-md border-b-2 px-3 pb-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-rj-navy {pestana === id ? 'border-rj-navy text-rj-navy' : 'border-transparent text-slate-500 hover:text-slate-800'}">{txt}</button>
					{/each}
				</div>
				<div data-scroll class="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5" role="tabpanel">
					{#if pestana === "bloques"}{@render bloques()}{:else if pestana === "estilo"}{@render estilo()}{:else}{@render marca()}{/if}
				</div>
			</div>

			<div data-scroll class="relative min-h-0 flex-1 overflow-y-auto bg-[#e6e8ee] px-4 py-6 sm:px-8 {vista === 'preview' ? '' : 'hidden lg:block'}">
				<p class="mx-auto mb-3 flex max-w-[560px] items-center justify-between text-xs text-slate-500">
					<span class="font-semibold tracking-wide uppercase">Vista previa</span>
					<span>Toca un bloque para ajustarlo o arrástralo</span>
				</p>
				<InvoicePreview {d} {p} {editor} />
			</div>
		</div>
	</div>
</main>
