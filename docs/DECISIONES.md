# Decisiones pendientes — widget de invoice

Lo que el equipo tiene que decidir antes de poner el widget de invoice en producción para Romero Jeweler.
Cada punto dice cómo está hoy, las opciones, una recomendación y qué se necesita para decidir.
Al decidir, anotar la respuesta en **Decisión** con la fecha y quién decidió.

Estado del código al escribir esto (2026-10-20): rama `claude/invoice-generator-widget-c75271`. El widget
(`widget/`), el servidor (`server/`) y el tour están hechos y probados en un Kommo simulado. Todavía no se
instaló en la cuenta real de Kommo.

## Resumen

| # | Decisión | Bloquea producción | Recomendación |
| --- | --- | --- | --- |
| 1 | [¿Guardar el PDF en el lead?](#1-guardar-el-pdf-en-el-lead) | No | Por ahora no; si se pide, como archivo adjunto del lead |
| 2 | [¿Base de datos?](#2-base-de-datos) | Depende del hosting | Postgres gestionado si se quiere historial; si no, seguir con el archivo JSON |
| 3 | [Numeración de facturas](#3-numeración-de-facturas) | **Sí** | Número correlativo asignado por el servidor |
| 4 | [Dónde se publica el servidor](#4-dónde-se-publica-el-servidor) | **Sí** | Railway, como los otros proxies de Holos |
| 5 | [Seguridad de la clave del widget](#5-seguridad-de-la-clave-del-widget) | No | Aceptar por ahora, igual que los otros widgets |
| 6 | [OpenAI: cuenta, modelo y costo](#6-openai-cuenta-modelo-y-costo) | **Sí** (para usar IA) | Cuenta de Romero o de Holos; modelo chico |
| 7 | [Invoices en inglés](#7-invoices-en-inglés) | No | Diccionario fijo para las etiquetas del PDF |
| 8 | [Imágenes de referencia](#8-imágenes-de-referencia) | No | Guardarlas en el servidor junto al borrador |
| 9 | [Dónde vive el borrador](#9-dónde-vive-el-borrador) | No | Va de la mano con la #2 |
| 10 | [Textos legales y valores por defecto](#10-textos-legales-y-valores-por-defecto) | **Sí** | Que Romero los revise y confirme |
| 11 | [Sales tax](#11-sales-tax) | **Sí** | Que lo confirme el contador de Romero |
| 12 | [Datos del lead en Kommo](#12-datos-del-lead-en-kommo) | No | Probar en la cuenta real; crear campos solo si se usan |
| 13 | [Repositorio del servidor](#13-repositorio-del-servidor) | No | Dejarlo en este repo mientras sea un solo cliente |
| 14 | [Instalación y distribución del widget](#14-instalación-y-distribución-del-widget) | **Sí** | Subida privada a la cuenta de Romero |

---

## 1. Guardar el PDF en el lead

**Hoy:** el PDF se genera en el servidor y **solo se descarga** en el equipo del asesor. Kommo no se entera de
que se emitió un invoice.

**Opciones:**
- **a) Dejarlo así.** Sin cambios. El asesor manda el PDF por el chat como cualquier archivo.
- **b) Adjuntarlo al lead** (sección Archivos de Kommo) desde el servidor. Necesita un token de Kommo en el
  servidor (`KOMMO_ACCESS_TOKEN`, ya existe para el tracking) y la API de archivos de Kommo.
- **c) Nota en el lead** con el número, el total y un enlace al PDF guardado en el servidor. Necesita guardar los
  PDF (ver #2) y servirlos con un enlace que no se pueda adivinar.
- **d) Mover el lead de etapa** (ej. a "Invoice Enviado", id 113110407) al generar. Se puede combinar con b o c.

**Recomendación:** a) por ahora (es lo que se pidió). Si el equipo quiere ver en Kommo qué invoices se
mandaron, b) es lo más simple y no requiere base de datos.

**Para decidir:** ¿los asesores o Romero necesitan ver los invoices desde Kommo?

**Decisión:** _pendiente_

## 2. Base de datos

**Hoy no hay base de datos:**
- La plantilla de diseño compartida es un archivo `server/data/plantilla.json`.
- Los borradores de cada lead viven en el navegador de cada asesor (`localStorage`).
- Los invoices emitidos no se registran en ningún lado.

**Opciones:**
- **a) Seguir sin base de datos.** Alcanza mientras solo haya que guardar la plantilla. El hosting necesita
  disco persistente (si el disco se borra al redesplegar, se pierde el diseño).
- **b) SQLite en el servidor** (`node:sqlite`, sin dependencias). Simple; también pide disco persistente.
- **c) Postgres gestionado** (Railway, Supabase o Neon) con `DATABASE_URL`. Funciona en cualquier hosting y con
  varios asesores a la vez.
- **d) Guardar todo en Kommo** (campos o notas del lead). Sin base propia, pero limitado para la plantilla y
  para consultar el historial.

**Qué necesitaría base de datos:** el historial de invoices emitidos, el número correlativo (#3), los borradores
compartidos entre asesores o dispositivos (#9) y las imágenes subidas (#8).

**Recomendación:** si se quiere cualquiera de esas cuatro cosas, c). Si no, a).

**Para decidir:** ¿hace falta historial de invoices o un número correlativo? ¿Dónde se publica el servidor (#4)?

**Decisión:** _pendiente_

## 3. Numeración de facturas

**Hoy:** el número se arma en el navegador: `RJ-INV-AAAA-MMDD-XX`, donde XX son las iniciales del cliente (ej.
`RJ-INV-2026-1020-DO`). Problemas:
- Dos invoices para el mismo cliente el mismo día salen con **el mismo número**.
- No es correlativo, y para efectos contables puede que tenga que serlo.
- Al generar de nuevo (por un cambio) se repite el número, aunque el contenido sea otro.

**Opciones:**
- **a) Dejarlo así** y que el asesor lo corrija a mano si choca (hoy el campo no es editable).
- **b) Agregar un sufijo** (ej. `-2`) cuando se genera más de uno el mismo día para ese lead. No es correlativo.
- **c) Correlativo asignado por el servidor** (`RJ-2026-0001`, `0002`…). Necesita base de datos (#2).
- **d) Usar el id del lead** (`RJ-INV-21458233`) más una versión (`-v2`).

**Recomendación:** c) si Romero lleva contabilidad por número de factura; si no, d), que es único y fácil de
buscar en Kommo.

**Para decidir:** preguntarle a Romero (o a su contador) qué formato necesita.

**Decisión:** _pendiente_

## 4. Dónde se publica el servidor

**Hoy:** el servidor (`server/`) solo corre en local. Necesita:
- **Chromium** para generar el PDF (Playwright), así que no sirve un hosting serverless como Vercel.
- **Disco persistente** si la plantilla sigue en un archivo (#2).
- **HTTPS**, y el dominio de Kommo en `ORIGENES`.

**Opciones:** Railway (donde ya están `server-widget-chats` y otros proxies de Holos), un VPS, Render o Fly.io.

**Recomendación:** Railway con un volumen para `data/`, igual que los demás proxies.

**Para decidir:** quién paga el hosting (Holos o Romero) y bajo qué cuenta queda.

**Decisión:** _pendiente_

## 5. Seguridad de la clave del widget

**Hoy:** la clave (`widget_key`) se configura en los ajustes del widget y viaja en el header `X-Widget-Key`. Como
el widget corre en el navegador, **cualquier usuario de la cuenta de Kommo puede verla** con las herramientas del
navegador. Con ella se pueden generar PDF, gastar IA y cambiar la plantilla de diseño. El servidor además solo
acepta los orígenes de `ORIGENES`.

**Opciones:**
- **a) Aceptarlo**, igual que los otros widgets de Holos con proxy. El riesgo se limita a gente de la cuenta.
- **b) Límite de uso** por clave (ej. N invoices por minuto) para acotar el gasto de IA.
- **c) Validar la sesión de Kommo** en el servidor en vez de una clave fija. Más seguro, más trabajo.

