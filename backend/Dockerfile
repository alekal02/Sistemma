# ============== BUILD STAGE ==============
FROM node:22-alpine AS builder

ARG BUILD_SHA=unknown
ENV BUILD_SHA=${BUILD_SHA}

WORKDIR /workspace

COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src
WORKDIR /workspace/packages/shared
RUN npm install && npm run build

WORKDIR /workspace/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

# ============== IMAGEM FINAL ==============
FROM node:22-alpine AS runner

# Instala PostgreSQL client para healthcheck e wait-for-it
# Instala Chromium e dependências para Puppeteer (geração de PDF)
RUN apk add --no-cache \
  postgresql-client \
  wget \
  chromium \
  nss \
  freetype \
  freetype-dev \
  harfbuzz \
  ca-certificates \
  ttf-freefont \
  font-noto \
  font-noto-cjk

# Configura Puppeteer para usar o Chromium do Alpine
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

ARG BUILD_SHA=unknown
ENV BUILD_SHA=${BUILD_SHA}

WORKDIR /app

# Cria usuário não-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copia artefatos do build (inclui dist/database/seed.js)
COPY --from=builder /workspace/backend/dist ./dist
COPY --from=builder /workspace/backend/node_modules ./node_modules
COPY --from=builder /workspace/backend/package.json ./
COPY --from=builder /workspace/packages/shared /packages/shared

# Copia entrypoint — remove CR de checkout Windows, senão o shebang não resolve
COPY backend/entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh && sh -n /entrypoint.sh

# Expõe a porta
EXPOSE 3200

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3200/health || exit 1

RUN mkdir -p /app/uploads && chown -R appuser:appgroup /app

# Entrypoint roda como root (ajusta volume) e inicia o Node como appuser
USER root

ENTRYPOINT ["/entrypoint.sh"]
