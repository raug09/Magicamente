import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Extender la interfaz de Request para incluir la propiedad "user"
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: 'paciente' | 'psicologo' | 'administrador';
  };
}

/**
 * Middleware para verificar que la solicitud tenga un token JWT válido.
 * Se espera que el token se envíe en el header "Authorization" con el formato "Bearer <token>".
 */
export const isAuthenticated = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ message: 'No se proporcionó token de autenticación' });
    return;
  }

  // Se espera el formato "Bearer token"
  const token = authHeader.split(' ')[1];
  if (!token) {
    res.status(401).json({ message: 'Token inválido o mal formado' });
    return;
  }

  try {
    // Verifica el token. Asegúrate de tener configurada la variable de entorno JWT_SECRET.
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { id: string; role: 'paciente' | 'psicologo' | 'administrador' };
    // Agregar la información decodificada a la request para uso posterior.
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token no válido' });
  }
};

/**
 * Middleware para verificar que el usuario autenticado tenga rol de "administrador".
 * Este middleware asume que `isAuthenticated` ya se ejecutó y que `req.user` está definido.
 */
export const isAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (!req.user || req.user.role !== 'administrador') {
    res.status(403).json({ message: 'Acceso denegado: se requiere rol de administrador' });
    return;
  }
  next();
};
