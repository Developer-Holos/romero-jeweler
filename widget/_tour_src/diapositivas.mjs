// Diapositivas del tour: texto a la izquierda, captura real del widget a la derecha con globos que señalan.
// Mismo esquema que el tour del Bot de Distribución, con los colores de Romero Jeweler.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { capturar } from "./capturas.mjs";
import { DICCIONARIO } from "./en.mjs";

const ANCHO = 1188;
const ALTO = 616;

// `img`: captura; `pos`: object-position del recorte; `globos`: [texto, x, y] en px dentro del marco (652×468).
const DIAPOSITIVAS = [
	{
		img: "lead",
		pos: "100% 0%",
		ruta: { es: "Lead · Anillo de compromiso · Daniela", en: "Lead · Engagement ring · Daniela" },
		etiqueta: { es: "Cómo funciona", en: "How it works" },
		titulo: { es: "Genera el invoice desde el lead", en: "Create the invoice from the lead" },
		texto: { es: "Un botón en la tarjeta del lead abre el generador, con el contacto, el correo y el presupuesto ya cargados.", en: "A button on the lead card opens the generator, with the contact, email and budget already filled in." },
		globos: [[{ es: "Un clic desde el lead", en: "One click from the lead" }, 420, 148]],
	},
	{
		img: "ventana",
		pos: "0% 0%",
		ruta: { es: "Invoice para el cliente", en: "Client invoice" },
		etiqueta: { es: "Paso 1 de 4", en: "Step 1 of 4" },
		titulo: { es: "Llena los datos de la pieza", en: "Fill in the piece details" },
		texto: { es: "Metal, piedras, talla y notas. La vista previa del invoice se actualiza mientras escribes.", en: "Metal, stones, size and notes. The invoice preview updates as you type." },
		globos: [
			[{ es: "Metal y piedras", en: "Metal and stones" }, 160, 142],
			[{ es: "Vista previa en vivo", en: "Live preview" }, 470, 10],
		],
	},
	{
		img: "pagos",
		pos: "0% 0%",
		ruta: { es: "Invoice › Precio y pagos", en: "Invoice › Price and payments" },
		etiqueta: { es: "Paso 2 de 4", en: "Step 2 of 4" },
		titulo: { es: "Depósitos que cuadran solos", en: "Deposits that always add up" },
		texto: { es: "Elige un plan o fija porcentajes y montos: el resto se reparte solo. La IA nunca toca los números.", en: "Pick a plan or set percents and amounts: the rest splits itself. AI never touches the numbers." },
		globos: [
			[{ es: "Planes listos", en: "Ready-made plans" }, 180, 94],
			[{ es: "Siempre suma el total", en: "Always matches the total" }, 400, 270],
		],
	},
	{
		img: "pdf",
		pos: "50% 0%",
		contener: true,
		ruta: { es: "RJ-INV-2026-1020-DO.pdf", en: "RJ-INV-2026-1020-DO.pdf" },
		etiqueta: { es: "Paso 3 de 4", en: "Step 3 of 4" },
		titulo: { es: "Genera y descarga el PDF", en: "Generate and download the PDF" },
		texto: { es: "La IA pule la descripción, o la redacta en inglés, y el PDF con el diseño de la joyería se descarga en tu equipo.", en: "AI polishes the description, or writes it in English, and the PDF with the jeweler's design downloads to your computer." },
		globos: [
			[{ es: "La IA pule la redacción", en: "AI polishes the wording" }, 470, 166],
			[{ es: "Listo para enviar", en: "Ready to send" }, 20, 60],
		],
	},
	{
		img: "diseno",
		pos: "0% 0%",
		ruta: { es: "Ajustes › Invoice Romero Jeweler", en: "Settings › Romero Jeweler Invoice" },
		etiqueta: { es: "Paso 4 de 4", en: "Step 4 of 4" },
		titulo: { es: "Un diseño para todo el equipo", en: "One design for the whole team" },
		texto: { es: "En Ajustes avanzados ordenas los bloques arrastrando y eliges colores, tipografía y logo. Aplica a todos los invoices.", en: "In Advanced settings you drag blocks into order and choose colors, fonts and logo. It applies to every invoice." },
		globos: [
			[{ es: "Paletas y colores", en: "Palettes and colors" }, 14, 168],
			[{ es: "Se ve al instante", en: "See it instantly" }, 450, 82],
		],
	},
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function html(d, lang, dirCapturas, logo) {
	const imagen = pathToFileURL(join(dirCapturas, `${d.img}.png`)).href;
	return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
	* { box-sizing: border-box; margin: 0; }
	body { width: ${ANCHO}px; height: ${ALTO}px; overflow: hidden; font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif; color: #fff;
		background: radial-gradient(900px 520px at 88% -10%, rgba(176,141,87,.32), transparent 60%), radial-gradient(700px 500px at 0% 110%, rgba(84,92,170,.45), transparent 60%), linear-gradient(135deg, #12153a, #1c2150 55%, #161a42); }
	.izq { position: absolute; left: 64px; top: 0; bottom: 0; width: 380px; display: flex; flex-direction: column; justify-content: center; }
	.etiqueta { align-self: flex-start; padding: 7px 16px; border-radius: 99px; border: 1px solid rgba(255,255,255,.28); background: rgba(255,255,255,.08); font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
	h1 { margin-top: 26px; font-family: Georgia, "Times New Roman", serif; font-size: 44px; line-height: 1.1; font-weight: 700; }
	p { margin-top: 18px; font-size: 18px; line-height: 1.55; color: #cfd2ea; }
	.marca { position: absolute; left: 64px; bottom: 34px; display: flex; align-items: center; gap: 12px; font-size: 15px; font-weight: 700; }
	.marca img { width: 34px; height: 34px; border-radius: 8px; }
	.marca span { font-weight: 400; color: #aab0d6; }
	.marco { position: absolute; left: 480px; top: 56px; width: 652px; height: 504px; border-radius: 16px; background: #fff; overflow: hidden; box-shadow: 0 30px 70px -20px rgba(0,0,0,.6); }
	.barra { height: 36px; display: flex; align-items: center; gap: 7px; padding: 0 16px; background: #f1f2f6; border-bottom: 1px solid #e3e5ec; color: #6b7080; font-size: 13px; }
	.barra i { width: 10px; height: 10px; border-radius: 50%; background: #d3d6df; } .barra b { margin-left: 8px; font-weight: 600; }
	.vista { position: relative; height: 468px; background: #e6e8ee; }
	.vista img { width: 100%; height: 100%; object-fit: cover; object-position: ${d.pos}; }
	.vista.contener img { object-fit: contain; padding: 18px 0; filter: drop-shadow(0 10px 22px rgba(28,33,80,.28)); }
	.globo { position: absolute; padding: 7px 14px; border-radius: 8px; background: #b08d57; color: #1c2150; font-size: 14px; font-weight: 800; white-space: nowrap; box-shadow: 0 6px 18px rgba(176,141,87,.5), 0 0 0 4px rgba(176,141,87,.25); }
</style></head><body>
	<div class="izq">
		<span class="etiqueta">${esc(d.etiqueta[lang])}</span>
		<h1>${esc(d.titulo[lang])}</h1>
		<p>${esc(d.texto[lang])}</p>
	</div>
	<div class="marca"><img src="${logo}" alt=""> ${lang === "en" ? "Romero Jeweler Invoice" : "Invoice Romero Jeweler"} <span>by holos</span></div>
	<div class="marco">
		<div class="barra"><i></i><i></i><i></i><b>${esc(d.ruta[lang])}</b></div>
		<div class="vista ${d.contener ? "contener" : ""}"><img src="${imagen}" alt="">
			${d.globos.map(([t, x, y]) => `<span class="globo" style="left:${x}px;top:${y}px">${esc(t[lang])}</span>`).join("")}
		</div>
	</div>
</body></html>`;
}

export async function construir({ origen, dirWidget }) {
	const dirTour = import.meta.dirname;
	const logo = pathToFileURL(join(dirWidget, "images", "logo_small.png")).href;
	const navegador = await chromium.launch();
	const page = await navegador.newPage({ viewport: { width: ANCHO, height: ALTO } });
	for (const lang of ["es", "en"]) {
		const dirCapturas = join(dirTour, "capturas", lang);
		await capturar({ origen, lang, dirSalida: dirCapturas, dic: DICCIONARIO });
		await mkdir(join(dirTour, "html"), { recursive: true });
		for (const [i, d] of DIAPOSITIVAS.entries()) {
			const archivoHtml = join(dirTour, "html", `slide_${i + 1}_${lang}.html`);
			await writeFile(archivoHtml, html(d, lang, dirCapturas, logo));
			await page.goto(pathToFileURL(archivoHtml).href);
			await page.waitForLoadState("load");
			const salida = join(dirWidget, "images", `slideshow_${i + 1}_${lang}.jpg`);
			await page.screenshot({ path: salida, type: "jpeg", quality: 92 });
			console.log(salida);
		}
	}
	await navegador.close();
}
