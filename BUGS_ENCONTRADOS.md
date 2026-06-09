# Bugs Encontrados — Auditoria Sistemma v2

## Críticos (corrigidos)

### 1. CORS aberto para qualquer origem
- **Arquivo:** `backend/src/index.ts`
- **Severidade:** CRÍTICA
- **Descrição:** `app.use(cors())` sem restrição permitia requisições de qualquer domínio.
- **Impacto:** Risco de CSRF/abuso de API autenticada via browser de terceiros.
- **Correção:** CORS configurado com `CORS_ORIGIN` (lista separada por vírgula) e bloqueio em produção.

### 2. Endpoint de PDF sem autenticação
- **Arquivo:** `backend/src/index.ts` — `POST /api/generate-pdf`
- **Severidade:** CRÍTICA
- **Descrição:** Puppeteer executava conversão HTML→PDF sem `authenticate`.
- **Impacto:** Abuso de CPU/memória do servidor (DoS) por qualquer cliente.
- **Correção:** Middleware `authenticate` adicionado; `ServicoMiniFlow.tsx` envia `Authorization: Bearer`.

### 3. JWT com fallback fixo em produção
- **Arquivo:** `backend/src/middlewares/authMiddleware.ts`
- **Severidade:** CRÍTICA
- **Descrição:** `JWT_SECRET` caía para `'abastecimento-secret-key-dev'` se ausente.
- **Impacto:** Tokens forjáveis em deploy mal configurado.
- **Correção:** `resolveJwtSecret()` lança erro se `NODE_ENV=production` sem `JWT_SECRET`.

### 4. Script de teste com JWT embutido
- **Arquivo:** `backend/test_upload_req.js`
- **Severidade:** CRÍTICA
- **Descrição:** Token JWT hardcoded no repositório.
- **Impacto:** Exposição de credencial de sessão.
- **Correção:** Arquivo removido (ver `LOG_DE_REMOCAO.md`).

### 5. Credenciais Nexus em script de deploy
- **Arquivo:** `build-and-push.ps1`, `deploy.ps1`
- **Severidade:** CRÍTICA
- **Descrição:** Usuário/senha do registry em texto plano.
- **Impacto:** Vazamento de credencial de registry Docker.
- **Correção:** **Não alterado** (fora do escopo seguro automático). Recomendado: usar variáveis de ambiente ou `docker login` interativo.

---

## Altos (corrigidos)

### 6. Chave errada no localStorage para gráficos padrão
- **Arquivo:** `frontend/src/services/graficosPadraoService.ts`
- **Severidade:** ALTA
- **Descrição:** Usava `localStorage.getItem('token')` em vez de `@abastecimento:token`.
- **Impacto:** Biblioteca de gráficos padrão falhava com 401 em todas as chamadas.
- **Correção:** Constante `TOKEN_KEY = '@abastecimento:token'`.

### 7. Rotas de API de debug em produção
- **Arquivo:** `backend/src/index.ts`
- **Severidade:** ALTA
- **Descrição:** `/api/antes` e `/api/teste-express5` expostas sem utilidade.
- **Impacto:** Superfície de ataque desnecessária e ruído operacional.
- **Correção:** Rotas removidas.

### 8. API `/api/tipo-servico` sem autenticação
- **Arquivo:** `backend/src/index.ts`
- **Severidade:** ALTA
- **Descrição:** Templates de serviço acessíveis publicamente.
- **Impacto:** Exposição de estrutura interna do sistema.
- **Correção:** `authenticate` aplicado no mount da rota.

### 9. `.env` e logs sem `.gitignore` na raiz
- **Arquivo:** raiz do monorepo
- **Severidade:** ALTA
- **Descrição:** Apenas `frontend/.gitignore` existia; `.env` do backend no disco.
- **Impacto:** Risco de commit acidental de secrets.
- **Correção:** `.gitignore` criado na raiz.

### 10. `.env.example` desatualizado
- **Arquivo:** `backend/.env.example`
- **Severidade:** ALTA
- **Descrição:** Variáveis `PORT`, `DB_*` não correspondiam ao código (`APP_PORT`, `DATABASE_*`).
- **Impacto:** Deploy incorreto por configuração errada.
- **Correção:** `.env.example` reescrito alinhado ao código.

---

## Médios (documentados — não corrigidos automaticamente)

### 11. TypeORM `synchronize: true`
- **Arquivo:** `backend/src/database/data-source.ts`
- **Severidade:** MÉDIA
- **Descrição:** Schema alterado automaticamente em runtime.
- **Impacto:** Perda de dados ou drift de schema em produção.
- **Recomendação:** Desativar em produção; usar migrations com `migrationsRun: true`.

### 12. Senha padrão do banco no código
- **Arquivo:** `backend/src/database/data-source.ts`
- **Severidade:** MÉDIA
- **Descrição:** Fallback `neurai@2025` se `DATABASE_PASSWORD` ausente.
- **Impacto:** Credencial previsível em ambientes mal configurados.

### 13. ~14 páginas React sem rota ativa
- **Arquivo:** `frontend/src/pages/*` (legado abastecimento + dashboards antigos)
- **Severidade:** MÉDIA
- **Descrição:** Código morto mantido após migração para Contrato→Serviço→Visão.
- **Impacto:** Bundle maior, manutenção confusa.
- **Recomendação:** Arquivar ou remover em sprint dedicada após validação com stakeholders.

### 14. Ausência de rate limiting
- **Arquivo:** `backend/src/index.ts`
- **Severidade:** MÉDIA
- **Descrição:** Login e upload sem limitação de taxa.
- **Impacto:** Brute force e abuso de upload.

### 15. Bundle frontend > 500 kB
- **Arquivo:** build Vite
- **Severidade:** MÉDIA
- **Descrição:** Chunk único de ~988 kB.
- **Impacto:** Tempo de carregamento inicial elevado.
- **Recomendação:** Code splitting por rota.

---

## Baixos (documentados)

### 16. `dashboardService` exportado mas não importado
- **Arquivo:** `frontend/src/services/api.ts`
- **Severidade:** BAIXA
- **Descrição:** Export morto (arquivo `dashboardService.ts` duplicado foi removido).

### 17. Token JWT via query string
- **Arquivo:** `backend/src/middlewares/authMiddleware.ts`
- **Severidade:** BAIXA
- **Descrição:** `?token=` aceito para downloads.
- **Impacto:** Token pode vazar em logs de URL.

### 18. `@types/*` e `typescript` em `dependencies` do backend
- **Arquivo:** `backend/package.json`
- **Severidade:** BAIXA
- **Descrição:** Ferramentas de build em runtime deps.
- **Impacto:** Imagem Docker ligeiramente maior.
