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

### Entrar sem senha (botões Gestor e Contratos)

A tela inicial só abre direto nas áreas quando o acesso livre está ligado. Em
`development` já vem ligado; em produção exige `ACESSO_LIVRE=true` no `.env`.
Sem isso o clique em **Contratos** cai no formulário de email e senha.

```powershell
cd C:\Sistemma
.\scripts\ativar-acesso-livre.cmd            # -Desligar volta a exigir senha
```

O script recusa rodar se o `docker-compose.yml` da máquina for antigo, porque é
ele que repassa a variável ao container.

Conferir: `docker exec sistemma-backend printenv ACESSO_LIVRE` e
`Invoke-RestMethod http://localhost:3200/api/auth/acesso-local` (`habilitado: true`).

### Isolamento por contrato (sem perder dados)

Na destino os dados ficam no volume `postgres_data`, não na imagem. **Nunca** rode `docker compose down -v`.

A ordem importa: a migração roda **com a imagem nova**, ainda em banco único, e o
multi-banco só liga depois que ela termina.

```powershell
cd C:\Sistemma
.\scripts\backup-destino.cmd
.\scripts\cutover-destino.cmd -TagNova 3.1.0 -TagAnterior 3.0.0 -AcessoLivre
```

O `cutover` sobe a imagem nova em banco único, espera o `/health`, copia
`abastecimento` → `sistemma_control` + `contrato_*` (origem intacta), e só então
grava `MULTI_TENANT=true` e recria o backend. Para fazer à mão, a migração é
`docker exec sistemma-backend node dist/scripts/migrar-bancos-por-contrato.js`
(em dev: `cd backend && npm run migrar:contratos`).

Rollback: `MULTI_TENANT=false`, comente `CONTROL_DATABASE_NAME`, TAG anterior se
quiser voltar a imagem. O banco `abastecimento` continua lá.

No modo multi-banco a área do Gestor consulta os contratos em paralelo e junta os
números; o dashboard executivo pede que se escolha um contrato, em vez de somar
bancos diferentes.

Os `.cmd` são atalhos para os `.ps1`: a destino costuma bloquear script não
assinado. Equivalente manual:
`powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\<nome>.ps1`

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
| `scripts/backup-destino.*` | Destino: dump do banco antes de migrar |
| `scripts/cutover-destino.*` | Destino: imagem nova → migração → multi-banco |
| `scripts/ativar-acesso-livre.*` | Destino: liga/desliga entrada sem senha |

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
