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
| **Dev** | `.\publicar.ps1 -Tag 4.1.0` |
| **Destino** | Editar `TAG` no `.env` → `docker compose up -d` |

### Dev — publicar

```powershell
Copy-Item env.nexus.example .env.nexus   # primeira vez
.\publicar.ps1 -Tag 4.0.15
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

### Isolamento por contrato (sem perder dados)

Na destino os dados ficam no volume `postgres_data`, não na imagem. **Nunca** rode `docker compose down -v`.

A ordem importa: a migração roda **com a imagem nova**, ainda em banco único, e o
multi-banco só liga depois que ela termina.

```powershell
cd C:\Sistemma
.\scripts\backup-destino.cmd
.\scripts\cutover-destino.cmd -TagNova 3.1.0 -TagAnterior 3.0.0
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
# Dev — publica a imagem no Nexus e gera dist\deploy
.\publicar.ps1 -Tag 4.0.15

# Destino — backup antes. Recria WuzAPI, backend e frontend. Não apaga volume.
cd C:\Sistemma
.\scripts\atualizar-destino.cmd
```

### Atualizar para a 4.0.15 sem perder dados

Na máquina atual, faça o backup antes de atualizar. O script não apaga volume, imagem nem banco:

```powershell
cd C:\Sistemma
.\scripts\backup-destino.cmd
```

Ele guarda o dump de cada banco do PostgreSQL do Sistemma, o dump do PostgreSQL da WuzAPI, a cópia do `.env` e um arquivo somente leitura de `minio_data`, `uploads_data`, `wuzapi_pg_data`, `wuzapi_files` e `wuzapi_dbdata`.

Na máquina nova, copie o pacote `dist\deploy`, os arquivos de `backups` e configure um `.env` próprio com as mesmas credenciais.
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

O `backup-destino.cmd` já gera os `.tgz` de MinIO, uploads e sessão da WuzAPI.
Na máquina nova, depois de criar os volumes com `docker compose up -d` e parar os
serviços, copie esses arquivos para a pasta `backups` e extraia cada um no
volume de mesmo papel. O prefixo `sistemma_` pode variar; confirme com `docker volume ls`.
Pare o serviço antes de extrair e não use `docker compose down -v`.

Para uma máquina que já possui os volumes, altere apenas `TAG=4.0.15` no `.env` e
execute `docker compose pull backend frontend` seguido de `docker compose up -d --force-recreate backend frontend`.
Não use `docker compose down -v`, não remova volumes e não substitua o `.env`.
Se for necessário restaurar um dump, pare apenas o backend e restaure no mesmo
volume PostgreSQL; o dump deve ser usado somente após confirmar o nome do banco e
do usuário no `.env`.

O compose **não tem build** — sempre puxa `backend` e `frontend` do Nexus (`pull_policy: always`).

Build local na dev usa override: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build`

Imagem local no formato da produção, sem enviar ao Nexus: `.\build-and-push.ps1 -Tag 4.0.15 -Load`

### O que entra na 4.1.0

- WhatsApp: o chatbot só lê os grupos marcados no gestor. Conversa privada e grupo não escolhido não são respondidos.
- No grupo marcado, só entram planilha e pedido de relatório (menu e atalhos). Conversa solta, foto, GPS e manutenção não entram na fila do PDF.
- Planilha de produção (modelo Unaí): o primeiro upload cria só os serviços que estão na aba CONSOLIDADO (Capina, Poda, Aterro, Coleta Seletiva e os demais reconhecidos), cada um com os KPIs do próprio tipo. Aterro e Coleta Seletiva não caem mais no tipo genérico.

### O que entra na 4.0.18

- WhatsApp: o PDF de evolução por ciclo volta ao gráfico de linhas do relatório gerencial (curva suave, ponto em cada dia, faixas ótimo/ruim/péssimo/excedido). A opção *3* e o atalho *evolucao por ciclo* usam o ciclo completo.

### O que entra na 4.0.17

- WhatsApp: planilha grande (acima de ~48 MB) não é mais recusada. O arquivo vai para disco em pedaços, sem segurar o JSON inteiro na memória.
- Se o servidor cair no meio, retoma uma vez. Na segunda queda avisa o grupo e não entra em ciclo no próximo pull.
- Relatório e planilha não rodam juntos, e o Chrome do PDF fecha ao terminar.

### O que entra na 4.0.16

- WhatsApp: a planilha grande (medição `.xls` de vários MB) não é mais lida inteira só para descobrir o tipo. O grupo recebe "Recebi a planilha" na hora; a importação segue em seguida.

### O que entra na 4.0.15

- WhatsApp na máquina destino: planilha e comando `relatorio` voltam a ser processados. Com a WuzAPI na rede Docker, o backend ignora `WUZAPI_WEBHOOK_URL` antiga (`host.docker.internal`) e regrava o webhook da sessão em `http://sistemma-backend:3200/api/wuzapi/webhook`.
- A atualização recria o container da WuzAPI para o webhook global acompanhar. Os volumes do Postgres, do MinIO e da sessão do WhatsApp não são removidos.

