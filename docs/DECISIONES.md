# Decisiones — widget de invoice

Decisiones para poner el widget de invoice de Romero Jeweler en producción. Las tomó **ctineo (Holos) el
2026-10-20**; aquí queda cada una con lo que ya está hecho en el código y lo que falta.

Estado: **Hecho** (implementado y probado contra un Kommo simulado) · **Por verificar** (hecho, falta probarlo en la
cuenta real) · **Externo** (depende de Romero, su contador o una configuración que hace Holos).

## Resumen

| # | Decisión | Estado | Qué falta |
| --- | --- | --- | --- |
| 1 | PDF al campo "Invoice" (archivo) del lead | Hecho | API verificada con la cuenta real; falta la prueba desde el widget (#14) |
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
| 12 | Campos de producto y precio del lead solo lectura | Por verificar | Campos creados; probar la precarga con un lead real |
| 13 | La API va dentro de la app de SvelteKit | Hecho | — |
| 14 | Instalación privada; la hace y la prueba Holos | Externo | Instalar y probar con un lead real |

**Bloquea producción:** #3 (formato), #4 (app publicada con Postgres), #6 (prueba con OpenAI), #10 (textos de Romero),
#11 (sales tax) y #14 (prueba con el widget instalado en la cuenta real, que cubre también #12).

**Lead de prueba en Kommo:** 407872 ("prueba", embudo Ventas). Quedaron en él, de la verificación del 2026-10-20,
`PRUEBA-widget-invoice.pdf` en el campo Invoice y `PRUEBA-widget-imagen.png` como archivo adjunto.

**Ids de los campos en Kommo** (cuenta `romerojeweler`, leads): Invoice 133486 · Metal 133508 · Quilates 133510 ·
Piedra 133562 · Talla 133564.

---

## 1. Guardar el PDF en el lead

**Decisión:** el PDF se guarda en un campo del lead llamado **Invoice**, de tipo archivo. Además se descarga.

**Hecho:**
- La API sube el PDF a Kommo Drive y lo pone en el campo (`src/lib/server/widget/kommo.ts`, `POST /api/invoices/:numero/pdf`).
- Si Kommo falla, el PDF se descarga igual y el widget avisa ("No se pudo guardar en el lead…").
- El campo guarda un solo archivo: un invoice nuevo del mismo lead reemplaza al anterior en el campo. El historial
  completo queda en la tabla `invoices` de Postgres.

**Falta:**
- ~~Crear el campo "Invoice"~~ Creado el 2026-10-20: **id 133486**, tipo archivo. Va en `KOMMO_CAMPO_INVOICE`.
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
- **Kommo:** pestaña "Orden" con los campos del pedido y los grupos `*Anillo °N*` … `*!*` (`[N] Metal`, `[N] Quilates`,
  `[N] Piedra`, `[N] Talla`, `[N] Ring Type`, `[N] Size`, `[N] Width`, `[N] Thickness`, `[N] Est. Weight`,
  `[N] Engraving`, `[N] Head style`, `[N] Halo Stones`, `[N] Notes`, más los creados). Metal, Quilates y Ring Type son
  de selección y Piedra de selección múltiple. "N° de Anillos" (283974) se guarda al generar. Al crear un grupo, el
  widget agrega "Anillo °N" a la regla de Group Fields. Las pestañas "Widget Invoice" y "Orden de producción" se
  vacían en "Orden" y se borran; los campos sueltos Metal/Quilates/Piedra/Talla se dejan y precargan la primera pieza.
- Probado de punta a punta contra el Kommo simulado (instalar, 2 piezas, opciones nuevas, invoice, orden en español con
  un campo creado y un tercer anillo, y un valor cambiado a mano en Kommo).

**Por verificar en la cuenta real** (solo se probó en el simulado):
1. Que Kommo deje mover campos de pestaña (`PATCH /api/v4/leads/custom_fields` con `group_id`) y borrar las pestañas viejas.
2. Que `GET/POST /api/v4/widgets/{código}` lea y guarde los ajustes de Group Fields (`ring_config`) sin perder su
   `api_key`. Si no, la regla se ajusta a mano en Group Fields.
3. Que Kommo acepte varios campos con el mismo nombre (`*!*`, uno por grupo).

**Dudas del documento:** la lista de campos por anillo trae "Metal" dos veces (se creó una sola) y trae "Talla" y "Size";
se crearon los dos y los dos se llenan con la talla de la pieza.

**Análisis de usabilidad (skill `ux-heuristics`, 7/10 antes):** se corrigió todo lo encontrado. Quitar una pieza, piedra,
depósito, anillo o fila de la orden ya no pregunta "¿seguro?": muestra "Deshacer" unos segundos. El pie dice qué falta
("el tipo de la pieza 2", no "pieza"). Los botones de pieza bajo cada imagen tienen rótulo y son más grandes. En la orden,
lo que viene del invoice lleva la etiqueta "del invoice". "+ Otro…" avisa que la opción queda para todos y en Kommo.
"Ocultar índice" en vez de "Ocultar", y menos texto en las ayudas.

