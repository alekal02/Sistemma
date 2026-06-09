# Sistemma

Sistema de gestão de coleta, contratos, serviços, KPIs e dashboards.

## Estrutura

- `backend/` — API Node.js + Express + TypeORM + PostgreSQL
- `frontend/` — React + Vite
- `docker-compose.yml` — deploy com PostgreSQL, MinIO, backend e frontend

## Desenvolvimento local

```bash
# Backend (porta 3200)
cd backend && npm install && npm run dev

# Frontend (porta 5175)
cd frontend && npm install && npm run dev
```

Copie `backend/.env.example` para `backend/.env` e ajuste as variáveis.

## Docker (outra máquina)

1. Copie `docker-compose.yml` e `.env.docker.example` → renomeie para `.env.docker`
2. Ajuste senhas, `CORS_ORIGIN` e `JWT_SECRET`
3. Execute:

```powershell
docker login nexus.chchat.org
docker compose --env-file .env.docker pull
docker compose --env-file .env.docker up -d
```

## Publicar imagens no Nexus

```powershell
$env:NEXUS_PASSWORD = "sua-senha"
.\build-and-push.ps1
```
