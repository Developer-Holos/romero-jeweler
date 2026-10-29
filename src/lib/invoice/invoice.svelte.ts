// Borrador del invoice: lo que el asesor llena en el widget de la tarjeta del lead.
// Los datos del lead llegan de Kommo (widget/script.js); los montos se calculan aquí, nunca en la IA.
// El borrador se guarda en la app, por lead, para que cualquier asesor lo retome. La orden de producción usa
// el mismo borrador: cada pieza del invoice es un anillo de la orden.
import { PEDIDO_EN_KOMMO, POR_DEFECTO_ANILLO, POR_DEFECTO_PEDIDO } from "./campos";
import { incluye, mezclarOpciones, OPCIONES_BASE, type CampoExtra, type ListaCampo, type ListaOpcion, type Opciones } from "./opciones";
import { plantilla, rellenar } from "./plantilla.svelte";
import { agregarOpcionServidor, guardarBorradorServidor, hayServidor, leerBorradorServidor, leerOpcionesServidor, type OrdenKommo } from "./servidor";

// `producto`: campos sueltos del lead en Kommo (Metal, Quilates, Piedra, Talla), de antes de los grupos por anillo.
export type Producto = { metal?: string; quilates?: string; piedra?: string; talla?: string };
export type Lead = { id: number; nombre: string; contacto: string; email: string; responsable: string; presupuesto: number; producto?: Producto };

// Lead de muestra para el diseñador y para probar fuera de Kommo.
export const LEAD_EJEMPLO: Lead = {
	id: 21458233,
	nombre: "Anillo de boda · Milena",
	contacto: "Milena Suarez Besada",
	email: "suarezmilena387@gmail.com",
	presupuesto: 2140,
	responsable: "Yan Romero",
};

export type Piedra = { id: number; tipo: string; origen: "natural" | "laboratorio"; corte: string; tamano: string; cantidad: string; posicion: string };
// `orden`: lo de la orden de producción que el invoice no tiene. `campos`: filas de su "Cad Details Ring";
// `valores`: lo escrito en ellas (en las que salen del invoice, solo si el asesor lo cambió).
export type Pieza = {
	id: number;
	tipo: string;
	metal: string;
	kilates: string;
	solido: boolean;
	piedras: Piedra[];
	talla: string;
	tallaPorConfirmar: boolean;
	grabado: string;
	notas: string;
	imagenes: string[];
	orden: { campos: string[]; valores: Record<string, string> };
};
export type Seccion = "cliente" | "pieza" | "pago" | "entrega" | "imagenes" | "condiciones";

// modo "auto": se reparte lo que dejan libre los depósitos fijados (por % o por monto).
export type Deposito = { id: number; nombre: string; modo: "auto" | "pct" | "monto"; pct: number; monto: number; momento: string; fecha: string };

export const SECCIONES: { id: Seccion; nombre: string }[] = [
	{ id: "cliente", nombre: "Cliente" },
	{ id: "pieza", nombre: "Piezas" },
	{ id: "pago", nombre: "Precio y pagos" },
	{ id: "entrega", nombre: "Entrega" },
	{ id: "imagenes", nombre: "Imágenes" },
	{ id: "condiciones", nombre: "Condiciones" },
];

const COLORES_METAL: Record<string, string> = { "oro amarillo": "#D9B45A", "oro blanco": "#D8DCE2", "oro rosa": "#E2A88E", platino: "#B9BEC6" };
export const colorMetal = (m: string) => COLORES_METAL[m.trim().toLowerCase()] ?? "conic-gradient(#D9B45A 0 33%, #D8DCE2 0 66%, #E2A88E 0)";
// Los quilates (y "oro sólido") solo aplican a los metales de oro, incluidos los que agregue un asesor.
export const esOro = (m: string) => /\boro\b/i.test(m);

export const VENCIMIENTOS = ["Al recibir (para iniciar producción)", "7 días después de la emisión", "15 días después de la emisión"];
export const MOMENTOS_PAGO = ["para iniciar la producción", "al aprobar el diseño CAD", "al completar la pieza, antes de la entrega", "en abonos a disposición del cliente, antes de la entrega"];

export type Param = { k: keyof Borrador["params"]; label: string; tipo: "num" | "money" | "text"; sufijo?: string };

