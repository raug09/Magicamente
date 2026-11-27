import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Añade `.openapi(...)` a los esquemas de zod (descripciones y ejemplos para la documentación).
// Se importa antes de definir cualquier esquema.
extendZodWithOpenApi(z);

export { z };
