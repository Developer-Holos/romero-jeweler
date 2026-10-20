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
| Servidor del widget | `server/` | API externa que usa el widget: PDF (Playwright), IA (OpenAI) y plantilla compartida |

## Arquitectura del widget de invoice

- **El widget es solo interfaz.** El trabajo pesado (PDF, IA, guardar el diseño) lo hace el servidor
  externo, al que el widget llama por URL. Cuando se dice "el servidor" se habla de `server/`, no de
  rutas de SvelteKit.
- `widget/script.js` sigue el formato de los demás widgets de Holos (AMD + jQuery ES5, `i18n` es/en,
  `loadCSS` manual, `render_template` + `ensureMounted` de respaldo). Ajustes `proxy_url` + `widget_key`;
  la clave viaja en el header `X-Widget-Key`.
- Ubicaciones: `lcard-1` (botón que abre una ventana flotante con el generador), `advanced_settings`
  (editor del diseño dentro de `div#work-area-*`, mismo contenedor que el Bot de Distribución) y `settings`.
- La interfaz son los componentes de Svelte de `src/lib/invoice/` (`Generador.svelte`, `Disenador.svelte`,
  `InvoicePreview.svelte`), compilados en `widget/app.js` (`vite.widget.config.ts`, entrada `src/widget/main.ts`)
  y montados en un **Shadow DOM** para que su CSS y el de Kommo no se mezclen.
- `/kommo` y `/kommo/diseno` montan los mismos componentes para probar fuera de Kommo (leen
  `SERVIDOR_URL` / `SERVIDOR_KEY` del `.env` raíz).
- El PDF **solo se descarga**. No se guarda en el lead (ver `docs/DECISIONES.md`).
- Los montos los calcula el widget; la IA nunca los cambia. El servidor descarta cualquier bloque en el que
  la IA haya alterado una cifra (`server/src/ia.ts`, `validar`).

## Comandos

```sh
corepack pnpm install --config.public-hoist-pattern='*'   # ver "Entorno" abajo
corepack pnpm check                       # svelte-check
corepack pnpm widget:zip                  # app.js + widget/invoice-romero-jeweler.zip
corepack pnpm widget:tour                 # imágenes del tour (capturas reales)
corepack pnpm --filter jeweler-servidor dev    # servidor en http://localhost:8787
corepack pnpm --filter jeweler-servidor test   # tests del servidor (node:test)
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
- El servidor exige `WIDGET_KEY` y solo responde a los orígenes de `ORIGENES` (agregar el dominio de Kommo).

## Probar el widget sin Kommo

`widget/_tour_src/kommo.mjs` levanta un Kommo simulado: carga el `script.js` + `app.js` reales, con `APP`,
`render_template`, `work-area-*` y respuestas falsas de `/api/v4/leads`, `/api/v4/contacts` y del servidor
(`/srv/plantilla`). Hoy lo usan las capturas del tour (`iniciarKommo()`); para probar a mano basta con
importarlo desde un script de Node y abrir `/lead` o `/ajustes` en el navegador.
