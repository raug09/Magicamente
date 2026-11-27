import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/env';

export const ROLES = ['paciente', 'psicologo', 'administrador'] as const;
export type Role = (typeof ROLES)[number];

export interface AuthUser {
  id: string;
  role: Role;
}

// Añade `req.user` al tipo Request de Express.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Mantengo el nombre anterior por compatibilidad. */
export type AuthenticatedRequest = Request;

/**
 * Verifica el JWT enviado en "Authorization: Bearer <token>" y deja el usuario en `req.user`.
 */
export const isAuthenticated = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ message: 'No se proporcionó token de autenticación' });
    return;
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ message: 'Token inválido o mal formado' });
    return;
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as AuthUser;
    req.user = { id: String(decoded.id), role: decoded.role };
    next();
  } catch {
    res.status(401).json({ message: 'Token no válido' });
  }
};

/** Permite el paso solo a los roles indicados. Requiere `isAuthenticated` antes. */
export const requireRole =
  (...roles: Role[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ message: `Acceso denegado: se requiere rol ${roles.join(' o ')}` });
      return;
    }
    next();
  };

export const isAdmin = requireRole('administrador');

/** Permite el paso si `req.params[param]` es el propio usuario o si es administrador. */
export const isSelfOrAdmin =
  (param = 'id') =>
  (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user || (user.role !== 'administrador' && user.id !== req.params[param])) {
      res.status(403).json({ message: 'Acceso denegado: solo puedes gestionar tu propia cuenta' });
      return;
    }
    next();
  };