export const CLAUSULAS: { id: string; nombre: string; params: Param[] }[] = [
	{ id: "pago", nombre: "Condiciones de pago", params: [{ k: "diasSaldo", label: "Plazo para pagar el saldo", tipo: "num", sufijo: "días" }, { k: "medios", label: "Métodos de pago", tipo: "text" }] },
	{ id: "produccion", nombre: "Producción y entrega", params: [{ k: "ciudadPickup", label: "Ciudad de pickup", tipo: "text" }, { k: "diasOrigen", label: "Entrega del video Origen", tipo: "text", sufijo: "días" }] },
	{ id: "cambios", nombre: "Cambios de diseño", params: [] },
	{ id: "talla", nombre: "Ajuste de talla", params: [{ k: "costoTalla", label: "Costo por talla adicional", tipo: "money" }, { k: "diasAjuste", label: "Espera mínima", tipo: "num", sufijo: "días" }] },
	{ id: "garantia", nombre: "Garantía", params: [{ k: "mesesGarantia", label: "Duración", tipo: "num", sufijo: "meses" }] },
	{ id: "variaciones", nombre: "Variaciones", params: [] },
	{ id: "terminos", nombre: "Términos y aceptación", params: [] },
];

// Imágenes dibujadas (Thumb.svelte) para el invoice de muestra del diseñador.
export const IMAGENES_MUESTRA = [
	{ id: "muestra-1", tono: 42 },
	{ id: "muestra-2", tono: 205 },
];

// ─── Opciones compartidas (metales, quilates, piedras…) ──────────────────────
export const opciones: Opciones = $state(mezclarOpciones(null));

export async function cargarOpciones() {
	if (!hayServidor()) return;
	try {
		Object.assign(opciones, mezclarOpciones(await leerOpcionesServidor()));
	} catch (e) {
		console.warn("[invoice] no se pudieron leer las opciones:", e);
	}
}

// Queda para todos los clientes. Si la app no responde, queda al menos en esta ventana.
export async function agregarOpcion(lista: ListaOpcion, valor: string) {
	const v = valor.trim();
	if (!v || incluye(opciones[lista], v)) return;
	opciones[lista].push(v);
	if (hayServidor()) Object.assign(opciones, mezclarOpciones(await agregarOpcionServidor(lista, v)));
}

export async function agregarCampo(lista: ListaCampo, campo: CampoExtra) {
	if (opciones[lista].some((c) => c.clave === campo.clave)) return;
	opciones[lista].push(campo);
	if (hayServidor()) Object.assign(opciones, mezclarOpciones(await agregarOpcionServidor(lista, campo)));
}

let siguienteId = 10;
const dep = (nombre: string, momento: string, modo: Deposito["modo"] = "auto", valor = 0): Deposito => ({
	id: siguienteId++, nombre, modo, pct: modo === "pct" ? valor : 0, monto: modo === "monto" ? valor : 0, momento, fecha: "",
});

export const PLANES = [
	{ nombre: "50 / 50", crear: () => [dep("Depósito 1", MOMENTOS_PAGO[0], "pct", 50), dep("Depósito 2", MOMENTOS_PAGO[2])] },
	{ nombre: "40 / 30 / 30", crear: () => [dep("Depósito 1", MOMENTOS_PAGO[0], "pct", 40), dep("Depósito 2", MOMENTOS_PAGO[1], "pct", 30), dep("Depósito 3", MOMENTOS_PAGO[2])] },
	{ nombre: "Depósito + abonos", crear: () => [dep("Depósito inicial", MOMENTOS_PAGO[0], "monto", 500), dep("Saldo", MOMENTOS_PAGO[3])] },
	{ nombre: "Pago completo", crear: () => [dep("Pago completo", MOMENTOS_PAGO[0])] },
];

const hoy = () => {
	const f = new Date();
	return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
};

// `campos`: las filas de la orden; un anillo nuevo trae las del anterior (con los campos que se le sumaron).
export function nuevaPieza(datos: Partial<Pieza> = {}, campos: string[] = POR_DEFECTO_ANILLO): Pieza {
	return {
		id: siguienteId++,
		tipo: "",
		metal: OPCIONES_BASE.metales[0],
		kilates: "14k",
		solido: true,
		piedras: [],
		talla: "",
		tallaPorConfirmar: true,
		grabado: "",
		notas: "",
		imagenes: [],
		...datos,
		orden: { campos: [...campos], valores: { ...datos.orden?.valores } },
	};
}

export function nuevaPiedra(posicion = "Laterales"): Piedra {
	return { id: siguienteId++, tipo: "Diamante", origen: "laboratorio", corte: "Redondo", tamano: "", cantidad: "1", posicion };
}

