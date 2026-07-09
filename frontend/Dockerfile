# ============== BUILD STAGE ==============
FROM node:22-alpine AS builder

# ARGS para variáveis de ambiente do Vite
ARG VITE_API_URL=/api
ARG VITE_APP_NAME=Sistemma
ARG VITE_APP_VERSION=dev
ARG VITE_ENV=production

ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_APP_NAME=${VITE_APP_NAME}
ENV VITE_APP_VERSION=${VITE_APP_VERSION}
ENV VITE_ENV=${VITE_ENV}

WORKDIR /app

# Copia arquivos de dependências
COPY package.json package-lock.json ./

# Instala dependências
RUN npm ci

# Copia configurações e código fonte
COPY tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY vite.config.ts ./
COPY index.html ./
COPY public/ ./public/
COPY scripts/ ./scripts/
COPY src/ ./src/
COPY eslint.config.js ./

# Build do frontend (tsc -b && vite build)
RUN npm run build

# ============== SERVE STAGE (Nginx) ==============
FROM nginx:1.27-alpine AS runner

# Remove config padrão do Nginx
RUN rm -rf /etc/nginx/conf.d/default.conf

# Copia config customizada
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copia os arquivos buildados do frontend
COPY --from=builder /app/dist /usr/share/nginx/html

# Expõe porta 80
EXPOSE 80

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
