// Mockup del widget de invoice: datos simulados del lead y borrador del formulario.
// Todo vive en el navegador; nada se envía a Kommo ni a la IA.

export const LEAD = {
	id: 21458233,
	nombre: "Anillo de boda · Milena",
	contacto: "Milena Suarez Besada",
	email: "suarezmilena387@gmail.com",
	telefono: "+1 305 555 0142",
	presupuesto: 2140,
	embudo: "Ventas",
	etapa: "En Conversación",
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

// Archivos que el cliente o el asesor ya compartieron en el chat del lead.
export const ARCHIVOS_LEAD = [
	{ id: "render-frontal", nombre: "render_frontal.png", tono: 42 },
	{ id: "render-lateral", nombre: "render_lateral.png", tono: 38 },
	{ id: "ref-cliente", nombre: "referencia_cliente.jpg", tono: 205 },
	{ id: "boceto", nombre: "boceto_mano.jpg", tono: 25 },
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

export function borradorInicial() {
	const depositos = PLANES[0].crear();
	return {
		sinCliente: false,
		cliente: LEAD.contacto,
		email: LEAD.email,
		emision: "2026-10-19",
		vencimiento: VENCIMIENTOS[0],
		preparadoPor: LEAD.responsable,
		idioma: "es" as "es" | "en",

		pieza: "Anillo de boda para hombre",
		aMedida: true,
		metal: "amarillo" as Metal,
		metalOtro: "",
		kilates: "14k",
		solido: true,
		piedras: [{ id: 1, tipo: "Diamante", origen: "natural", corte: "Redondo", tamano: "2 mm", cantidad: "6–7", posicion: "pave" }] as Piedra[],
		talla: "",
		tallaPorConfirmar: true,
		grabado: "",
		origen: false,
		notas: "Diamantes color D-F, corte excelente, claridad VS. La cantidad final depende del diseño.",

		valor: LEAD.presupuesto,
		conTax: true,
		taxPct: 0,
		depositos,
		cobrarAhora: depositos[0].id,

		entregaDesde: "2026-11-05",
		entregaHasta: "",
		envio: true,
		pickup: true,

		imagenes: ["render-frontal"] as string[],
		// texto null = se usa el texto estándar, que se arma con los valores de `params`.
		clausulas: Object.fromEntries(CLAUSULAS.map((c) => [c.id, { activa: true, texto: null as string | null }])),
		params: { diasSaldo: 15, medios: "tarjeta de crédito, tarjeta de débito o PayPal", ciudadPickup: "Miami", diasOrigen: "7 y 15", costoTalla: 100, diasAjuste: 60, mesesGarantia: 12 },
		instrucciones: "",
	};
}

export type Borrador = ReturnType<typeof borradorInicial>;

export const draft: Borrador = $state(borradorInicial());

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

export function numeroFactura(d: Borrador) {
	const [y, m, dd] = (d.emision || "2026-01-01").split("-");
	const iniciales = d.sinCliente || !d.cliente.trim() ? "XX" : d.cliente.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
	return `RJ-INV-${y}-${m}${dd}-${iniciales}`;
}

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
	if (d.origen) out.push("Incluye el servicio Origen (video del proceso de banco de tu anillo)");
	return out;
}

const duracion = (meses: number) => (meses % 12 === 0 ? `${meses / 12} ${meses === 12 ? "año" : "años"}` : `${meses} meses`);

// Texto estándar de cada cláusula. **texto** sale en negrita en el invoice.
export function textoEstandar(id: string, d: Borrador): string {
	const p = d.params;
	const t = totales(d);
	switch (id) {
		case "pago": {
			const lineas = t.depositos.map((x) => {
				const nombre = t.depositos.length > 1 ? `${x.nombre} (${pctTexto(x.pctCalc)})` : x.nombre;
				return `El **${nombre}** de ${money(x.montoCalc)} se paga ${x.momento}${x.fecha ? `, a más tardar el ${fechaLarga(x.fecha)}` : ""}.`;
			});
			if (t.depositos.length > 1) lineas.push(`Una vez notificada la finalización de la pieza, el cliente cuenta con **${p.diasSaldo} días** para pagar el saldo. La pieza se entrega únicamente al recibir el pago completo.`);
			lineas.push(`Métodos de pago aceptados: ${p.medios}, a través de un enlace de pago seguro.`);
			return lineas.join(" ");
		}
		case "produccion": {
			const pieza = d.pieza.toLowerCase().includes("anillo") ? "anillo" : "pieza";
			const partes = [`Fecha estimada de entrega: **${rangoEntrega(d.entregaDesde, d.entregaHasta) || "por definir"}**. Al ser una pieza hecha a la medida, los tiempos pueden variar ligeramente. Recibirás un enlace de seguimiento para ver en qué etapa de producción se encuentra tu ${pieza}.`];
			if (d.envio) partes.push("El envío está incluido y va asegurado por el valor total de la pieza, con firma requerida.");
			if (d.pickup) partes.push(`${d.envio ? "También puedes" : "Puedes"} recoger tu pieza en persona en ${p.ciudadPickup} (pickup).`);
			if (d.origen) partes.push(`El video Origen se entrega completo entre ${p.diasOrigen} días después de finalizada la joya.`);
			return partes.join(" ");
		}
		case "cambios":
			return "El diseño CAD incluye modificaciones sin costo, siempre que se mantenga la misma estructura del diseño. Un cambio total del diseño, o cualquier cambio después de que el cliente apruebe el CAD, tiene un costo adicional y puede modificar la fecha estimada de entrega.";
		case "talla":
			return `El primer ajuste es gratis, ya sea para reducir o agrandar. Después del primero, cada talla adicional para agrandar cuesta **${money(p.costoTalla).replace(".00", "")}**; reducir no tiene costo. El ajuste tiene un tiempo de espera mínimo de **${p.diasAjuste} días**. No todos los diseños permiten ajuste de talla.`;
		case "garantia":
			return `**${duracion(p.mesesGarantia)}** en engaste y defectos de fabricación. No cubre golpes, desgaste normal, mal uso ni piezas reparadas o modificadas por otro joyero.`;
		case "variaciones":
			return "Las imágenes y renders del diseño son una referencia. Por tratarse de una pieza artesanal, pueden existir ligeras variaciones en el peso del metal, las proporciones y la apariencia final respecto al render, sin que esto se considere un defecto.";
		case "terminos":
			return "Por tratarse de una pieza hecha a la medida, no se aceptan devoluciones ni cancelaciones, y los depósitos no son reembolsables en ningún caso. Ante cualquier inconformidad, el cliente se compromete a contactar primero a Romero Jeweler para buscar una solución antes de iniciar una disputa con su banco o procesador de pago.";
	}
	return "";
}

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
