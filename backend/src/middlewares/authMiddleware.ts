import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '../entities/User';

function resolveJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET é obrigatório em produção');
  }
  return 'abastecimento-secret-key-dev';
}

const JWT_SECRET = resolveJwtSecret();
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '8h') as jwt.SignOptions['expiresIn'];

export interface TokenPayload {
  id: string;
  email: string;
  nome: string;
  role: UserRole;
}

// Extende a tipagem do Request para incluir o usuário
declare global {
  namespace Express {
    interface Request {
      usuario?: TokenPayload;
    }
  }
}

/**
 * Gera um token JWT para o usuário
 */
export function gerarToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Middleware que verifica se o usuário está autenticado
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Suporta token via header Authorization ou query string ?token=
  let token: string | null = null;

  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2) {
      const [scheme, t] = parts;
      if (/^Bearer$/i.test(scheme)) {
        token = t;
      }
    }
  }

  // Fallback: token na query string (para download direto via window.open)
  if (!token && req.query.token) {
    token = req.query.token as string;
  }

  if (!token) {
    res.status(401).json({ error: 'Token de autenticação não fornecido' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    req.usuario = decoded;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expirado' });
      return;
    }
    res.status(401).json({ error: 'Token inválido' });
  }
}

/**
 * Middleware que verifica se o usuário tem uma role específica
 */
export function authorize(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.usuario) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    if (!roles.includes(req.usuario.role)) {
      res.status(403).json({
        error: 'Acesso negado: você não tem permissão para esta ação',
      });
      return;
    }

    next();
  };
}

export { JWT_SECRET };