// Lo que traen los campos sueltos del lead (Metal, Quilates, Piedra, Talla): precargan la primera pieza.
export function desdeProducto(p: Producto = {}): Partial<Pieza> {
	const out: Partial<Pieza> = {};
	if (p.metal?.trim()) out.metal = opciones.metales.find((m) => p.metal!.toLowerCase().includes(m.toLowerCase())) ?? p.metal.trim();
	const k = p.quilates?.match(/\d{2}/)?.[0];
	if (k) out.kilates = `${k}k`;
	if (p.piedra?.trim()) out.piedras = [{ ...nuevaPiedra("Central"), tipo: opciones.piedras.find((x) => x.toLowerCase() === p.piedra!.trim().toLowerCase()) ?? p.piedra.trim(), origen: "natural" }];
	if (p.talla?.trim()) Object.assign(out, { talla: p.talla.trim(), tallaPorConfirmar: false });
	return out;
}

// Valores de un grupo "*Anillo °N*" de Kommo (por clave de KOMMO_ANILLO o campo extra) → pieza.
export function piezaDesdeKommo(a: Record<string, string | string[]>, campos?: string[]): Pieza {
	const texto = (k: string) => {
		const v = a[k];
		return (Array.isArray(v) ? v.join(", ") : (v ?? "")).trim();
	};
	const piedras = (Array.isArray(a.piedra) ? a.piedra : a.piedra ? [a.piedra] : []).map((tipo, i) => ({ ...nuevaPiedra(i === 0 ? "Central" : "Laterales"), tipo, origen: "natural" as const }));
	const talla = texto("talla") || texto("size");
	const valores: Record<string, string> = {};
	for (const [k, v] of Object.entries(a)) if (!["metal", "quilates", "piedra", "talla", "tipo", "size", "grabado", "notas", "halo"].includes(k) && texto(k)) valores[k] = texto(k);
	return nuevaPieza(
		{ tipo: texto("tipo"), ...(texto("metal") ? { metal: texto("metal") } : {}), ...(texto("quilates") ? { kilates: texto("quilates") } : {}), piedras, talla, tallaPorConfirmar: !talla, grabado: texto("grabado"), notas: texto("notas"), orden: { campos: [], valores } },
		campos ?? [...POR_DEFECTO_ANILLO, ...Object.keys(valores).filter((k) => !POR_DEFECTO_ANILLO.includes(k))],
	);
}

export function borradorInicial(lead: Lead) {
	const depositos = PLANES[0].crear();
	return {
		// Lo asigna la API al generar (RJ-AAAA-NNNN) y se conserva si se vuelve a generar.
		numero: "",
		sinCliente: false,
		cliente: lead.contacto,
		email: lead.email,
		emision: hoy(),
		vencimiento: VENCIMIENTOS[0],
		preparadoPor: lead.responsable,
		idioma: "es" as "es" | "en",

		// Empieza sin piezas: el asesor agrega la primera (precargada con lo que tenga el lead).
		piezas: [] as Pieza[],
		origen: false,

		valor: lead.presupuesto,
		conTax: true,
		taxPct: 0,
		depositos,
		cobrarAhora: depositos[0].id,

		entregaDesde: "",
		entregaHasta: "",
		envio: true,
		pickup: true,

		// texto null = se usa el texto estándar, que se arma con los valores de `params`.
		clausulas: Object.fromEntries(CLAUSULAS.map((c) => [c.id, { activa: true, texto: null as string | null }])),
		// Valores por defecto de la plantilla (los edita Romero); en cada invoice se pueden cambiar.
		params: { ...plantilla.valores },
		instrucciones: "",

		// Orden de producción: filas de "Order Details", lo escrito en ellas, e idioma del documento.
		orden: { campos: [...POR_DEFECTO_PEDIDO], valores: {} as Record<string, string>, idioma: "en" as "es" | "en", traducirValores: false },
	};
}

export type Borrador = ReturnType<typeof borradorInicial>;

// Invoice completo de muestra: así el diseñador muestra todos los bloques con contenido.
export function borradorEjemplo(): Borrador {
	return {
		...borradorInicial(LEAD_EJEMPLO),
		piezas: [
			nuevaPieza({
				tipo: "Anillo de bodas para hombre",
				piedras: [{ id: siguienteId++, tipo: "Diamante", origen: "natural", corte: "Redondo", tamano: "2 mm", cantidad: "6–7", posicion: "Pavé" }],
				notas: "Diamantes color D-F, corte excelente, claridad VS. La cantidad final depende del diseño.",
				imagenes: [IMAGENES_MUESTRA[0].id],
			}),
		],
		entregaDesde: hoy(),
	};
}

