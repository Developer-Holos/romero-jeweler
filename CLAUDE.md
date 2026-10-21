# CLAUDE.md

Guía para trabajar en este repositorio (personas y Claude). El detalle funcional está en `README.md`;
las decisiones que siguen abiertas, en `docs/DECISIONES.md`.

## Qué hay aquí

Proyecto de Holos para **Romero Jeweler** (joyería a la medida en Miami), conectado al CRM **Kommo**
(cuenta `romerojeweler`). Tres piezas:

| Pieza | Dónde | Qué hace |
| --- | --- | --- |
| Tracking de pedidos | `src/routes/orders/[lead_id]`, `src/lib/kommo`, `src/lib/tracking` | Página pública con la etapa de producción del pedido, leída de Kommo |
| Widget de invoice | `widget/` + `src/lib/invoice` + `src/widget` | Widget de Kommo: generador de invoices (tarjeta del lead) y editor del diseño (ajustes avanzados) |
| Servidor del widget | `server/` | API externa que usa el widget: PDF (Playwright), IA (OpenAI), Postgres y archivos en Kommo |

## Arquitectura del widget de invoice

- **El widget es solo interfaz.** El trabajo pesado lo hace el servidor externo, al que el widget llama por URL:
  PDF, IA, correlativo, borradores, plantilla, y subir archivos a Kommo. Cuando se dice "el servidor" se habla
  de `server/`, no de rutas de SvelteKit.
- `widget/script.js` sigue el formato de los demás widgets de Holos (AMD + jQuery ES5, `i18n` es/en,
  `loadCSS` manual, `render_template` + `ensureMounted` de respaldo). Servidor fijo:
  `https://romero-jeweler-production.up.railway.app` (`SERVIDOR_URL`); el único ajuste, `widget_key`, es opcional.
- Ubicaciones: `lcard-1` (botón que abre una ventana flotante con el generador), `advanced_settings`
  (editor del diseño dentro de `div#work-area-*`, mismo contenedor que el Bot de Distribución) y `settings`.
- La interfaz son los componentes de Svelte de `src/lib/invoice/` (`Generador.svelte`, `Disenador.svelte`,
  `InvoicePreview.svelte`), compilados en `widget/app.js` (`vite.widget.config.ts`, entrada `src/widget/main.ts`)
  y montados en un **Shadow DOM** para que su CSS y el de Kommo no se mezclen.
- `/kommo` y `/kommo/diseno` montan los mismos componentes para probar fuera de Kommo (leen
  `SERVIDOR_URL` / `SERVIDOR_KEY` del `.env` raíz).
- Al generar: el servidor asigna el número (`RJ-AAAA-NNNN`), la IA redacta (en inglés traduce todo), y el PDF
  se guarda en el campo **Invoice** del lead (Kommo Drive) y se descarga. Si Kommo falla, el PDF se descarga
  igual. Las decisiones y lo que falta verificar están en `docs/DECISIONES.md`.
- El borrador de cada lead vive en el servidor (Postgres): lo retoma cualquier asesor. Gana el último guardado.
- Las imágenes de referencia viven en Kommo, en la pestaña **"Imágenes de la pieza"** del lead: un campo archivo
  por imagen ("Imagen 1…N"). Al instalar (`onSave` → `POST /kommo/instalar`) se crean 3; si un lead los ocupa, el
  servidor crea el siguiente. El borrador guarda solo sus uuid.
- Los textos legales y valores por defecto están en la plantilla (`TEXTOS` / `VALORES` en `plantilla.svelte.ts`) y
  Romero los edita en la pestaña Textos del diseñador. No escribir textos legales en el código.
- Los montos los calcula el widget; la IA nunca los cambia. El servidor descarta cualquier texto en el que la IA
  haya alterado una cifra o el mes de una fecha (`server/src/ia.ts`, `validar`).
