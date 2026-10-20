# Servidor del widget de invoice para Railway. Se construye desde la RAÍZ del repo (monorepo pnpm):
#   docker build -f server/Dockerfile .
# La imagen de Playwright ya trae Chromium y sus dependencias de Linux para generar los PDF;
# su versión tiene que coincidir con la de `playwright` en server/package.json (pnpm-lock.yaml).
FROM mcr.microsoft.com/playwright:v1.64.1-noble

ENV NODE_ENV=production \
	PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
	PORT=8787

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@12.14.0 --activate

# Primero solo los manifiestos, para que la instalación quede en caché entre despliegues.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY server/package.json server/
RUN pnpm install --filter jeweler-servidor --frozen-lockfile

COPY server/ server/

WORKDIR /app/server
EXPOSE 8787
CMD ["node", "node_modules/tsx/dist/cli.mjs", "src/index.ts"]
