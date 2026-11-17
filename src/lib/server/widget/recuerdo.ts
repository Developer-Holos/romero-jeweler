// Recuerda lo que devuelve `leer` un rato, para no repetir una lectura cara (Kommo) en cada carga. Puro: sin imports, para
// probarlo con un reloj falso.
type Guardada<T> = { leidoEn: number | null; lectura: Promise<T> }; // `leidoEn` es null mientras se lee

type Opciones = {
	duracion: number; // cuánto se recuerda una lectura terminada
	minimoParaReleer: number; // `releer` no vuelve a leer si la última lectura terminó hace menos que esto
	ahora?: () => number;
};

export function recordar<T>(leer: () => Promise<T>, { duracion, minimoParaReleer, ahora = Date.now }: Opciones) {
	let guardada: Guardada<T> | null = null;

	return (releer = false): Promise<T> => {
		const anterior = guardada;
		const edad = anterior?.leidoEn == null ? null : ahora() - anterior.leidoEn; // null: se está leyendo (o no hay nada)
		// Mientras se lee, todos comparten esa lectura, aunque pidan releer.
		if (anterior && (edad === null || (edad < duracion && !(releer && edad >= minimoParaReleer)))) return anterior.lectura;

		// Si se pidió releer y lo recordado aún sirve, queda como respaldo: un fallo de Kommo no lo borra.
		const respaldo = releer && anterior && edad !== null && edad < duracion ? anterior : null;
		const lectura = leer();
		const nueva: Guardada<T> = { leidoEn: null, lectura: respaldo ? lectura.catch(() => respaldo.lectura) : lectura };
		guardada = nueva;
		lectura.then(
			// Los `duracion` se cuentan desde que terminó, aunque Kommo tarde.
			() => (nueva.leidoEn = ahora()),
			// Si falla, no se recuerda (o vuelve lo anterior): el próximo pedido intenta otra vez.
			() => {
				if (guardada === nueva) guardada = respaldo;
			}
		);
		return nueva.lectura;
	};
}