const POSICIONES_VIEJAS: Record<string, string> = { central: "Central", lateral: "Laterales", pave: "Pavé" };
const METALES_VIEJOS: Record<string, string> = { amarillo: "Oro amarillo", blanco: "Oro blanco", rosa: "Oro rosa", platino: "Platino" };

// Borradores de antes de las piezas: una sola pieza en la raíz y `produccion` para la orden.
function migrar(g: Record<string, unknown>) {
	if (Array.isArray(g.piezas)) return g;
	const v = g as { pieza?: string; aMedida?: boolean; metal?: string; metalOtro?: string; kilates?: string; solido?: boolean; piedras?: Piedra[]; talla?: string; tallaPorConfirmar?: boolean; grabado?: string; notas?: string; imagenes?: string[]; produccion?: Record<string, string> };
	const { orden = "", stuller = "", nivoda = "", ...delAnillo } = v.produccion ?? {};
	const tieneAlgo = !!(v.pieza || v.piedras?.length || v.grabado || v.notas || v.imagenes?.length);
	const pieza = nuevaPieza({
		tipo: v.pieza && v.aMedida && !/medida/i.test(v.pieza) ? `${v.pieza} a la medida` : (v.pieza ?? ""),
		metal: v.metal === "otro" ? (v.metalOtro ?? "") : (METALES_VIEJOS[v.metal ?? ""] ?? OPCIONES_BASE.metales[0]),
		kilates: v.kilates ?? "14k",
		solido: v.solido ?? true,
		piedras: (v.piedras ?? []).map((p) => ({ ...p, posicion: POSICIONES_VIEJAS[p.posicion] ?? p.posicion })),
		talla: v.talla ?? "",
		tallaPorConfirmar: v.tallaPorConfirmar ?? true,
		grabado: v.grabado ?? "",
		notas: v.notas ?? "",
		imagenes: v.imagenes ?? [],
		orden: { campos: [], valores: { ...(delAnillo.ancho ? { ancho: delAnillo.ancho } : {}), ...(delAnillo.grosor ? { grosor: delAnillo.grosor } : {}), ...(delAnillo.peso ? { peso: delAnillo.peso } : {}), ...(delAnillo.cabeza ? { cabeza: delAnillo.cabeza } : {}) } },
	}, delAnillo.cabeza ? [...POR_DEFECTO_ANILLO, "cabeza"] : POR_DEFECTO_ANILLO);
	return { ...g, piezas: tieneAlgo ? [pieza] : [], orden: { valores: { orden, stuller, nivoda } } };
}

// Lo guardado se mezcla con un borrador nuevo, así una versión vieja no rompe el formulario.
function mezclar(base: Borrador, guardado: unknown): Borrador {
	if (!guardado || typeof guardado !== "object") return base;
	const g = migrar(guardado as Record<string, unknown>) as Partial<Borrador>;
	const d: Borrador = {
		...base,
		...g,
		params: { ...base.params, ...g.params },
		clausulas: { ...base.clausulas, ...g.clausulas },
		orden: { ...base.orden, ...g.orden, valores: { ...base.orden.valores, ...g.orden?.valores } },
	};
	// Las imágenes que no llegaron a Kommo (subidas sin servidor) no sobreviven a cerrar la ventana.
	d.piezas = (d.piezas ?? []).map((p) => ({ ...nuevaPieza(), ...p, imagenes: (p.imagenes ?? []).filter((id) => !id.startsWith("local-")), orden: { campos: p.orden?.campos ?? [...POR_DEFECTO_ANILLO], valores: { ...p.orden?.valores } } }));
	siguienteId = Math.max(siguienteId, ...d.piezas.flatMap((p) => [p.id + 1, ...p.piedras.map((x) => x.id + 1)]), ...d.depositos.map((x) => x.id + 1));
	if (!d.depositos.length) Object.assign(d, { depositos: base.depositos, cobrarAhora: base.depositos[0].id });
	return d;
}

// Copia local por si la app no responde: el asesor no pierde lo que lleva escrito.
const claveLocal = (leadId: number) => `rj-invoice-borrador-${leadId}`;
const leerLocal = (leadId: number) => {
	try {
		return JSON.parse(localStorage.getItem(claveLocal(leadId)) ?? "null");
	} catch {
		return null;
	}
};

