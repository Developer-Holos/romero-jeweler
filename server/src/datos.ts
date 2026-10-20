// Lecturas y escrituras de la base: ajustes, borradores por lead e invoices con su correlativo.
import type { Db } from "./db.ts";

export async function leerAjuste<T>(db: Db, clave: string): Promise<T | null> {
	const { rows } = await db.query<{ valor: T }>("select valor from ajustes where clave = $1", [clave]);
	return rows[0]?.valor ?? null;
}

export async function guardarAjuste(db: Db, clave: string, valor: unknown) {
	await db.query(
		`insert into ajustes (clave, valor) values ($1, $2)
		 on conflict (clave) do update set valor = excluded.valor, actualizado = now()`,
		[clave, JSON.stringify(valor)],
	);
}

// El último guardado gana: el borrador es compartido entre asesores (ver docs/DECISIONES.md, #9).
export async function leerBorrador(db: Db, leadId: number) {
	const { rows } = await db.query<{ datos: unknown; actualizado: Date }>("select datos, actualizado from borradores where lead_id = $1", [leadId]);
	return rows[0] ?? null;
}

export async function guardarBorrador(db: Db, leadId: number, datos: unknown) {
	const { rows } = await db.query<{ actualizado: Date }>(
		`insert into borradores (lead_id, datos) values ($1, $2)
		 on conflict (lead_id) do update set datos = excluded.datos, actualizado = now()
		 returning actualizado`,
		[leadId, JSON.stringify(datos)],
	);
	return rows[0].actualizado;
}

export const formatoNumero = (anio: number, secuencia: number) => `RJ-${anio}-${String(secuencia).padStart(4, "0")}`;

// Correlativo por año (RJ-2026-0001, 0002…). El upsert con returning es atómico: dos asesores que
// generan a la vez nunca reciben el mismo número.
export async function asignarNumero(db: Db, leadId: number, anio = new Date().getFullYear()) {
	return db.transaccion(async (tx) => {
		const { rows } = await tx.query<{ ultimo: number }>(
			`insert into contadores (anio, ultimo) values ($1, 1)
			 on conflict (anio) do update set ultimo = contadores.ultimo + 1
			 returning ultimo`,
			[anio],
		);
		const secuencia = rows[0].ultimo;
		const numero = formatoNumero(anio, secuencia);
		await tx.query("insert into invoices (numero, anio, secuencia, lead_id) values ($1, $2, $3, $4)", [numero, anio, secuencia, leadId]);
		return numero;
	});
}

export async function buscarInvoice(db: Db, numero: string) {
	const { rows } = await db.query<{ numero: string; lead_id: string; total: string | null; kommo_archivo: string | null }>(
		"select numero, lead_id, total, kommo_archivo from invoices where numero = $1",
		[numero],
	);
	return rows[0] ?? null;
}

export async function registrarInvoice(db: Db, numero: string, { total, datos }: { total: number; datos: unknown }) {
	await db.query("update invoices set total = $2, datos = $3, actualizado = now() where numero = $1", [numero, total, JSON.stringify(datos)]);
}

export async function marcarSubidoAKommo(db: Db, numero: string, archivo: string) {
	await db.query("update invoices set kommo_archivo = $2, actualizado = now() where numero = $1", [numero, archivo]);
}
