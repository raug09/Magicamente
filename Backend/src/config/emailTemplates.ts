import { getFrontendUrl } from './env';

/**
 * Plantillas de correo. Cada una devuelve asunto, HTML y texto plano (los clientes que no muestran HTML
 * y los filtros antispam prefieren tener las dos versiones).
 * El HTML usa tablas y estilos en línea: es la forma que mejor soportan los clientes de correo.
 */

const COLORS = {
  brand: '#2f6f5e',
  text: '#1f2d2a',
  muted: '#64736f',
  background: '#f3f6f5',
  card: '#ffffff',
};

const APP_NAME = 'Magicamente';

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

interface Content {
  subject: string;
  /** Título grande dentro de la tarjeta. */
  heading: string;
  /** Párrafos del cuerpo (texto plano; se escapan al renderizar). */
  paragraphs: string[];
  /** Botón de acción opcional. */
  action?: { label: string; url: string };
  /** Nota final en letra pequeña. */
  note?: string;
}

/** Diseño común: tarjeta centrada, cabecera con el nombre de la aplicación y pie discreto. */
const renderHtml = (content: Content): string => {
  const paragraphs = content.paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:${COLORS.text};">${escapeHtml(p)}</p>`)
    .join('');

  const button = content.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
         <tr><td style="border-radius:8px;background:${COLORS.brand};">
           <a href="${escapeHtml(content.action.url)}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(content.action.label)}</a>
         </td></tr>
       </table>
       <p style="margin:0 0 16px;font-size:13px;line-height:20px;color:${COLORS.muted};">
         Si el botón no funciona, copia este enlace en tu navegador:<br>
         <a href="${escapeHtml(content.action.url)}" style="color:${COLORS.brand};word-break:break-all;">${escapeHtml(content.action.url)}</a>
       </p>`
    : '';

  const note = content.note
    ? `<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e6ecea;font-size:13px;line-height:20px;color:${COLORS.muted};">${escapeHtml(content.note)}</p>`
    : '';

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(content.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:${COLORS.background};font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.background};padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
          <tr><td style="padding:0 0 16px;font-size:20px;font-weight:bold;color:${COLORS.brand};">${APP_NAME}</td></tr>
          <tr><td style="background:${COLORS.card};border-radius:12px;padding:32px 28px;">
            <h1 style="margin:0 0 20px;font-size:22px;line-height:28px;color:${COLORS.text};">${escapeHtml(content.heading)}</h1>
            ${paragraphs}
            ${button}
            ${note}
          </td></tr>
          <tr><td style="padding:20px 8px 0;font-size:12px;line-height:18px;color:${COLORS.muted};text-align:center;">
            Recibes este correo porque tienes una cuenta en ${APP_NAME}.<br>
            Por favor, no respondas a este mensaje.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
};

/** Versión de texto plano del mismo contenido. */
const renderText = (content: Content): string => {
  const parts = [content.heading, '', ...content.paragraphs];
  if (content.action) parts.push('', `${content.action.label}: ${content.action.url}`);
  if (content.note) parts.push('', content.note);
  parts.push('', `— ${APP_NAME}`);
  return parts.join('\n');
};

const build = (content: Content) => ({ subject: content.subject, html: renderHtml(content), text: renderText(content) });

export const emailTemplates = {
  verifyEmail: (name: string, verifyLink: string) =>
    build({
      subject: `Confirma tu correo en ${APP_NAME}`,
      heading: 'Confirma tu correo',
      paragraphs: [
        `Hola ${name}.`,
        `Gracias por crear tu cuenta. Para activarla, confirma que este es tu correo.`,
      ],
      action: { label: 'Confirmar correo', url: verifyLink },
      note: 'El enlace caduca en 24 horas y solo se puede usar una vez. Si no creaste una cuenta, ignora este mensaje.',
    }),

  resetPassword: (name: string, resetLink: string) =>
    build({
      subject: 'Restablece tu contraseña',
      heading: 'Restablece tu contraseña',
      paragraphs: [
        `Hola ${name}.`,
        'Recibimos una solicitud para cambiar la contraseña de tu cuenta.',
      ],
      action: { label: 'Crear una contraseña nueva', url: resetLink },
      note: 'El enlace caduca en 1 hora y solo se puede usar una vez. Si no fuiste tú, ignora este mensaje: tu contraseña no cambiará.',
    }),

  appointmentReminder: (name: string, date: string, hour: string) =>
    build({
      subject: 'Recordatorio de tu cita',
      heading: 'Tienes una cita pronto',
      paragraphs: [`Hola ${name}.`, `Te recordamos tu cita del ${date} a las ${hour}.`],
      action: { label: 'Ver mis citas', url: `${getFrontendUrl()}/citas` },
      note: 'Si ya no puedes asistir, cancélala desde la aplicación con antelación para liberar el horario.',
    }),

  appointmentCancelled: (name: string, date: string, hour: string) =>
    build({
      subject: 'Tu cita ha sido cancelada',
      heading: 'Cita cancelada',
      paragraphs: [
        `Hola ${name}.`,
        `Tu cita del ${date} a las ${hour} ha sido cancelada porque la otra persona eliminó su cuenta.`,
        'Puedes reservar otra cita cuando quieras.',
      ],
      action: { label: 'Buscar psicólogos', url: `${getFrontendUrl()}/psicologos` },
    }),
};

export type EmailTemplateName = keyof typeof emailTemplates;
