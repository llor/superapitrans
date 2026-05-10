# =============================================
# pasarela — API (Node.js + PostgreSQL)
# =============================================
# Contexto de build: pasarela/

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache curl

COPY api/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY api/src ./src
COPY api/scripts ./scripts
COPY api/tests ./tests

ENV NODE_ENV=production
EXPOSE 3412

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -fsSL "http://localhost:${PORT:-3412}/health" || exit 1

CMD ["node", "src/index.js"]
