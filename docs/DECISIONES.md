# Decisiones — widget de invoice

Decisiones para poner el widget de invoice de Romero Jeweler en producción. Las tomó **ctineo (Holos) el
2026-10-20**; aquí queda cada una con lo que ya está hecho en el código y lo que falta.

Estado: **Hecho** (implementado y probado contra un Kommo simulado) · **Por verificar** (hecho, falta probarlo en la
cuenta real) · **Externo** (depende de Romero, su contador o una configuración que hace Holos).

## Resumen

| # | Decisión | Estado | Qué falta |
| --- | --- | --- | --- |
| 1 | PDF al campo "Invoice" (archivo) de la pestaña "Orden" | Hecho | API verificada con la cuenta real; falta la prueba desde el widget (#14) |
| 2 | Postgres gestionado | Hecho | Crear la base en Railway |
| 3 | Correlativo `RJ-AAAA-NNNN` de la API | Hecho · Externo | Que Romero o su contador confirmen el formato |
| 4 | Railway, cuenta de Holos | Hecho | Publicado; falta agregarle Postgres y las variables |
| 5 | Clave opcional (basta la URL), sin límite de uso | Hecho | — |
| 6 | OpenAI de Holos, modelo editable, fallback | Hecho · Por verificar | Probar con la clave real |
| 7 | La IA traduce todo | Hecho · Por verificar | Revisar un invoice en inglés real |
| 8 | Imágenes en la pestaña "Imágenes de la pieza" del lead (la crea el widget) | Por verificar | Instalar el widget en la cuenta real; adjuntos de chats sin resolver |
| 9 | Borrador en la app (Postgres), por lead | Hecho | — |
| 10 | Textos legales en el diseñador; Romero los revisa | Hecho · Externo | Que Romero confirme `docs/TEXTOS_PARA_ROMERO.md` |
| 11 | Sales tax | Externo | Respuesta del contador (mientras tanto 0 % editable) |
| 12 | Campos de producto (ahora `[N] …` por anillo) y precio del lead solo lectura | Por verificar | Probar con un lead real |
| 13 | La API va dentro de la app de SvelteKit | Hecho | — |
| 14 | Instalación privada; la hace y la prueba Holos | Externo | Instalar y probar con un lead real |

**Bloquea producción:** #3 (formato), #4 (app publicada con Postgres), #6 (prueba con OpenAI), #10 (textos de Romero),
#11 (sales tax), #14 (prueba con el widget instalado en la cuenta real, que cubre también #12) y los errores de la
[revisión del 2026-11-03](#revisión-de-código-2026-11-03) marcados como importantes.

**Lead de prueba en Kommo:** 407872 ("prueba", embudo Ventas). Quedaron en él, de la verificación del 2026-10-20,
`PRUEBA-widget-invoice.pdf` en el campo Invoice y `PRUEBA-widget-imagen.png` como archivo adjunto.

**Ids de los campos en Kommo** (cuenta `romerojeweler`, leads, desde el 2026-10-29): Invoice 288076 · Orden de
producción (PDF) 288078 · N° de Anillos 283974. Los campos `[N] …` de cada anillo los busca el widget por nombre. Los
anteriores (Invoice 133486, Metal 133508, Quilates 133510, Piedra 133562, Talla 133564) **se borraron**.

---

## 1. Guardar el PDF en el lead

**Decisión:** el PDF se guarda en un campo del lead llamado **Invoice**, de tipo archivo. Además se descarga.

**Hecho:**
- La API sube el PDF a Kommo Drive y lo pone en el campo (`src/lib/server/widget/kommo.ts`, `POST /api/invoices/:numero/pdf`).
- Si Kommo falla, el PDF se descarga igual y el widget avisa ("No se pudo guardar en el lead…").
- El campo guarda un solo archivo: un invoice nuevo del mismo lead reemplaza al anterior en el campo. El historial
  completo queda en la tabla `invoices` de Postgres.

**Falta:**
- ~~Crear el campo "Invoice"~~ Creado el 2026-10-20 (id 133486). **Reemplazado el 2026-10-29** por el campo Invoice
  de la pestaña "Orden" (**id 288076**): el widget le pasa su id a la API (`campo_id`); `KOMMO_CAMPO_INVOICE` queda solo
  de respaldo.
- ~~Verificar la API con la cuenta real~~ **Verificado el 2026-10-20** con `kommo.ts` (entonces en `server/src`) y el token de la
  cuenta, en el lead de prueba 407872: la subida a Kommo Drive (`drive-c.kommo.com`, sesión + partes) devuelve
  `uuid` y `version_uuid`, y el campo Invoice acepta el valor `{ file_uuid, version_uuid, file_name, file_size }`
  (Kommo corrige `file_size` con el tamaño real).
- Falta la prueba completa desde el widget instalado (#14).

## 2. Base de datos

**Decisión:** Postgres gestionado, con `DATABASE_URL`.

**Hecho:** tablas `ajustes` (plantilla y modelo de IA), `borradores` (por lead), `contadores` e `invoices`
(`src/lib/server/widget/db.ts`). El esquema se crea solo con el primer pedido. Sin `DATABASE_URL` la app usa PGlite
(Postgres en WASM) en `data/`, para desarrollar y para los tests.

**Falta:** agregar Postgres al proyecto de Railway (inyecta `DATABASE_URL`).

## 3. Numeración de facturas

**Decisión:** correlativo asignado por la API: `RJ-2026-0001`, `RJ-2026-0002`…

**Hecho:**
- El número se asigna al generar, antes de armar el PDF, porque va impreso en él. La asignación es atómica: dos
  asesores generando a la vez nunca reciben el mismo número (probado con 25 pedidos simultáneos).
- El contador **se reinicia cada año** (el año va en el número).
- **Al regenerar** el mismo invoice se conserva su número (queda en el borrador). "Restablecer" deja el borrador en
  blanco y el próximo invoice recibe un número nuevo. *Decidido al implementar; confirmar si sirve.*
- Un invoice "sin datos del cliente" (cotización) no recibe número ni se guarda en Kommo.

**Falta:** que Romero o su contador confirmen el formato `RJ-AAAA-NNNN` y el reinicio anual.

## 4. Dónde se publica

**Decisión:** Railway, en la cuenta de Holos.

**Cambio (2026-10-29):** el servidor aparte (`server/`) se quitó. El `railway.json` de la raíz que lo publicaba hacía
que Railway construyera solo ese servidor, y la **página de tracking dejó de existir**. Ahora la API del widget son
rutas de SvelteKit (`src/routes/api`) dentro de la misma app: **un solo servicio** con tracking (`/orders/…`) y API
(`/api/…`).

**Publicado** en `https://romero-jeweler-production.up.railway.app`; el widget usa `…/api` (`SERVIDOR_URL` en
`widget/script.js`).

**Hecho:** `Dockerfile` de la raíz (imagen oficial de Playwright, con Chromium; `vite build` con adapter-node y
`node build`) y `railway.json` de la raíz (healthcheck en `/api/salud`).

**Falta (Holos):**
1. Que el servicio de Railway use el `railway.json` de la raíz (si tenía *Config file path* `server/railway.json`,
   borrarlo).
2. Agregar Postgres al proyecto.
3. Variables: `ADMIN_KEY`, `OPENAI_API_KEY`, `KOMMO_SUBDOMAIN`, `KOMMO_ACCESS_TOKEN`,
   `KOMMO_CAMPO_INVOICE` y `ORIGENES` con `https://romerojeweler.kommo.com` (ver `.env.example`).
4. Revisar que la versión de la imagen del `Dockerfile` coincida con la de `playwright` del lockfile.

El `Dockerfile` no se pudo probar en local (no hay Docker en el equipo de desarrollo).

## 5. Seguridad de la clave del widget

**Decisión (actualizada el 2026-10-20):** la clave es **opcional**. Basta con que el widget mande las solicitudes a
la URL del servidor. Sin límite de uso.

**Hecho:** sin `WIDGET_KEY` el servidor no pide clave; si se define, exige el header `X-Widget-Key` (y el widget la
manda si está en sus ajustes). Para cambiar el modelo de IA hay una clave aparte (`ADMIN_KEY`) que no viaja al
navegador.

**Riesgo a tener presente:** sin clave, cualquiera que conozca la URL puede usar el servidor desde fuera del
navegador (`ORIGENES` solo frena a los navegadores): generar PDF, gastar IA, cambiar la plantilla y, con el token de
Kommo del servidor, subir archivos a leads de la cuenta. Si eso preocupa, basta con definir `WIDGET_KEY` en Railway
y ponerla en los ajustes del widget; no hace falta tocar código.

## 6. OpenAI: cuenta, modelo y costo

**Decisión:** cuenta de Holos; el modelo se cambia desde el servidor sin redesplegar; la IA se intenta siempre, con
fallback al texto estándar.

**Hecho:**
- El modelo queda guardado en Postgres. Se consulta y se cambia con la clave de administración:
  ```sh
  curl -H "X-Admin-Key: $ADMIN_KEY" https://romero-jeweler-production.up.railway.app/api/admin/ia
  curl -X PUT -H "X-Admin-Key: $ADMIN_KEY" -H "Content-Type: application/json" -d '{"modelo":"gpt-5-mini"}' https://romero-jeweler-production.up.railway.app/api/admin/ia
  ```
  `OPENAI_MODEL` es solo el modelo inicial.
- Si la IA no responde o falla, el invoice sale igual con el texto estándar y el widget lo avisa.

**Falta:** probar contra OpenAI con la clave de Holos (todavía no se hizo) y vigilar el gasto en la cuenta (no hay
tope por clave, ver #5).

## 7. Invoices en inglés

**Decisión:** la IA traduce todo, etiquetas y fechas incluidas.

**Hecho:**
- Además de la descripción y las cláusulas, el widget manda a la IA las etiquetas del documento ("Factura No.",
  "Total a pagar ahora"…), los títulos de los bloques, las fechas, el lema y los nombres de los depósitos
  (`etiquetasInvoice` en `src/lib/invoice/invoice.svelte.ts`).
- El control de cifras ahora **también cubre las fechas**: si la IA cambia un número o el mes de una fecha
  ("octubre" → "November"), ese texto queda en el original (`src/lib/server/widget/ia.ts`, tests en `ia.test.ts`).
- Sin IA, el invoice en inglés sale en español (como se decidió) y el widget lo avisa.

**Falta:** revisar un invoice real en inglés, con OpenAI activo.

## 8. Imágenes de referencia

**Decisión:** las imágenes viven en Kommo, en una pestaña de campos del lead, **"Imágenes de la pieza"**, un campo de
tipo archivo por imagen. **La pestaña y los campos los crea el widget** (no el servidor), con la API de Kommo y la
sesión del usuario, igual que el widget "IA Campos y Bots".

**Hecho:**
- Al instalar el widget (y al guardar sus ajustes, `onSave`) el widget crea la pestaña con **Imagen 1**, **Imagen 2** e
  **Imagen 3** si no existen.
- Antes de subir cada foto, el widget busca el primer campo libre del lead; si están todos ocupados, crea
  "Imagen 4", "Imagen 5"… sin límite. El servidor sube la foto a Drive y la guarda en ese campo (`X-Campo-Imagen`).
- El widget muestra las imágenes de esos campos, en orden, y también las adjuntas como archivos del lead.
- Probado de punta a punta contra el Kommo simulado (instalar, 4 fotos → "Imagen 4", reabrir).

**Falta:** instalar el widget en la cuenta real y ver que se creen las pestañas (subir a Drive y guardar en un campo
archivo ya están verificados, #1). Los adjuntos de **WhatsApp o Instagram** no son archivos del lead: el asesor los
sube desde el widget.

## 9. Dónde vive el borrador

**Decisión:** en el servidor, por lead.

**Hecho:** se carga al abrir la ventana y se guarda solo, un momento después de cada cambio. Si el servidor no
responde, queda una copia en el navegador y el widget avisa ("Sin conexión: guardado solo en este equipo").

**Concurrencia:** si dos asesores editan el mismo lead a la vez, **gana el último guardado**. *Decidido al
implementar; si se vuelve un problema, se puede avisar del conflicto.*

## 10. Textos legales y valores por defecto

**Decisión:** Romero revisa y confirma cada valor; los textos se editan en el diseñador sin tocar código.

**Hecho:** pestaña **Textos** en ajustes avanzados, con los valores por defecto (plazo del saldo, métodos de pago,
costo de talla, garantía…) y cada texto del invoice. Avisa si se escribe un marcador que no existe. Se guardan en
la plantilla (Postgres).

**Falta:** mandarle a Romero `docs/TEXTOS_PARA_ROMERO.md` y cargar sus correcciones antes de producción.

## 11. Sales tax

**Decisión:** pendiente del contador de Romero. Mientras tanto, 0 % editable.

**Falta:** que el contador confirme si aplica, en qué casos (pickup en Miami, envío dentro o fuera de Florida) y con
qué porcentaje. Según eso se quita la línea, se precarga un valor o se calcula por tipo de entrega.

## 12. Datos del lead en Kommo

**Decisión:** crear campos de producto y precargarlos; el precio del lead es solo lectura.

**Hecho:**
- El widget lee los campos **Metal** (133508), **Quilates** (133510), **Piedra** (133562) y **Talla** (133564) del
  lead **por id** (`CAMPOS_PRODUCTO` en `widget/script.js`); si un id no aparece, los busca por nombre. Los precarga
  en el invoice, con la etiqueta "Lead". El metal se reconoce si contiene "amarillo", "blanco", "rosa" o
  "platino"; si no, va como "Otro" con el texto tal cual.
- El precio del lead solo se lee (como presupuesto); el widget nunca lo modifica.

**Campos creados** el 2026-10-20 en la cuenta de Romero: Metal (lista: Oro amarillo, Oro blanco, Oro rosa, Platino),
Quilates (lista: 10k, 14k, 18k), Piedra (lista: Diamante, Esmeralda, Zafiro, Rubí, Moissanita, Morganita) y Talla
(área de texto). Tipos y opciones verificados por API el 2026-10-20.

**Cambio (2026-10-29):** esos cuatro campos sueltos se borraron al rehacer la pestaña "Orden". Ahora cada pieza tiene
sus campos `[N] Metal`, `[N] Quilates`, `[N] Piedra`, `[N] Talla`… en su grupo `*Anillo °N*` (ver "Varias piezas"
abajo), y las opciones de los campos de selección salen de las opciones compartidas (`/api/opciones`).

**Falta:** probar la precarga con un lead real, y verificar ahí el nombre del responsable
(`APP.constant('managers')`) y que el panel aparezca a la primera.

## 13. Dónde vive la API

**Decisión:** en este repo. **Hecho:** desde el 2026-10-29 es parte de la app de SvelteKit (`src/routes/api`), no un
servidor aparte (ver #4).

## 14. Instalación y distribución del widget

**Decisión:** instalación privada en la cuenta de Romero; Holos la instala y la prueba.

**Falta (Holos):**
1. `pnpm widget:zip` y subir `widget/invoice-romero-jeweler.zip` en Ajustes → Integraciones → Crear integración.
2. Nada más que configurar: el widget ya apunta al servidor de Railway (`https://romero-jeweler-production.up.railway.app`). La clave de los
   ajustes solo hace falta si se definió `WIDGET_KEY`.
3. Probar con un lead real: precarga del lead (#12), imágenes (#8), generar (número, PDF en el campo Invoice, #1 y
   #3), un invoice en inglés (#7) y el diseñador con los textos de Romero (#10).

## Orden de producción

**Pedido (2026-10-26):** un generador de órdenes de producción con el formato de la ficha de Romero (orden 1146), que
use la misma información que el invoice.

**Hecho:**
- Botón **Orden de producción** en la tarjeta del lead. La orden sale del **mismo borrador que el invoice**: Invoice #,
  fecha, fecha de entrega, cliente, total, pagos, video, y de la pieza: tipo, talla, metal, piedras (central y halo),
  grabado, notas e imágenes.
- Lo que el invoice no tiene se llena en la ventana de la orden y queda en la pestaña **"Orden de producción"** del
  lead, que crea el widget: Order #, Stuller O.#, Nivoda O.#, Width bottom, Thickness, Est. Weight, Head style, y el
  campo archivo **Orden de producción (PDF)** donde se guarda el PDF al generarlo.
- Formato igual al ejemplo: página "Order Details" y página "Cad Details Ring 1" con sus imágenes, en inglés.

**Por verificar:** probarla en la cuenta real con el widget instalado.

## Varias piezas, pestaña "Orden" y grupos por anillo

**Pedido (2026-10-29, `correcciones.md`):** varias piezas en el invoice y en la orden, todo en una pestaña "Orden"
con un grupo de campos por anillo para el widget Group Fields, opciones personalizadas, secciones plegables y la orden
en inglés o español.

**Hecho:**
- **Invoice:** la sección "Piezas" empieza vacía; cada pieza (tipo, metal, quilates, piedras, talla, grabado, notas) y
  cada piedra se pliegan. Solo tipos de anillo (compromiso mujer/hombre, bodas mujer/hombre, a la medida). "+ Otro
  metal", "+ Otro quilate", "+ Otro tipo", "+ Otra forma" y "+ Otra ubicación" quedan para todos los clientes y como
  opción de los campos de Kommo. Todas las secciones y la barra de la izquierda se pliegan. Las imágenes se eligen por
  pieza.
- **Orden:** "Order Details" y un "Cad Details Ring N" por pieza, cada uno con sus imágenes. Filas por defecto como en
  el ejemplo; "+ Agregar otro campo" (uno configurado o uno nuevo, que se crea en todos los anillos), x para quitar,
  "+ Agregar otro anillo". Inglés o español: los nombres de las filas siempre, los valores solo si se marca.
- **Kommo:** pestaña "Orden" con los campos del pedido y los grupos `*Anillo °N*` … `*!` (`[N] Metal`, `[N] Quilates`,
  `[N] Piedra`, `[N] Talla`, `[N] Ring Type`, `[N] Size`, `[N] Width`, `[N] Thickness`, `[N] Est. Weight`,
  `[N] Engraving`, `[N] Head style`, `[N] Halo Stones`, `[N] Notes`, más los creados). Metal, Quilates y Ring Type son
  de selección y Piedra de selección múltiple. "N° de Anillos" (283974) se guarda al generar.
- Probado de punta a punta contra el Kommo simulado (instalar, 2 piezas, opciones nuevas, invoice, orden en español con
  un campo creado y un tercer anillo, y un valor cambiado a mano en Kommo).

**Cambio (2026-10-29, en la cuenta real):** el widget no pudo mover campos entre pestañas, y Group Fields no aparece en
`/api/v4/widgets` (no se pueden tocar sus ajustes). A pedido del equipo, la pestaña "Orden" se rehízo con la API: se
borraron los campos de "Orden de producción" y "Widget Invoice" (y esas pestañas) y se crearon los del pedido y el
grupo del anillo 1. Los grupos cierran con `*!` (no `*!*`) para que Group Fields los reconozca; Group Fields solo
necesita "N° de Anillos". Los anillos 2, 3… los crea el widget cuando hacen falta.

**Por verificar en la cuenta real:** instalar el widget nuevo, generar un invoice con 2 piezas en el lead de prueba
407872 y ver que se cree el grupo "Anillo °2" y que Group Fields lo muestre.

**Dudas del documento:** la lista de campos por anillo trae "Metal" dos veces (se creó una sola) y trae "Talla" y "Size";
se crearon los dos y los dos se llenan con la talla de la pieza.

**Análisis de usabilidad (skill `ux-heuristics`, 7/10 antes):** se corrigió todo lo encontrado. Quitar una pieza, piedra,
depósito, anillo o fila de la orden ya no pregunta "¿seguro?": muestra "Deshacer" unos segundos. El pie dice qué falta
("el tipo de la pieza 2", no "pieza"). Los botones de pieza bajo cada imagen tienen rótulo y son más grandes. En la orden,
lo que viene del invoice lleva la etiqueta "del invoice". "+ Otro…" avisa que la opción queda para todos y en Kommo.
"Ocultar índice" en vez de "Ocultar", y menos texto en las ayudas.


## Video del cliente (Dropbox)

**Pedido (2026-11-03):** detectar cuándo el video del cliente está terminado en Dropbox y automatizar en Kommo el
envío y el check de "video enviado".

**Decidido:** el identificador es el **número de la orden pagada de Shopify** (carpeta `1146/`, video
`1146_completo.mp4`, campo "Order #" del lead). El cliente recibe un **link compartido de Dropbox a la carpeta de la orden** (los videos pasan
de los 9 MB que acepta Kommo, y a veces se mandan varios formatos del mismo video). Cambio del 2026-11-06: antes era el
link del archivo. La detección es por **webhook de Dropbox**.

**Hecho** (`src/lib/server/widget/dropbox.ts`, `videos.ts`, `src/routes/api/videos`):
- Webhook firmado (`X-Dropbox-Signature`). Pide los cambios con `list_folder/continue` y el cursor guardado en
  `ajustes`. El cursor se toma **al arrancar la app** (`init` de `hooks.server.ts`), así el primer video ya cuenta.
- Con un video completo, busca el lead por "Order #" (`GET /api/v4/leads?query=` y comparación exacta). Guarda el link de
  la carpeta (pedido como público: si la política del equipo lo deja solo para el equipo, falla con un aviso) en "Video (link)",
  deja una nota y lanza el Salesbot `KOMMO_BOT_VIDEO`.
- **Una sola vez por orden, aunque haya varias réplicas:** `avisado` se marca en la tabla `videos` con un upsert
  atómico *antes* de lanzar el bot; si el bot falla, se desmarca. Si la app muere justo entre medio, gana no
  mandarlo dos veces (para reenviar, borrar la fila).
- **Pendientes:** sin lead, con varios leads o con un error, la fila queda con `carpeta` y sin `avisado`, y se reintenta
  en cada pasada (webhook o repaso cada 10 min) durante 30 días. Se usa la carpeta guardada, sin buscarla por nombre (con dos carpetas iguales podría elegir otra, y el índice de
  `search_v2` tarda). Así el video sale solo cuando un asesor llena el
  Order # después. Con varios leads, la nota se deja una vez por combinación de leads.
- Con `DROPBOX_RAIZ`, el webhook solo acepta `<raiz>/<orden>/<orden>_completo.*` (lo mismo que mira `GET/POST`); sin
  ella, la carpeta de la orden puede estar a cualquier profundidad.
- Se avisa con el primer `_completo`; los demás formatos ya están en la carpeta compartida (`GET /api/videos/:orden`
  lista los que hay en `videos`). Si se borra o mueve la **carpeta** de una orden ya enviada, se deja una nota en el
  lead (el link deja de abrir); borrar un solo video no la rompe.
- **Riesgo aceptado:** el cliente ve todo lo que haya en la carpeta de la orden (invoice, orden de producción,
  borradores). Mover los videos a una subcarpeta aparte lo evitaría; hoy se comparte la carpeta tal cual.
- Si Dropbox reinicia el cursor (`reset`), lo que cambió entre medio se pierde: queda un aviso en el log y esos videos
  se pasan a mano con `POST /api/videos/:orden`.
- `GET /api/videos/:orden` dice cómo está el video, sin efectos. `POST` lo revisa a mano (videos que ya estaban, o
  un webhook perdido).
- Cuenta de equipo: se agrega `Dropbox-API-Path-Root` si `get_current_account` dice `team`.
- "Video (link)" (URL) y "Video enviado" (casilla) se crean **a mano** en Kommo, con esos nombres exactos: el cambio
  del widget que los creaba se descartó. La app busca "Video (link)" por nombre; "Video enviado" solo lo marca el bot.
- Probado contra un Dropbox y un Kommo simulados (`app.test.ts`).

**Falta (Holos / Romero):**
1. App de Dropbox, refresh token y webhook (pasos en el README). Confirmar la estructura real de carpetas para fijar
   `DROPBOX_RAIZ`, y si es una cuenta de equipo.
2. Salesbot "Enviar video": mensaje de WhatsApp con el link (texto que confirma Romero) y marcar "Video enviado". Su id
   va en `KOMMO_BOT_VIDEO`.
3. Crear a mano en la pestaña Orden los campos "Video (link)" y "Video enviado".
4. Prueba real: `PRUEBA/PRUEBA_completo.mp4` con "Order #" = PRUEBA en el lead de prueba **407872**.
5. Hasta que llegue lo de Shopify, el "Order #" se llena a mano.

## Shopify: link de pago (pendiente)

**Pedido (2026-11-03):** al generar el link de pago, identificar el lead y guardar en Kommo el id de la orden.
**Queda para después.** Antes hay que preguntarle a Romero cómo crea hoy los links de pago.

**Propuesta** (APIs revisadas el 2026-11-03, Admin GraphQL 2026-10):
- Lo ideal: que **el widget cree el draft order** desde el invoice (`draftOrderCreate`, con el id del lead en
  `customAttributes`) y guarde en Kommo el `invoiceUrl` (el link de pago) y el nombre del draft (`#D12`).
- El número de la orden (`#1146`) recién existe cuando el cliente paga. El webhook `orders/paid` (firma
  `X-Shopify-Hmac-Sha256`, dedupe con `X-Shopify-Webhook-Id`) llenaría "Order #" del lead. Iría en
  `src/routes/api/shopify` (carpeta ya creada, vacía).
- Autenticación: app del **Dev Dashboard** con *client credentials grant* (token de 24 h, la app y la tienda en la
  misma organización). Desde 2026 ya no se pueden crear apps personalizadas desde el admin de Shopify.
- **Verificar** con un draft de prueba que los `customAttributes` pasan a la orden al pagarla (la documentación no lo
  dice). Si no pasan, guardar la relación draft → lead en la app y buscarla desde `orders/paid`.

## Revisión de código (2026-11-03)

Se revisaron los commits `eb3e0a1`…`cfb5204` (de `6439010` en adelante) y la guardia de `/api`. `pnpm check` da 0
errores, `pnpm build` compila y `pnpm test:api` pasa 29/29 (en Linux). Solo está corregido el #1.

**Importantes:**

1. ~~**La guardia de `/api` se salta codificando la ruta**~~ **Corregido el 2026-11-03** (`event.route.id`, test en `app.test.ts`) (`src/hooks.server.ts`). El hook compara `event.url.pathname`
   sin decodificar, pero SvelteKit busca la ruta decodificada (`decode_pathname`). `PUT /%61pi/borradores/407872` llega
   al handler sin CORS ni `X-Widget-Key`, aunque `WIDGET_KEY` esté definida. Lo mismo cambia si `/api/salud` y
   `/api/admin` quedan libres o no. Arreglo: decidir con `event.route.id` (la ruta que SvelteKit reconoció).
2. **Si `leerOrden` falla, la orden abre con el borrador de otro lead** (`OrdenProduccion.svelte`, `onMount`). En el
   error no se carga el borrador: queda el anterior (otro lead de la misma página de Kommo) y el autoguardado o
   "Generar" lo escriben en este lead. `Generador.svelte` ya lo evita con `.catch(() => null)`.
3. **Valores viejos de Kommo pasan al anillo equivocado** (`anilloAKommo` / `aplicarKommo` en `invoice.svelte.ts`).
   `anilloAKommo` no manda vacíos los campos propios de la orden (Width, Thickness, Est. Weight, Head style, `x_*`) que
   la pieza no tiene; al quitar una pieza, el grupo N conserva los de la anterior y al reabrir se copian a la nueva.
4. **`estructura()` sin exclusión** (`widget/script.js`). Dos llamadas a la vez (agregar pieza dos veces, o agregar y
   generar) pueden crear dos veces el mismo grupo `*Anillo °N*`; dos PATCH de opciones en paralelo mandan cada uno la
   lista completa y Kommo borra la opción del otro. Arreglo: una cola de promesas.
5. **Opciones compartidas: gana el último** (`/api/opciones`, POST). Lee, agrega y reescribe todo el documento; dos
   asesores a la vez pierden una opción (que sí queda en Kommo).

**Menores:**

- "Ring Type" cambiado en la fila de la orden sale en el PDF pero no va a Kommo (`anilloAKommo` usa siempre `p.tipo`).
- El cierre `*!` se busca por `sort` (1000 + N·100 … +99): si el grupo 1 hecho a mano tiene otro `sort`, el widget puede
  crear un `*!` repetido. Verificar en la cuenta real.
- "Deshacer" al quitar un depósito restaura la foto completa y pisa lo cambiado en esos 8 s.
- `+error.svelte`: `notFound` (nombre en inglés); un 403/410 en `/orders/…` pierde el texto del pedido; el título
  bilingüe es tan largo que el inglés no se ve en la pestaña.
- El tour (`widget/_tour_src/capturas.mjs`) todavía busca el formulario de una sola pieza (`#f-pieza`).

**Revisado sin defectos:** migración de borradores viejos, montos (`totales`), promesas jQuery, `campo_id` con respaldo,
413, timeouts de 30 s, tope de 9 MB y compresión de imágenes, `validarTraduccion`.
