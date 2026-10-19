# Jeweler — Tracking de pedidos conectado a Kommo

Página pública de seguimiento para los clientes de la joyería. El cliente recibe un enlace
(`/orders/<lead_id>`) y ve en qué etapa de producción está su pedido. La etapa es un reflejo
directo de la etapa en la que está su lead dentro del CRM **Kommo**.

## Stack

- **SvelteKit 3** + **Svelte 5** (runes forzado en todo el proyecto)
- **TypeScript 6** (strict), **Vite 8**, **Tailwind CSS 4**
- **Vitest 4** (proyecto `client` en navegador con Playwright, proyecto `server` en Node)
- `@sveltejs/adapter-auto` (aún sin plataforma de despliegue definida)
- Gestor de paquetes: **pnpm**

## Comandos

```sh
pnpm install
pnpm dev        # servidor de desarrollo
pnpm check      # svelte-check (tipos)
pnpm test       # vitest (una sola pasada)
pnpm build && pnpm preview
```

## Variables de entorno

Declaradas en `src/env.ts` con `defineEnvVars` y leídas desde `$app/env/private` (solo servidor).
Se cargan desde `.env` (ignorado por git).

| Variable             | Uso                                                  | En `.env` |
| -------------------- | ---------------------------------------------------- | --------- |
| `KOMMO_SUBDOMAIN`    | Subdominio de la cuenta: `https://<sub>.kommo.com`   | ✅        |
| `KOMMO_ACCESS_TOKEN` | Token de larga duración (Bearer) de la API v4        | ✅        |

## Estructura

```
src/
├── env.ts                         # declaración de variables de entorno
├── lib/
│   ├── index.ts                   # tipos compartidos: HTTPMethods, Result<T>
│   ├── fetcher.ts                 # fetcher HTTP genérico (base URL, reintentos en 429)
│   ├── kommo/kommo.ts             # cliente Kommo (sobre fetcher.ts): pipeline PRODUCCION, lead, fechas de etapas
│   └── tracking/tracking.ts(+test) # etapa de Kommo → pasos, % y texto que ve el cliente
└── routes/
    ├── +layout.svelte             # layout raíz (Tailwind + favicon)
    ├── +page.svelte               # página de bienvenida por defecto de SvelteKit
    └── orders/[lead_id]/
        ├── +page.server.ts        # load: consulta el lead en Kommo y calcula la etapa
        └── +page.svelte           # vista de tracking (progreso + línea de tiempo)
docs/Reqs.md                       # requerimientos del cliente (WhatsApp, Manychat, mensajes, keywords)
references/images/                 # capturas del diseño de referencia (joyerokit.com)
```

`#lib` y `#lib/*` son alias de import (subpath imports en `package.json`) hacia `src/lib`.

## Flujo de la página de tracking

```
Cliente abre /orders/123
  └─ +page.server.ts (load)
       ├─ lead_id no entero                     → 404
       ├─ getLead(id)  GET /api/v4/leads/{id}   → no existe: 404
       ├─ getLeadProductionStage(lead)          → no está en PRODUCCION: 404
       ├─ getStageDates(id)  GET /api/v4/events?filter[type]=lead_status_changed
       └─ buildTracking(etapa, fechas)          → { steps, percent, label, cancelled }
  └─ +page.svelte: nombre del lead, tarjeta de progreso y línea de tiempo con fechas
```

### Reglas de `buildTracking`

- 11 pasos visibles, de **Diseño** a **Entregado**, con los mismos nombres que las etapas de PRODUCCION en Kommo.
- `Post-Entrega` y `Lead Ganado` (142) → Entregado, 100 %, "Pieza entregada".
- `Lead Perdido` (143) → "Pedido cancelado", 0 %.
- La fecha de cada paso es la última vez que el lead entró a esa etapa.

## Pendientes

1. **IDs reales de Kommo**: en `PRODUCCION` (`src/lib/kommo/kommo.ts`) los ids del pipeline y de
   sus etapas siguen en `0`. Salen de `GET /api/v4/leads/pipelines`. Mientras tanto toda URL da 404.
   El `.env` actual tiene valores de relleno.
2. **Seguridad del enlace**: el `lead_id` es consecutivo y fácil de adivinar, así que cualquiera puede
   ver pedidos ajenos. Conviene usar un token por pedido guardado en un campo personalizado del lead.
3. **Subtítulo** (p. ej. metal "14k blanco" como en la referencia): necesita el id del campo personalizado.
4. `adapter-auto` → cambiar por el adaptador del hosting final.
