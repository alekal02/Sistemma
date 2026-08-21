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
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || `${JWT_SECRET}-refresh`;
const JWT_REFRESH_EXPIRES_IN = (process.env.JWT_REFRESH_EXPIRY || '30d') as jwt.SignOptions['expiresIn'];
const REFRESH_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

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

export function gerarRefreshToken(payload: TokenPayload): string {
  return jwt.sign({ ...payload, typ: 'refresh' }, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
  });
}

type JwtComExp = TokenPayload & { exp?: number; typ?: string };

/** Lê Bearer do header Authorization. */
export function extrairBearer(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || !/^Bearer$/i.test(parts[0])) return null;
  return parts[1];
}

/**
 * Renova a sessão a partir do refresh token (ou do access token expirado há pouco).
 * Enquanto a TV/aba estiver ligada e renovando, a sessão não cai.
 */
export function verificarTokenRenovacao(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET) as JwtComExp;
    if (decoded?.id && decoded.typ === 'refresh') {
      return { id: decoded.id, email: decoded.email, nome: decoded.nome, role: decoded.role };
    }
  } catch {
    /* tenta access token abaixo */
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true }) as JwtComExp;
    if (!decoded?.id || decoded.typ === 'refresh') return null;
    if (decoded.exp) {
      const expiradoHa = Date.now() - decoded.exp * 1000;
      if (expiradoHa > REFRESH_GRACE_MS) return null;
    }
    return { id: decoded.id, email: decoded.email, nome: decoded.nome, role: decoded.role };
  } catch {
    return null;
  }
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
  let token: string | null = extrairBearer(req);

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
