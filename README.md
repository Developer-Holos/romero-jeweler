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
| `DROPBOX_API_KEY`    | Token para el módulo de Dropbox (en construcción)     | ❌ falta  |

## Estructura

```
src/
├── env.ts                         # declaración de variables de entorno
├── lib/
│   ├── index.ts                   # tipos compartidos: HTTPMethods, Result<T>
│   ├── fetcher.ts                 # fetcher HTTP genérico (base URL, reintentos en 429)
│   ├── kommo/kommo.ts             # cliente Kommo: pipelines, tipos, KommoService
│   ├── tracking/tracking.ts       # mapeo etapa de Kommo → etapa visible al cliente
│   └── dropbox/dropbox.ts         # esqueleto de integración con Dropbox (no compila)
└── routes/
    ├── +layout.svelte             # layout raíz (Tailwind + favicon)
    ├── +page.svelte               # página de bienvenida por defecto de SvelteKit
    └── orders/[lead_id]/
        ├── +page.server.ts        # load: consulta el lead en Kommo y calcula la etapa
        └── +page.svelte           # vista de tracking (placeholder)
docs/Reqs.md                       # requerimientos del cliente (WhatsApp, Manychat, mensajes, keywords)
```

`#lib` y `#lib/*` son alias de import (subpath imports en `package.json`) hacia `src/lib`.

## Flujo de la página de tracking

```
Cliente abre /orders/123
  └─ +page.server.ts (load)
       ├─ parseInt(lead_id)                     → inválido: 404
       ├─ KommoService().getLead(id)            → GET /api/v4/leads/{id}
       ├─ leadIsInProduction(lead)              → lead.pipeline_id === PRODUCCION.id
       ├─ getLeadProductionStage(lead)          → busca status_id en PRODUCCION.stages
       └─ normalizeTrackingStatus(stage)        → AppStage { name, weight }
  └─ +page.svelte muestra la etapa
```

### Pipelines modelados en Kommo (`src/lib/kommo/kommo.ts`)

- **VENTAS**: Lead Entrante → Contacto Inicial → Recontactar → Seguimiento → Interesado →
  En Conversación → Invoice Enviado → Lead Ganado / Lead Perdido
- **PRODUCCION**: Diseño → Aprobación de Diseño → Lista de Espera → Impresión 3D → Fundición →
  Trabajo en Metal → Engaste → Acabado → Control de Calidad → Listo para Entrega → Entregado →
  Post-Entrega → Lead Ganado / Lead Perdido

### Etapas visibles al cliente (`src/lib/tracking/tracking.ts`)

Las 11 etapas de producción de Diseño a Entregado (con `weight` 0–10, útil para una barra de
progreso) más **Pedido Cancelado** (11). Reglas de normalización:

- Nombre idéntico a una etapa de app → esa etapa
- `Lead Ganado` → Entregado
- `Lead Perdido` → Pedido Cancelado
- Cualquier otro (p. ej. `Post-Entrega`) → Diseño (valor por defecto)

## Estado actual y pendientes

Lo que funciona: estructura del proyecto, cliente HTTP de Kommo con reintentos en `429`,
consulta de un lead y la lógica de mapeo de etapas.

Pendientes detectados al revisar el código:

1. **IDs reales de Kommo**: todos los `id` de pipelines y etapas en `PIPELINES` están en `0`.
   Hay que obtenerlos con `GET /api/v4/leads/pipelines`. Ojo: en Kommo, "ganado" y "perdido"
   son estados de sistema con id `142` y `143` en todos los pipelines.
2. **Respuesta 404**: `+page.server.ts` usa `redirect(404, '/not-exists')`, pero `redirect` solo
   acepta códigos 3xx y lanza error. Debe ser `error(404, ...)`.
3. **Vista**: `+page.svelte` renderiza `{status}`, que es un objeto → muestra `[object Object]`.
   Falta diseñar la página real (timeline de etapas).
4. **Etapa no encontrada**: `getLeadProductionStage` usa `!`; si el `status_id` no está en la lista
   devuelve `undefined` y `normalizeTrackingStatus` falla al leer `.name`.
5. **`Post-Entrega`** no tiene equivalente en `APP_STAGES` y cae en "Diseño"; probablemente
   debería mostrarse como "Entregado".
6. **Dropbox** (`src/lib/dropbox/dropbox.ts`) no compila (`pnpm check` reporta 3 errores):
   `standardFetcher` no acepta `token`, `request` recibe un solo objeto y `getVideo` no existe.
   Además `DROPBOX_API_KEY` no está en `.env`.
7. **Duplicación**: `kommoFetcher` repite la lógica de `standardFetcher`; podría construirse sobre él.
8. **Seguridad del enlace**: el `lead_id` es secuencial y adivinable; cualquiera podría consultar
   pedidos ajenos. Conviene un token/hash por pedido (p. ej. guardado en un campo personalizado
   del lead) en lugar del id crudo.
9. **Sin tests** aún, y `adapter-auto` pendiente de reemplazar por el adaptador del hosting final.