// `origen`: de dónde salió, para avisar si el borrador no es el compartido.
export async function cargarBorrador(lead: Lead): Promise<{ borrador: Borrador; origen: "servidor" | "local" | "nuevo" }> {
	const base = borradorInicial(lead);
	if (hayServidor()) {
		try {
			const guardado = await leerBorradorServidor(lead.id);
			return { borrador: mezclar(base, guardado), origen: guardado ? "servidor" : "nuevo" };
		} catch (e) {
			console.warn("[invoice] no se pudo leer el borrador del servidor:", e);
		}
	}
	const local = leerLocal(lead.id);
	return { borrador: mezclar(base, local), origen: local ? "local" : "nuevo" };
}

export async function guardarBorrador(leadId: number, d: Borrador) {
	try {
		localStorage.setItem(claveLocal(leadId), JSON.stringify(d));
	} catch {
		// modo privado: queda solo la copia de la app
	}
	if (hayServidor()) await guardarBorradorServidor(leadId, d);
}

export const draft: Borrador = $state(borradorInicial(LEAD_EJEMPLO));

export function nuevoDeposito(n: number) {
	return dep(`Depósito ${n}`, MOMENTOS_PAGO[2]);
}

export const money = (n: number) => "$" + (Number.isFinite(n) ? n : 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pctTexto = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1)) + "%";
const r2 = (n: number) => Math.round(n * 100) / 100;

export function fechaLarga(iso: string) {
	if (!iso) return "";
	const [y, m, d] = iso.split("-").map(Number);
	return new Date(y, m - 1, d).toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });
}

export function rangoEntrega(desde: string, hasta: string) {
	if (!desde) return "";
	if (!hasta || hasta === desde) return fechaLarga(desde);
	const [y1, m1, d1] = desde.split("-").map(Number);
	const [y2, m2, d2] = hasta.split("-").map(Number);
	if (y1 === y2 && m1 === m2) return `${d1} al ${d2} de ${new Date(y2, m2 - 1, 1).toLocaleDateString("es", { month: "long" })} de ${y2}`;
	return `${fechaLarga(desde)} al ${fechaLarga(hasta)}`;
}

// Vacío hasta que la API asigna el correlativo al generar.
export const numeroFactura = (d: Borrador) => (d.sinCliente ? "" : d.numero);

export function totales(d: Borrador) {
	const valor = Math.max(0, Number(d.valor) || 0);
	const tax = d.conTax ? r2(valor * (Number(d.taxPct) || 0) / 100) : 0;
	const total = valor + tax;

	// Montos fijados primero; lo que sobra se reparte entre los automáticos (el último absorbe los centavos).
	const fijos = d.depositos.map((x) => (x.modo === "pct" ? r2(total * (Number(x.pct) || 0) / 100) : x.modo === "monto" ? r2(Number(x.monto) || 0) : null));
	const autos = d.depositos.filter((x) => x.modo === "auto").length;
	const libre = r2(total - fijos.reduce<number>((s, m) => s + (m ?? 0), 0));
	const parte = autos ? Math.floor((libre / autos) * 100) / 100 : 0;
	let vistos = 0;
	const depositos = d.depositos.map((x, i) => {
		let monto = fijos[i];
		if (monto === null) monto = ++vistos === autos ? r2(libre - parte * (autos - 1)) : parte;
		return { ...x, montoCalc: monto, pctCalc: total ? Math.round((monto / total) * 1000) / 10 : 0 };
	});
	const suma = r2(depositos.reduce((s, x) => s + x.montoCalc, 0));
	const ahoraDep = depositos.find((x) => x.id === d.cobrarAhora) ?? depositos[0];
	const ahora = ahoraDep?.montoCalc ?? 0;
	return { valor, tax, total, depositos, suma, diferencia: r2(total - suma), ahoraDep, ahora, saldo: r2(total - ahora) };
}

export const tituloPieza = (p: Pieza) => p.tipo || "Tipo de pieza pendiente";

// "anillo" / "anillos" / "pieza" / "piezas", para los textos que nombran lo que se fabrica.
export function nombrePiezas(d: Borrador) {
	const anillos = d.piezas.length > 0 && d.piezas.every((p) => /anillo/i.test(p.tipo));
	return (anillos ? "anillo" : "pieza") + (d.piezas.length > 1 ? "s" : "");
}

