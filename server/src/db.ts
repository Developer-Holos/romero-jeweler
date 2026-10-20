// Postgres del servidor: plantilla de diseño, ajustes (modelo de IA), borradores por lead y el registro
// de invoices con su correlativo. En producción, `pg` con DATABASE_URL (Railway). Sin DATABASE_URL,
// PGlite (Postgres compilado a WASM) en DATA_DIR, para desarrollar y probar sin instalar nada.
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

export type Db = {
	query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
	transaccion<T>(fn: (db: Db) => Promise<T>): Promise<T>;
	cerrar(): Promise<void>;
};

const ESQUEMA = `
	create table if not exists ajustes (
		clave text primary key,
		valor jsonb not null,
		actualizado timestamptz not null default now()
	);
	create table if not exists borradores (
		lead_id bigint primary key,
		datos jsonb not null,
		actualizado timestamptz not null default now()
	);
	create table if not exists contadores (
		anio int primary key,
		ultimo int not null
	);
	create table if not exists invoices (
		numero text primary key,
		anio int not null,
		secuencia int not null,
		lead_id bigint not null,
		total numeric(12, 2),
		datos jsonb,
		kommo_archivo text,
		creado timestamptz not null default now(),
		actualizado timestamptz not null default now()
	);
	create index if not exists invoices_lead on invoices (lead_id);
`;

// `url`: DATABASE_URL. `dir`: carpeta de PGlite; "memoria" para los tests.
export async function abrirDb({ url, dir }: { url?: string; dir: string }): Promise<Db> {
	const db = url ? conPg(url) : await conPglite(dir);
	await db.query(ESQUEMA);
	return db;
}

function conPg(url: string): Db {
	// Railway da conexiones con SSL interno; el certificado no es de una CA pública.
	const pool = new pg.Pool({ connectionString: url, ssl: /sslmode=disable|localhost|\.internal/.test(url) ? false : { rejectUnauthorized: false } });
	const envolver = (c: pg.Pool | pg.PoolClient): Omit<Db, "transaccion" | "cerrar"> => ({
		query: async (sql, params) => ({ rows: (await c.query(sql, params as unknown[])).rows }),
	});
	return {
		...envolver(pool),
		async transaccion(fn) {
			const cliente = await pool.connect();
			try {
				await cliente.query("begin");
				// Anidada: misma conexión, misma transacción.
				const tx: Db = { ...envolver(cliente), transaccion: (f) => f(tx), cerrar: async () => {} };
				const r = await fn(tx);
				await cliente.query("commit");
				return r;
			} catch (e) {
				await cliente.query("rollback");
				throw e;
			} finally {
				cliente.release();
			}
		},
		cerrar: () => pool.end(),
	};
}

async function conPglite(dir: string): Promise<Db> {
	const lite = dir === "memoria" ? new PGlite() : new PGlite(dir);
	await lite.waitReady;
	const db: Db = {
		// exec admite varias sentencias (el esquema); query, parámetros.
		query: async (sql, params) => (params?.length ? { rows: (await lite.query(sql, params)).rows as never[] } : { rows: ((await lite.exec(sql)).at(-1)?.rows ?? []) as never[] }),
		transaccion: (fn) =>
			lite.transaction((t) => {
				const tx: Db = { query: async (sql, params) => ({ rows: (await t.query(sql, params)).rows as never[] }), transaccion: (f) => f(tx), cerrar: async () => {} };
				return fn(tx);
			}),
		cerrar: () => lite.close(),
	};
	return db;
}
