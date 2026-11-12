// Datos de ejemplo para ver el panel de entregas sin Kommo (`vite dev` + `?demo`). Fijos: siempre los mismos leads,
// con fechas relativas a hoy, para que el panel se vea igual cualquier día.
import type { LeadResumen } from "./kommo.ts";

const CAMPO_ORDEN = 9001;
// Ids reales de las etapas de Producción (src/lib/kommo/pipeline.ts).
export const ETAPAS_DEMO = new Map([
	[113110623, "Diseño"],
	[113110627, "Aprobación de diseño"],
	[113110631, "En espera"],
	[113110751, "Impresión 3D"],
	[113110755, "Fundición"],
	[113110759, "Trabajo en metal"],
	[113110763, "Engaste"],
	[113110767, "Acabado"],
	[113110771, "Control de calidad"],
	[113110775, "Listo para entrega"],
]);
export const USUARIOS_DEMO = new Map([
	[1, "Carolina Romero"],
	[2, "Javier Méndez"],
	[3, "Lucía Fernández"],
]);
const [DISENO, APROBACION, ESPERA, IMPRESION, FUNDICION, METAL, ENGASTE, ACABADO, CALIDAD, LISTO] = [...ETAPAS_DEMO.keys()];

// [días hasta la entrega (null: sin fecha), nombre, etapa, Order #]
const PIEZAS: [number | null, string, number, string][] = [
	[-15, "Solitario oval 2ct — Valentina R.", ENGASTE, "1131"],
	[-6, "Alianzas oro rosa — Pérez/Gómez", ACABADO, "1138"],
	[-2, "Eternity esmeraldas — Daniela M.", CALIDAD, "1142"],
	[-1, "Lead #1902214", METAL, ""],
	[0, "Halo cojín 1.5ct — Andrés T.", LISTO, "1144"],
	[1, "Banda platino 4mm — Carlos V.", LISTO, "1145"],
	[2, "Trilogy diamantes — Mariana S.", CALIDAD, "1146"],
	[3, "Boda — evento de Laura P. (Ventas)", ACABADO, ""],
	[3, "Sello familiar oro 18k — J. Ramírez", ENGASTE, "1148"],
	[5, "Pavé micro — Sofía L.", ENGASTE, "1149"],
	[6, "Solitario esmeralda corte — Ana G.", IMPRESION, "1150"],
	[9, "Toi et moi pera — Gabriela F.", DISENO, "1151"],
	[11, "Lead #1902377", FUNDICION, ""],
	[12, "Alianza grabada — Hernández", APROBACION, "1153"],
	[14, "Anillo de grado UM — Diego A.", FUNDICION, "1154"],
	[16, "Halo redondo 1ct — Paula C.", IMPRESION, "1155"],
	[19, "Banda eternity — Natalia O.", IMPRESION, "1156"],
	[21, "Solitario radiant — Isabel K.", IMPRESION, "1157"],
	[24, "Anillo rubí vintage — Camila D.", APROBACION, "1158"],
	[28, "Alianzas oro blanco — Torres/Ruiz", APROBACION, "1159"],
	[33, "Solitario marquesa — Fernanda B.", APROBACION, "1160"],
	[38, "Anillo morganita — Lucía E.", DISENO, "1161"],
	[45, "Trilogy esmeraldas — Mónica Q.", DISENO, "1162"],
	[52, "Lead #1902590", DISENO, ""],
	[58, "Banda zafiros azules — Ricardo N.", ESPERA, "1164"],
	[67, "Solitario asscher — Elena W.", DISENO, "1165"],
	[79, "Anillo boda vintage — Rosa I.", ESPERA, "1166"],
	[104, "Solitario 3ct princesa — Marco Z.", DISENO, ""],
	[140, "Colección aniversario — Familia Ortiz", ESPERA, "1168"],
	[null, "Anillo compromiso pera — Valeria H.", DISENO, "1169"],
	[null, "Banda oro amarillo — Tomás Y.", APROBACION, ""],
	[null, "Lead #1902655", DISENO, ""],
];

export function leadsDemo(campoFecha: number, ahora = Date.now()): LeadResumen[] {
	// Mediodía UTC de hoy: cae en el mismo día en Miami, sin importar la hora.
	const hoy = Math.floor(ahora / 86_400_000) * 86_400 + 12 * 3600;
	return PIEZAS.map(([dias, nombre, etapa, orden], i) => ({
		id: 1902000 + i,
		nombre,
		etapa,
		// Una pieza de otro embudo (Ventas) con el mismo campo: el panel no la cuenta.
		embudo: i === 7 ? 14630839 : 14639515,
		responsable: (i % 3) + 1,
		valores: [
			...(dias === null ? [] : [{ campo: campoFecha, nombre: "Fecha evento", valores: [hoy + dias * 86_400] }]),
			...(orden ? [{ campo: CAMPO_ORDEN, nombre: "Order #", valores: [orden] }] : []),
		],
	}));
}
