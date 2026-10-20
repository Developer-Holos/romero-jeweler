# Textos y valores del invoice — para que Romero los confirme

Estos son los textos y valores que hoy salen en **todos los invoices nuevos**. Tienen peso legal y comercial
frente al cliente, así que Romero debe confirmar o corregir cada uno antes de que los asesores empiecen a usar
el widget (decisión #10 de `docs/DECISIONES.md`).

Después se pueden cambiar sin un desarrollador: **Ajustes → Invoice Romero Jeweler → Ajustes avanzados →
pestaña Textos**. Lo que está entre llaves, como `{diasSaldo}`, lo reemplaza el widget al armar cada invoice.
Lo que está entre `**dobles asteriscos**` sale en negrita.

## Valores por defecto

Cada asesor los puede ajustar en un invoice puntual (sección Condiciones del generador).

| Valor | Hoy | ¿Correcto? |
| --- | --- | --- |
| Plazo para pagar el saldo | 15 días | |
| Métodos de pago | tarjeta de crédito, tarjeta de débito o PayPal | |
| Ciudad de pickup | Miami | |
| Entrega del video Origen | entre 7 y 15 días después de terminada la joya | |
| Costo por talla adicional | $100 | |
| Espera mínima del ajuste de talla | 60 días | |
| Duración de la garantía | 12 meses (sale como "1 año") | |
| Plan de depósitos al empezar | 50 / 50 | |
| Sales tax | 0 %, editable (pendiente del contador, decisión #11) | |

## Datos de la empresa (pestaña Marca)

| Dato | Hoy | ¿Correcto? |
| --- | --- | --- |
| Nombre en el encabezado | ROMERO JEWELER | |
| Lema | Más que una joya, un legado. | |
| Pie de página | Golden Rooster LLC, dba Romero Jeweler · Miami, FL · contact@yrjeweler.com | |
| Logo | Monograma "RJ" (se puede subir el logo oficial) | |

## Textos

**Condiciones de pago · cada depósito** (uno por depósito):
> El **{deposito}** de {monto} se paga {momento}{fecha_limite}.

**Condiciones de pago · fecha límite de un depósito** (solo si el asesor puso una fecha):
> , a más tardar el {fecha}

**Condiciones de pago · saldo** (solo si hay más de un depósito):
> Una vez notificada la finalización de la pieza, el cliente cuenta con **{diasSaldo} días** para pagar el saldo. La pieza se entrega únicamente al recibir el pago completo.

**Condiciones de pago · métodos de pago:**
> Métodos de pago aceptados: {medios}, a través de un enlace de pago seguro.

**Aviso bajo el total a pagar:**
> Recibirás por separado un enlace de pago seguro{para_cada} ({medios}). **Al realizar el pago, confirmas que has leído y aceptas todos los términos y condiciones de esta factura.**

**Producción y entrega:**
> Fecha estimada de entrega: **{entrega}**. Al ser una pieza hecha a la medida, los tiempos pueden variar ligeramente. Recibirás un enlace de seguimiento para ver en qué etapa de producción se encuentra tu {pieza}.

**Producción y entrega · envío incluido** (si el envío está marcado):
> El envío está incluido y va asegurado por el valor total de la pieza, con firma requerida.

**Producción y entrega · pickup** (si el pickup está marcado):
> También puedes recoger tu pieza en persona en {ciudadPickup} (pickup).

**Producción y entrega · servicio Origen** (si se incluye):
> El video Origen se entrega completo entre {diasOrigen} días después de finalizada la joya.

**Viñeta del servicio Origen** (en la descripción de la pieza):
> Incluye el servicio Origen (video del proceso de banco de tu anillo)

**Cambios de diseño:**
> El diseño CAD incluye modificaciones sin costo, siempre que se mantenga la misma estructura del diseño. Un cambio total del diseño, o cualquier cambio después de que el cliente apruebe el CAD, tiene un costo adicional y puede modificar la fecha estimada de entrega.

**Ajuste de talla:**
> El primer ajuste es gratis, ya sea para reducir o agrandar. Después del primero, cada talla adicional para agrandar cuesta **{costoTalla}**; reducir no tiene costo. El ajuste tiene un tiempo de espera mínimo de **{diasAjuste} días**. No todos los diseños permiten ajuste de talla.

**Garantía:**
> **{garantia}** en engaste y defectos de fabricación. No cubre golpes, desgaste normal, mal uso ni piezas reparadas o modificadas por otro joyero.

**Variaciones:**
> Las imágenes y renders del diseño son una referencia. Por tratarse de una pieza artesanal, pueden existir ligeras variaciones en el peso del metal, las proporciones y la apariencia final respecto al render, sin que esto se considere un defecto.

**Términos y aceptación:**
> Por tratarse de una pieza hecha a la medida, no se aceptan devoluciones ni cancelaciones, y los depósitos no son reembolsables en ningún caso. Ante cualquier inconformidad, el cliente se compromete a contactar primero a Romero Jeweler para buscar una solución antes de iniciar una disputa con su banco o procesador de pago.

**Nota bajo las imágenes:**
> Render de referencia del diseño. La pieza final puede presentar ligeras variaciones.

## Invoices en inglés

No hace falta escribir estos textos en inglés: cuando el invoice va en inglés, la IA traduce todo (decisión #7).
Si Romero tiene una versión oficial en inglés de los términos legales, conviene revisar un par de invoices
traducidos contra ella.
