import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/env';
import User from '../models/User';
import Session from '../models/Session';

export const ROLES = ['paciente', 'psicologo', 'administrador'] as const;
export type Role = (typeof ROLES)[number];

export interface AuthUser {
  id: string;
  role: Role;
  /** Identificador de la sesión en la que se hizo la petición (para cerrarla). */
  jti?: string;
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
 *
 * Además del token se consulta la base de datos en cada petición, así que:
 *  - un usuario borrado o desactivado pierde el acceso al instante;
 *  - un cambio de rol se aplica al instante (se usa el rol de la BD, no el del token);
 *  - los tokens emitidos antes de cambiar la contraseña dejan de valer.
 */
export const isAuthenticated = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
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

    let decoded: jwt.JwtPayload;
    try {
      const payload = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
      if (typeof payload === 'string') throw new Error('payload inesperado');
      decoded = payload;
    } catch {
      res.status(401).json({ message: 'Token no válido' });
      return;
    }

    // La sesión debe existir: un logout, un cambio de contraseña o un borrado la eliminan.
    const jti = typeof decoded.jti === 'string' ? decoded.jti : undefined;
    const session = jti ? await Session.exists({ jti, userId: decoded.id }) : null;
    if (!session) {
      res.status(401).json({ message: 'La sesión no es válida: vuelve a iniciar sesión' });
      return;
    }

    const user = await User.findById(decoded.id).select('role isActive +passwordChangedAt');
    if (!user || user.isActive === false) {
      res.status(401).json({ message: 'La cuenta no existe o está desactivada' });
      return;
    }

    // `iat` está en segundos: se compara con la contraseña cambiada, también en segundos.
    const changedAtSeconds = user.passwordChangedAt ? Math.floor(user.passwordChangedAt.getTime() / 1000) : 0;
    if (typeof decoded.iat !== 'number' || decoded.iat < changedAtSeconds) {
      res.status(401).json({ message: 'La sesión ha caducado: vuelve a iniciar sesión' });
      return;
    }

    req.user = { id: String(user._id), role: user.role, jti };
    next();
  } catch (error) {
    next(error);
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
