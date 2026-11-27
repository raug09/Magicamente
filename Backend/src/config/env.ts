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
      `Faltan variables de entorno obligatorias: ${missing.join(', ')}. ` +
        'Copia Backend/.env.example a Backend/.env y rellénalas.'
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

export const getMongoUri = (): string =>
  process.env.MONGO_URI || 'mongodb://localhost:27017/magicamente';

export const getPort = (): number => Number(process.env.PORT) || 3000;

/** Zona horaria con la que se muestran fechas en los correos. Las horas se guardan en UTC. */
export const getAppTimezone = (): string => process.env.APP_TIMEZONE || 'UTC';

export const getResendApiKey = (): string | undefined => process.env.RESEND_API_KEY || undefined;

export const getEmailFrom = (): string =>
  process.env.EMAIL_FROM || 'Soporte <support@magicamente.online>';
