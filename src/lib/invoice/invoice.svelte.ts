// Borrador del invoice: lo que el asesor llena en el widget de la tarjeta del lead.
// Los datos del lead llegan de Kommo (widget/script.js); los montos se calculan aquí, nunca en la IA.
// El borrador se guarda en el servidor, por lead, para que cualquier asesor lo retome.
import { plantilla, rellenar } from "./plantilla.svelte";
import { guardarBorradorServidor, hayServidor, leerBorradorServidor } from "./servidor";

// `producto`: campos del lead en Kommo (Metal, Quilates, Piedra, Talla), si están llenos.
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

export type Metal = "amarillo" | "blanco" | "rosa" | "platino" | "otro";
export type Posicion = "central" | "lateral" | "pave";
export type Piedra = { id: number; tipo: string; origen: "natural" | "laboratorio"; corte: string; tamano: string; cantidad: string; posicion: Posicion };
export type Seccion = "cliente" | "pieza" | "pago" | "entrega" | "imagenes" | "condiciones";

// modo "auto": se reparte lo que dejan libre los depósitos fijados (por % o por monto).
export type Deposito = { id: number; nombre: string; modo: "auto" | "pct" | "monto"; pct: number; monto: number; momento: string; fecha: string };

export const SECCIONES: { id: Seccion; nombre: string }[] = [
	{ id: "cliente", nombre: "Cliente" },
	{ id: "pieza", nombre: "Pieza" },
	{ id: "pago", nombre: "Precio y pagos" },
	{ id: "entrega", nombre: "Entrega" },
	{ id: "imagenes", nombre: "Imágenes" },
	{ id: "condiciones", nombre: "Condiciones" },
];

export const TIPOS_PIEZA = ["Anillo de compromiso", "Anillo de boda", "Anillo de boda para hombre", "Anillo a la medida", "Aretes", "Collar", "Pulsera", "Dije"];
export const TIPOS_PIEDRA = ["Diamante", "Esmeralda", "Zafiro", "Rubí", "Moissanita", "Morganita"];
export const CORTES = ["Redondo", "Oval", "Pera", "Marquesa", "Esmeralda", "Princesa", "Cojín", "Radiante"];
export const METALES: { id: Metal; nombre: string; color: string }[] = [
	{ id: "amarillo", nombre: "Oro amarillo", color: "#D9B45A" },
	{ id: "blanco", nombre: "Oro blanco", color: "#D8DCE2" },
	{ id: "rosa", nombre: "Oro rosa", color: "#E2A88E" },
	{ id: "platino", nombre: "Platino", color: "#B9BEC6" },
	{ id: "otro", nombre: "Otro", color: "conic-gradient(#D9B45A 0 33%, #D8DCE2 0 66%, #E2A88E 0)" },
];
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

// Lo que traen los campos de producto del lead, en el formato del borrador.
function desdeProducto(p: Producto = {}) {
	const out: { metal?: Metal; metalOtro?: string; kilates?: string; piedras?: Piedra[]; talla?: string; tallaPorConfirmar?: boolean } = {};
	if (p.metal?.trim()) {
		const t = p.metal.toLowerCase();
		const m = METALES.find((x) => x.id !== "otro" && (t.includes(x.id) || t.includes(x.nombre.toLowerCase())));
		Object.assign(out, m ? { metal: m.id } : { metal: "otro", metalOtro: p.metal.trim() });
	}
	const k = p.quilates?.match(/\d{2}/)?.[0];
	if (k) out.kilates = `${k}k`;
	if (p.piedra?.trim()) {
		const tipo = TIPOS_PIEDRA.find((x) => x.toLowerCase() === p.piedra!.trim().toLowerCase()) ?? p.piedra.trim();
		out.piedras = [{ id: siguienteId++, tipo, origen: "natural", corte: "Redondo", tamano: "", cantidad: "1", posicion: "central" }];
	}
	if (p.talla?.trim()) Object.assign(out, { talla: p.talla.trim(), tallaPorConfirmar: false });
	return out;
}

