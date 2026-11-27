import { Resend } from 'resend';
import { emailTemplates, EmailTemplateName } from '../config/emailTemplates';
import { getEmailFrom, getResendApiKey } from '../config/env';
import { logger } from '../utils/logger';

let resendClient: Resend | null = null;

/** Crea el cliente de Resend la primera vez que se necesita (el constructor falla sin API key). */
const getResend = (): Resend | null => {
  const apiKey = getResendApiKey();
  if (!apiKey) return null;
  if (!resendClient) resendClient = new Resend(apiKey);
  return resendClient;
};

/**
 * Envía un correo usando una plantilla de `emailTemplates`.
 * Sin RESEND_API_KEY no envía nada: muestra el correo en consola (útil en desarrollo).
 */
export const sendEmail = async <T extends EmailTemplateName>(
  templateName: T,
  to: string,
  ...args: Parameters<(typeof emailTemplates)[T]>
) => {
  const template = emailTemplates[templateName] as (...a: string[]) => { subject: string; html: string };
  if (!template) {
    throw new Error(`Plantilla de email '${templateName}' no encontrada`);
  }
  const { subject, html } = template(...(args as string[]));

  const resend = getResend();
  if (!resend) {
    logger.warn(`Email: RESEND_API_KEY no definido; no se envía "${subject}"`); // sin la dirección: son datos personales
    return null;
  }

  const { data, error } = await resend.emails.send({ from: getEmailFrom(), to, subject, html });
  if (error) {
    throw new Error(`No se pudo enviar el email: ${error.message}`);
  }
  return data;
};
