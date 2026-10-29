<script lang="ts">
  import { page } from "$app/state";

  const serverError = $derived(page.status >= 500);
  const isOrder = $derived(page.url.pathname.startsWith("/orders/"));

  // Texto propio: page.error.message es técnico y está solo en español.
  const text = $derived(
    serverError
      ? {
          es: ["Algo falló de nuestro lado", "Intenta de nuevo en unos minutos."],
          en: ["Something went wrong on our end", "Please try again in a few minutes."],
        }
      : isOrder
        ? {
            es: ["No encontramos este pedido", "Revisa que el enlace sea el que te enviamos."],
            en: ["We couldn't find this order", "Please check that the link is the one we sent you."],
          }
        : {
            es: ["No encontramos esta página", "Revisa que el enlace sea el correcto."],
            en: ["We couldn't find this page", "Please check that the link is correct."],
          },
  );
</script>

<svelte:head>
  <title>{page.status} · {serverError ? "Error" : "No encontrado / Not found"}</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="grid min-h-screen place-items-center bg-gradient-to-b from-amber-50 to-white px-4 py-10 text-slate-900">
  <div class="w-full max-w-md">
    <div class="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-amber-100 text-amber-600">
      <svg class="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12l4 6-10 13L2 9Z" /><path d="M11 3 8 9l4 13 4-13-3-6" /><path d="M2 9h20" /></svg>
    </div>

    <section class="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <p class="text-5xl font-bold tracking-tight text-amber-500">{page.status}</p>
      <h1 class="mt-3 text-xl font-bold">{text.es[0]}</h1>
      <p class="mt-1 text-sm text-slate-600">{text.es[1]}</p>

      <div lang="en" class="mt-5 border-t border-slate-100 pt-5">
        <h2 class="text-base font-semibold text-slate-500">{text.en[0]}</h2>
        <p class="mt-1 text-sm text-slate-500">{text.en[1]}</p>
      </div>
    </section>
  </div>
</main>
