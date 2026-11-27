/**
 * Acceso centralizado a variables de entorno.
 * Se leen en el momento de usarlas (no al importar) para que los tests puedan fijarlas.
 */

/** Variables sin las que el servidor no debe arrancar. */
const REQUIRED_VARS = ['JWT_SECRET'] as const;

export const assertRequiredEnv = (): void => {
  const missing = REQUIRED_VARS.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Faltan variables de entorno obligatorias: ${missing.join(', ')}. ` + 'Copia Backend/.env.example a Backend/.env y rellénalas.'
    );
  }
};

export const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error('JWT_SECRET no está definido');
  }
  return secret;
};

export const getMongoUri = (): string => process.env.MONGO_URI || 'mongodb://localhost:27017/magicamente';

export const getPort = (): number => Number(process.env.PORT) || 3000;

/**
 * Documentación de la API en /api/docs. `API_DOCS=true` o `false` la fuerza;
 * sin definir, está activada salvo con `NODE_ENV=production`.
 */
export const getApiDocsEnabled = (): boolean => {
  const value = process.env.API_DOCS?.trim().toLowerCase();
  if (value === 'true') return true;
  if (value === 'false') return false;
  return process.env.NODE_ENV !== 'production';
};

/** Zona horaria con la que se muestran fechas en los correos. Las horas se guardan en UTC. */
export const getAppTimezone = (): string => process.env.APP_TIMEZONE || 'UTC';

export const getResendApiKey = (): string | undefined => process.env.RESEND_API_KEY || undefined;

export const getEmailFrom = (): string => process.env.EMAIL_FROM || 'Soporte <support@magicamente.online>';

/** URL base del frontend, usada para construir el enlace de recuperación de contraseña. */
export const getFrontendUrl = (): string => (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');

/**
 * Orígenes web autorizados por CORS. Por defecto, solo el frontend (`FRONTEND_URL`).
 * `CORS_ORIGIN` admite una lista separada por comas, o `*` para abrirlo a cualquiera.
 */
export const getCorsOrigins = (): string[] | '*' => {
  const configured = process.env.CORS_ORIGIN?.trim();
  if (configured === '*') return '*';
  if (configured)
    return configured
      .split(',')
      .map((origin) => origin.trim().replace(/\/+$/, ''))
      .filter(Boolean);
  try {
    return [new URL(getFrontendUrl()).origin];
  } catch {
    return [];
  }
};

/**
 * Cuántos proxies hay delante del servidor (para que el límite de intentos use la IP real del cliente).
 * Sin `TRUST_PROXY` no se confía en ninguna cabecera `X-Forwarded-For`.
 */
export const getTrustProxy = (): number | boolean | undefined => {
  const value = process.env.TRUST_PROXY?.trim();
  if (!value) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return /^\d+$/.test(value) ? Number(value) : undefined;
};

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/**
 * El id de cuenta es el trozo de 32 caracteres de `https://<ID>.r2.cloudflarestorage.com`. Si alguien pega la
 * dirección completa (o con comillas o barras) se extrae el id, para no fallar con un error de TLS poco claro.
 */
export const normalizeR2AccountId = (value: string): string =>
  value
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/^https?:\/\//i, '')
    .split(/[./:]/)[0]
    .trim();

/** Configuración de Cloudflare R2 para los documentos. Devuelve null si falta alguna variable. */
export const getR2Config = (): R2Config | null => {
  const rawAccountId = process.env.R2_ACCOUNT_ID?.trim();
  const accountId = rawAccountId ? normalizeR2AccountId(rawAccountId) : undefined;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket };
};
