import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { AppError } from '../utils/AppError';

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({ message: 'Ruta no encontrada' });
};

// Express reconoce los middlewares de error por tener 4 parámetros.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler = (err: unknown, req: Request, res: Response, next: NextFunction): void => {
  if (err instanceof AppError) {
    res.status(err.status).json({ message: err.message });
    return;
  }
  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({ message: 'Identificador o valor no válido' });
    return;
  }
  if (err instanceof mongoose.Error.ValidationError) {
    res.status(400).json({ message: 'Datos no válidos', errors: Object.keys(err.errors) });
    return;
  }
  if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
    res.status(409).json({ message: 'El recurso ya existe' });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ message: 'JSON mal formado' });
    return;
  }

  console.error('Error no controlado:', err);
  res.status(500).json({ message: 'Error interno del servidor' });
};