**Recomendación:** a) con b) para la IA.

**Decisión:** _pendiente_

## 6. OpenAI: cuenta, modelo y costo

**Hoy:** la IA está lista pero **no se probó contra OpenAI** (falta la clave). Sin `OPENAI_API_KEY` el widget
genera igual el PDF, con el texto armado de los campos. El modelo por defecto es `gpt-5-mini` y se cambia con
`OPENAI_MODEL`. Cada invoice hace una sola llamada, chica.

**Para decidir:**
- ¿Con qué cuenta de OpenAI (Romero o Holos)? ¿Quién paga?
- ¿Qué modelo? Uno chico alcanza para pulir viñetas y traducir.
- ¿La IA es obligatoria o un extra? Hoy es un extra: si falla, el PDF sale con el texto estándar.

**Decisión:** _pendiente_

## 7. Invoices en inglés

**Hoy:** si el invoice va en inglés, la IA traduce la descripción y las condiciones, pero las **etiquetas fijas
del PDF siguen en español** ("Factura No.", "Total a pagar ahora", "Facturado a", las fechas, etc.). Sin IA, todo
sale en español.

**Opciones:**
- **a) Diccionario fijo** para las etiquetas y fechas (sin IA, siempre igual), y la IA solo para los textos libres.
- **b) Que la IA traduzca todo**, etiquetas incluidas. Más caro y puede variar entre invoices.
- **c) Plantillas de condiciones ya escritas en inglés** por Romero, sin depender de la IA.

**Recomendación:** a) + c) si Romero tiene sus condiciones en inglés.

**Para decidir:** ¿cuántos clientes reciben el invoice en inglés? ¿Romero tiene textos oficiales en inglés?

