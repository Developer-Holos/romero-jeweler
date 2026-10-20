<script lang="ts">
	// Miniatura simulada de un render de anillo (el mockup no tiene imágenes reales).
	let { tono }: { tono: number } = $props();
</script>

<svg viewBox="0 0 120 90" class="size-full" aria-hidden="true">
	<defs>
		<radialGradient id="bg-{tono}" cx="50%" cy="40%" r="75%">
			<stop offset="0" stop-color="hsl({tono} 30% 96%)" />
			<stop offset="1" stop-color="hsl({tono} 22% 80%)" />
		</radialGradient>
		<linearGradient id="metal-{tono}" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#f3dc9a" />
			<stop offset=".5" stop-color="#b08d57" />
			<stop offset="1" stop-color="#f0d38a" />
		</linearGradient>
	</defs>
	<rect width="120" height="90" fill="url(#bg-{tono})" />
	<ellipse cx="60" cy="54" rx="26" ry="22" fill="none" stroke="url(#metal-{tono})" stroke-width="5" />
	<path d="M60 22l7 9-7 9-7-9z" fill="hsl({tono + 120} 55% 70%)" stroke="#fff" stroke-width="1" />
</svg>
