import { Request, Response, NextFunction, RequestHandler } from 'express';

/** Envuelve un handler async para que sus errores lleguen al middleware de errores (Express 4). */
export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};