**Decisión:** _pendiente_

## 8. Imágenes de referencia

**Hoy:** el asesor sube los renders o fotos desde su equipo. **No se guardan con el borrador**: si cierra la ventana,
tiene que volver a subirlas. Tampoco se leen los archivos que el cliente mandó por el chat de Kommo.

**Opciones:**
- **a) Dejarlo así.**
- **b) Guardar las imágenes en el servidor** junto al borrador del lead (necesita almacenamiento, ver #2).
- **c) Leer los archivos adjuntos del lead en Kommo** para elegir de ahí. Depende de que la API de Kommo los
  exponga para los chats (WhatsApp, Instagram); hay que investigarlo.

**Recomendación:** b) si se hace la base de datos; c) solo después de confirmar que la API lo permite.

**Decisión:** _pendiente_

## 9. Dónde vive el borrador

**Hoy:** el borrador de cada lead se guarda en el navegador del asesor. Si otro asesor abre el mismo lead, o el mismo
asesor desde otro equipo, empieza de cero.

**Opciones:** a) dejarlo así; b) guardarlo en el servidor por lead (necesita #2).

**Recomendación:** decidirlo junto con #2. Si cada lead lo atiende siempre un solo asesor desde su equipo, a) alcanza.

**Decisión:** _pendiente_

## 10. Textos legales y valores por defecto

Todo esto está escrito en el código (`src/lib/invoice/invoice.svelte.ts`) y **nadie de Romero lo revisó**:
- Razón social del pie: "Golden Rooster LLC, dba Romero Jeweler · Miami, FL · contact@yrjeweler.com".
- Condiciones: plazo de 15 días para pagar el saldo; ajuste de talla $100 por talla adicional y 60 días de espera;
  garantía de 12 meses; no hay devoluciones y los depósitos no se reembolsan.
- Plan de depósitos por defecto: 50 / 50. Métodos de pago: tarjeta de crédito, débito o PayPal.
- Servicio "Origen" (video del proceso) entregado entre 7 y 15 días después.
- Lema "Más que una joya, un legado." y monograma "RJ" (o el logo que se suba en el editor de diseño).

**Para decidir:** que Romero confirme o corrija cada valor. Si cambian seguido, se pueden pasar al editor de diseño
(ajustes avanzados) para que no haga falta tocar código.

**Decisión:** _pendiente_

## 11. Sales tax

**Hoy:** la línea de sales tax aparece por defecto con **0 %** y el asesor puede cambiar el porcentaje en cada invoice.

**Para decidir:** si Romero cobra sales tax de Florida, en qué casos (envío fuera del estado, pickup en Miami) y qué
porcentaje. Según la respuesta: quitar la línea, ponerle un valor por defecto o calcularlo según el tipo de entrega.
Lo tiene que confirmar su contador.

**Decisión:** _pendiente_

## 12. Datos del lead en Kommo

**Hoy:** al abrir el generador se precargan el nombre y el correo del contacto principal, el responsable y el precio
del lead (como presupuesto). Sin verificar en la cuenta real:
- El nombre del responsable se toma de `APP.constant('managers')`.
- Que el panel aparezca a la primera en la tarjeta (hay un montaje de respaldo, igual que en otros widgets).

Además, Kommo no tiene campos de producto (metal, piedra, talla); por eso esos datos se llenan a mano en el invoice.

**Para decidir:**
- ¿Conviene crear campos en Kommo (metal, quilates, piedra, talla) para precargar el invoice y reusarlos en el
  tracking (el subtítulo del pedido ya lo pide)?
- ¿Al generar el invoice se actualiza el precio del lead con el total?

**Decisión:** _pendiente_

## 13. Repositorio del servidor

**Hoy:** `server/` vive en este repo, como paquete del workspace. Los otros proxies de Holos tienen su propio repo
(ej. `server-widget-chats`).

**Opciones:** a) dejarlo aquí, con el widget y la app en un solo lugar; b) separarlo en su propio repo, como los demás.

**Recomendación:** a) mientras sirva a un solo cliente. Separarlo si se reutiliza para otras joyerías.

**Decisión:** _pendiente_

## 14. Instalación y distribución del widget

**Hoy:** el zip (`pnpm widget:zip`) está listo para subirse en **Ajustes → Integraciones → Crear integración → Subir
widget**. Ya tiene logos y tour.

**Para decidir:**
- ¿Instalación privada solo en la cuenta de Romero, o publicarlo en el marketplace de Kommo?
- ¿Quién lo instala y lo prueba en la cuenta real? Ver los puntos sin verificar en #12.
- ¿Quién mantiene los textos de Romero cuando cambien (#10)?

**Recomendación:** subida privada a la cuenta de Romero y una prueba con un lead real antes de dárselo a los asesores.

**Decisión:** _pendiente_

---

Pendientes del tracking de pedidos (otra parte del repo): ver la sección **Pendientes** del `README.md`.
