// Compila el generador y el diseñador del invoice en un solo widget/app.js para el widget de Kommo.
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), svelte({ compilerOptions: { runes: true } })],
	define: { 'process.env.NODE_ENV': '"production"' },
	build: {
		outDir: 'widget',
		emptyOutDir: false,
		copyPublicDir: false,
		lib: {
			entry: 'src/widget/main.ts',
			formats: ['iife'],
			name: 'RJInvoiceApp',
			fileName: () => 'app.js'
		}
	}
});
