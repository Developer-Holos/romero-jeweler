// Qué datos del lead (de sus campos en Kommo) se le pasan a la IA para escribir el seguimiento.
import type { LeadKommo } from "./kommo.ts";

// Las notas del asesor ("[N] Notes") no van: son internas y podrían terminar en el mensaje al cliente.
// Para que la IA vea un campo más, agrega su nombre aquí tal como se llama en Kommo. No importan las mayúsculas, los
// acentos ni el prefijo "[N] " de los campos por anillo ("[2] Ring Type" cuenta como "Ring Type").
export const CAMPOS_RELEVANTES = [
	// Lo que busca el cliente
	"Servicio",
	"Tipo de anillo",
	"Rango de precios",
	"Plazo espera",
	"País",
	"N° de Anillos",
	// Lo que pidió para cada anillo
	"Ring Type",
	"Metal",
	"Quilates",
	"Piedra",
	"Talla",
	"Size",
];

export type DatoLead = { nombre: string; valor: string };

const normalizar = (nombre: string) =>
	nombre
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/^\[\d+\]\s*/, "")
		.trim();

const relevantes = new Set(CAMPOS_RELEVANTES.map(normalizar));

const TIPOS_SIN_TEXTO = new Set(["checkbox", "file"]);
const TIPOS_FECHA = new Set(["date", "date_time", "birthday"]);

// Kommo guarda las fechas como segundos desde 1970.
// Los valores que no son texto, número o fecha (direcciones, listas encadenadas…) se descartan.
const comoTexto = (tipo: string, valor: unknown) => {
	if (TIPOS_FECHA.has(tipo) && typeof valor === "number") return new Date(valor * 1000).toISOString().slice(0, 10);
	return typeof valor === "string" || typeof valor === "number" ? String(valor).trim() : "";
};

export function datosRelevantes(lead: LeadKommo): DatoLead[] {
	const datos: DatoLead[] = [];
	// El precio del lead es el presupuesto del cliente.
	if (lead.precio > 0) datos.push({ nombre: "Presupuesto", valor: String(lead.precio) });
	for (const campo of lead.campos) {
		if (!relevantes.has(normalizar(campo.nombre)) || TIPOS_SIN_TEXTO.has(campo.tipo)) continue;
		const valor = campo.valores.map((v) => comoTexto(campo.tipo, v)).filter(Boolean).join(", ");
		if (valor) datos.push({ nombre: campo.nombre, valor });
	}
	return datos;
}
