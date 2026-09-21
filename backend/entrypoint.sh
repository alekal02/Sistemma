#!/bin/sh
# Aguarda dependências, ajusta volume de uploads e inicia o backend.

set -e

echo "========================================"
echo "  Sistemma Backend - Entrypoint"
echo "========================================"

echo "Aguardando PostgreSQL em ${DATABASE_HOST}:${DATABASE_PORT}..."
until pg_isready -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "${DATABASE_USER:-neurai}" -q; do
  echo "  PostgreSQL ainda nao esta pronto... aguardando 2s"
  sleep 2
done
echo "PostgreSQL disponivel."

if [ -n "$MINIO_ENDPOINT" ]; then
  MINIO_PORT="${MINIO_PORT:-9000}"
  echo "Aguardando MinIO em ${MINIO_ENDPOINT}:${MINIO_PORT}..."
  until wget --no-verbose --tries=1 --spider "http://${MINIO_ENDPOINT}:${MINIO_PORT}/minio/health/live" 2>/dev/null; do
    echo "  MinIO ainda nao esta pronto... aguardando 2s"
    sleep 2
  done
  echo "MinIO disponivel."
fi

mkdir -p /app/uploads /data/planilhas-ciclo
chown -R appuser:appgroup /app/uploads 2>/dev/null || true
chown -R appuser:appgroup /data/planilhas-ciclo 2>/dev/null || true

if [ -n "${WUZAPI_URL}" ] && [ -n "${WUZAPI_TOKEN}" ]; then
  echo "WuzAPI: configurada (URL=${WUZAPI_URL})"
else
  echo "WuzAPI: NAO configurada — defina WUZAPI_URL e WUZAPI_TOKEN e recrie o container"
fi

echo "Executando migrations/seeds..."
if [ "${SKIP_STARTUP_SEED}" = "true" ]; then
  echo "SKIP_STARTUP_SEED=true — seed do entrypoint ignorado"
else
  su -s /bin/sh appuser -c "node dist/database/seed.js" \
    || echo "Aviso: seed retornou erro (pode ser normal em reexecucao)"
fi

echo "Iniciando servidor na porta ${APP_PORT:-3200}..."
exec su -s /bin/sh appuser -c "exec node dist/index.js"
