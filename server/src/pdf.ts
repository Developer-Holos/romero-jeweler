// HTML del invoice → PDF con Chromium. El widget manda la vista previa ya armada,
// así el PDF sale idéntico a lo que el asesor ve.
import { chromium, type Browser } from "playwright";

let navegador: Promise<Browser> | null = null;

function abrirNavegador() {
	// Si Chromium no abre o se cae, el próximo pedido lo vuelve a intentar.
	navegador ??= chromium.launch().then(
		(b) => {
			b.on("disconnected", () => (navegador = null));
			return b;
		},
		(e) => {
			navegador = null;
			throw e;
		},
	);
	return navegador;
}

export async function htmlAPdf(html: string): Promise<Uint8Array> {
	const b = await abrirNavegador();
	// Sin JavaScript ni red: el HTML trae todo (estilos e imágenes como data URLs).
	const ctx = await b.newContext({ javaScriptEnabled: false, offline: true });
	try {
		const page = await ctx.newPage();
		await page.setContent(html, { waitUntil: "load", timeout: 15_000 });
		return await page.pdf({ format: "Letter", printBackground: true, preferCSSPageSize: true });
	} finally {
		await ctx.close();
	}
}

export async function cerrarNavegador() {
	await (await navegador)?.close();
}