// En plural, "tu {pieza}" de los textos de la plantilla pasa a "tus {pieza}".
const enNumero = (texto: string, d: Borrador) => (d.piezas.length > 1 ? texto.replace(/\btu (\{pieza\})/gi, "tus $1") : texto);

// "14k Oro amarillo" o "Platino": el metal como se lee en la orden y en Kommo.
export const metalCorto = (p: Pieza) => (esOro(p.metal) && p.kilates ? `${p.kilates} ${p.metal}` : p.metal);

const PLURALES: Record<string, string> = { Rubí: "Rubíes" };
const POSICION_TEXTO: Record<string, string> = { central: "central", laterales: "a los lados", "pavé": "en pavé" };

// Viñetas que se pueden armar sin IA a partir de los campos de la pieza. La IA las pule y suma las notas.
export function vinetas(p: Pieza) {
	const out: string[] = [];
	if (!p.metal.trim()) out.push("Metal por definir");
	else if (esOro(p.metal)) out.push(`${p.metal}${p.solido ? " sólido" : ""}${p.kilates ? ` de ${p.kilates}` : ""}`);
	else out.push(p.metal.toLowerCase() === "platino" ? "Platino 950" : p.metal);
	for (const x of p.piedras) {
		const plural = !!x.cantidad && x.cantidad !== "1";
		const tipo = (plural ? PLURALES[x.tipo] ?? x.tipo + "s" : x.tipo).toLowerCase();
		const origen = x.origen === "laboratorio" ? "de laboratorio" : plural ? "naturales" : "natural";
		const pos = POSICION_TEXTO[x.posicion.toLowerCase()] ?? `(${x.posicion.toLowerCase()})`;
		const texto = [`${plural ? x.cantidad + " " : ""}${tipo} ${origen} ${pos}`, x.corte && `corte ${x.corte.toLowerCase()}`, x.tamano].filter(Boolean).join(", ");
		out.push(texto[0].toUpperCase() + texto.slice(1));
	}
	const talla = p.tallaPorConfirmar || !p.talla ? "Talla por confirmar" : `Talla ${p.talla}`;
	out.push(p.grabado ? `${talla}, con grabado: ${p.grabado}` : talla);
	return out;
}

// Piedras de una pieza en una línea, para la orden y para Kommo: "6–7 Diamante Redondo 2 mm".
const resumenPiedra = (x: Piedra) => [x.cantidad && x.cantidad !== "1" ? x.cantidad : "", x.origen === "laboratorio" ? "Lab" : "", x.tipo, x.corte, x.tamano].filter(Boolean).join(" ");
export const piedrasCentrales = (p: Pieza) => p.piedras.filter((x) => x.posicion.toLowerCase() === "central").map(resumenPiedra).join("; ");
export const piedrasHalo = (p: Pieza) =>
	p.piedras
		.filter((x) => x.posicion.toLowerCase() !== "central")
		.map((x) => `${resumenPiedra(x)} (${x.posicion})`)
		.join("; ");

// Valor de una fila de "Cad Details Ring": lo que escribió el asesor o, si no, lo que sale del invoice.
export function valorAnillo(p: Pieza, clave: string): string {
	const escrito = p.orden.valores[clave];
	if (escrito !== undefined && escrito !== "") return escrito;
	switch (clave) {
		case "tipo":
			return p.tipo;
		case "size":
			return p.tallaPorConfirmar ? "" : p.talla;
		case "metal":
			return metalCorto(p);
		case "grabado":
			return p.grabado;
		case "notas":
			return p.notas.trim();
		case "halo":
			return piedrasHalo(p);
		case "central":
			return piedrasCentrales(p);
	}
	return escrito ?? "";
}

// Lo que va a los campos "[N] …" del grupo de cada anillo en Kommo (claves de KOMMO_ANILLO y campos extra).
export function anilloAKommo(p: Pieza): Record<string, string | string[]> {
	const out: Record<string, string | string[]> = {
		metal: p.metal,
		quilates: esOro(p.metal) ? p.kilates : "",
		piedra: [...new Set(p.piedras.map((x) => x.tipo))],
		talla: p.tallaPorConfirmar ? "" : p.talla,
		tipo: p.tipo,
		size: valorAnillo(p, "size"),
		grabado: valorAnillo(p, "grabado"),
		halo: valorAnillo(p, "halo"),
		notas: valorAnillo(p, "notas"),
	};
	// Width, Thickness, Est. Weight, Head style y los campos creados por los asesores (Center Stone no tiene campo).
	for (const [k, v] of Object.entries(p.orden.valores)) if (!(k in out) && k !== "central") out[k] = v;
	return out;
}

