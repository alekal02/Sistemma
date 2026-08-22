import { Request, Response, NextFunction } from 'express';
import { isMultiTenant } from '../database/data-source';
import { ehGestorGlobal } from './authMiddleware';

/** Recusa acesso se o contrato da URL não for o do usuário (gestor no hub passa). */
export function tenantGuard(req: Request, res: Response, next: NextFunction): void {
  if (!isMultiTenant()) {
    next();
    return;
  }

  const usuario = req.usuario;
  if (!usuario) {
    next();
    return;
  }

  if (ehGestorGlobal(usuario) && !usuario.contractId) {
    next();
    return;
  }

  const urlId = String(req.params.contractId || req.params.id || '');
  if (urlId && usuario.contractId && urlId !== usuario.contractId) {
    res.status(403).json({ error: 'Sem acesso a este contrato' });
    return;
  }

  next();
}
