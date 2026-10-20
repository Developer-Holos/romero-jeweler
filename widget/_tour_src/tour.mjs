// Imágenes del tour del widget (images/slideshow_<n>_<idioma>.jpg, 1188×616) a partir de capturas reales.
//
//   pnpm widget:build && node widget/_tour_src/tour.mjs            → capturas + diapositivas es/en
//   node widget/_tour_src/tour.mjs --listar                        → textos de la interfaz que faltan en en.mjs
//
// Reglas del marketplace de Kommo: 1188×616, sin logo ni marca de Kommo, y cada diapositiva entera en su idioma.
// Esta carpeta no va en el zip del widget.
import { join } from "node:path";
import { capturar } from "./capturas.mjs";
import { iniciarKommo } from "./kommo.mjs";

const dirWidget = join(import.meta.dirname, "..");
const kommo = await iniciarKommo({ dirWidget });

if (process.argv.includes("--listar")) {
	const { DICCIONARIO } = await import("./en.mjs").catch(() => ({ DICCIONARIO: {} }));
	const faltan = await capturar({ origen: kommo.origen, lang: "en", dirSalida: join(import.meta.dirname, "capturas", "en"), dic: DICCIONARIO, listar: true });
	const traducidos = new Set(Object.values(DICCIONARIO));
	console.log(JSON.stringify(faltan.filter((t) => !Object.hasOwn(DICCIONARIO, t) && !traducidos.has(t)), null, 1));
	kommo.cerrar();
} else {
	const { construir } = await import("./diapositivas.mjs");
	await construir({ origen: kommo.origen, dirWidget });
	kommo.cerrar();
}
