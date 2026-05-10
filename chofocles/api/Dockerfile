# =============================================
# CHOFOCLES — API backend
# =============================================

FROM node:20-alpine

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

RUN apk add --no-cache curl ca-certificates

COPY api/package*.json ./

RUN npm install --omit=dev && \
    npm cache clean --force

COPY --chown=nodejs:nodejs api/ .

RUN mkdir -p logs && \
    chown -R nodejs:nodejs logs

USER nodejs

EXPOSE 3411

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3411/health || exit 1

CMD ["node", "src/index.js"]