export function borradorInicial(lead: Lead) {
	const depositos = PLANES[0].crear();
	return {
		// Lo asigna el servidor al generar (RJ-AAAA-NNNN) y se conserva si se vuelve a generar.
		numero: "",
		sinCliente: false,
		cliente: lead.contacto,
		email: lead.email,
		emision: hoy(),
		vencimiento: VENCIMIENTOS[0],
		preparadoPor: lead.responsable,
		idioma: "es" as "es" | "en",

		pieza: "",
		aMedida: true,
		metal: "amarillo" as Metal,
		metalOtro: "",
		kilates: "14k",
		solido: true,
		piedras: [] as Piedra[],
		talla: "",
		tallaPorConfirmar: true,
		grabado: "",
		origen: false,
		notas: "",

		...desdeProducto(lead.producto),

		valor: lead.presupuesto,
		conTax: true,
		taxPct: 0,
		depositos,
		cobrarAhora: depositos[0].id,

		entregaDesde: "",
		entregaHasta: "",
		envio: true,
		pickup: true,

		imagenes: [] as string[],
		// texto null = se usa el texto estándar, que se arma con los valores de `params`.
		clausulas: Object.fromEntries(CLAUSULAS.map((c) => [c.id, { activa: true, texto: null as string | null }])),
		// Valores por defecto de la plantilla (los edita Romero); en cada invoice se pueden cambiar.
		params: { ...plantilla.valores },
		instrucciones: "",

		// Orden de producción: solo lo que el invoice no tiene (lo demás sale de los campos de arriba).
		produccion: { orden: "", stuller: "", nivoda: "", ancho: "", grosor: "", peso: "", cabeza: "" },
	};
}

export type Borrador = ReturnType<typeof borradorInicial>;

// Invoice completo de muestra: así el diseñador muestra todos los bloques con contenido.
export function borradorEjemplo(): Borrador {
	return {
		...borradorInicial(LEAD_EJEMPLO),
		pieza: "Anillo de boda para hombre",
		piedras: [{ id: siguienteId++, tipo: "Diamante", origen: "natural", corte: "Redondo", tamano: "2 mm", cantidad: "6–7", posicion: "pave" }],
		notas: "Diamantes color D-F, corte excelente, claridad VS. La cantidad final depende del diseño.",
		entregaDesde: hoy(),
		imagenes: [IMAGENES_MUESTRA[0].id],
	};
}

// Lo guardado se mezcla con un borrador nuevo, así una versión vieja no rompe el formulario.
function mezclar(base: Borrador, guardado: unknown): Borrador {
	if (!guardado || typeof guardado !== "object") return base;
	const g = guardado as Partial<Borrador>;
	const d: Borrador = { ...base, ...g, params: { ...base.params, ...g.params }, clausulas: { ...base.clausulas, ...g.clausulas }, produccion: { ...base.produccion, ...g.produccion } };
	// Las imágenes que no llegaron a Kommo (subidas sin servidor) no sobreviven a cerrar la ventana.
	d.imagenes = (d.imagenes ?? []).filter((id) => !id.startsWith("local-"));
	siguienteId = Math.max(siguienteId, ...d.piedras.map((p) => p.id + 1), ...d.depositos.map((x) => x.id + 1));
	if (!d.depositos.length) Object.assign(d, { depositos: base.depositos, cobrarAhora: base.depositos[0].id });
	return d;
}

// Copia local por si el servidor no responde: el asesor no pierde lo que lleva escrito.
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
		// modo privado: queda solo la copia del servidor
	}
	if (hayServidor()) await guardarBorradorServidor(leadId, d);
}

export const draft: Borrador = $state(borradorInicial(LEAD_EJEMPLO));

export function nuevaPiedra(): Piedra {
	return { id: siguienteId++, tipo: "Diamante", origen: "laboratorio", corte: "Redondo", tamano: "", cantidad: "1", posicion: "lateral" };
}

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

// Vacío hasta que el servidor asigna el correlativo al generar.
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

