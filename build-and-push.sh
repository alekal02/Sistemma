#!/bin/bash
# Linux/Mac/Git Bash — no Windows PowerShell use: .\build-and-push.ps1 -Tag 2.0.2
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [ -f .env.nexus ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.nexus
  set +a
fi

NEXUS_URL="${NEXUS_URL:-nexus.neurai-platform.com}"
NEXUS_USER="${NEXUS_USER:-admin}"
NEXUS_PASS="${NEXUS_PASSWORD:?Defina NEXUS_PASSWORD em .env.nexus}"
TAG="${1:-latest}"
BUILD_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo local)"
if [ -n "$TAG" ] && [ "$TAG" != "latest" ]; then
  printf '%s' "$TAG" > "$ROOT/VERSION"
fi
VERSION_FROM_FILE=""
if [ -f "$ROOT/VERSION" ]; then
  VERSION_FROM_FILE="$(tr -d '\r\n' < "$ROOT/VERSION")"
  printf '{"version":"%s"}\n' "$VERSION_FROM_FILE" > "$ROOT/frontend/public/app-version.json"
fi
GIT_DESCRIBE="$(git describe --tags --always --dirty 2>/dev/null || true)"
if [ -n "$TAG" ] && [ "$TAG" != "latest" ]; then
  export VITE_APP_VERSION="$TAG"
elif [ -n "$VERSION_FROM_FILE" ]; then
  export VITE_APP_VERSION="$VERSION_FROM_FILE"
elif [ -n "$GIT_DESCRIBE" ] && ! echo "$GIT_DESCRIBE" | grep -Eq '^[0-9a-f]{7,40}'; then
  export VITE_APP_VERSION="$GIT_DESCRIBE"
else
  export VITE_APP_VERSION="dev"
fi
REGISTRY="${REGISTRY:-nexus.neurai-platform.com/docker-registry}"

if [ ! -f .env.docker ]; then
  cp env.docker.example .env.docker
fi

export TAG REGISTRY BUILD_SHA VITE_APP_VERSION
export DOCKER_DEFAULT_PLATFORM=linux/amd64

echo "========================================"
echo "  Sistemma — Build & Push"
echo "========================================"
echo "TAG: ${TAG}"
echo "VITE_APP_VERSION: ${VITE_APP_VERSION}"
echo "Backend:  ${REGISTRY}/sistemma-backend:${TAG}"
echo "Frontend: ${REGISTRY}/sistemma-frontend:${TAG}"
echo ""

echo "Login no Nexus..."
echo "${NEXUS_PASS}" | docker login "${NEXUS_URL}" -u "${NEXUS_USER}" --password-stdin

echo "Build e push (buildx linux/amd64)..."
docker buildx create --name sistemma-amd64 --driver docker-container --use 2>/dev/null || docker buildx use sistemma-amd64
docker buildx inspect --bootstrap >/dev/null

docker buildx build --platform linux/amd64 --provenance=false --sbom=false \
  -f backend/Dockerfile -t "${REGISTRY}/sistemma-backend:${TAG}" \
  --build-arg "BUILD_SHA=${BUILD_SHA}" --push ./backend

docker buildx build --platform linux/amd64 --provenance=false --sbom=false \
  -f frontend/Dockerfile -t "${REGISTRY}/sistemma-frontend:${TAG}" \
  --build-arg "VITE_API_URL=/api" \
  --build-arg "VITE_APP_NAME=Sistemma" \
  --build-arg "VITE_APP_VERSION=${VITE_APP_VERSION}" \
  --build-arg "VITE_ENV=production" --push ./frontend

echo "Verificando manifest amd64..."
docker buildx imagetools inspect "${REGISTRY}/sistemma-backend:${TAG}"
docker buildx imagetools inspect "${REGISTRY}/sistemma-frontend:${TAG}"

echo ""
echo "Concluido! Na outra maquina: TAG=${TAG} no .env  ->  docker compose up -d"
