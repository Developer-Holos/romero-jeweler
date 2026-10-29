// Campos de la orden de producción: los de "Order Details" y los de cada "Cad Details Ring". Cada uno tiene su
// nombre en inglés y en español (la orden se genera en cualquiera de los dos) y, si se guarda en Kommo, el campo
// que le corresponde: los del pedido en la pestaña "Orden", los de cada anillo en su grupo "*Anillo °N*" como
// "[N] Nombre". Los nombres de Kommo tienen que coincidir con CAMPOS_ANILLO / CAMPOS_PEDIDO de widget/script.js.
import type { CampoExtra, ListaOpcion } from "./opciones";

export type CampoOrden = { clave: string; en: string; es: string };

export const CAMPOS_PEDIDO: CampoOrden[] = [
	{ clave: "orden", en: "Order #", es: "N° de orden" },
	{ clave: "invoice", en: "Invoice #", es: "N° de factura" },
	{ clave: "fecha", en: "Date", es: "Fecha" },
	{ clave: "entrega", en: "Date Finish", es: "Fecha de entrega" },
	{ clave: "cliente", en: "Customer", es: "Cliente" },
	{ clave: "anillos", en: "N° Rings", es: "N° de anillos" },
	{ clave: "total", en: "Total", es: "Total" },
	// Una fila por depósito del invoice: 1st Payment, 2nd Payment…
	{ clave: "pagos", en: "Payments", es: "Pagos" },
	{ clave: "video", en: "Video", es: "Video" },
	{ clave: "stuller", en: "Stuller O.#", es: "Orden Stuller" },
	{ clave: "nivoda", en: "Nivoda O.#", es: "Orden Nivoda" },
];

// Los del pedido que se guardan en Kommo (los demás salen del invoice).
export const PEDIDO_EN_KOMMO = ["orden", "stuller", "nivoda"];

export const CAMPOS_ANILLO: CampoOrden[] = [
	{ clave: "tipo", en: "Ring Type", es: "Tipo de anillo" },
	{ clave: "size", en: "Size", es: "Talla" },
	{ clave: "ancho", en: "Width", es: "Ancho" },
	{ clave: "grosor", en: "Thickness", es: "Grosor" },
	{ clave: "peso", en: "Est.Weight", es: "Peso estimado" },
	{ clave: "metal", en: "Metal", es: "Metal" },
	{ clave: "grabado", en: "Engraving", es: "Grabado" },
	{ clave: "notas", en: "Notes", es: "Notas" },
	// No vienen por defecto: se agregan a un anillo con "+ Agregar otro campo".
	{ clave: "cabeza", en: "Head style", es: "Estilo de cabeza" },
	{ clave: "halo", en: "Halo Stones", es: "Piedras del halo" },
	{ clave: "central", en: "Center Stone", es: "Piedra central" },
];

export const POR_DEFECTO_ANILLO = ["tipo", "size", "ancho", "grosor", "peso", "metal", "grabado", "notas"];
export const POR_DEFECTO_PEDIDO = CAMPOS_PEDIDO.map((c) => c.clave);

// Campos de cada anillo en Kommo: [N] Nombre. `lista`: opciones del campo (selección), de opciones.ts.
export type CampoKommo = { clave: string; nombre: string; tipo: "text" | "textarea" | "select" | "multiselect"; lista?: ListaOpcion };
export const KOMMO_ANILLO: CampoKommo[] = [
	{ clave: "metal", nombre: "Metal", tipo: "select", lista: "metales" },
	{ clave: "quilates", nombre: "Quilates", tipo: "select", lista: "quilates" },
	{ clave: "piedra", nombre: "Piedra", tipo: "multiselect", lista: "piedras" },
	{ clave: "talla", nombre: "Talla", tipo: "text" },
	{ clave: "tipo", nombre: "Ring Type", tipo: "select", lista: "tipos" },
	{ clave: "size", nombre: "Size", tipo: "text" },
	{ clave: "ancho", nombre: "Width", tipo: "text" },
	{ clave: "grosor", nombre: "Thickness", tipo: "text" },
	{ clave: "peso", nombre: "Est. Weight", tipo: "text" },
	{ clave: "grabado", nombre: "Engraving", tipo: "text" },
	{ clave: "cabeza", nombre: "Head style", tipo: "text" },
	{ clave: "halo", nombre: "Halo Stones", tipo: "text" },
	{ clave: "notas", nombre: "Notes", tipo: "textarea" },
];

// Un campo creado por un asesor: el nombre que escribió, igual en los dos idiomas hasta que se traduzca.
export const campoExtra = (c: CampoExtra): CampoOrden => ({ clave: c.clave, en: c.nombre, es: c.nombre });
