import { Router } from 'express';
import { ContractController } from '../controllers/ContractController';
import { authenticate, authorize } from '../middlewares/authMiddleware';
import { tenantGuard } from '../middlewares/tenantGuard';

const router = Router();
const controller = new ContractController();
const adminOnly = authorize('admin');

// ⚠️ Rotas fixas DEVEM vir antes de rotas com parâmetro :id

// Listar todos os contratos
router.get('/', authenticate, tenantGuard, (req, res) => controller.listar(req, res));

// ⭐ Saúde consolidada (NÃO mover para depois de /:id)
router.get('/saude', authenticate, tenantGuard, (req, res) => controller.saudeLista(req, res));

// Criar novo contrato
router.post('/', authenticate, (req, res) => controller.criar(req, res));

// Buscar um contrato específico
router.get('/:id', authenticate, tenantGuard, (req, res) => controller.buscarUm(req, res));

// Atualizar contrato
router.put('/:id', authenticate, (req, res) => controller.atualizar(req, res));

// Excluir contrato — apenas admin (ação destrutiva)
router.delete('/:id', authenticate, adminOnly, (req, res) => controller.excluir(req, res));

// KPIs do contrato
router.get('/:id/kpis', authenticate, (req, res) => controller.listarKpis(req, res));
router.put('/:id/kpis', authenticate, (req, res) => controller.salvarKpis(req, res));

// ⭐ Saúde de um contrato específico
router.get('/:id/saude', authenticate, (req, res) => controller.saudeDetalhe(req, res));

// Configuração do resumo executivo do contrato
router.get('/:id/config-resumo', authenticate, (req, res) => controller.getConfigResumo(req, res));
router.put('/:id/config-resumo', authenticate, (req, res) => controller.salvarConfigResumo(req, res));

export default router;
