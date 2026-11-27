const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export const emailTemplates = {
  confirmation: (name: string) => ({
    subject: 'Confirmación de Registro',
    html: `<p>Hola ${escapeHtml(name)},</p><p>Tu registro ha sido exitoso.</p>`,
  }),

  resetPassword: (name: string, resetLink: string) => ({
    subject: 'Restablecimiento de Contraseña',
    html:
      `<p>Hola ${escapeHtml(name)},</p>` +
      `<p>Recibimos una solicitud para restablecer tu contraseña. Puedes hacerlo <a href="${escapeHtml(resetLink)}">aquí</a>. ` +
      'El enlace caduca en 1 hora y solo se puede usar una vez.</p>' +
      '<p>Si no fuiste tú, ignora este correo: tu contraseña no cambiará.</p>',
  }),

  appointmentCancelled: (name: string, date: string, hour: string) => ({
    subject: 'Cita cancelada',
    html:
      `<p>Hola ${escapeHtml(name)},</p>` +
      `<p>Tu cita del ${escapeHtml(date)} a las ${escapeHtml(hour)} ha sido cancelada porque la otra persona eliminó su cuenta.</p>` +
      '<p>Puedes reservar otra cita cuando quieras.</p>',
  }),

  appointmentReminder: (name: string, date: string, hour: string) => ({
    subject: 'Recordatorio de cita',
    html: `<p>Hola ${escapeHtml(name)},</p><p>Recuerda que tienes una cita el ${escapeHtml(date)} a las ${escapeHtml(hour)}.</p>`,
  }),
};

export type EmailTemplateName = keyof typeof emailTemplates;
