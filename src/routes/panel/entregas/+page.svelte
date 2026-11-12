<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { fly } from 'svelte/transition';
	import { invalidateAll } from '$app/navigation';
	import type { PageProps } from './$types';

	type Pieza = PageProps['data']['resumen']['sinFecha'][number];

	let { data }: PageProps = $props();
	const r = $derived(data.resumen);

	// La regla: un tramo del mismo ancho por rango (no es una escala proporcional: lo cercano se ve más grande); dentro del
	// tramo, la pieza va en su día y los extremos se recortan.
	const TRAMOS: Record<string, { corto: string; desde: number; hasta: number }> = {
		atrasadas: { corto: 'Atrasadas', desde: -30, hasta: -1 },
		semana: { corto: '0–7 días', desde: 0, hasta: 7 },
		mes: { corto: '8–30 días', desde: 8, hasta: 30 },
		'dos-meses': { corto: '31–60 días', desde: 31, hasta: 60 },
		'tres-meses': { corto: '61–90 días', desde: 61, hasta: 90 },
		despues: { corto: '+90 días', desde: 91, hasta: 180 }
	};
	const MARCAS = ['Hoy', '7 d', '30 d', '60 d', '90 d'];
	const PILA = 5; // rombos apilados como máximo; el resto se cuenta ("+3")

	// Filtro por asesor: todo (totales, regla y listas) sale de las piezas filtradas.
	const asesores = $derived([...new Set([...r.rangos.flatMap((x) => x.piezas), ...r.sinFecha].map((p) => p.responsable).filter(Boolean))].sort());
	let asesor = $state('');
	const de = (ps: Pieza[]) => (asesor ? ps.filter((p) => p.responsable === asesor) : ps);
	const rangos = $derived(r.rangos.map((x) => ({ ...x, piezas: de(x.piezas) })));
	const sinFecha = $derived(de(r.sinFecha));
	const enRiesgo = $derived(rangos.flatMap((x) => x.piezas).filter((p) => p.riesgo));
	const enCurso = $derived(rangos.reduce((n, x) => n + x.piezas.length, 0));
	const atrasadas = $derived(rangos[0].piezas.length);

	const regla = $derived.by(() => {
		const pila = new Map<number, number>();
		const gemas: { p: Pieza; x: number; alto: number; clave: string }[] = [];
		rangos.forEach((rango, i) =>
			rango.piezas.forEach((p) => {
				const t = TRAMOS[rango.clave];
				const dentro = Math.min(1, Math.max(0, (p.dias! - t.desde) / Math.max(1, t.hasta - t.desde)));
				const x = ((i + 0.1 + dentro * 0.8) / rangos.length) * 100;
				const celda = Math.round(x / 1.6); // las que caen casi en el mismo punto se apilan
				const alto = pila.get(celda) ?? 0;
				pila.set(celda, alto + 1);
				if (alto < PILA) gemas.push({ p, x: celda * 1.6, alto, clave: rango.clave });
			})
		);
		const sobran = [...pila].filter(([, n]) => n > PILA).map(([celda, n]) => ({ x: celda * 1.6, n: n - PILA }));
		return { gemas, sobran };
	});

	const inicial = () => (atrasadas ? 'atrasadas' : enRiesgo.length ? 'riesgo' : (rangos.find((x) => x.piezas.length)?.clave ?? 'semana'));
	let elegido = $state<string | null>(null);
	const seleccion = $derived(elegido ?? inicial());
	const lista = $derived(seleccion === 'sin-fecha' ? sinFecha : seleccion === 'riesgo' ? enRiesgo : (rangos.find((x) => x.clave === seleccion)?.piezas ?? []));
	const titulo = $derived(seleccion === 'sin-fecha' ? 'Sin fecha de entrega' : seleccion === 'riesgo' ? 'En riesgo' : TRAMOS[seleccion].corto);

	// Tocar un rombo no saca del panel: elige su rango y señala la pieza en la lista.
	let marcada = $state<number | null>(null);
	async function senalar(clave: string, id: number) {
		elegido = clave;
		marcada = id;
		await tick();
		document.getElementById(`p-${id}`)?.scrollIntoView({ block: 'nearest', behavior: quieto ? 'auto' : 'smooth' });
	}

	const anio = $derived(r.hoy.slice(0, 4));
	const fecha = (dia: string) =>
		new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', ...(dia.slice(0, 4) !== anio && { year: 'numeric' }), timeZone: 'UTC' }).format(new Date(`${dia}T00:00:00Z`));
	const cuando = (dias: number) => (dias === 0 ? 'Hoy' : dias === 1 ? 'Mañana' : dias === -1 ? 'Ayer' : dias > 0 ? `En ${dias} días` : `Hace ${-dias} días`);
	const piezas = (n: number) => `${n} ${n === 1 ? 'pieza' : 'piezas'}`;

	// Se recarga sola (el servidor recuerda Kommo 2 minutos) y dice de cuándo son los datos.
	let ahora = $state(Date.now());
	let quieto = $state(false);
	const hora = $derived(new Intl.DateTimeFormat('es', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }).format(r.actualizado));
	const hace = $derived(Math.max(0, Math.floor((ahora - r.actualizado) / 60_000)));
	onMount(() => {
		quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
		const reloj = setInterval(() => (ahora = Date.now()), 20_000);
		const recarga = setInterval(() => invalidateAll(), 120_000);
		return () => (clearInterval(reloj), clearInterval(recarga));
	});
