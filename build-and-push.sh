#!/bin/bash
# =============================================
# build-and-push.sh
# Builda as imagens Docker e envia ao Nexus
# =============================================
set -e

echo "========================================"
echo "  Sistemma — Build & Push para Nexus"
echo "========================================"

# Configurações
NEXUS_URL="${NEXUS_URL:-nexus.chchat.org}"
NEXUS_USER="${NEXUS_USER:-admin}"
NEXUS_PASS="${NEXUS_PASSWORD:?Defina NEXUS_PASSWORD antes de executar.}"
TAG="${1:-latest}"

BACKEND_IMAGE="${NEXUS_URL}/sistemma-backend:${TAG}"
FRONTEND_IMAGE="${NEXUS_URL}/sistemma-frontend:${TAG}"

echo ""
echo "📦 TAG: ${TAG}"
echo "📦 Backend: ${BACKEND_IMAGE}"
echo "📦 Frontend: ${FRONTEND_IMAGE}"
echo ""

# =============================================
# LOGIN NO NEXUS
# =============================================
echo "🔐 Login no Nexus..."
echo "${NEXUS_PASS}" | docker login "${NEXUS_URL}" \
  --username "${NEXUS_USER}" \
  --password-stdin

# =============================================
# BUILD — BACKEND
# =============================================
echo ""
echo "🏗️  Buildando backend..."
docker build \
  -t "${BACKEND_IMAGE}" \
  -f backend/Dockerfile \
  backend/

echo "✅ Backend buildado: ${BACKEND_IMAGE}"

# =============================================
# BUILD — FRONTEND
# =============================================
echo ""
echo "🏗️  Buildando frontend..."
docker build \
  -t "${FRONTEND_IMAGE}" \
  --build-arg VITE_API_URL=/api \
  --build-arg VITE_APP_NAME="Sistemma" \
  -f frontend/Dockerfile \
  frontend/

echo "✅ Frontend buildado: ${FRONTEND_IMAGE}"

# =============================================
# PUSH PARA O NEXUS
# =============================================
echo ""
echo "⬆️  Enviando backend para Nexus..."
docker push "${BACKEND_IMAGE}"

echo "⬆️  Enviando frontend para Nexus..."
docker push "${FRONTEND_IMAGE}"

echo ""
echo "========================================"
echo "  ✅ Build & Push concluído!"
echo "========================================"
echo ""
echo "📋 Imagens publicadas:"
echo "   ${BACKEND_IMAGE}"
echo "   ${FRONTEND_IMAGE}"
echo ""
echo "🚀 Para usar em outra máquina:"
echo "   1. Instale Docker + Docker Compose"
echo "   2. Copie docker-compose.yml + .env.docker"
echo "   3. Execute:"
echo "      docker login nexus.chchat.org"
echo "      docker compose --env-file .env.docker pull"
echo "      docker compose --env-file .env.docker up -d"
echo ""
echo "🔑 Credenciais padrão do sistema:"
echo "   (definidas no seed do backend)"
echo ""
