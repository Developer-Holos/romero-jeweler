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
| 3 | Correlativo `RJ-AAAA-NNNN` del servidor | Hecho · Externo | Que Romero o su contador confirmen el formato |
| 4 | Railway, cuenta de Holos | Hecho | Publicado; falta agregarle Postgres y las variables |
| 5 | Clave opcional (basta la URL), sin límite de uso | Hecho | — |
| 6 | OpenAI de Holos, modelo editable, fallback | Hecho · Por verificar | Probar con la clave real |
| 7 | La IA traduce todo | Hecho · Por verificar | Revisar un invoice en inglés real |
| 8 | Imágenes en Kommo | Hecho | API verificada con la cuenta real; adjuntos de chats sin resolver |
| 9 | Borrador en el servidor, por lead | Hecho | — |
| 10 | Textos legales en el diseñador; Romero los revisa | Hecho · Externo | Que Romero confirme `docs/TEXTOS_PARA_ROMERO.md` |
| 11 | Sales tax | Externo | Respuesta del contador (mientras tanto 0 % editable) |
| 12 | Campos de producto y precio del lead solo lectura | Por verificar | Campos creados; probar la precarga con un lead real |
| 13 | El servidor se queda en este repo | Hecho | — |
| 14 | Instalación privada; la hace y la prueba Holos | Externo | Instalar y probar con un lead real |

**Bloquea producción:** #3 (formato), #4 (servidor publicado), #6 (prueba con OpenAI), #10 (textos de Romero),
#11 (sales tax) y #14 (prueba con el widget instalado en la cuenta real, que cubre también #12).

**Lead de prueba en Kommo:** 407872 ("prueba", embudo Ventas). Quedaron en él, de la verificación del 2026-10-20,
`PRUEBA-widget-invoice.pdf` en el campo Invoice y `PRUEBA-widget-imagen.png` como archivo adjunto.

**Ids de los campos en Kommo** (cuenta `romerojeweler`, leads): Invoice 133486 · Metal 133508 · Quilates 133510 ·
Piedra 133562 · Talla 133564.

---

## 1. Guardar el PDF en el lead

**Decisión:** el PDF se guarda en un campo del lead llamado **Invoice**, de tipo archivo. Además se descarga.

**Hecho:**
- El servidor sube el PDF a Kommo Drive y lo pone en el campo (`server/src/kommo.ts`, `POST /invoices/:numero/pdf`).
- Si Kommo falla, el PDF se descarga igual y el widget avisa ("No se pudo guardar en el lead…").
- El campo guarda un solo archivo: un invoice nuevo del mismo lead reemplaza al anterior en el campo. El historial
  completo queda en la tabla `invoices` de Postgres.

**Falta:**
- ~~Crear el campo "Invoice"~~ Creado el 2026-10-20: **id 133486**, tipo archivo. Va en `KOMMO_CAMPO_INVOICE`.
- ~~Verificar la API con la cuenta real~~ **Verificado el 2026-10-20** con `server/src/kommo.ts` y el token de la
  cuenta, en el lead de prueba 407872: la subida a Kommo Drive (`drive-c.kommo.com`, sesión + partes) devuelve
  `uuid` y `version_uuid`, y el campo Invoice acepta el valor `{ file_uuid, version_uuid, file_name, file_size }`
  (Kommo corrige `file_size` con el tamaño real).
