import { RequestHandler } from 'express';
import { ZodTypeAny } from 'zod';
import { AppError } from '../utils/AppError';

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Valida (y limpia) `params`, `query` y `body` con esquemas de zod antes de llegar al controlador.
 *  - Los campos desconocidos se descartan (salvo que el esquema use `.passthrough()`).
 *  - Si algo no cumple: 400 con el primer mensaje y la lista completa en `errors`.
 *  - El controlador recibe ya los valores validados y transformados.
 */
export const validate =
  (schemas: Schemas): RequestHandler =>
  (req, _res, next) => {
    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;

      const result = schema.safeParse(req[part] ?? {});
      if (!result.success) {
        const { issues } = result.error;
        return next(
          new AppError(
            400,
            issues[0].message,
            issues.map((issue) => ({ field: issue.path.join('.') || part, message: issue.message }))
          )
        );
      }
      (req as unknown as Record<string, unknown>)[part] = result.data;
    }
    next();
  };
