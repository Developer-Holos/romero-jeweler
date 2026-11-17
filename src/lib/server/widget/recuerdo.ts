// Recuerda lo que devuelve `leer` un rato, para no repetir una lectura cara (Kommo) en cada carga. Puro: sin imports, para
// probarlo con un reloj falso.
type Buena<T> = { lectura: Promise<T>; leidoEn: number };

type Opciones<T> = {
	duracion: number; // cuánto se recuerda una lectura buena
	minimoParaReleer: number; // `releer` no vuelve a intentarlo si el último intento (bueno o malo) terminó hace menos que esto
	// Si `releer` falla y todavía hay una copia vigente, se sirve lo que devuelva esto (por defecto, la copia).
	alFallarReleyendo?: (error: unknown, copia: T) => T;
	ahora?: () => number;
};

export function recordar<T>(leer: () => Promise<T>, { duracion, minimoParaReleer, alFallarReleyendo = (_, copia) => copia, ahora = Date.now }: Opciones<T>) {
	let buena: Buena<T> | null = null; // última lectura que salió bien
	let enCurso: Promise<T> | null = null;
	let ultimoIntento = -Infinity; // cuándo terminó el último intento, haya salido bien o mal

	return (releer = false): Promise<T> => {
		const t = ahora();
		const copia = buena && t - buena.leidoEn < duracion ? buena : null; // la que aún sirve
		const puedeReleer = t - ultimoIntento >= minimoParaReleer;

		// Con una copia vigente se sirve esa, salvo que se pida releer y se pueda; mientras se relee, también.
		if (copia && (enCurso || !(releer && puedeReleer))) return copia.lectura;
		// Sin copia que sirva, todos esperan la misma lectura.
		if (enCurso) return enCurso;

		const intento = leer();
		const sirviendo = copia ? intento.catch(async (e) => alFallarReleyendo(e, await copia.lectura)) : intento;
		enCurso = sirviendo;
		// Se anota antes de que quien pidió la lectura reanude, para que su siguiente pedido ya vea el estado nuevo.
		const terminar = () => {
			ultimoIntento = ahora();
			enCurso = null;
		};
		intento.then(
			// Los `duracion` se cuentan desde que terminó, aunque Kommo tarde.
			() => ((buena = { lectura: intento, leidoEn: ahora() }), terminar()),
			// Si falla, `buena` sigue como estaba (vencida o la copia): el próximo pedido lo intenta otra vez.
			terminar
		);
		return sirviendo;
	};
}
