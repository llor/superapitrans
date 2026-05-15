# =============================================
# PASARELA — Panel web (Vite + React + Caddy)
# =============================================
# Contexto de build: carpeta pasarela/ (no panel/).
# El script de deploy hace vendor-copy de saycu-theme a pasarela/saycu-theme/
# antes del build, así package.json puede resolver "file:../saycu-theme".
# Build arg VITE_API_BASE: URL pública del API (ej.
# https://dev-api.superapi.eoden.es/pasarela). Sin él, el panel apuntaría a
# /api relativo y no funcionaría detrás de system-caddy.

FROM node:20-alpine AS build

ARG VITE_API_BASE
ENV VITE_API_BASE=${VITE_API_BASE}

WORKDIR /app

# Replicamos la estructura pasarela/{panel,saycu-theme} dentro del contenedor
# para que el `file:../saycu-theme` del package.json resuelva.
COPY saycu-theme/ ./saycu-theme/
COPY panel/package.json ./panel/

WORKDIR /app/panel
RUN npm install --no-audit --no-fund

COPY panel/index.html panel/vite.config.js ./
COPY panel/src/ ./src/
COPY panel/public/ ./public/

RUN npm run build


FROM caddy:2-alpine

COPY panel/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/panel/dist /srv

EXPOSE 80