</script>

<svelte:head>
	<title>Entregas estimadas</title>
	<meta name="robots" content="noindex" />
	<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,500;6..96,600&family=IBM+Plex+Mono:wght@400;500&display=swap" />
</svelte:head>

<main class="panel">
	<header class="cabecera">
		<div>
			<h1>Entregas estimadas</h1>
			<p class="sub">
				Fechas aproximadas, sujetas a cambio · {piezas(enCurso)} en curso{#if enCurso}{' · '}<span class:alerta={atrasadas}>{Math.round((atrasadas / enCurso) * 100)} % atrasadas</span>{/if}
			</p>
		</div>
		<div class="controles">
			{#if asesores.length > 1}
				<label class="asesor">
					<span class="sr-only">Asesor</span>
					<select bind:value={asesor} onchange={() => ((elegido = null), (marcada = null))}>
						<option value="">Todos los asesores</option>
						{#each asesores as a (a)}<option value={a}>{a}</option>{/each}
					</select>
				</label>
			{/if}
			<p class="estado" title="Se actualiza sola cada 2 minutos">
				<span class="pulso" aria-hidden="true"></span>
				Actualizado {hace < 1 ? `a las ${hora}` : `hace ${hace} min`}
			</p>
		</div>
	</header>

	{#if enRiesgo.length || sinFecha.length}
		<div class="avisos">
			{#if enRiesgo.length}
				<button type="button" class="aviso riesgo" aria-pressed={seleccion === 'riesgo'} onclick={() => (elegido = 'riesgo')}>
					<span class="cifra-aviso">{enRiesgo.length}</span>
					<span><strong>En riesgo</strong> · se entregan en {r.diasRiesgo} días o menos y siguen en diseño, aprobación, espera o impresión</span>
				</button>
			{/if}
			{#if sinFecha.length}
				<button type="button" class="aviso sin-fecha" aria-pressed={seleccion === 'sin-fecha'} onclick={() => (elegido = 'sin-fecha')}>
					<span class="cifra-aviso">{sinFecha.length}</span>
					<span><strong>Sin fecha</strong> · en curso sin fecha de entrega</span>
				</button>
			{/if}
		</div>
	{/if}

	<section class="calibre" aria-label="Piezas por fecha de entrega">
		<div class="regla" title="Cada tramo tiene el mismo ancho; dentro de él, las piezas van por día">
			{#each MARCAS as m, i (m)}
				<span class="marca" class:hoy={i === 0} style="left: {((i + 1) / rangos.length) * 100}%">
					<span class="etiqueta">{m}</span>
				</span>
			{/each}
			{#each regla.gemas as g, i (g.p.id)}
				<button
					type="button"
					tabindex="-1"
					class="gema {g.clave}"
					class:en-riesgo={g.p.riesgo}
					class:apagada={!g.p.riesgo && (seleccion === 'riesgo' || g.clave !== seleccion)}
					style="left: {g.x}%; --alto: {g.alto}; --i: {Math.min(i, 40)}"
					title="{g.p.nombre} · {fecha(g.p.fecha!)} · {cuando(g.p.dias!)}"
					aria-hidden="true"
					onclick={() => senalar(g.clave, g.p.id)}
				></button>
			{/each}
			{#each regla.sobran as s (s.x)}
				<span class="sobran" style="left: {s.x}%">+{s.n}</span>
			{/each}
		</div>
		<p class="leyenda" aria-hidden="true">
			<span><i class="punto atrasadas"></i>Atrasada</span>
			<span><i class="punto en-riesgo"></i>En riesgo</span>
			<span><i class="punto"></i>A tiempo</span>
		</p>

		<div class="tramos" role="group" aria-label="Rango de fechas">
			{#each rangos as rango (rango.clave)}
				<button type="button" class="tramo {rango.clave}" aria-pressed={seleccion === rango.clave} onclick={() => (elegido = rango.clave)}>
					<span class="cifra">{rango.piezas.length}</span>
					<span class="nombre">{TRAMOS[rango.clave].corto}</span>
				</button>
			{/each}
		</div>
	</section>

	<section class="lista" aria-live="polite">
		<h2>{titulo} <span>· {piezas(lista.length)}</span></h2>
		{#key `${seleccion}|${asesor}`}
			{#if lista.length}
				<ul>
					{#each lista as p, i (p.id)}
						<li id="p-{p.id}" class:marcada={marcada === p.id} in:fly={{ y: 6, duration: quieto ? 0 : 220, delay: quieto ? 0 : Math.min(i, 12) * 22 }}>
							<div class="pieza">
								<a href="{data.kommo}/leads/detail/{p.id}" target="_blank" rel="noopener">
									{p.nombre}<span class="salir" aria-hidden="true">↗</span>
								</a>
								{#if p.orden}<span class="orden">#{p.orden.replace(/^#/, '')}</span>{/if}
								{#if p.riesgo && seleccion !== 'riesgo'}<span class="etiqueta-riesgo">En riesgo</span>{/if}
								<p class="detalle">
									{p.etapa || 'Sin etapa'}{#if p.fecha}{' · '}<span class="mono">{fecha(p.fecha)}</span>{/if}{#if p.responsable && !asesor}{' · '}{p.responsable}{/if}
								</p>
							</div>
							{#if p.dias !== null}
								<span class="cuando mono" class:tarde={p.dias < 0} class:pronto={p.dias >= 0 && p.dias <= 7}>{cuando(p.dias)}</span>
							{:else}
								<span class="cuando mono falta">Poner fecha</span>
							{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="vacio">Ninguna pieza en este rango.</p>
			{/if}
		{/key}
	</section>
</main>

<style>
	.panel {
		--tinta: #1c2150;
		--platino: #f4f5f9;
		--linea: #dde0ea;
		--oro: #b08d57;
		--oro-hondo: #7a5a22;
		--granate: #a3213a;
		--suave: #5b6178;
		--ambar: #c98a1c;
		--ambar-hondo: #85520a;
		--ambar-suave: #fdf4e3;
		--mono: 'IBM Plex Mono', ui-monospace, monospace;
		--display: 'Bodoni Moda', 'Didot', Georgia, serif;
		min-height: 100vh;
		background: #fff;
		color: var(--tinta);
		padding: 18px 18px 24px;
		font-size: 13px;
	}
	.mono {
		font-family: var(--mono);
	}

	.cabecera {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 6px 16px;
		margin-bottom: 18px;
	}
	h1 {
		font-family: var(--display);
		font-weight: 600;
		font-size: 24px;
		line-height: 1;
		letter-spacing: -0.01em;
	}
	.sub {
		margin-top: 6px;
		color: var(--suave);
		font-size: 12px;
	}
	.alerta {
		color: var(--granate);
		font-weight: 600;
	}
	.controles {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 14px;
	}
	.asesor select {
		padding: 4px 26px 4px 10px;
		border: 1px solid var(--linea);
		border-radius: 8px;
		background: #fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%235b6178' stroke-width='1.5'/%3E%3C/svg%3E") no-repeat right 9px center;
		appearance: none;
		font-size: 12px;
		color: var(--tinta);
		cursor: pointer;
	}
	.estado {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--suave);
		font: 11px var(--mono);
	}
	.pulso {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #2f8a5b;
		animation: pulso 2.4s ease-in-out infinite;
	}

	/* Avisos: lo que hay que mover hoy. En riesgo pesa más que sin fecha. */
	.avisos {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 8px;
		margin-bottom: 12px;
	}
	.aviso {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		border-radius: 10px;
		font-size: 12px;
		line-height: 1.35;
		text-align: left;
		cursor: pointer;
		transition: background 0.15s;
	}
	.aviso.riesgo {
		border: 1px solid var(--ambar);
		background: var(--ambar-suave);
		color: var(--ambar-hondo);
	}
	.aviso.riesgo[aria-pressed='true'] {
		box-shadow: inset 0 0 0 1px var(--ambar);
	}
	.aviso.sin-fecha {
		border: 1px dashed #b9bdcc;
		color: var(--suave);
	}
	.aviso.sin-fecha[aria-pressed='true'] {
		border-style: solid;
		background: var(--platino);
	}
	.cifra-aviso {
		font-family: var(--display);
		font-size: 24px;
		font-weight: 500;
		line-height: 1;
	}

	/* El calibre: la regla con las piezas engastadas y, debajo, los mismos tramos como selector. */
	.calibre {
		border: 1px solid var(--linea);
		border-radius: 14px;
		background: var(--platino);
		overflow: hidden;
	}
	.regla {
		position: relative;
		height: 82px;
		margin: 0 4px;
		/* La zona de atrasadas teñida (el primer sexto). */
		background: linear-gradient(90deg, rgb(163 33 58 / 0.06) calc(100% / 6), transparent calc(100% / 6));
	}
	.marca {
		position: absolute;
		bottom: 0;
		top: 22px;
		width: 1px;
		background: var(--linea);
	}
	.marca.hoy {
		top: 14px;
		width: 2px;
		margin-left: -0.5px;
		background: var(--tinta);
	}
	.etiqueta {
		position: absolute;
		top: -16px;
		left: 50%;
		transform: translateX(-50%);
		white-space: nowrap;
		font: 10px var(--mono);
		color: var(--suave);
	}
	.hoy .etiqueta {
		top: -14px;
		color: var(--tinta);
		font-weight: 500;
	}
	.gema {
		position: absolute;
		bottom: calc(10px + var(--alto) * 11px);
		width: 9px;
		height: 9px;
		margin-left: -4.5px;
		padding: 0;
		cursor: pointer;
		background: var(--oro);
		transform: rotate(45deg);
		border-radius: 1.5px;
		box-shadow: 0 0 0 1.5px #fff;
		animation: engaste 420ms cubic-bezier(0.2, 0.8, 0.3, 1.3) both;
		animation-delay: calc(var(--i) * 18ms + 120ms);
		transition: opacity 0.2s, scale 0.15s;
	}
	.gema.atrasadas {
		background: var(--granate);
	}
	.gema.en-riesgo {
		background: var(--ambar);
	}
	.gema.apagada {
		opacity: 0.45;
	}
	.sobran {
		position: absolute;
		bottom: calc(10px + 5 * 11px);
		transform: translateX(-50%);
		font: 9px var(--mono);
		color: var(--suave);
	}
	.leyenda {
		display: flex;
		justify-content: flex-end;
		gap: 12px;
		padding: 0 10px 6px;
		font-size: 10px;
		color: var(--suave);
	}
	.punto {
		display: inline-block;
		width: 7px;
		height: 7px;
		margin-right: 5px;
		background: var(--oro);
		transform: rotate(45deg);
	}
	.punto.atrasadas {
		background: var(--granate);
	}
	.punto.en-riesgo {
		background: var(--ambar);
	}
	.gema:hover,
	.gema:focus-visible {
		opacity: 1;
		scale: 1.5;
		z-index: 1;
	}

	.tramos {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		border-top: 1px solid var(--linea);
		background: #fff;
	}
	.tramo {
		display: grid;
		gap: 2px;
		justify-items: center;
		padding: 10px 2px 11px;
		border-top: 2px solid transparent;
		margin-top: -1px;
		cursor: pointer;
		transition: background 0.15s;
	}
	.tramo + .tramo {
		border-left: 1px solid var(--linea);
	}
	.tramo:hover {
		background: var(--platino);
	}
	.tramo[aria-pressed='true'] {
		border-top-color: var(--oro);
		background: var(--platino);
	}
	.tramo.atrasadas[aria-pressed='true'] {
		border-top-color: var(--granate);
	}
	.cifra {
		font-family: var(--display);
		font-size: 26px;
		font-weight: 500;
		line-height: 1.05;
		font-variant-numeric: lining-nums;
	}
	.atrasadas .cifra {
		color: var(--granate);
	}
	.nombre {
		font-size: 11px;
		color: var(--suave);
		white-space: nowrap;
	}

	.lista {
		margin-top: 18px;
	}
	h2 {
		font-family: var(--display);
		font-size: 17px;
		font-weight: 600;
		margin-bottom: 4px;
	}
	h2 span {
		font-family: var(--mono);
		font-size: 11px;
		font-weight: 400;
		color: var(--suave);
	}
	li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 9px 0;
		border-bottom: 1px solid #eceef4;
	}
	.pieza {
		min-width: 0;
	}
	.pieza a {
		font-weight: 600;
		color: var(--tinta);
		text-decoration: underline;
		text-decoration-color: var(--linea);
		text-underline-offset: 3px;
		transition: text-decoration-color 0.15s;
	}
	.pieza a:hover {
		text-decoration-color: var(--tinta);
	}
	.etiqueta-riesgo {
		margin-left: 6px;
		padding: 1px 6px;
		border-radius: 999px;
		background: var(--ambar-suave);
		color: var(--ambar-hondo);
		font-size: 10.5px;
		font-weight: 600;
	}
	li.marcada {
		animation: marcada 1.6s ease-out;
	}
	.salir {
		margin-left: 3px;
		font-size: 11px;
		color: var(--suave);
	}
	.orden {
		margin-left: 6px;
		padding: 1px 6px;
		border-radius: 999px;
		background: var(--platino);
		font: 10.5px var(--mono);
		color: var(--suave);
	}
	.detalle {
		margin-top: 2px;
		font-size: 12px;
		color: var(--suave);
	}
	.cuando {
		flex-shrink: 0;
		font-size: 12px;
		color: var(--suave);
	}
	.cuando.tarde {
		color: var(--granate);
		font-weight: 500;
	}
	.cuando.pronto {
		color: var(--tinta);
		font-weight: 500;
	}
	.cuando.falta {
		color: var(--oro-hondo);
	}
	.vacio {
		padding: 14px 0;
		color: var(--suave);
	}

	.panel :focus-visible {
		outline: 2px solid var(--tinta);
		outline-offset: 2px;
	}

	/* Angosto: la regla se deja, los tramos se leen en dos filas. */
	@media (max-width: 480px) {
		.tramos {
			grid-template-columns: repeat(3, 1fr);
		}
		.tramo:nth-child(4) {
			border-left: 0;
		}
		.tramo:nth-child(n + 4) {
			border-top: 1px solid var(--linea);
		}
		.tramo[aria-pressed='true']:nth-child(n + 4) {
			border-top: 2px solid var(--oro);
		}
		.etiqueta {
			font-size: 9px;
		}
	}

	@keyframes engaste {
		from {
			opacity: 0;
			transform: translateY(-14px) rotate(45deg) scale(0.3);
		}
	}
	@keyframes marcada {
		from {
			background: var(--ambar-suave);
		}
	}
	@keyframes pulso {
		50% {
			opacity: 0.35;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.gema,
		.pulso,
		li.marcada {
			animation: none;
		}
	}
</style>
