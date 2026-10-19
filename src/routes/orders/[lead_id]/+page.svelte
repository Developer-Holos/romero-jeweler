<script lang="ts">
  import type { PageProps } from "./$types";
  let { data }: PageProps = $props();
  let { name, tracking } = $derived(data);

  const formatDate = (unix: number) =>
    new Date(unix * 1000).toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });
</script>

<svelte:head>
  <title>Seguimiento de tu pieza</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="min-h-screen bg-gradient-to-b from-amber-50 to-white px-4 py-10 text-slate-900">
  <div class="mx-auto max-w-md space-y-6">
    <header class="text-center">
      <div class="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-amber-100 text-amber-600">
        <svg class="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12l4 6-10 13L2 9Z" /><path d="M11 3 8 9l4 13 4-13-3-6" /><path d="M2 9h20" /></svg>
      </div>
      <h1 class="text-xl font-bold">{name}</h1>
    </header>

    <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div class="flex items-baseline justify-between">
        <h2 class="text-xs font-semibold tracking-wider text-slate-500 uppercase">Progreso</h2>
        <span class="text-2xl font-bold {tracking.cancelled ? 'text-red-600' : 'text-emerald-600'}">{tracking.percent}%</span>
      </div>
      <div class="mt-3 h-3 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={tracking.percent} aria-valuemin="0" aria-valuemax="100">
        <div class="h-full rounded-full bg-emerald-500 transition-[width] duration-700" style:width="{tracking.percent}%"></div>
      </div>
      <p class="mt-3 text-center text-sm font-semibold {tracking.cancelled ? 'text-red-600' : 'text-emerald-700'}">{tracking.label}</p>
    </section>

    <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 class="mb-4 text-xs font-semibold tracking-wider text-slate-500 uppercase">Proceso de producción</h2>
      <ol>
        {#each tracking.steps as step, i (step.name)}
          {@const isLast = i === tracking.steps.length - 1}
          <li class="relative flex gap-3 pb-6 last:pb-0">
            {#if !isLast}
              <span class="absolute top-9 bottom-0 left-[17px] w-0.5 {step.state === 'done' ? 'bg-amber-200' : 'bg-slate-200'}" aria-hidden="true"></span>
            {/if}
            {#if step.state === "done" && !(isLast)}
              <span class="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-600">
                <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
              </span>
            {:else if step.state !== "pending"}
              <span class="grid size-9 shrink-0 place-items-center rounded-full bg-amber-200 text-amber-700 ring-2 ring-amber-300 ring-offset-2">
                {#if isLast}
                  <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13" /><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" /></svg>
                {:else}
                  <span class="size-2.5 animate-pulse rounded-full bg-amber-600"></span>
                {/if}
              </span>
            {:else}
              <span class="grid size-9 shrink-0 place-items-center rounded-full border-2 border-slate-200 text-xs font-semibold text-slate-400">{i + 1}</span>
            {/if}
            <div class="pt-1.5">
              <p class="text-sm font-semibold {step.state === 'pending' ? 'text-slate-400' : step.state === 'current' || (isLast && step.state === 'done') ? 'text-amber-700' : 'text-emerald-700'}">
                {step.name}
                {#if step.state === "current"}<span class="sr-only"> (etapa actual)</span>{/if}
              </p>
              {#if step.date}
                <p class="text-xs text-slate-500">{formatDate(step.date)}</p>
              {/if}
            </div>
          </li>
        {/each}
      </ol>
    </section>
  </div>
</main>