// Lo que va a la pestaña "Orden" del lead: los campos del pedido, un grupo por pieza y "N° de Anillos".
export const ordenAKommo = (d: Borrador): OrdenKommo => ({
	cantidad: d.piezas.length,
	pedido: Object.fromEntries(Object.entries(d.orden.valores).filter(([k]) => PEDIDO_EN_KOMMO.includes(k) || k.startsWith("x_"))),
	anillos: d.piezas.map(anilloAKommo),
});

// Lo que se puede cambiar a mano en Kommo y la orden toma al abrirse: los campos que el invoice no tiene.
const DE_KOMMO = (clave: string) => ["ancho", "grosor", "peso", "cabeza"].includes(clave) || clave.startsWith("x_");
const textoKommo = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(", ") : (v ?? "")).trim();

// Junta lo guardado en Kommo con el borrador: si el borrador aún no tiene piezas, salen de los grupos de anillos
// del lead; si ya las tiene, solo se toman los campos propios de la orden (los que no salen del invoice).
export function aplicarKommo(d: Borrador, k: OrdenKommo) {
	const anillos = k.anillos.slice(0, Math.max(k.cantidad, 0) || k.anillos.length);
	if (!d.piezas.length) d.piezas = anillos.filter((a) => Object.values(a).some((v) => textoKommo(v))).map((a) => piezaDesdeKommo(a));
	else
		anillos.forEach((a, i) => {
			const p = d.piezas[i];
			if (!p) return;
			for (const [clave, v] of Object.entries(a)) {
				if (!DE_KOMMO(clave) || !textoKommo(v)) continue;
				p.orden.valores[clave] = textoKommo(v);
				if (!p.orden.campos.includes(clave)) p.orden.campos.push(clave);
			}
		});
	for (const [clave, v] of Object.entries(k.pedido)) if (v.trim()) d.orden.valores[clave] = v.trim();
}

const duracion = (meses: number) => (meses % 12 === 0 ? `${meses / 12} ${meses === 12 ? "año" : "años"}` : `${meses} meses`);

// Texto estándar de cada cláusula, armado con los textos de la plantilla (los edita Romero en el diseñador).
// **texto** sale en negrita en el invoice.
export function textoEstandar(id: string, d: Borrador): string {
	const p = d.params;
	const t = plantilla.textos;
	const pieza = nombrePiezas(d);
	switch (id) {
		case "pago": {
			const tot = totales(d);
			const lineas = tot.depositos.map((x) =>
				rellenar(t.pago_deposito, {
					deposito: tot.depositos.length > 1 ? `${x.nombre} (${pctTexto(x.pctCalc)})` : x.nombre,
					monto: money(x.montoCalc),
					momento: x.momento,
					fecha_limite: x.fecha ? rellenar(t.pago_fecha_limite, { fecha: fechaLarga(x.fecha) }) : "",
				}),
			);
			if (tot.depositos.length > 1) lineas.push(rellenar(t.pago_saldo, { diasSaldo: p.diasSaldo }));
			lineas.push(rellenar(t.pago_medios, { medios: p.medios }));
			return lineas.join(" ");
		}
		case "produccion": {
			const partes = [rellenar(enNumero(t.produccion, d), { entrega: rangoEntrega(d.entregaDesde, d.entregaHasta) || "por definir", pieza })];
			if (d.envio) partes.push(t.produccion_envio);
			if (d.pickup) partes.push(rellenar(t.produccion_pickup, { ciudadPickup: p.ciudadPickup }));
			if (d.origen) partes.push(rellenar(t.produccion_origen, { diasOrigen: p.diasOrigen }));
			return partes.join(" ");
		}
		case "talla":
			return rellenar(t.talla, { costoTalla: money(Number(p.costoTalla)).replace(".00", ""), diasAjuste: p.diasAjuste });
		case "garantia":
			return rellenar(t.garantia, { garantia: duracion(Number(p.mesesGarantia)) });
		case "cambios":
		case "variaciones":
		case "terminos":
			return t[id];
	}
	return "";
}

// Título de un bloque de la plantilla: {pieza} → "anillo", "anillos" o "pieza".
export const tituloBloque = (titulo: string, d: Borrador) => enNumero(titulo, d).replaceAll("{pieza}", nombrePiezas(d));

