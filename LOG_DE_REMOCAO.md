# Log de Remoção — Auditoria Sistemma v2

## 2026-06-04

| Arquivo removido | Motivo |
|------------------|--------|
| `backend/src/routes/qualidade.ts` | Rota órfã — não importada em `index.ts`; lógica duplicada inline |
| `backend/src/routes/qualidadeApp.ts` | Rota órfã — não importada em `index.ts` |
| `backend/test_upload_req.js` | Script ad-hoc com JWT hardcoded; sem referência no projeto |
| `backend/create_test.js` | Gerador de `test_upload.xlsx` só usado pelo script removido |
| `backend/out.log` | Artefato de log de runtime |
| `backend/dist/server.log` | Artefato de log de runtime |
| `frontend/vite_output.log` | Artefato de log de dev |
| `frontend/frontend_server.log` | Artefato de log de dev |
| `frontend/build_output.log` | Artefato de log de build |
| `frontend/src/services/dashboardService.ts` | Serviço duplicado; zero importadores no código |
| `frontend/src/styles/DadosColeta.css` | CSS órfão — nenhum import em `.tsx`/`.ts` |
| `frontend/src/assets/react.svg` | Asset template Vite não referenciado |
| `frontend/src/assets/vite.svg` | Asset template Vite não referenciado |

## Não removidos (confirmado órfão, mas mantidos por decisão de auditoria)

| Arquivo / grupo | Motivo da retenção |
|-----------------|-------------------|
| `frontend/src/pages/Dashboard*.tsx`, `ServicoDashboard.tsx`, etc. (~14 páginas) | Módulo legado; remoção exige validação de negócio |
| `backend/src/test-express.ts` | Utilitário de dev Express 5; não referenciado mas pode ser útil |
| `frontend/src/components/WhatsAppModal.tsx` e dependentes | Cadeia órfã ligada a feature desativada |
| Dependências `jspdf-autotable`, `xlsx` no frontend | Usadas apenas por `Relatorio.tsx` (página órfã) |
