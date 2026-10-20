# Graph Report - jeweler  (2026-10-19)

## Corpus Check
- Corpus is ~8,729 words - fits in a single context window. You may not need a graph.

## Summary
- 140 nodes · 171 edges · 13 communities (10 shown, 3 thin omitted)
- Extraction: 90% EXTRACTED · 9% INFERRED · 1% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Package Metadata
- Fetcher Types
- Tracking Business Rules
- Kommo Service & Tracking
- Dev Dependencies
- Client Requirements (Reqs)
- Frontend Routes & Layout
- npm Scripts
- Fetch Request Pipeline
- TypeScript Config
- pnpm Build Permissions
- App Type Declarations

## God Nodes (most connected - your core abstractions)
1. `standardFetcher()` - 10 edges
2. `scripts` - 9 edges
3. `KommoService()` - 7 edges
4. `Página pública de tracking /orders/<lead_id>` - 7 edges
5. `Requerimientos del cliente para configurar la plataforma` - 6 edges
6. `doFetch()` - 5 edges
7. `constructUrl()` - 5 edges
8. `buildTracking()` - 5 edges
9. `@sveltejs/kit` - 4 edges
10. `request()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `Captura: tarjeta de progreso 100% (Pieza entregada), subtítulo 14k blanco y lista de producción con fechas` --references--> `Embudo Producción (id 14639515) con 11 pasos visibles`  [AMBIGUOUS]
  references/images/20261019_10h20m12s_grim.png → README.md
- `Captura: tarjeta de progreso 100% (Pieza entregada), subtítulo 14k blanco y lista de producción con fechas` --references--> `Página pública de tracking /orders/<lead_id>`  [INFERRED]
  references/images/20261019_10h20m12s_grim.png → README.md
- `Captura: final de la línea de tiempo con Entregado resaltado (18 oct 2026) y pie 'Hecho con Joyerokit'` --references--> `Embudo Producción (id 14639515) con 11 pasos visibles`  [INFERRED]
  references/images/20261019_10h20m15s_grim.png → README.md
- `Captura: tarjeta de progreso 100% (Pieza entregada), subtítulo 14k blanco y lista de producción con fechas` --references--> `Subtítulo de metal pendiente (campo no existe en Kommo)`  [INFERRED]
  references/images/20261019_10h20m12s_grim.png → README.md
- `Favicon: logo de Svelte` --conceptually_related_to--> `Stack: SvelteKit 3, Svelte 5, TypeScript 6, Vite 8, Tailwind CSS 4, Vitest 4, pnpm`  [INFERRED]
  src/lib/assets/favicon.svg → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Página de tracking y sus referencias visuales** — readme_tracking_page, references_images_20261019_10h20m12s_grim_tracking_progress, references_images_20261019_10h20m15s_grim_tracking_timeline [INFERRED 0.75]

## Communities (13 total, 3 thin omitted)

### Community 0 - "Package Metadata"
Cohesion: 0.10
Nodes (20): imports, #lib, name, private, type, version, playwright, svelte (+12 more)

### Community 1 - "Fetcher Types"
Cohesion: 0.15
Nodes (14): BaseRequest, EndpointRequestArgs, FetcherArgs, RequestArgs, UrlRequestArgs, HTTPMethods, Result, KommoEvents (+6 more)

### Community 2 - "Tracking Business Rules"
Cohesion: 0.15
Nodes (14): buildTracking: reglas de etapa, porcentaje y texto del cliente, Variables de entorno KOMMO_SUBDOMAIN y KOMMO_ACCESS_TOKEN, Jeweler: tracking de pedidos conectado a Kommo, Cuenta Kommo romerojeweler (embudos y etapas reales), Embudo Producción (id 14639515) con 11 pasos visibles, Stack: SvelteKit 3, Svelte 5, TypeScript 6, Vite 8, Tailwind CSS 4, Vitest 4, pnpm, Página pública de tracking /orders/<lead_id>, Captura: tarjeta de progreso 100% (Pieza entregada), subtítulo 14k blanco y lista de producción con fechas (+6 more)

### Community 3 - "Kommo Service & Tracking"
Cohesion: 0.17
Nodes (10): KommoService(), buildTracking(), DELIVERED, NAMES, stepIndex(), STEPS, StepState, Tracking (+2 more)

### Community 4 - "Dev Dependencies"
Cohesion: 0.14
Nodes (14): devDependencies, playwright, svelte, svelte-check, @sveltejs/adapter-auto, @sveltejs/kit, @sveltejs/vite-plugin-svelte, tailwindcss (+6 more)

### Community 5 - "Client Requirements (Reqs)"
Cohesion: 0.24
Nodes (11): Accesos y complementos: Manychat, Dropbox, ficha técnica del diseñador, Conexión con CRM mediante Dropbox, Keywords para identificar prospectos en comentarios, CRM Kommo, Manychat (automatizaciones a trasladar), Prerrequisitos: número de WhatsApp Business y Portfolio Comercial en Meta, Recontacto automático para clientes que piden ser contactados a futuro, Requerimientos del cliente para configurar la plataforma (+3 more)

### Community 6 - "Frontend Routes & Layout"
Cohesion: 0.18
Nodes (3): { children }, { data }, { tracking }

### Community 7 - "npm Scripts"
Cohesion: 0.22
Nodes (9): scripts, build, check, check:watch, dev, prepare, preview, test (+1 more)

### Community 8 - "Fetch Request Pipeline"
Cohesion: 0.39
Nodes (9): isUrlRequest(), standardFetcher(), constructOptions(), constructUrl(), doFetch(), getRetryTime(), request(), trimBase() (+1 more)

### Community 9 - "TypeScript Config"
Cohesion: 0.33
Nodes (5): $app/tsconfig, compilerOptions, strict, extends, include

## Ambiguous Edges - Review These
- `Embudo Producción (id 14639515) con 11 pasos visibles` → `Captura: tarjeta de progreso 100% (Pieza entregada), subtítulo 14k blanco y lista de producción con fechas`  [AMBIGUOUS]
  references/images/20261019_10h20m12s_grim.png · relation: references
- `CRM Kommo` → `Conexión con CRM mediante Dropbox`  [AMBIGUOUS]
  docs/Reqs.md · relation: references

## Knowledge Gaps
- **17 isolated node(s):** `@sveltejs/vite-plugin-svelte`, `playwright`, `svelte`, `svelte-check`, `tailwindcss` (+12 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 78 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@sveltejs/kit` connect `Package Metadata` to `Kommo Service & Tracking`?**
  _High betweenness centrality (0.234) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `KommoService()` (e.g. with `getLead()` and `getLeadProductionStage()`) actually correct?**
  _`KommoService()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@sveltejs/vite-plugin-svelte`, `playwright`, `svelte` to the rest of the system?**
  _17 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Package Metadata` be split into smaller, more focused modules?**
  _Cohesion score 0.10276679841897234 - nodes in this community are weakly interconnected._
- **Why does `devDependencies` connect `Dev Dependencies` to `Package Metadata`?**
  _High betweenness centrality (0.126) - this node is a cross-community bridge._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Embudo Producción (id 14639515) con 11 pasos visibles` and `Captura: tarjeta de progreso 100% (Pieza entregada), subtítulo 14k blanco y lista de producción con fechas`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `CRM Kommo` and `Conexión con CRM mediante Dropbox`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._