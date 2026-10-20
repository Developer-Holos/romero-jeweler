# Jeweler — Tracking de pedidos conectado a Kommo

> Guía para trabajar en el repo: [`CLAUDE.md`](CLAUDE.md). Decisiones pendientes: [`docs/DECISIONES.md`](docs/DECISIONES.md).

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
│   ├── kommo/pipeline.ts          # pipeline PRODUCCION: única lista de etapas (nombre + id)
│   ├── kommo/kommo.ts             # cliente Kommo (sobre fetcher.ts): lead e historial de etapas
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
       ├─ lead_id no es solo dígitos            → 404
       ├─ getLead(id)          GET /api/v4/leads/{id}  → no existe: 404 · otro error: log + 502
       ├─ getLeadProductionStage(lead)          → no está en PRODUCCION: 404
       ├─ getStageChanges(id)  GET /api/v4/events (paginado, máx. 1000) → error: log, sin fechas
       └─ buildTracking(etapa, historial)       → { steps, percent, label, cancelled }
  └─ +page.svelte: tarjeta de progreso y línea de tiempo con fechas (hora de Ecuador)
```

### Reglas de `buildTracking`

- 11 pasos visibles: las etapas de `PRODUCCION` (`pipeline.ts`) de **Diseño** a **Entregado**. Si `pipeline.ts` tiene una etapa que el tracking no sabe mostrar, la app falla al arrancar.
- Cambios de etapa en el mismo segundo: se ordena primero la etapa más adelantada que el lead dejó atrás (gana el avance).
- `Post-Entrega` y `Lead Ganado` (142) → Entregado, 100 %, "Pieza entregada".
- `Lead Perdido` (143) → "Pedido cancelado", 0 %.
- La fecha de cada paso es la de la pasada actual: si el lead vuelve atrás, se borran las fechas de las etapas posteriores. La fecha de entrega es la primera entrada a Entregado / Post-Entrega / Ganado.

## Cuenta de Kommo (verificado 2026-10-19)

Subdominio `romerojeweler`. Embudos y etapas reales (`GET /api/v4/leads/pipelines`):

| Embudo | id | Etapas (id) |
| --- | --- | --- |
| Ventas (principal) | 14630839 | Leads Entrantes 113046811 · Contacto Inicial 113046823 · Recontactar 113046831 · Seguimiento 113046839 · Interesado 113046847 · En Conversación 113110403 · Invoice Enviado 113110407 · Logrado con éxito 142 · Venta Perdido 143 |
| Producción | 14639515 | Leads Entrantes 113110619 · Diseño 113110623 · Aprobación de diseño 113110627 · En espera 113110631 · Impresión 3D 113110751 · Fundición 113110755 · Trabajo en metal 113110759 · Engaste 113110763 · Acabado 113110767 · Control de calidad 113110771 · Listo para entrega 113110775 · Entregado 113110779 · Post-Entrega 113110783 · Logrado con éxito 142 · Ventas Perdidos 143 |

En Producción, "Leads Entrantes" se muestra como Diseño en curso; "Post-Entrega" y "Logrado con éxito" como
entregado; "Ventas Perdidos" como pedido cancelado.

Campos personalizados: los leads solo tienen los de sistema (utm_*, referrer, gclid, fbclid…) y los
contactos Posición, Teléfono y Email. No hay campos de producto ni de metal.

Probado de punta a punta con un lead real: avance, vuelta atrás, entrega, ganado, cancelado, lead en
Ventas (404), ids inválidos (404) y token inválido (502 + log).

## Widget de invoice de Kommo (`widget/`) y su servidor (`server/`)

El widget es solo la interfaz; el trabajo pesado lo hace un **servidor aparte** que el widget llama por URL.

**En Kommo** (`widget/`, mismo formato que los demás widgets de Holos: AMD + jQuery, `i18n`, logos):

- **Tarjeta del lead** (`lcard-1`): botón **Generar invoice** que abre una ventana flotante con el formulario
  y la vista previa. Llega precargado con el contacto principal, su correo, el responsable y el precio del
  lead. El borrador de cada lead se guarda en el navegador. Al generar, el PDF se descarga.
- **Ajustes avanzados** (`advanced_settings`): el editor del diseño del invoice (orden de bloques, colores,
  tipografía, logo, pie). Es el mismo para todos los asesores (se guarda en el servidor).
- **Ajustes** (`settings`): *URL del servidor* y *Clave del widget*.

El generador y el diseñador son los componentes de Svelte de `src/lib/invoice/`, compilados en
`widget/app.js` (`vite.widget.config.ts`) y montados dentro de un Shadow DOM para que su CSS y el de Kommo no
se mezclen. `script.js` descarga `app.js` recién al primer uso.

```sh
pnpm widget:zip    # compila app.js y arma widget/invoice-romero-jeweler.zip (manifest.json en la raíz)
pnpm widget:tour   # vuelve a generar las imágenes del tour (images/slideshow_*.jpg) con capturas reales
```

Las imágenes del tour salen de `widget/_tour_src/`: un Kommo simulado carga el widget real, se toman capturas
(en inglés la interfaz se traduce con `en.mjs`) y se arman las diapositivas de 1188×616. Si cambia un texto de
la interfaz, `node widget/_tour_src/tour.mjs --listar` dice qué falta traducir.

En Kommo: **Ajustes → Integraciones → Crear integración → Subir widget**, con ese zip. Después completar la
URL del servidor (sin barra final) y la misma `WIDGET_KEY` del servidor.

Para probar fuera de Kommo están `/kommo` (generador con un lead de muestra) y `/kommo/diseno`, que leen
`SERVIDOR_URL` y `SERVIDOR_KEY` del `.env` raíz.

**El servidor** (`server/`, Node + Hono):

| Ruta | Qué hace |
| --- | --- |
| `GET /salud` | Estado y si la IA está activa (sin clave) |
| `GET/PUT /plantilla` | Diseño compartido por todos los asesores (`server/data/plantilla.json`) |
| `POST /ia/redactar` | OpenAI pule la descripción y traduce al inglés. Si la IA cambia una cifra, ese bloque queda con el texto original |
| `POST /pdf` | HTML de la vista previa → PDF carta con Chromium (Playwright) |

Todo menos `/salud` pide el header `X-Widget-Key`, y solo responde a los orígenes de `ORIGENES` (agregar ahí
el dominio de la cuenta de Kommo).

```sh
cp server/.env.example server/.env   # completar WIDGET_KEY y OPENAI_API_KEY
pnpm install                         # instala también Chromium para el servidor
pnpm --filter jeweler-servidor dev   # http://localhost:8787
pnpm --filter jeweler-servidor test
```

## Pendientes

Las decisiones abiertas del widget de invoice (guardar el PDF en el lead, base de datos, numeración, hosting,
IA, textos legales…) están en [`docs/DECISIONES.md`](docs/DECISIONES.md). Lo que sigue es del tracking de pedidos.


1. **Seguridad del enlace**: el `lead_id` es consecutivo y fácil de adivinar, así que cualquiera puede
   ver la etapa de pedidos ajenos (la página ya no muestra el nombre del lead). Conviene un token por pedido.
2. **Fecha de la primera etapa**: un lead creado directamente en Producción no tiene evento de cambio
   de etapa, así que esa primera etapa sale sin fecha. Los leads que pasan desde Ventas sí la tienen.
3. **Subtítulo** (metal, como en la referencia): no existe el campo en Kommo; hay que crearlo primero.
4. `adapter-auto` → cambiar por el adaptador del hosting final.
