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

A tela inicial abre direto em Gestor e Contratos. Só volta a pedir senha com
`ACESSO_LIVRE=false` no `.env`. Se o clique em **Contratos** mostrar email e
senha, a variável ficou `false` no container — rode o script abaixo.

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
\.\publicar.ps1 -Tag 3.3.1
docker compose pull
docker compose up -d --force-recreate backend frontend
```

### Atualizar para a 3.3.1 sem perder o banco

Na máquina atual, faça um backup antes de desligar ou atualizar:

```powershell
cd C:\Sistemma
.\scripts\backup-destino.cmd
docker volume ls | Select-String 'sistemma'
```

Guarde o arquivo `backups\abastecimento-*.dump` e o `.env` em local seguro. O banco
fica no volume `postgres_data`; as planilhas enviadas ficam em `uploads_data`; e o
WhatsApp usa `wuzapi_pg_data`, `wuzapi_files` e `wuzapi_dbdata`.

Na máquina nova, copie o pacote `dist\deploy` gerado pela publicação, o dump
`abastecimento-*.dump` e configure um `.env` próprio com as mesmas credenciais.
Não copie senhas do `.env` entre máquinas sem revisar.

```powershell
cd C:\Sistemma
Copy-Item env.docker.example .env
notepad .env
docker login nexus.neurai-platform.com -u admin
docker compose pull
docker compose up -d postgres minio wuzapi-db wuzapi
```

Restaure o banco antes de subir o backend:

```powershell
docker cp .\backups\abastecimento-AAAAmmdd-HHmmss.dump sistemma-postgres:/tmp/abastecimento.dump
docker exec sistemma-postgres pg_restore -U neurai -d abastecimento --clean --if-exists --no-owner /tmp/abastecimento.dump
docker compose up -d --force-recreate backend frontend
Invoke-RestMethod http://localhost:3200/health
```

Para levar também os arquivos das planilhas e a sessão do WhatsApp, faça um
arquivo de cada volume na máquina antiga e restaure nos volumes equivalentes da
máquina nova. Pare o Compose antes de copiar os volumes:

```powershell
docker compose stop
docker run --rm -v sistemma_uploads_data:/data -v ${PWD}/backups:/backup alpine tar czf /backup/uploads_data.tgz -C /data .
docker run --rm -v sistemma_minio_data:/data -v ${PWD}/backups:/backup alpine tar czf /backup/minio_data.tgz -C /data .
docker run --rm -v sistemma_wuzapi_pg_data:/data -v ${PWD}/backups:/backup alpine tar czf /backup/wuzapi_pg_data.tgz -C /data .
docker run --rm -v sistemma_wuzapi_files:/data -v ${PWD}/backups:/backup alpine tar czf /backup/wuzapi_files.tgz -C /data .
docker run --rm -v sistemma_wuzapi_dbdata:/data -v ${PWD}/backups:/backup alpine tar czf /backup/wuzapi_dbdata.tgz -C /data .
```

Na máquina nova, depois de criar os volumes com `docker compose up -d` e parar os
serviços, copie os arquivos `.tgz` para a pasta `backups` e extraia cada um no
volume de mesmo nome. O prefixo `sistemma_` pode variar; confirme com `docker volume ls`.

Para uma máquina que já possui os volumes, altere apenas `TAG=3.3.1` no `.env` e
execute `docker compose pull` seguido de `docker compose up -d --force-recreate`.
Não use `docker compose down -v`, não remova volumes e não substitua o `.env`.
Se for necessário restaurar um dump, pare apenas o backend e restaure no mesmo
volume PostgreSQL; o dump deve ser usado somente após confirmar o nome do banco e
do usuário no `.env`.

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
