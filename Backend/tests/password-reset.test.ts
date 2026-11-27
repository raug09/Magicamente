import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import User from '../src/models/User';
import { app, createUser, request } from './helpers';

vi.mock('../src/services/emailService', () => ({ sendEmail: vi.fn().mockResolvedValue({ id: 'test' }) }));

import { sendEmail } from '../src/services/emailService';
import { RESET_TOKEN_TTL_MS } from '../src/services/authService';

const forgot = (email: unknown) => request(app).post('/api/auth/forgot-password').send({ email });
const reset = (token: unknown, password: unknown) => request(app).post('/api/auth/reset-password').send({ token, password });
const login = (email: string, password: string) => request(app).post('/api/auth/login').send({ email, password });

/** El correo se envía en segundo plano: espera a que se haya pedido y devuelve el token del enlace. */
const tokenFromEmail = async (callIndex = 0): Promise<string> => {
  await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(callIndex + 1));
  const link = vi.mocked(sendEmail).mock.calls[callIndex][3] as string;
  return new URL(link).searchParams.get('token')!;
};

const GENERIC_MESSAGE = 'Si el email está registrado, recibirás un enlace para restablecer tu contraseña';

describe('recuperación de contraseña', () => {
  beforeEach(() => {
    vi.mocked(sendEmail).mockClear();
    vi.mocked(sendEmail).mockResolvedValue({ id: 'test' } as never);
  });

  describe('POST /api/auth/forgot-password', () => {
    it('envía un correo con un enlace y guarda solo el hash del token', async () => {
      const user = await createUser('paciente');
      const res = await forgot(user.email);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe(GENERIC_MESSAGE);

      const token = await tokenFromEmail();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      const [template, to, , link] = vi.mocked(sendEmail).mock.calls[0] as unknown as string[];
      expect(template).toBe('resetPassword');
      expect(to).toBe(user.email);
      expect(link).toContain('/reset-password?token=');

      const stored = await User.findById(user.id).select('+passwordResetTokenHash +passwordResetExpires');
      expect(stored?.passwordResetTokenHash).toBe(crypto.createHash('sha256').update(token).digest('hex'));
      expect(stored?.passwordResetTokenHash).not.toBe(token);
      const msLeft = stored!.passwordResetExpires!.getTime() - Date.now();
      expect(msLeft).toBeGreaterThan(RESET_TOKEN_TTL_MS - 60_000);
      expect(msLeft).toBeLessThanOrEqual(RESET_TOKEN_TTL_MS);
    });

    it('responde igual si el email no existe, y no envía nada', async () => {
      const known = await createUser('paciente');
      const a = await forgot(known.email);
      const b = await forgot('nadie@example.com');

      expect(b.status).toBe(a.status);
      expect(b.body).toEqual(a.body);
      await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(1)); // solo el del usuario real
    });

    it('no envía nada a cuentas desactivadas', async () => {
      const user = await createUser('paciente');
      await User.updateOne({ _id: user.id }, { isActive: false });

      expect((await forgot(user.email)).status).toBe(200);
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('limita a un correo por minuto y cuenta', async () => {
      const user = await createUser('paciente');
      await forgot(user.email);
      await tokenFromEmail();

      const again = await forgot(user.email);
      expect(again.status).toBe(200);
      expect(sendEmail).toHaveBeenCalledTimes(1);
    });

    it('pasado el minuto genera un token nuevo y el anterior deja de valer', async () => {
      const user = await createUser('paciente');
      await forgot(user.email);
      const oldToken = await tokenFromEmail(0);

      // simula que la petición anterior fue hace 2 minutos
      await User.updateOne({ _id: user.id }, { passwordResetExpires: new Date(Date.now() + RESET_TOKEN_TTL_MS - 120_000) });
      await forgot(user.email);
      const newToken = await tokenFromEmail(1);

      expect(newToken).not.toBe(oldToken);
      expect((await reset(oldToken, 'nueva-clave-123')).status).toBe(400);
      expect((await reset(newToken, 'nueva-clave-123')).status).toBe(200);
    });

    it('si el correo falla, la respuesta sigue siendo la misma', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(sendEmail).mockRejectedValueOnce(new Error('Resend caído'));
      const user = await createUser('paciente');

      const res = await forgot(user.email);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe(GENERIC_MESSAGE);
    });

    it('exige el email', async () => {
      expect((await forgot(undefined)).status).toBe(400);
      expect((await forgot('')).status).toBe(400);
      expect((await forgot({ $ne: null })).status).toBe(400); // no es un texto
    });
  });

  describe('POST /api/auth/reset-password', () => {
    it('cambia la contraseña: la nueva sirve y la antigua ya no', async () => {
      const user = await createUser('paciente', 'clave-antigua');
      await forgot(user.email);
      const token = await tokenFromEmail();

      const res = await reset(token, 'clave-nueva-123');
      expect(res.status).toBe(200);

      expect((await login(user.email, 'clave-nueva-123')).status).toBe(200);
      expect((await login(user.email, 'clave-antigua')).status).toBe(401);

      const stored = await User.findById(user.id).select('+passwordResetTokenHash +passwordResetExpires');
      expect(stored?.passwordResetTokenHash).toBeUndefined();
      expect(stored?.passwordResetExpires).toBeUndefined();
    });

    it('el token solo se puede usar una vez', async () => {
      const user = await createUser('paciente');
      await forgot(user.email);
      const token = await tokenFromEmail();

      expect((await reset(token, 'clave-nueva-123')).status).toBe(200);
      expect((await reset(token, 'otra-clave-456')).status).toBe(400);
      expect((await login(user.email, 'clave-nueva-123')).status).toBe(200);
    });

    it('dos usos simultáneos del mismo token: solo uno gana', async () => {
      const user = await createUser('paciente');
      await forgot(user.email);
      const token = await tokenFromEmail();

      const [a, b] = await Promise.all([reset(token, 'clave-nueva-111'), reset(token, 'clave-nueva-222')]);
      expect([a.status, b.status].sort()).toEqual([200, 400]);
    });

    it('rechaza un token caducado', async () => {
      const user = await createUser('paciente');
      await forgot(user.email);
      const token = await tokenFromEmail();

      await User.updateOne({ _id: user.id }, { passwordResetExpires: new Date(Date.now() - 1000) });
      const res = await reset(token, 'clave-nueva-123');
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/caducado/);
    });

    it('rechaza tokens inventados, vacíos o de otro tipo', async () => {
      expect((await reset('a'.repeat(64), 'clave-nueva-123')).status).toBe(400);
      expect((await reset(undefined, 'clave-nueva-123')).status).toBe(400);
      expect((await reset('', 'clave-nueva-123')).status).toBe(400);
      expect((await reset({ $ne: null }, 'clave-nueva-123')).status).toBe(400);
    });

    it('exige una contraseña de al menos 8 caracteres y no consume el token si es corta', async () => {
      const user = await createUser('paciente');
      await forgot(user.email);
      const token = await tokenFromEmail();

      expect((await reset(token, 'corta')).status).toBe(400);
      expect((await reset(token, undefined)).status).toBe(400);
      expect((await reset(token, 'clave-valida-123')).status).toBe(200); // el token sigue siendo válido
    });

    it('no permite restablecer cuentas desactivadas', async () => {
      const user = await createUser('paciente');
      await forgot(user.email);
      const token = await tokenFromEmail();

      await User.updateOne({ _id: user.id }, { isActive: false });
      expect((await reset(token, 'clave-nueva-123')).status).toBe(400);
    });
  });

  it('el hash y la caducidad nunca salen en las respuestas de usuarios', async () => {
    const user = await createUser('paciente');
    await forgot(user.email);
    await tokenFromEmail();

    const res = await request(app).get(`/api/users/${user.id}`).set({ Authorization: `Bearer ${user.token}` });
    expect(res.status).toBe(200);
    expect(res.body.passwordResetTokenHash).toBeUndefined();
    expect(res.body.passwordResetExpires).toBeUndefined();
  });
});
