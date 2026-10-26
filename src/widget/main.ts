// Entrada del bundle que carga el widget de Kommo (widget/script.js → app.js).
// Monta el generador (ventana flotante sobre la tarjeta del lead) y el diseñador (ajustes avanzados)
// dentro de un Shadow DOM, así los estilos de Kommo y los del invoice no se pisan.
import { mount, unmount } from "svelte";
import Disenador from "#lib/invoice/Disenador.svelte";
import Generador from "#lib/invoice/Generador.svelte";
import OrdenProduccion from "#lib/invoice/OrdenProduccion.svelte";
import type { Lead } from "#lib/invoice/invoice.svelte.ts";
import { configurarServidor, type Kommo } from "#lib/invoice/servidor.ts";
import css from "./app.css?inline";

type Servidor = { url?: string; clave?: string };

// Kommo no usa 16px de base: las medidas en rem de Tailwind se pasan a px para que no cambien de tamaño.
const cssWidget = css.replace(/(-?\d*\.?\d+)rem\b/g, (_, n: string) => `${+(Number(n) * 16).toFixed(3)}px`);

// Las reglas @property no funcionan dentro de un Shadow DOM: van una sola vez al documento.
function registrarPropiedades() {
	if (document.getElementById("rj-invoice-propiedades")) return;
	const propiedades = cssWidget.match(/@property[^{]+\{[^}]*\}/g) ?? [];
	const style = Object.assign(document.createElement("style"), { id: "rj-invoice-propiedades", textContent: propiedades.join("\n") });
	document.head.append(style);
}

function raizAislada(host: HTMLElement) {
	registrarPropiedades();
	const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
	shadow.replaceChildren(Object.assign(document.createElement("style"), { textContent: cssWidget }));
	const contenedor = document.createElement("div");
	contenedor.className = "font-sans text-base text-slate-800 antialiased";
	shadow.append(contenedor);
	return contenedor;
}

let ventana: { host: HTMLElement; app: Record<string, unknown> } | null = null;

export function abrirGenerador({ lead, servidor, kommo }: { lead: Lead; servidor: Servidor; kommo?: Kommo }) {
	cerrarGenerador();
	configurarServidor(servidor.url, servidor.clave);
	const host = document.createElement("div");
	host.id = "rj-invoice-ventana";
	host.style.cssText = "position: fixed; inset: 0; z-index: 2147483000;";
	document.body.append(host);
	const app = mount(Generador, { target: raizAislada(host), props: { lead, kommo, flotante: true, onclose: cerrarGenerador } });
	ventana = { host, app };
}

// Orden de producción del lead: misma ventana flotante, mismo borrador que el invoice.
export function abrirOrden({ lead, servidor, kommo }: { lead: Lead; servidor: Servidor; kommo?: Kommo }) {
	cerrarGenerador();
	configurarServidor(servidor.url, servidor.clave);
	const host = document.createElement("div");
	host.id = "rj-invoice-ventana";
	host.style.cssText = "position: fixed; inset: 0; z-index: 2147483000;";
	document.body.append(host);
	const app = mount(OrdenProduccion, { target: raizAislada(host), props: { lead, kommo, flotante: true, onclose: cerrarGenerador } });
	ventana = { host, app };
}

export function cerrarGenerador() {
	if (!ventana) return;
	unmount(ventana.app);
	ventana.host.remove();
	ventana = null;
}

// `contenedor`: el div#work-area-<código> que Kommo deja vacío en la página de ajustes avanzados.
export function montarDisenador(contenedor: HTMLElement, servidor: Servidor) {
	configurarServidor(servidor.url, servidor.clave);
	const host = document.createElement("div");
	contenedor.replaceChildren(host);
	const app = mount(Disenador, { target: raizAislada(host), props: { incrustado: true } });
	return () => unmount(app);
}