### O que entra na 4.0.14

- WhatsApp volta a receber mensagem e planilha: o webhook global aponta para `sistemma-backend` dentro do Docker, e o backend regrava essa URL na sessão já conectada.

### O que entra na 4.0.13

- Apagar o dia não dispara mais o aquecimento do dashboard (isso derrubava o Docker).
- WhatsApp: *relatorio* agora é *1* diário, *2* ciclo, *3* evolução da semana, *4* saúde. *evolucao* gera a semana na hora; *evolucao 15*, *evolucao ciclo* e *evolucao anterior* mudam a janela.
- O PDF de evolução não baixa mais gráfico da internet.
- O webhook global da WuzAPI deixa de ir para `host.docker.internal` (a mensagem chegava duas vezes).

### O que entra na 4.0.12

- Dia de capina, varrição, poda e pintura: em **Ver registros**, o botão **Apagar registros do dia** remove só aquela data (ciclo aberto) para reenviar a planilha corrigida.

### O que entra na 4.0.11

- Chatbot: ledger `whatsapp_mensagem_processamento` preparado por script, sem aplicação automática.
- Webhook da WuzAPI: chave HMAC alinhada e bloqueio desligado (`WUZAPI_WEBHOOK_ENFORCE=false`).
- Backup de destino passa a incluir PostgreSQL, MinIO, uploads e a sessão da WuzAPI.

### O que entra na 4.0.8

- WhatsApp: `relatorio` volta a ter *3* Evolução diária (gráficos Ótimo/Ruim/Péssimo/Excedido). Atalhos: `evolucao`, `graficos`.
- Inclui tudo da 4.0.7 (login e-mail/senha, agente de conferência, retrabalho de coleta, saúde com rotas).

### O que entra na 4.0.7

- Login local volta a pedir email e senha (saiu a API `/auth/acesso-local`).
- Agente de conferência no upload: conta rotas vs template, aponta retrabalho da sala técnica e cruza com o que já está no sistema (planilha de ontem + hoje).
- Coleta: retrabalho com o mesmo KM/peso e motorista grafado diferente **não apaga mais 1 rota** (1184 na planilha deixava de virar 1183 no chatbot).
- Relatório de saúde: mostra rotas e viagens; se não houver erro, deixa isso explícito e lista retrabalho.

### O que entra na 4.0.6

- Hub do contrato: os cards aparecem na hora; o resumo de cada serviço não varre mais `coleta_dados` em paralelo (isso travava a máquina destino).

### O que entra na 4.0.5

- Planilha de produção (CONSOLIDADO, unificado e roçada): no reenvio, linhas que já estão no sistema **não sobem de novo** (mesmo critério da coleta). Só entram registros novos.
- Relatório de saúde: viagens que **não entram no dashboard** ficam no **topo**, em evidência.

### O que entra na 4.0.4

- WhatsApp: `relatorio` abre um menu curto — *1* operacional (lista de serviços) ou *2* saúde dos dados (PDF da coleta). Atalho: `saude`.

### O que entra na 4.0.3

- Cards de tipo de serviço (Roçada Manual, Varrição, etc.) passam a ter **Excluir** também nos tipos padrão.
- A exclusão remove o serviço, planilhas, `coleta_dados`, totais do dia e mapeamento WhatsApp. O tipo **não é recriado** ao reabrir o contrato.
- Configurar → **Voltar ao contrato** volta para o hub do contrato (a tela branca vinha de ir para o dashboard do serviço).
- Error boundary no layout: se uma página quebrar, mostra o erro em vez de tela branca.

### O que entra na 4.0.2

- WhatsApp: `relatorio` lista os serviços com dado; depois você escolhe **diário** ou **ciclo completo** daquele serviço.
- Na etapa do serviço, envie `16/09` para o diário de outra data, ou `voltar` para a lista.

### O que entra na 4.0.1

- WhatsApp: `relatorio` varre o contrato e envia o PDF do tipo certo (coleta, roçada, varrição, capina, poda, remoção, feiras) para cada serviço com dado.
- `dia 16/09` e `ciclo` também percorrem todos os tipos com operação, não só o serviço mapeado no grupo.
- Atalhos: `relatorio rocada`, `varricao`, `poda`, `ciclo rocada`.

### O que entra na 4.0.0

- Planilha padrão de produção (XLSM/XLSX com Power Query, aba **CONSOLIDADO**): um serviço por aba, Relatórios do dia e do ciclo; coleta continua PLACA/PESO.
- WhatsApp importa a planilha todo dia e **não envia PDF sozinho** — peça `dia 16/09`.
- MinIO: `contratos/{contrato}/ciclo-{inicio}_{fim}/consolidado.xlsm` + snapshot em `diario/`.
- Hub do contrato com abas Operação, Relatórios e Configuração.
- No startup o banco desliga `responderPdf` nos grupos já mapeados (schema TypeORM continua sincronizando).

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
