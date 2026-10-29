# Jeweler — Tracking de pedidos conectado a Kommo

> Guía para trabajar en el repo: [`CLAUDE.md`](CLAUDE.md). Decisiones y pendientes: [`docs/DECISIONES.md`](docs/DECISIONES.md).

Página pública de seguimiento para los clientes de la joyería. El cliente recibe un enlace
(`/orders/<lead_id>`) y ve en qué etapa de producción está su pedido. La etapa es un reflejo
directo de la etapa en la que está su lead dentro del CRM **Kommo**.

## Stack

- **SvelteKit 3** + **Svelte 5** (runes forzado en todo el proyecto)
- **TypeScript 6** (strict), **Vite 8**, **Tailwind CSS 4**
- **Vitest 4** (proyecto `client` en navegador con Playwright, proyecto `server` en Node)
- `@sveltejs/adapter-node`: publicada en Railway con el `Dockerfile` de la raíz (tracking y API del widget juntos)
- Gestor de paquetes: **pnpm**

## Comandos

```sh
pnpm install
pnpm dev        # servidor de desarrollo
pnpm check      # svelte-check (tipos)
pnpm test       # vitest (una sola pasada)
pnpm build && pnpm preview
pnpm build && pnpm test:api   # API del widget: node:test contra la app compilada, Kommo falso y PGlite
```

## Variables de entorno

Declaradas en `src/env.ts` con `defineEnvVars` y leídas desde `$app/env/private` (solo servidor).
Se cargan desde `.env` (ignorado por git; plantilla en `.env.example`, con las de la API del widget).

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

## Widget de invoice de Kommo (`widget/`) y su API (`src/routes/api`)

El widget es solo la interfaz; el trabajo pesado lo hace la **API de esta misma app** (`/api`), que el widget llama
por URL. No hay un servidor aparte: la página de tracking y la API se publican juntas.

**En Kommo** (`widget/`, mismo formato que los demás widgets de Holos: AMD + jQuery, `i18n`, logos, tour):

- **Tarjeta del lead** (`lcard-1`): botón **Generar invoice** que abre una ventana flotante con el formulario y la
  vista previa. Llega precargado con el contacto principal, su correo, el responsable, el precio del lead (solo
  lectura) y los campos de producto (Metal, Quilates, Piedra, Talla). El borrador se guarda en la app, por
  lead. Al generar, el invoice recibe su número, la IA pule el texto (o traduce todo al inglés) y el PDF se guarda
  en el campo **Invoice** del lead y se descarga.
- **Ajustes avanzados** (`advanced_settings`): el editor del diseño (bloques, colores, tipografía, logo, pie) y la
  pestaña **Textos** con los textos legales y valores por defecto. Es el mismo para todos los asesores.
- **API:** fija en el widget, `https://romero-jeweler-production.up.railway.app/api` (`SERVIDOR_URL` en `widget/script.js`). El
  único ajuste, *Clave del widget*, es opcional y solo hace falta si la app tiene `WIDGET_KEY`.

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

**La API** (`src/routes/api`, rutas `+server.ts`; la lógica en `src/lib/server/widget`, con Postgres):

| Ruta (bajo `/api`) | Qué hace |
| --- | --- |
| `GET /salud` | Estado: IA y Kommo configurados (sin clave) |
| `GET/PUT /plantilla` | Diseño y textos compartidos por todos los asesores |
| `GET/PUT /borradores/:lead` | Borrador del invoice de cada lead |
| `POST /ia/redactar` | OpenAI pule la descripción y, en inglés, traduce todo. Si cambia una cifra o un mes, ese texto queda en el original |
| `POST /invoices/numero` | Asigna el correlativo `RJ-AAAA-NNNN` |
| `POST /invoices/:numero/pdf` | HTML de la vista previa → PDF carta (Chromium); lo registra y lo guarda en el campo Invoice del lead |
| `POST /pdf` | PDF de una cotización (sin número, no va a Kommo) |
| `GET/POST /leads/:lead/imagenes`, `GET /imagenes/:uuid` | Imágenes de referencia: cada una al campo "Imagen N" que indica el widget (`X-Campo-Imagen`) |
| `POST /ordenes/pdf` | Orden de producción → PDF; con `campo_id`, lo guarda en el campo archivo de la pestaña "Orden de producción" |
| `GET/PUT /admin/ia` | Modelo de IA, sin redesplegar (clave `ADMIN_KEY`) |

Basta con la URL. Si se define `WIDGET_KEY`, todo menos `/api/salud` y `/api/admin` pide además el header
`X-Widget-Key` (lo revisa `src/hooks.server.ts`, junto con CORS). Los navegadores solo pueden llamarla desde los
orígenes de `ORIGENES`.

```sh
cp .env.example .env         # completar Kommo, ADMIN_KEY y OPENAI_API_KEY (WIDGET_KEY es opcional)
pnpm build && pnpm preview   # o `node build`; sin DATABASE_URL usa PGlite en data/
```

En Railway, el `Dockerfile` usa la imagen de Playwright (Chromium para los PDF) y fija `BODY_SIZE_LIMIT=25M`:
adapter-node corta los cuerpos de más de 512 KB y el HTML de un PDF trae las imágenes adentro.

**Campos de los leads en Kommo (cuenta `romerojeweler`):**

| Campo | Tipo | Id | Lo usa |
| --- | --- | --- | --- |
| Invoice | Archivo | 133486 | La API guarda ahí el PDF (`KOMMO_CAMPO_INVOICE`) |
| Metal | Lista | 133508 | El widget lo precarga (`CAMPOS_PRODUCTO` en `widget/script.js`) |
| Quilates | Lista | 133510 | Ídem |
| Piedra | Lista | 133562 | Ídem |
| Talla | Texto | 133564 | Ídem |

Los campos de producto se buscan por id y, si no aparecen, por nombre.

## Pendientes

Las decisiones del widget de invoice, con lo que ya está hecho y lo que falta verificar, están en
[`docs/DECISIONES.md`](docs/DECISIONES.md); los textos que Romero debe confirmar, en
[`docs/TEXTOS_PARA_ROMERO.md`](docs/TEXTOS_PARA_ROMERO.md). Lo que sigue es del tracking de pedidos.


1. **Seguridad del enlace**: el `lead_id` es consecutivo y fácil de adivinar, así que cualquiera puede
   ver la etapa de pedidos ajenos (la página ya no muestra el nombre del lead). Conviene un token por pedido.
2. **Fecha de la primera etapa**: un lead creado directamente en Producción no tiene evento de cambio
   de etapa, así que esa primera etapa sale sin fecha. Los leads que pasan desde Ventas sí la tienen.
3. **Subtítulo** (metal, como en la referencia): no existe el campo en Kommo; hay que crearlo primero.