// Textos fijos del documento. Si el invoice va en inglés, la IA los traduce junto con las condiciones.
export const ETIQUETAS = {
	factura_no: "Factura No.",
	facturado_a: "Facturado a",
	fecha_emision: "Fecha de emisión",
	correo: "Correo del cliente",
	fecha_limite: "Fecha límite de pago",
	preparado_por: "Preparado por",
	valor_pieza: "Valor de la pieza",
	valor_total_pieza: "Valor total de la pieza",
	valor_total: "Valor total",
	esta_factura: "esta factura",
	antes_del: "antes del",
	total_ahora: "Total a pagar ahora",
} as const;

// Todo lo que la IA traduce además de la descripción y las cláusulas: etiquetas, títulos de los bloques,
// fechas y nombres de depósitos. Las claves son las que usa InvoicePreview.
export function etiquetasInvoice(d: Borrador): { clave: string; texto: string }[] {
	const t = totales(d);
	return [
		...Object.entries(ETIQUETAS).map(([clave, texto]) => ({ clave, texto })),
		...plantilla.bloques.map((b) => ({ clave: `bloque_${b.id}`, texto: tituloBloque(b.titulo, d) })),
		{ clave: "lema", texto: plantilla.encabezado.lema },
		{ clave: "valor_emision", texto: fechaLarga(d.emision) },
		{ clave: "valor_vencimiento", texto: d.vencimiento },
		{ clave: "aviso_pago", texto: textoAvisoPago(d) },
		{ clave: "nota_imagenes", texto: plantilla.textos.nota_imagenes },
		...(d.origen ? [{ clave: "vineta_origen", texto: plantilla.textos.vineta_origen }] : []),
		...t.depositos.map((x) => ({ clave: `deposito_${x.id}`, texto: x.nombre })),
		...t.depositos.filter((x) => x.fecha).map((x) => ({ clave: `fecha_${x.id}`, texto: fechaLarga(x.fecha) })),
	].filter((e) => e.texto.trim());
}

// Aviso bajo el total a pagar.
export const textoAvisoPago = (d: Borrador) => rellenar(plantilla.textos.aviso_pago, { para_cada: totales(d).depositos.length > 1 ? " para cada depósito" : "", medios: d.params.medios });

export const textoClausula = (id: string, d: Borrador) => d.clausulas[id].texto ?? textoEstandar(id, d);

// "a **b** c" → [["a ", false], ["b", true], [" c", false]]
export const negritas = (s: string) => s.split(/\*\*(.+?)\*\*/g).map((parte, i) => [parte, i % 2 === 1] as const);

export type Pendiente = { sec: Seccion; msg: string; bloquea: boolean };

export function pendientes(d: Borrador): Pendiente[] {
	const p: Pendiente[] = [];
	const t = totales(d);
	if (!d.sinCliente && !d.cliente.trim()) p.push({ sec: "cliente", msg: "Falta el nombre del cliente", bloquea: true });
	if (!d.piezas.length) p.push({ sec: "pieza", msg: "Falta agregar una pieza", bloquea: true });
	d.piezas.forEach((x, i) => {
		const n = d.piezas.length > 1 ? ` de la pieza ${i + 1}` : "";
		if (!x.tipo.trim()) p.push({ sec: "pieza", msg: `Falta el tipo${n}`, bloquea: true });
		if (!x.metal.trim()) p.push({ sec: "pieza", msg: `Falta el metal${n}`, bloquea: true });
	});
	if (!(t.valor > 0)) p.push({ sec: "pago", msg: "Falta el valor de la pieza", bloquea: true });
	else if (t.depositos.some((x) => x.montoCalc < 0)) p.push({ sec: "pago", msg: "Un depósito quedó en negativo", bloquea: true });
	else if (t.diferencia !== 0) p.push({ sec: "pago", msg: `Los depósitos no cuadran con el total (${t.diferencia > 0 ? "faltan" : "sobran"} ${money(Math.abs(t.diferencia))})`, bloquea: true });
	if (d.entregaHasta && d.entregaDesde && d.entregaHasta < d.entregaDesde) p.push({ sec: "entrega", msg: "La fecha final va antes que la inicial", bloquea: true });
	if (!d.entregaDesde) p.push({ sec: "entrega", msg: "Sin fecha estimada de entrega", bloquea: false });
	if (d.piezas.length && d.piezas.every((x) => !x.imagenes.length)) p.push({ sec: "imagenes", msg: "Sin imágenes de referencia", bloquea: false });
	return p;
}
