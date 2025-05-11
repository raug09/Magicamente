// src/utils/emailTemplates.ts

export const emailTemplates = {
    confirmation: (name: string) => ({
      subject: "Confirmación de Registro",
      html: `<p>Hola ${name},</p><p>Tu registro ha sido exitoso.</p>`,
    }),
  
    resetPassword: (name: string, resetLink: string) => ({
      subject: "Restablecimiento de Contraseña",
      html: `<p>Hola ${name},</p><p>Puedes restablecer tu contraseña <a href="${resetLink}">aquí</a>.</p>`,
    }),
  
    appointmentReminder: (name: string, date: string, hour: string) => ({
      subject: "Recordatorio de cita",
      html: `<p>Hola ${name},</p><p>Recuerda que tienes una cita el ${date} a las ${hour}.</p>`,
    }),
  };
  