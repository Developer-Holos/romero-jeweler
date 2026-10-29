# CLAUDE.md

Guía para trabajar en este repositorio (personas y Claude). El detalle funcional está en `README.md`;
las decisiones que siguen abiertas, en `docs/DECISIONES.md`.

## Qué hay aquí

Proyecto de Holos para **Romero Jeweler** (joyería a la medida en Miami), conectado al CRM **Kommo**
(cuenta `romerojeweler`). Tres piezas:

| Pieza | Dónde | Qué hace |
| --- | --- | --- |
| Tracking de pedidos | `src/routes/orders/[lead_id]`, `src/lib/kommo`, `src/lib/tracking` | Página pública con la etapa de producción del pedido, leída de Kommo. Todo error (404 de rutas sin página, pedido inexistente, 5xx) lo muestra `src/routes/+error.svelte`, en español e inglés |
| Widget de invoice | `widget/` + `src/lib/invoice` + `src/widget` | Widget de Kommo: generador de invoices y de órdenes de producción (tarjeta del lead) y editor del diseño (ajustes avanzados) |
| API del widget | `src/routes/api` + `src/lib/server/widget` | Rutas de SvelteKit que usa el widget: PDF (Playwright), IA (OpenAI), Postgres y archivos en Kommo |

## Arquitectura del widget de invoice

- **El widget es solo interfaz.** El trabajo pesado lo hace la API de esta misma app (`/api`, rutas `+server.ts`),
  que el widget llama por URL: PDF, IA, correlativo, borradores, plantilla, y subir archivos a Kommo. **No hay un
  servidor aparte**: tracking y API son un solo despliegue (adapter-node + `Dockerfile` de la raíz, en Railway).
  CORS y `WIDGET_KEY` se revisan en `src/hooks.server.ts`.
- `widget/script.js` sigue el formato de los demás widgets de Holos (AMD + jQuery ES5, `i18n` es/en,
  `loadCSS` manual, `render_template` + `ensureMounted` de respaldo). API fija:
  `https://romero-jeweler-production.up.railway.app/api` (`SERVIDOR_URL`); el único ajuste, `widget_key`, es opcional.
- Ubicaciones: `lcard-1` (botón que abre una ventana flotante con el generador), `advanced_settings`
  (editor del diseño dentro de `div#work-area-*`, mismo contenedor que el Bot de Distribución) y `settings`.
- La interfaz son los componentes de Svelte de `src/lib/invoice/` (`Generador.svelte`, `Disenador.svelte`,
  `InvoicePreview.svelte`), compilados en `widget/app.js` (`vite.widget.config.ts`, entrada `src/widget/main.ts`)
  y montados en un **Shadow DOM** para que su CSS y el de Kommo no se mezclen.
- `/kommo` y `/kommo/diseno` montan los mismos componentes para probar fuera de Kommo (leen
  `/api` de la misma app).
- Al generar: la API asigna el número (`RJ-AAAA-NNNN`), la IA redacta (en inglés traduce todo), y el PDF
  se guarda en el campo **Invoice** del lead (Kommo Drive) y se descarga. Si Kommo falla, el PDF se descarga
  igual. Las decisiones y lo que falta verificar están en `docs/DECISIONES.md`.
- El borrador de cada lead vive en la app (Postgres): lo retoma cualquier asesor. Gana el último guardado.
- **Varias piezas**: el borrador tiene `piezas[]` (empieza vacío, botón "Agregar la primera pieza"). Cada pieza es un
  anillo de la orden de producción, con sus piedras, sus imágenes y sus filas de la orden (`pieza.orden`). Los
  borradores viejos (una sola pieza en la raíz) se migran al cargarlos (`migrar` en `invoice.svelte.ts`).
- **Opciones compartidas** (`opciones.ts`, `/api/opciones`): tipos de anillo, metales, quilates, piedras, formas,
  ubicaciones y campos extra de la orden. Las de fábrica están en el código; las que agrega un asesor ("+ Otro metal"…)
  quedan en la app para todos, y el widget las suma como opción de los campos de selección de Kommo.
