// Capturas reales del widget (tarjeta del lead, ventana del generador, depósitos, PDF y diseñador)
// sobre el Kommo simulado. Para el inglés, la interfaz se traduce con el diccionario justo antes de
// cada captura (la app solo está en español).
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { LEAD_ID } from "./kommo.mjs";

// Borrador de muestra con todo lleno, para que las capturas cuenten la historia completa.
const BORRADOR = {
	numero: "RJ-2026-0001",
	cliente: "Daniela Ortega",
	email: "daniela.ortega@example.com",
	emision: "2026-10-20",
	preparadoPor: "Yan Romero",
	pieza: "Anillo de compromiso",
	metal: "blanco",
	kilates: "14k",
	piedras: [
		{ id: 1, tipo: "Diamante", origen: "laboratorio", corte: "Oval", tamano: "1.5 ct", cantidad: "1", posicion: "central" },
		{ id: 2, tipo: "Diamante", origen: "natural", corte: "Redondo", tamano: "1.2 mm", cantidad: "24", posicion: "pave" },
	],
	talla: "6",
	tallaPorConfirmar: false,
	grabado: "D & M",
	notas: "Pavé en la mitad superior del aro, perfil bajo.",
	valor: 3850,
	conTax: false,
	depositos: [
		{ id: 3, nombre: "Depósito 1", modo: "pct", pct: 40, monto: 0, momento: "para iniciar la producción", fecha: "" },
		{ id: 4, nombre: "Depósito 2", modo: "pct", pct: 30, monto: 0, momento: "al aprobar el diseño CAD", fecha: "" },
		{ id: 5, nombre: "Depósito 3", modo: "auto", pct: 0, monto: 0, momento: "al completar la pieza, antes de la entrega", fecha: "" },
	],
	cobrarAhora: 3,
	entregaDesde: "2026-12-01",
	entregaHasta: "2026-12-08",
};