- Falta la prueba completa desde el widget instalado (#14).

## 2. Base de datos

**Decisión:** Postgres gestionado, con `DATABASE_URL`.

**Hecho:** tablas `ajustes` (plantilla y modelo de IA), `borradores` (por lead), `contadores` e `invoices`
(`server/src/db.ts`). El esquema se crea solo al arrancar. Sin `DATABASE_URL` el servidor usa PGlite (Postgres en
WASM) en `server/data/`, para desarrollar y para los tests.

**Falta:** agregar Postgres al proyecto de Railway (inyecta `DATABASE_URL`).

## 3. Numeración de facturas

**Decisión:** correlativo asignado por el servidor: `RJ-2026-0001`, `RJ-2026-0002`…

**Hecho:**
- El número se asigna al generar, antes de armar el PDF, porque va impreso en él. La asignación es atómica: dos
  asesores generando a la vez nunca reciben el mismo número (probado con 25 pedidos simultáneos).
- El contador **se reinicia cada año** (el año va en el número).
- **Al regenerar** el mismo invoice se conserva su número (queda en el borrador). "Restablecer" deja el borrador en
  blanco y el próximo invoice recibe un número nuevo. *Decidido al implementar; confirmar si sirve.*
- Un invoice "sin datos del cliente" (cotización) no recibe número ni se guarda en Kommo.

**Falta:** que Romero o su contador confirmen el formato `RJ-AAAA-NNNN` y el reinicio anual.

## 4. Dónde se publica el servidor

**Decisión:** Railway, en la cuenta de Holos.

**Publicado** en `https://romero-jeweler-production.up.railway.app` (el widget lo usa por defecto).

**Hecho:** `server/Dockerfile` (imagen oficial de Playwright, con Chromium) y `server/railway.json` (healthcheck en
`/salud`). Se construye desde la raíz del repo.

**Falta (Holos):**
1. Crear el servicio en Railway desde este repo, con *Config file path* `server/railway.json`.
2. Agregar Postgres al proyecto.
3. Variables: `ADMIN_KEY`, `OPENAI_API_KEY`, `KOMMO_SUBDOMAIN`, `KOMMO_ACCESS_TOKEN`,
   `KOMMO_CAMPO_INVOICE` y `ORIGENES` con `https://romerojeweler.kommo.com` (ver `server/.env.example`).
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
  curl -H "X-Admin-Key: $ADMIN_KEY" https://<servidor>/admin/ia
  curl -X PUT -H "X-Admin-Key: $ADMIN_KEY" -H "Content-Type: application/json" -d '{"modelo":"gpt-5-mini"}' https://<servidor>/admin/ia
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
  ("octubre" → "November"), ese texto queda en el original (`server/src/ia.ts`, tests en `ia.test.ts`).
- Sin IA, el invoice en inglés sale en español (como se decidió) y el widget lo avisa.

**Falta:** revisar un invoice real en inglés, con OpenAI activo.

## 8. Imágenes de referencia

**Decisión:** las imágenes viven en Kommo; el servidor no las guarda.

**Hecho:**
- Las que sube el asesor desde el widget se suben a Kommo Drive y se adjuntan al lead.
- El widget muestra las imágenes que ya están adjuntas al lead (subidas desde el widget o a mano en Kommo) para
  elegirlas.
- El borrador guarda solo las referencias (uuid), y las imágenes pasan por el servidor porque Kommo Drive pide el
  token.

**Verificado el 2026-10-20** con la cuenta real (lead de prueba 407872): subir una imagen, adjuntarla al lead,
listarla entre los archivos del lead y descargarla (mismos bytes). Kommo devuelve el nombre sin extensión; el tipo se
reconoce por el metadato del archivo.

**Falta:**
- Los adjuntos que el cliente manda por **WhatsApp o Instagram** no son archivos del lead en Kommo: no aparecen.
  Para usarlos, el asesor los adjunta al lead o los sube desde el widget. Si hace falta leerlos directo del chat,
  es otra investigación de la API.

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

## 13. Repositorio del servidor

**Decisión:** se queda en este repo. **Hecho.** Railway despliega solo `server/` (ver #4).

## 14. Instalación y distribución del widget

**Decisión:** instalación privada en la cuenta de Romero; Holos la instala y la prueba.

**Falta (Holos):**
1. `pnpm widget:zip` y subir `widget/invoice-romero-jeweler.zip` en Ajustes → Integraciones → Crear integración.
2. Nada más que configurar: el widget ya apunta al servidor de Railway (`https://romero-jeweler-production.up.railway.app`). Los ajustes solo hacen
   falta para usar otro servidor o si se definió `WIDGET_KEY`.
3. Probar con un lead real: precarga del lead (#12), imágenes (#8), generar (número, PDF en el campo Invoice, #1 y
   #3), un invoice en inglés (#7) y el diseñador con los textos de Romero (#10).
