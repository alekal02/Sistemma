import { Router } from 'express';
import { KpiUniversalController } from '../controllers/KpiUniversalController';

const router = Router();
const controller = new KpiUniversalController();

// ═══ Rotas fixas (SEM parâmetro :id) — devem vir ANTES de /:id ═══

// GET /api/kpis-universais
router.get('/', (req, res) => controller.listar(req, res));

// GET /api/kpis-universais/tipos
router.get('/tipos', (req, res) => controller.listarTiposComKpis(req, res));

// POST /api/kpis-universais/ativar-multiplos
router.post('/ativar-multiplos', (req, res) => controller.ativarMultiplos(req, res));

// POST /api/kpis-universais/importar-de-servico
router.post('/importar-de-servico', (req, res) => controller.importarDeServico(req, res));

// POST /api/kpis-universais/importar-todos-servicos
router.post('/importar-todos-servicos', (req, res) => controller.importarTodosServicos(req, res));

// GET /api/kpis-universais/listar-kpis-servicos
router.get('/listar-kpis-servicos', (req, res) => controller.listarKpisServicos(req, res));

// GET /api/kpis-universais/verificar-servico/:servicoId
router.get('/verificar-servico/:servicoId', (req, res) => controller.verificarServico(req, res));

// ═══ Rotas com parâmetro :id — devem vir DEPOIS das fixas ═══

// GET /api/kpis-universais/:id
router.get('/:id', (req, res) => controller.buscarUm(req, res));

// POST /api/kpis-universais
router.post('/', (req, res) => controller.criar(req, res));

// PUT /api/kpis-universais/:id
router.put('/:id', (req, res) => controller.atualizar(req, res));

// DELETE /api/kpis-universais/:id
router.delete('/:id', (req, res) => controller.excluir(req, res));

// POST /api/kpis-universais/duplicar/:id
router.post('/duplicar/:id', (req, res) => controller.duplicar(req, res));

// POST /api/kpis-universais/:id/ativar/:servicoId
router.post('/:id/ativar/:servicoId', (req, res) => controller.ativarEmServico(req, res));

export default router;
