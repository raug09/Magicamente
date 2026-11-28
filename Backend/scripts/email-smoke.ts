/**
 * Prueba de envío real con Resend: manda las plantillas de correo del backend a una dirección de prueba.
 *   RESEND_API_KEY   clave de Resend (obligatoria)
 *   RESEND_SMOKE_TO  destinatario (por defecto delivered@resend.dev, que descarta el correo)
 *   EMAIL_FROM       remitente; con dominio sin verificar usa onboarding@resend.dev
 * Sale con código 1 si algún envío falla.
 */
import { sendEmail } from '../src/services/emailService';

const to = process.env.RESEND_SMOKE_TO || 'delivered@resend.dev';

const cases: Array<[string, unknown[]]> = [
  ['verifyEmail', ['Prueba', 'https://example.com/verify-email?token=smoke']],
  ['resetPassword', ['Prueba', 'https://example.com/reset-password?token=smoke']],
  ['appointmentReminder', ['Prueba', 'martes, 15 de diciembre de 2026', '10:00']],
  ['appointmentCancelled', ['Prueba', 'martes, 15 de diciembre de 2026', '10:00']],
];

(async () => {
  let failures = 0;
  for (const [template, args] of cases) {
    try {
      const data = await sendEmail(template as 'verifyEmail', to, ...(args as [string, string]));
      console.log(`${template}: enviado (${data?.id})`);
    } catch (error) {
      failures++;
      console.error(`${template}: ERROR ${(error as Error).message}`);
    }
  }
  process.exit(failures > 0 ? 1 : 0);
})();