- **Pestaña "Orden"** (la arma `estructura` en `widget/script.js`): arriba los campos del pedido (Order #, Stuller O.#,
  Nivoda O.#, Invoice, Orden de producción (PDF) y los que se creen) y después un grupo por anillo, en este orden
  (`sort`): `*Anillo °N*` (texto), los campos `[N] Metal`, `[N] Quilates`… y `*!` (texto). Así lo reconoce el widget
  **Group Fields** (cierra con un nombre que termina en `!`: `*!*` no cierra). Los grupos son de la cuenta; Group Fields
  muestra en cada lead tantos como diga **"N° de Anillos"** (283974), que el widget guarda al generar. Si hacen falta
  más anillos, el widget crea el grupo siguiente. El widget no toca los ajustes de Group Fields (no aparece en
  `/api/v4/widgets`) ni mueve campos entre pestañas (Kommo no lo permitió).
- **Las pestañas y campos del lead los crea el widget, no la API** (`widget/script.js`, con `$.ajax` a `/api/v4`
  y la sesión del usuario, igual que el widget "IA Campos y Bots"): busca por nombre y crea solo lo que falta. Se
  crean al instalar (`onSave`) y, si faltan, al usarlas. La API solo sube archivos a Drive y los guarda en el
  campo que el widget le indica.
- Las imágenes de referencia van en la pestaña **"Imágenes de la pieza"**: un campo archivo por imagen ("Imagen 1…N").
  Empiezan 3; si un lead los ocupa, el widget crea el siguiente. El borrador guarda solo sus uuid.
- **Orden de producción** (`OrdenProduccion.svelte` + `OrdenPreview.svelte`, botón aparte en la tarjeta del lead):
  sale del **mismo borrador que el invoice** con el formato de la ficha de producción de Romero (orden 1146): "Order
  Details" y un "Cad Details Ring N" por pieza, con sus imágenes. Cada fila se puede quitar (x) o agregar ("+ Agregar
  otro campo": uno ya configurado o uno nuevo, que se crea en todos los grupos de anillos). Los nombres de las filas
  están en `campos.ts` en inglés y español; la orden sale en cualquiera de los dos (los campos creados por los asesores
  y, si se pide, los valores, los traduce la IA en `/api/ia/traducir`). Lo propio de la orden (Width, Thickness, Est.
  Weight, Head style, campos creados) manda lo que esté en Kommo: si se cambia a mano allí, la orden lo toma al abrirse.
- Los textos legales y valores por defecto están en la plantilla (`TEXTOS` / `VALORES` en `plantilla.svelte.ts`) y
  Romero los edita en la pestaña Textos del diseñador. No escribir textos legales en el código.
- Los montos los calcula el widget; la IA nunca los cambia. La API descarta cualquier texto en el que la IA
  haya alterado una cifra o el mes de una fecha (`src/lib/server/widget/ia.ts`, `validar`).
- El precio del lead es solo lectura. El PDF del invoice va al campo **Invoice** de la pestaña "Orden": el widget le
  pasa su id a la API (`campo_id`); `KOMMO_CAMPO_INVOICE` queda solo de respaldo.
- **Pestaña "Orden" en la cuenta real** (rehecha el 2026-10-29 con la API, a pedido del equipo): se borraron los campos y
  las pestañas "Orden de producción" y "Widget Invoice" (y con ellos los Metal/Quilates/Piedra/Talla sueltos y el
  Invoice 133486) y se creó la estructura de arriba con el anillo 1 (Invoice: 288076, PDF de la orden: 288078).
- **Versión del widget** (`manifest.json`): súbela con cada zip nuevo. `script.js` carga `app.js` y `style.css` con
  `?v=<versión>`; si no cambia, los navegadores siguen usando los viejos (pasó: el widget llamaba a rutas sin `/api`).

## Comandos

```sh
corepack pnpm install --config.public-hoist-pattern='*'   # ver "Entorno" abajo
corepack pnpm check                       # svelte-check
corepack pnpm widget:zip                  # app.js + widget/invoice-romero-jeweler.zip
corepack pnpm widget:tour                 # imágenes del tour (capturas reales)
corepack pnpm build && corepack pnpm preview   # app con la API en /api (PGlite en data/ sin DATABASE_URL)
corepack pnpm build && corepack pnpm test:api  # tests de la API (node:test contra la app compilada, Kommo falso)
node widget/_tour_src/kommo.mjs                # Kommo simulado en http://localhost:4180/lead y /ajustes
```

## Entorno (Windows) — problemas conocidos

- **`pnpm` global roto**: usar `corepack pnpm`. Dentro de scripts de `package.json` no se encadena
  `pnpm algo`; se llama a `vite` / `node` directo.
- **`C:\Users\JOSE\node_modules` suelto** con un `cookie` viejo: Node lo encuentra antes que el del proyecto
  y rompe `vite build` (`Named export 'parseCookie' not found`). Arreglo: instalar con
  `--config.public-hoist-pattern='*'` (se pierde si se reinstala sin la opción) o borrar esa carpeta.
- **`vite dev` y `vitest` fallan** al arrancar (rolldown: `Could not resolve 'node:module' … Tsconfig not
  found`). Para probar la app: `vite build` + `vite preview`. Por eso la API se prueba con `node:test` (Node 26
  corre `.ts` directo: en `src/lib/server/widget` nada de `enum` ni propiedades en el constructor).
- **Node 26 ya no trae `corepack`**: si falta, `node ~/AppData/Local/node/corepack/v1/pnpm/12.14.0/bin/pnpm.mjs`.
- Fuera de Kommo, `vite build` de la app necesita `KOMMO_SUBDOMAIN` y `KOMMO_ACCESS_TOKEN` (pueden ser `x`).

## Convenciones

- Código, nombres y comentarios en **español** (`borrador`, `plantilla`, `generar`…). Comentarios cortos que
  explican el porqué, no el qué.
- Svelte 5 con runes forzado. Tailwind 4. Indentación con tabs en `src/routes`, `src/lib/invoice`, `src/lib/server` y
  `widget/`; dos espacios en `src/lib/kommo` y `src/lib/tracking` (se respeta el estilo de cada archivo).
- `#lib/*` es alias de `src/lib/*`.
- Commits en español, con un resumen y viñetas de lo que cambió.

## Cosas fáciles de romper

- **Shadow DOM**: `document.elementFromPoint` / `document.styleSheets` no ven lo de adentro; usar
  `el.getRootNode()`. Las reglas `@property` de Tailwind no funcionan dentro de un shadow root
  (`main.ts` las sube al `<head>`). Las medidas en `rem` se pasan a `px` porque Kommo no usa 16 px de base.
- **CSS en capas**: un `!important` en una hoja suelta pierde contra el de Tailwind (está en `@layer`).
- **jQuery en `script.js`**: en `.then(ok, error)` el rechazo se devuelve explícito con
  `$.Deferred().reject(...)`; devolver un valor resolvería la promesa en jQuery 3.
- **Zip del widget**: lo arma `widget/empaquetar.mjs`. `Compress-Archive` de PowerShell 5.1 guarda las
  rutas con `\`, que Kommo no espera.
- **Tour**: si cambia un texto de la interfaz, `node widget/_tour_src/tour.mjs --listar` dice qué falta en
  `widget/_tour_src/en.mjs` para las capturas en inglés. **Pendiente**: `capturas.mjs` todavía busca el formulario de
  una sola pieza (`#f-pieza`); hay que adaptarlo a las piezas antes de volver a generar las imágenes.
- `WIDGET_KEY` es opcional: sin ella la API acepta cualquier pedido que llegue a su URL; con ella exige el
  header `X-Widget-Key`. Los navegadores solo pueden llamarlo desde `ORIGENES` (agregar el dominio de Kommo).
  `/admin/*` usa otra clave (`ADMIN_KEY`), que nunca va al widget.
- **API de Kommo Drive y campo archivo** (`src/lib/server/widget/kommo.ts`): verificada contra la cuenta real el 2026-10-20 en
  el lead de prueba 407872 (subir, campo Invoice, adjuntar, listar, descargar). Para pruebas reales usar ese lead,
  nunca uno de un cliente.
- **Número del invoice**: lo asigna `POST /invoices/numero` con un upsert atómico; no armar números en el widget.
- El `Dockerfile` usa la imagen de Playwright: su versión debe coincidir con `playwright` del lockfile.
- **`BODY_SIZE_LIMIT`**: adapter-node corta los cuerpos de más de 512 KB y el HTML de los PDF trae las imágenes
  adentro. El `Dockerfile` lo fija en 25M; al correr `node build` a mano, definirlo también.
- **El `railway.json` de la raíz decide qué se publica.** Si apunta a otro Dockerfile, la página de tracking deja de
  existir (pasó con el servidor aparte).
- **Kommo no acepta archivos de más de 9 MB** (`MAX_ARCHIVO` en `servidor.ts`). Por eso las fotos van al PDF
  achicadas a 1600 px en JPEG (`htmlDelInvoice`), y las que pesan más de 9 MB se comprimen antes de subirlas
  (`paraKommo`). La API lo vuelve a revisar: un PDF más pesado se descarga, pero no va al lead.
- **Llamadas a Kommo**: se cortan a los 30 s, en la API (`kommo.ts`) y en el widget (`kommoApi`). Si Kommo se cuelga, el
  PDF se descarga igual con el aviso.

## Probar el widget sin Kommo

`node widget/_tour_src/kommo.mjs` levanta un Kommo simulado en el puerto 4180: carga el `script.js` + `app.js`
reales, con `APP`, `render_template`, `work-area-*` y un lead con campos de producto. Sirve de tres formas:

- **Solo el widget**: `/lead` y `/ajustes` usan un servidor del widget falso en `/srv` (lo usa el tour).
- **De punta a punta**: `/lead?servidor=http://localhost:4173/api` usa la API de la app (`vite preview`; más `&clave=…`
  si tiene `WIDGET_KEY`).
- **Kommo para la app**: con `KOMMO_BASE_URL=http://localhost:4180` en el `.env`, la API sube el PDF y las
  imágenes a su Drive en memoria. `GET /kommo/estado` muestra qué llegó.
