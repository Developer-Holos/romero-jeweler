import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diaLocal, resumirEntregas } from "./entregas.ts";
import type { LeadResumen } from "./kommo.ts";

const CAMPO = 544152;
// 12 nov 2026, 10:00 en Miami.
const AHORA = Date.parse("2026-11-12T15:00:00Z");
// Kommo guarda la fecha como medianoche (segundos unix); aquí, medianoche de Miami a `dias` de AHORA.
const enDias = (dias: number) => Date.parse("2026-11-12T05:00:00Z") / 1000 + dias * 86_400;
const lead = (id: number, valor: unknown, etapa = 1, orden?: string, embudo = 9): LeadResumen => ({
	id,
	nombre: `Lead ${id}`,
	etapa,
	embudo,
	responsable: 5,
	valores: [...(valor === undefined ? [] : [{ campo: CAMPO, nombre: "Fecha evento", valores: [valor] }]), ...(orden ? [{ campo: 7, nombre: "Order #", valores: [orden] }] : [])],
});
const OPC = { campo: CAMPO, etapas: new Map<number, string>(), usuarios: new Map([[5, "Carolina"]]) };
const ids = (r: ReturnType<typeof resumirEntregas>, clave: string) => r.rangos.find((x) => x.clave === clave)!.piezas.map((p) => p.id);

describe("resumen de entregas", () => {
	it("cuenta los días en la hora de Miami, no en UTC", () => {
		// 23:30 del 12 en Miami ya es el 13 en UTC.
		assert.equal(diaLocal(Date.parse("2026-11-13T04:30:00Z")), "2026-11-12");
		const r = resumirEntregas([lead(1, enDias(0)), lead(2, enDias(1))], OPC, Date.parse("2026-11-13T04:30:00Z"));
		assert.deepEqual(r.rangos[1].piezas.map((p) => [p.id, p.dias]), [[1, 0], [2, 1]]);
	});

	it("reparte por rangos sin solaparse y ordena de lo más urgente a lo más lejano", () => {
		const leads = [lead(1, enDias(40)), lead(2, enDias(-3)), lead(3, enDias(7)), lead(4, enDias(8)), lead(5, enDias(30)), lead(6, enDias(200)), lead(7, enDias(0))];
		const r = resumirEntregas(leads, { ...OPC, etapas: new Map([[1, "Diseño"]]) }, AHORA);
		assert.deepEqual(Object.fromEntries(r.rangos.map((x) => [x.clave, x.piezas.map((p) => p.id)])), {
			atrasadas: [2],
			semana: [7, 3],
			mes: [4, 5],
			"dos-meses": [1],
			"tres-meses": [],
			despues: [6],
		});
		assert.equal(r.enCurso, 7);
		assert.equal(r.rangos[0].piezas[0].etapa, "Diseño");
		assert.equal(r.rangos[0].piezas[0].fecha, "2026-11-09");
		assert.equal(r.rangos[0].piezas[0].responsable, "Carolina");
	});

	it("separa las abiertas sin fecha y deja fuera las cerradas", () => {
		const leads = [lead(1, enDias(2), 142), lead(2, enDias(2), 143), lead(3, undefined, 1, " 1146 "), lead(4, "mañana"), lead(5, 0), lead(6, String(enDias(2)))];
		const r = resumirEntregas(leads, OPC, AHORA);
		assert.deepEqual(ids(r, "semana"), [6]);
		assert.deepEqual(r.sinFecha.map((p) => p.id), [3, 4, 5]);
		assert.equal(r.sinFecha[0].orden, "1146");
		assert.equal(r.enCurso, 1);
	});

	it("cuenta solo el embudo pedido (otro embudo puede usar el campo para otra fecha)", () => {
		const r = resumirEntregas([lead(1, enDias(2), 1, "", 100), lead(2, enDias(2), 1, "", 200)], { ...OPC, embudo: 100 }, AHORA);
		assert.deepEqual(ids(r, "semana"), [1]);
	});

	it("marca en riesgo lo que se entrega en 14 días o menos y sigue en una etapa temprana", () => {
		const DISENO = 113110623;
		const FUNDICION = 113110755;
		const leads = [lead(1, enDias(5), DISENO), lead(2, enDias(5), FUNDICION), lead(3, enDias(20), DISENO), lead(4, enDias(-1), DISENO), lead(5, enDias(14), DISENO)];
		const r = resumirEntregas(leads, OPC, AHORA);
		const riesgo = r.rangos.flatMap((x) => x.piezas).filter((p) => p.riesgo).map((p) => p.id);
		assert.deepEqual(riesgo.sort(), [1, 5]); // la atrasada ya cuenta como atrasada
	});
});
