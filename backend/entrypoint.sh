#!/bin/sh
# entrypoint.sh — Sistemma Backend
# Aguarda PostgreSQL, executa migrations e inicia o servidor

set -e

echo "========================================"
echo "  Sistemma Backend - Entrypoint"
echo "========================================"

# Aguarda o PostgreSQL ficar disponível
echo "⏳ Aguardando PostgreSQL em ${DATABASE_HOST}:${DATABASE_PORT}..."
until nc -z -v -w30 "$DATABASE_HOST" "$DATABASE_PORT" 2>/dev/null; do
  echo "   PostgreSQL ainda não está pronto... aguardando 2s"
  sleep 2
done
echo "✅ PostgreSQL está disponível!"

# Aguarda o MinIO ficar disponível (storage de arquivos)
if [ -n "$MINIO_ENDPOINT" ]; then
  echo "⏳ Aguardando MinIO em ${MINIO_ENDPOINT}:${MINIO_PORT:-9000}..."
  until nc -z -v -w30 "$MINIO_ENDPOINT" "${MINIO_PORT:-9000}" 2>/dev/null; do
    echo "   MinIO ainda não está pronto... aguardando 2s"
    sleep 2
  done
  echo "✅ MinIO está disponível!"
fi

# Executa as migrations
echo "🔄 Executando migrations..."
node dist/database/seed.js || echo "⚠️  Aviso: seed.js encontrou algum problema (pode ser normal na primeira execução)"

# Inicia o servidor
echo "🚀 Iniciando servidor na porta ${APP_PORT:-3200}..."
exec node dist/index.js
