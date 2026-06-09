# ============== BUILD STAGE ==============
FROM node:22-alpine AS builder

WORKDIR /app

# Copia arquivos de dependências
COPY package.json package-lock.json ./

# Instala dependências
RUN npm ci

# Copia código fonte
COPY tsconfig.json ./
COPY src/ ./src/

# Build do TypeScript (inclui seed.ts)
RUN npm run build

# ============== IMAGEM FINAL ==============
FROM node:22-alpine AS runner

# Instala PostgreSQL client para healthcheck e wait-for-it
# Instala Chromium e dependências para Puppeteer (geração de PDF)
RUN apk add --no-cache \
  postgresql-client \
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

WORKDIR /app

# Cria usuário não-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copia artefatos do build (inclui dist/database/seed.js)
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Copia entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expõe a porta
EXPOSE 3200

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3200/health || exit 1

# Usuário não-root (mudamos para root para entrypoint poder instalar pacotes, mas roda app como appuser)
USER appuser

ENTRYPOINT ["/entrypoint.sh"]