- El precio del lead es solo lectura. Los campos de producto se leen por id (`CAMPOS_PRODUCTO` en `widget/script.js`:
  Metal 133508, Quilates 133510, Piedra 133562, Talla 133564) y, si no aparecen, por nombre. El campo Invoice es el
  133486 (`KOMMO_CAMPO_INVOICE`).

## Comandos

```sh
corepack pnpm install --config.public-hoist-pattern='*'   # ver "Entorno" abajo
corepack pnpm check                       # svelte-check
corepack pnpm widget:zip                  # app.js + widget/invoice-romero-jeweler.zip
corepack pnpm widget:tour                 # imágenes del tour (capturas reales)
corepack pnpm --filter jeweler-servidor dev    # servidor en http://localhost:8787 (PGlite en server/data sin DATABASE_URL)
corepack pnpm --filter jeweler-servidor test   # tests del servidor (node:test, PGlite en memoria, Kommo falso)
node widget/_tour_src/kommo.mjs                # Kommo simulado en http://localhost:4180/lead y /ajustes
```

## Entorno (Windows) — problemas conocidos

- **`pnpm` global roto**: usar `corepack pnpm`. Dentro de scripts de `package.json` no se encadena
  `pnpm algo`; se llama a `vite` / `node` directo.
- **`C:\Users\JOSE\node_modules` suelto** con un `cookie` viejo: Node lo encuentra antes que el del proyecto
  y rompe `vite build` (`Named export 'parseCookie' not found`). Arreglo: instalar con
  `--config.public-hoist-pattern='*'` (se pierde si se reinstala sin la opción) o borrar esa carpeta.
- **`vite dev` y `vitest` fallan** al arrancar (rolldown: `Could not resolve 'node:module' … Tsconfig not
  found`). Para probar la app: `vite build` + `vite preview`. Por eso el servidor usa `node:test` + `tsx`.
- Fuera de Kommo, `vite build` de la app necesita `KOMMO_SUBDOMAIN` y `KOMMO_ACCESS_TOKEN` (pueden ser `x`).

## Convenciones

- Código, nombres y comentarios en **español** (`borrador`, `plantilla`, `generar`…). Comentarios cortos que
  explican el porqué, no el qué.
- Svelte 5 con runes forzado. Tailwind 4. Indentación con tabs en `src/routes`, `src/lib/invoice`, `server/` y
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
  `widget/_tour_src/en.mjs` para las capturas en inglés.
- `WIDGET_KEY` es opcional: sin ella el servidor acepta cualquier pedido que llegue a su URL; con ella exige el
  header `X-Widget-Key`. Los navegadores solo pueden llamarlo desde `ORIGENES` (agregar el dominio de Kommo).
  `/admin/*` usa otra clave (`ADMIN_KEY`), que nunca va al widget.
- **API de Kommo Drive y campo archivo** (`server/src/kommo.ts`): verificada contra la cuenta real el 2026-10-20 en
  el lead de prueba 407872 (subir, campo Invoice, adjuntar, listar, descargar). Para pruebas reales usar ese lead,
  nunca uno de un cliente.
- **Número del invoice**: lo asigna `POST /invoices/numero` con un upsert atómico; no armar números en el widget.
- El `Dockerfile` usa la imagen de Playwright: su versión debe coincidir con `playwright` del lockfile.

## Probar el widget sin Kommo

`node widget/_tour_src/kommo.mjs` levanta un Kommo simulado en el puerto 4180: carga el `script.js` + `app.js`
reales, con `APP`, `render_template`, `work-area-*` y un lead con campos de producto. Sirve de tres formas:

- **Solo el widget**: `/lead` y `/ajustes` usan un servidor del widget falso en `/srv` (lo usa el tour).
- **De punta a punta**: `/lead?servidor=http://localhost:8787` usa el servidor real (más `&clave=…` si tiene `WIDGET_KEY`).
- **Kommo para el servidor real**: con `KOMMO_BASE_URL=http://localhost:4180` en `server/.env`, el servidor sube el
  PDF y las imágenes a su Drive en memoria. `GET /kommo/estado` muestra qué llegó.
