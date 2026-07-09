# Sistemma

Sistema de gestão de coleta, contratos, serviços, KPIs e dashboards.

## Desenvolvimento local

```bash
cd backend && npm install && npm run dev   # :3200
cd frontend && npm install && npm run dev  # :5175
```

---

## Deploy para outra máquina

### Fluxo

| Onde | Comando |
|------|---------|
| **Dev** | `.\publicar.ps1 -Tag 2.0.1` |
| **Destino** | Editar `TAG` no `.env` → `docker compose up -d` |

### Dev — publicar

```powershell
Copy-Item env.nexus.example .env.nexus   # primeira vez
.\publicar.ps1 -Tag 2.0.1
```

Gera `dist\deploy\` para copiar em `C:\Sistemma`.

### Outra máquina — primeira vez

```powershell
cd C:\Sistemma
Copy-Item env.docker.example .env
notepad .env              # senhas + TAG
docker login nexus.neurai-platform.com -u admin -p "senha"
docker compose up -d
```

### Toda atualização

```powershell
# Dev
.\publicar.ps1 -Tag 2.0.2

# Destino — só muda a TAG no .env e:
docker compose up -d
```

O compose **não tem build** — sempre puxa `backend` e `frontend` do Nexus (`pull_policy: always`).

Build local na dev usa override: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build`

---

## Arquivos importantes

| Arquivo | Uso |
|---------|-----|
| `docker-compose.yml` | Destino e prod — só pull Nexus |
| `docker-compose.dev.yml` | Dev — adiciona `build:` local |
| `env.docker.example` | Copiar para `.env` na destino |
| `env.nexus.example` | Login registry → `.env.nexus` |
| `publicar.ps1` | Dev: build + push + pacote deploy |
| `subir.ps1` / `subir.sh` | Destino: pull + up |
| `corrigir-kpis.ps1` | Destino: corrige KPIs universais no banco |

**Nunca copie** `.env.docker` nem `.env.nexus` entre máquinas com senhas reais — configure uma vez em cada lugar.

### Verificar versão implantada

```powershell
Invoke-RestMethod http://localhost:3200/health
# buildSha, tag
```

### Diagnóstico de dashboards vazios

```powershell
Invoke-RestMethod http://localhost:3200/api/dashboard/diagnostico-servicos -Headers @{ Authorization = "Bearer $token" }
```

**Dica:** filtro `periodo=30d` só mostra viagens dos últimos 30 dias. Se a planilha for de meses anteriores, o dashboard ajusta o período automaticamente na tela do serviço.