// Reemplaza textos, placeholders y valores por su traducción, también dentro de los Shadow DOM.
// Con `listar`, en vez de traducir devuelve los textos que el diccionario aún no cubre.
function traducirPagina({ dic, listar }) {
	const faltan = new Set();
	const cambiar = (s) => {
		const t = s.trim();
		if (!t || !/[A-Za-zÁÉÍÓÚáéíóúñÑ]/.test(t)) return s;
		if (Object.hasOwn(dic, t)) return s.replace(t, dic[t]);
		faltan.add(t);
		return s;
	};
	const recorrer = (raiz) => {
		const w = document.createTreeWalker(raiz, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
		for (let n = w.currentNode; n; n = w.nextNode()) {
			if (n.nodeType === Node.TEXT_NODE) {
				if (!["SCRIPT", "STYLE"].includes(n.parentNode?.nodeName)) n.nodeValue = cambiar(n.nodeValue);
				continue;
			}
			if (n.nodeType !== Node.ELEMENT_NODE) continue; // la propia raíz del Shadow DOM
			if (n.shadowRoot) recorrer(n.shadowRoot);
			if (n.placeholder) n.placeholder = cambiar(n.placeholder);
			if ((n.nodeName === "INPUT" && !["date", "number", "checkbox", "radio", "file", "color"].includes(n.type)) || n.nodeName === "TEXTAREA") n.value = cambiar(n.value);
			for (const a of ["aria-label", "title"]) if (n.getAttribute(a)) n.setAttribute(a, cambiar(n.getAttribute(a)));
		}
	};
	recorrer(document.body);
	return listar ? [...faltan] : [];
}

export async function capturar({ origen, lang, dirSalida, dic = {}, listar = false }) {
	await mkdir(dirSalida, { recursive: true });
	// --lang: los campos de fecha muestran el formato del idioma (dd/mm/aaaa o mm/dd/yyyy).
	const navegador = await chromium.launch({ args: [`--lang=${lang === "en" ? "en-US" : "es-ES"}`] });
	const contexto = await navegador.newContext({ deviceScaleFactor: 2, locale: lang === "en" ? "en-US" : "es-ES" });
	const page = await contexto.newPage();
	const faltan = new Set();
	const traducir = async () => {
		if (lang !== "en" && !listar) return;
		for (const t of await page.evaluate(traducirPagina, { dic: lang === "en" ? dic : {}, listar })) faltan.add(t);
	};
	const archivo = (n) => join(dirSalida, `${n}.png`);
	// Las capturas van en un marco de 652×468: se toman en esa proporción para no recortarlas.
	const PROPORCION = 652 / 468;
	// Paneles con scroll arriba del todo (el clic en una pestaña puede dejarlos a mitad).
	const alInicio = () => page.evaluate(() => {
		const todos = (raiz) => [...raiz.querySelectorAll("*")].flatMap((el) => [el, ...(el.shadowRoot ? todos(el.shadowRoot) : [])]);
		for (const el of todos(document)) if (el.hasAttribute("data-scroll")) el.scrollTop = 0;
	});
	const listo = () => page.waitForFunction(() => window.listo === true);

	// 1. Diseñador en ajustes avanzados (y de paso, la imagen del anillo para subirla al invoice).
	// El diseñador incrustado mide (ancho - 36) × (alto - 170): se elige el alto para que quede en proporción.
	await page.setViewportSize({ width: 1100, height: Math.round(1064 / PROPORCION) + 170 });
	await page.goto(`${origen}/ajustes?lang=${lang}`);
	await listo();
	await page.locator("#work-area-rjinvoice article").waitFor();
	// El anillo dibujado (Thumb.svelte, viewBox 120×90), no el ícono de arrastre del bloque.
	await page.locator('#work-area-rjinvoice [data-bloque="imagenes"] svg[viewBox="0 0 120 90"]').first().screenshot({ path: archivo("render") });
	await page.getByRole("tab", { name: "Estilo" }).click();
	await alInicio();
	await page.waitForTimeout(300);
	await traducir();
	await page.locator("#work-area-rjinvoice").screenshot({ path: archivo("diseno") });

	// 2. Tarjeta del lead con el botón del widget.
	await page.setViewportSize({ width: 780, height: Math.round(780 / PROPORCION) });
	await page.goto(`${origen}/lead?lang=${lang}`);
	await listo();
	// El borrador vive en el servidor del widget (aquí, el falso de /srv).
	await page.evaluate(([id, b]) => fetch(`/srv/borradores/${id}`, { method: "PUT", body: JSON.stringify(b), headers: { "Content-Type": "application/json" } }), [LEAD_ID, BORRADOR]);
	await page.locator("#rj-invoice-abrir").waitFor();
	await traducir();
	await page.screenshot({ path: archivo("lead") });

	// 3. Ventana flotante del generador, en la sección Pieza.
	await page.setViewportSize({ width: 1366, height: 1000 });
	await page.locator("#rj-invoice-abrir").click();
	const ventana = page.locator("#rj-invoice-ventana");
	await ventana.locator("#f-pieza").waitFor();
	await ventana.getByText("Cargando el borrador del lead").waitFor({ state: "detached" });
	await ventana.locator('input[type="file"]').setInputFiles(archivo("render"));
	// Índice de secciones por posición: en inglés sus textos ya están traducidos. 0 Cliente · 1 Pieza · 2 Precio y pagos.
	const seccion = (i) => ventana.locator("nav li button").nth(i).click();
	await seccion(1);
	await page.waitForTimeout(700);
	await traducir();
	// Formulario y vista previa, sin el índice de secciones ni la barra de abajo.
	const nav = await ventana.locator("nav").boundingBox();
	const recorte = { x: nav.x + nav.width, y: nav.y, width: 1000, height: Math.round(1000 / PROPORCION) };
	await page.screenshot({ path: archivo("ventana"), clip: recorte });

	// 4. Precio y depósitos, con la tabla de pagos en la vista previa.
	await seccion(2);
	await page.waitForTimeout(700);
	await traducir();
	await page.screenshot({ path: archivo("pagos"), clip: recorte });

	// 5. El invoice (lo que sale en el PDF), desde arriba y con una ventana alta para que entre.
	await page.setViewportSize({ width: 1366, height: 1500 });
	await seccion(0);
	await page.waitForTimeout(700);
	// Como en el PDF: sin el resaltado del bloque activo ni las anotaciones del editor.
	await page.evaluate(() => {
		const raiz = document.getElementById("rj-invoice-ventana").shadowRoot;
		raiz.querySelectorAll("[data-no-pdf]").forEach((el) => el.remove());
		// Se quitan las clases del resaltado; un !important en una hoja suelta pierde contra el de Tailwind (va en @layer).
		for (const el of raiz.querySelectorAll("[data-bloque]")) {
			el.style.transition = "none"; // si no, la captura sale a mitad del fundido del resaltado
			el.classList.remove("outline-rj-gold", "bg-rj-gold-soft/40");
			el.style.outline = "none";
		}
	});
	await traducir();
	const articulo = await ventana.locator("article").boundingBox();
	await page.screenshot({ path: archivo("pdf"), clip: { x: articulo.x, y: articulo.y, width: articulo.width, height: Math.min(articulo.height, 800) } });

	await navegador.close();
	return [...faltan];
}
