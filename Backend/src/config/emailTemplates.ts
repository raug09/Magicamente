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
  /** HTML y texto ya preparados (listas, citas) que se insertan después de los párrafos. */
  extraHtml?: string;
  extraText?: string[];
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

  const extra = content.extraHtml ?? '';
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
            ${extra}
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
  const parts = [content.heading, '', ...content.paragraphs, ...(content.extraText ?? [])];
  if (content.action) parts.push('', `${content.action.label}: ${content.action.url}`);
  if (content.note) parts.push('', content.note);
  parts.push('', `— ${APP_NAME}`);
  return parts.join('\n');
};

const build = (content: Content) => ({ subject: content.subject, html: renderHtml(content), text: renderText(content) });

/** Un documento en el correo de rechazo: el rechazado se destaca. */
export interface DocumentLine {
  label: string;
  status: 'pendiente' | 'ok' | 'rechazado';
  note?: string;
}

const documentListHtml = (documents: DocumentLine[]): string =>
  documents
    .map((doc) => {
      if (doc.status === 'rechazado') {
        return `<div style="margin:0 0 12px;padding:14px 16px;border:2px solid #c0392b;border-radius:8px;background:#fdecea;">
          <div style="font-size:16px;font-weight:bold;color:#c0392b;">✗ ${escapeHtml(doc.label)}: revisar este documento</div>
          ${doc.note ? `<div style="margin-top:6px;font-size:14px;color:${COLORS.text};">${escapeHtml(doc.note)}</div>` : ''}
        </div>`;
      }
      const mark = doc.status === 'ok' ? '✓' : '•';
      const state = doc.status === 'ok' ? 'correcto' : 'pendiente de revisión';
      return `<div style="margin:0 0 8px;font-size:15px;color:${COLORS.muted};">${mark} ${escapeHtml(doc.label)}: ${state}</div>`;
    })
    .join('');

const documentListText = (documents: DocumentLine[]): string[] =>
  documents.map((doc) => {
    const mark = doc.status === 'rechazado' ? '[REVISAR]' : doc.status === 'ok' ? '[OK]' : '[PENDIENTE]';
    return `${mark} ${doc.label}${doc.note ? ` — ${doc.note}` : ''}`;
  });

export const emailTemplates = {
  verificationApproved: (name: string, agendaLink: string) =>
    build({
      subject: 'Tu cuenta de psicólogo ha sido aprobada',
      heading: 'Cuenta aprobada',
      paragraphs: [
        `Hola ${name}.`,
        'Revisamos tus documentos y tu cuenta ya está aprobada. Ya puedes publicar tu agenda, y los pacientes podrán reservar contigo.',
      ],
      action: { label: 'Ir a mi agenda', url: agendaLink },
    }),

  verificationRejected: (name: string, message: string, documents: DocumentLine[], profileLink: string) => {
    const extraHtml =
      `<div style="margin:0 0 20px;padding:14px 16px;border-left:4px solid ${COLORS.brand};background:#f3f6f5;font-size:15px;line-height:22px;color:${COLORS.text};white-space:pre-line;">${escapeHtml(message)}</div>` +
      `<p style="margin:0 0 12px;font-size:15px;font-weight:bold;color:${COLORS.text};">Documentos</p>` +
      documentListHtml(documents);
    return build({
      subject: 'Necesitamos revisar tu solicitud de psicólogo',
      heading: 'Necesitamos que revises algunos documentos',
      paragraphs: [`Hola ${name}.`, 'No hemos podido aprobar tu cuenta todavía. Este es el mensaje del equipo:'],
      extraHtml,
      extraText: ['', message, '', 'Documentos:', ...documentListText(documents)],
      action: { label: 'Corregir mi solicitud', url: profileLink },
      note: 'Corrige los documentos señalados desde tu perfil. No necesitas crear una cuenta nueva.',
    });
  },

  verifyEmail: (name: string, verifyLink: string) =>
    build({
      subject: `Confirma tu correo en ${APP_NAME}`,
      heading: 'Confirma tu correo',
      paragraphs: [`Hola ${name}.`, `Gracias por crear tu cuenta. Para activarla, confirma que este es tu correo.`],
      action: { label: 'Confirmar correo', url: verifyLink },
      note: 'El enlace caduca en 24 horas y solo se puede usar una vez. Si no creaste una cuenta, ignora este mensaje.',
    }),

  resetPassword: (name: string, resetLink: string) =>
    build({
      subject: 'Restablece tu contraseña',
      heading: 'Restablece tu contraseña',
      paragraphs: [`Hola ${name}.`, 'Recibimos una solicitud para cambiar la contraseña de tu cuenta.'],
      action: { label: 'Crear una contraseña nueva', url: resetLink },
      note: 'El enlace caduca en 1 hora y solo se puede usar una vez. Si no fuiste tú, ignora este mensaje: tu contraseña no cambiará.',
    }),

  confirmEmailChange: (name: string, confirmLink: string) =>
    build({
      subject: 'Confirma tu nuevo correo',
      heading: 'Confirma tu nuevo correo',
      paragraphs: [
        `Hola ${name}.`,
        'Pediste cambiar el correo de tu cuenta a esta dirección. Para completar el cambio, confirma el enlace.',
      ],
      action: { label: 'Confirmar nuevo correo', url: confirmLink },
      note: 'El enlace caduca en 24 horas y solo se puede usar una vez. Si no pediste este cambio, ignora este mensaje: tu correo no cambiará.',
    }),

  emailChangeRequested: (name: string) =>
    build({
      subject: 'Se ha pedido cambiar el correo de tu cuenta',
      heading: 'Cambio de correo solicitado',
      paragraphs: [
        `Hola ${name}.`,
        'Se ha pedido cambiar el correo de tu cuenta de Magicamente. El cambio solo se aplicará si se confirma desde la nueva dirección.',
      ],
      note: 'Si no fuiste tú, cambia tu contraseña cuanto antes para proteger tu cuenta.',
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
