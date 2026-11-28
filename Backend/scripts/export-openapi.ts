/**
 * Escribe el esquema OpenAPI en `docs/openapi.json` (para el frontend o para importarlo en Postman/Insomnia).
 * Uso: npm run openapi. Un test falla si el archivo no está al día.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getOpenApiDocument } from '../src/docs/openapi';

export const OPENAPI_FILE = resolve(__dirname, '../../docs/openapi.json');
export const serializeOpenApi = () => `${JSON.stringify(getOpenApiDocument(), null, 2)}\n`;

if (require.main === module) {
  writeFileSync(OPENAPI_FILE, serializeOpenApi());
  console.log(`Escrito ${OPENAPI_FILE}`);
}
