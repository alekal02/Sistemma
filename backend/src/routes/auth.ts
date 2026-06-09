import { Router } from 'express';
import AuthController from '../controllers/AuthController';
import { authenticate, authorize } from '../middlewares/authMiddleware';

const router = Router();

// Rotas públicas
router.post('/register', AuthController.register.bind(AuthController));
router.post('/login', AuthController.login.bind(AuthController));

// Rotas protegidas (qualquer usuário autenticado)
router.get('/me', authenticate, AuthController.me.bind(AuthController));
router.put('/profile', authenticate, AuthController.updateProfile.bind(AuthController));

// Rota pública (autenticada) — lista básica para selects
router.get(
  '/users/simple',
  authenticate,
  AuthController.listSimple.bind(AuthController)
);

// Rotas de admin
router.get(
  '/users',
  authenticate,
  authorize('admin'),
  AuthController.listUsers.bind(AuthController)
);

router.patch(
  '/users/:id/toggle-status',
  authenticate,
  authorize('admin'),
  AuthController.toggleUserStatus.bind(AuthController)
);

export default router;