export const tituloPieza = (d: Borrador) => (d.pieza ? `${d.pieza}${d.aMedida && !d.pieza.toLowerCase().includes("medida") ? " a la medida" : ""}` : "Tipo de pieza pendiente");

const PLURALES: Record<string, string> = { Rubí: "Rubíes" };

// Viñetas que se pueden armar sin IA a partir de los campos. La IA las pule y suma las notas.
export function vinetas(d: Borrador) {
	const out: string[] = [];
	const metal = METALES.find((m) => m.id === d.metal)!;
	if (d.metal === "otro") out.push(d.metalOtro.trim() || "Metal por definir");
	else out.push(d.metal === "platino" ? "Platino 950" : `${metal.nombre}${d.solido ? " sólido" : ""} de ${d.kilates}`);
	for (const p of d.piedras) {
		const plural = !!p.cantidad && p.cantidad !== "1";
		const tipo = (plural ? PLURALES[p.tipo] ?? p.tipo + "s" : p.tipo).toLowerCase();
		const origen = p.origen === "laboratorio" ? "de laboratorio" : plural ? "naturales" : "natural";
		const pos = { central: "central", lateral: "a los lados", pave: "en pavé" }[p.posicion];
		const texto = [`${plural ? p.cantidad + " " : ""}${tipo} ${origen} ${pos}`, p.corte && `corte ${p.corte.toLowerCase()}`, p.tamano].filter(Boolean).join(", ");
		out.push(texto[0].toUpperCase() + texto.slice(1));
	}
	const talla = d.tallaPorConfirmar || !d.talla ? "Talla por confirmar" : `Talla ${d.talla}`;
	out.push(d.grabado ? `${talla}, con grabado: ${d.grabado}` : talla);
	if (d.origen) out.push(plantilla.textos.vineta_origen);
	return out;
}

const duracion = (meses: number) => (meses % 12 === 0 ? `${meses / 12} ${meses === 12 ? "año" : "años"}` : `${meses} meses`);

// Texto estándar de cada cláusula, armado con los textos de la plantilla (los edita Romero en el diseñador).
// **texto** sale en negrita en el invoice.
export function textoEstandar(id: string, d: Borrador): string {
	const p = d.params;
	const t = plantilla.textos;
	const pieza = d.pieza.toLowerCase().includes("anillo") ? "anillo" : "pieza";
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
			const partes = [rellenar(t.produccion, { entrega: rangoEntrega(d.entregaDesde, d.entregaHasta) || "por definir", pieza })];
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

// Título de un bloque de la plantilla: {pieza} → "anillo" o "pieza".
export const tituloBloque = (titulo: string, d: Borrador) => titulo.replaceAll("{pieza}", d.pieza.toLowerCase().includes("anillo") ? "anillo" : "pieza");

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
	if (!d.pieza.trim()) p.push({ sec: "pieza", msg: "Falta el tipo de pieza", bloquea: true });
	if (d.metal === "otro" && !d.metalOtro.trim()) p.push({ sec: "pieza", msg: "Falta describir el metal", bloquea: true });
	if (!(t.valor > 0)) p.push({ sec: "pago", msg: "Falta el valor de la pieza", bloquea: true });
	else if (t.depositos.some((x) => x.montoCalc < 0)) p.push({ sec: "pago", msg: "Un depósito quedó en negativo", bloquea: true });
	else if (t.diferencia !== 0) p.push({ sec: "pago", msg: `Los depósitos no cuadran con el total (${t.diferencia > 0 ? "faltan" : "sobran"} ${money(Math.abs(t.diferencia))})`, bloquea: true });
	if (d.entregaHasta && d.entregaDesde && d.entregaHasta < d.entregaDesde) p.push({ sec: "entrega", msg: "La fecha final va antes que la inicial", bloquea: true });
	if (!d.entregaDesde) p.push({ sec: "entrega", msg: "Sin fecha estimada de entrega", bloquea: false });
	if (d.imagenes.length === 0) p.push({ sec: "imagenes", msg: "Sin imágenes de referencia", bloquea: false });
	return p;
}
