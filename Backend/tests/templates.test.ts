import { describe, expect, it } from 'vitest';
import { emailTemplates } from '../src/config/emailTemplates';

describe('plantillas de correo', () => {
  const cases = {
    verifyEmail: () => emailTemplates.verifyEmail('Ana', 'https://app.example.com/verify-email?token=abc'),
    resetPassword: () => emailTemplates.resetPassword('Ana', 'https://app.example.com/reset-password?token=abc'),
    appointmentReminder: () => emailTemplates.appointmentReminder('Ana', 'martes, 15 de diciembre de 2026', '10:00'),
    appointmentCancelled: () => emailTemplates.appointmentCancelled('Ana', 'martes, 15 de diciembre de 2026', '10:00'),
  };

  for (const [name, render] of Object.entries(cases)) {
    it(`${name}: tiene asunto, HTML y texto plano, con el enlace visible como respaldo`, () => {
      const mail = render();
      expect(mail.subject.length).toBeGreaterThan(5);
      expect(mail.html).toContain('<!doctype html>');
      expect(mail.text).toContain('— Magicamente');
      expect(mail.text).not.toContain('<');
    });
  }

  it('los enlaces de acción aparecen en el botón, en el texto y en el respaldo', () => {
    const mail = emailTemplates.verifyEmail('Ana', 'https://app.example.com/verify-email?token=abc');
    expect(mail.html.match(/https:\/\/app\.example\.com\/verify-email\?token=abc/g)?.length).toBeGreaterThanOrEqual(2);
    expect(mail.text).toContain('https://app.example.com/verify-email?token=abc');
  });

  it('escapa el nombre en el HTML para que no se pueda inyectar código', () => {
    const mail = emailTemplates.verifyEmail('<script>alert(1)</script>', 'https://app.example.com/x');
    expect(mail.html).not.toContain('<script>alert(1)</script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.text).toContain('<script>'); // en texto plano no hay HTML que ejecutar
  });

  it('el aviso de caducidad de los enlaces de verificación y recuperación se incluye', () => {
    expect(emailTemplates.verifyEmail('A', 'https://x.example').text).toMatch(/24 horas/);
    expect(emailTemplates.resetPassword('A', 'https://x.example').text).toMatch(/1 hora/);
  });
});
