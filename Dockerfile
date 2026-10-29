# App de Romero Jeweler para Railway: página de tracking y API del widget de invoice (/api) en un solo servicio.
# La imagen de Playwright ya trae Chromium y sus dependencias de Linux para generar los PDF;
# su versión tiene que coincidir con la de `playwright` en package.json (pnpm-lock.yaml).
FROM mcr.microsoft.com/playwright:v1.64.1-noble

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
	PORT=3000 \
	BODY_SIZE_LIMIT=25M

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@12.14.0 --activate

# Primero solo los manifiestos, para que la instalación quede en caché entre despliegues.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY . .
# Las variables de Kommo se leen al arrancar; el build solo necesita que existan.
RUN KOMMO_SUBDOMAIN=x KOMMO_ACCESS_TOKEN=x pnpm build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "build"]
