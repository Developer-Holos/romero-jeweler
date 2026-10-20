// Arma widget/invoice-romero-jeweler.zip para subir a Kommo (manifest.json en la raíz).
// Sin dependencias: Compress-Archive de PowerShell 5.1 guarda las rutas con "\" y Kommo espera "/".
import { deflateRawSync } from "node:zlib";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const raiz = import.meta.dirname;
const ENTRADAS = ["manifest.json", "script.js", "style.css", "app.js", "i18n", "images"];
const SALIDA = join(raiz, "invoice-romero-jeweler.zip");

const archivos = ENTRADAS.flatMap(function listar(nombre) {
	const ruta = join(raiz, nombre);
	return statSync(ruta).isDirectory() ? readdirSync(ruta).flatMap((hijo) => listar(join(nombre, hijo))) : [ruta];
});

const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});
const crc32 = (buf) => {
	let c = 0xffffffff;
	for (const b of buf) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
};

const ahora = new Date();
const HORA_DOS = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | (ahora.getSeconds() >> 1);
const FECHA_DOS = ((ahora.getFullYear() - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate();

const locales = [];
const centrales = [];
let desplazamiento = 0;
for (const ruta of archivos) {
	const nombre = Buffer.from(relative(raiz, ruta).split("\\").join("/"));
	const datos = readFileSync(ruta);
	const comprimidos = deflateRawSync(datos, { level: 9 });
	const crc = crc32(datos);
	const cabecera = (firma, extra) => {
		const b = Buffer.alloc(extra ? 46 : 30);
		b.writeUInt32LE(firma, 0);
		let i = 4;
		if (extra) b.writeUInt16LE(20, i), (i += 2); // versión que lo creó
		b.writeUInt16LE(20, i); // versión necesaria
		b.writeUInt16LE(0x0800, i + 2); // nombres en UTF-8
		b.writeUInt16LE(8, i + 4); // deflate
		b.writeUInt16LE(HORA_DOS, i + 6);
		b.writeUInt16LE(FECHA_DOS, i + 8);
		b.writeUInt32LE(crc, i + 10);
		b.writeUInt32LE(comprimidos.length, i + 14);
		b.writeUInt32LE(datos.length, i + 18);
		b.writeUInt16LE(nombre.length, i + 22);
		if (extra) b.writeUInt32LE(desplazamiento, 42);
		return b;
	};
	const local = Buffer.concat([cabecera(0x04034b50, false), nombre, comprimidos]);
	centrales.push(Buffer.concat([cabecera(0x02014b50, true), nombre]));
	locales.push(local);
	desplazamiento += local.length;
}

const central = Buffer.concat(centrales);
const fin = Buffer.alloc(22);
fin.writeUInt32LE(0x06054b50, 0);
fin.writeUInt16LE(archivos.length, 8);
fin.writeUInt16LE(archivos.length, 10);
fin.writeUInt32LE(central.length, 12);
fin.writeUInt32LE(desplazamiento, 16);
writeFileSync(SALIDA, Buffer.concat([...locales, central, fin]));
console.log(`${relative(process.cwd(), SALIDA)}: ${archivos.length} archivos`);
