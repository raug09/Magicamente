import { beforeEach, describe, expect, it, vi } from 'vitest';
import User from '../src/models/User';
import { app, auth, createUser, request, TestUser } from './helpers';

vi.mock('../src/services/emailService', () => ({ sendEmail: vi.fn().mockResolvedValue({ id: 'test' }) }));

import { sendEmail } from '../src/services/emailService';

const requestChange = (user: TestUser, email: unknown, password: unknown = 'secreto123') =>
  request(app).post('/api/auth/change-email').set(auth(user)).send({ email, password });
const confirm = (token: unknown) => request(app).post('/api/auth/confirm-email-change').send({ token });
const login = (email: string, password = 'secreto123') => request(app).post('/api/auth/login').send({ email, password });

const callsTo = (template: string, email: string) =>
  (vi.mocked(sendEmail).mock.calls as unknown as unknown[][]).filter((call) => call[0] === template && call[1] === email);

/** Token del último correo de confirmación de cambio enviado a la nueva dirección. */
const tokenFor = async (newEmail: string, expected = 1): Promise<string> => {
  await vi.waitFor(() => expect(callsTo('confirmEmailChange', newEmail).length).toBeGreaterThanOrEqual(expected));
  const last = callsTo('confirmEmailChange', newEmail).at(-1)!;
  return new URL(last[3] as string).searchParams.get('token')!;
};

beforeEach(() => {
  vi.mocked(sendEmail).mockClear();
});

describe('cambio de email', () => {
  it('exige sesión', async () => {
    const res = await request(app).post('/api/auth/change-email').send({ email: 'nuevo@example.com', password: 'secreto123' });
    expect(res.status).toBe(401);
  });

  it('exige la contraseña actual: con otra, 400 y no se envía nada', async () => {
    const user = await createUser('paciente');
    const res = await requestChange(user, 'nuevo@example.com', 'otra-clave');

    expect(res.status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
    expect((await User.findById(user.id))?.email).toBe(user.email);
  });

  it('rechaza un email ya usado, el mismo email actual y un formato inválido', async () => {
    const user = await createUser('paciente');
    const other = await createUser('paciente');

    expect((await requestChange(user, other.email)).status).toBe(409);
    expect((await requestChange(user, user.email)).status).toBe(400);
    expect((await requestChange(user, 'no-es-un-email')).status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('envía el enlace a la NUEVA dirección y avisa a la ACTUAL; el email aún no cambia', async () => {
    const user = await createUser('paciente');
    expect((await requestChange(user, 'nuevo@example.com')).status).toBe(200);

    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(2));
    expect(callsTo('confirmEmailChange', 'nuevo@example.com')).toHaveLength(1);
    expect(callsTo('emailChangeRequested', user.email)).toHaveLength(1);
    expect((await User.findById(user.id))?.email).toBe(user.email);
  });

  it('el aviso al email actual no revela la nueva dirección', async () => {
    const user = await createUser('paciente');
    await requestChange(user, 'nuevo@example.com');
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(2));
    const notice = callsTo('emailChangeRequested', user.email)[0];
    expect(JSON.stringify(notice)).not.toContain('nuevo@example.com');
  });

  it('confirmar el enlace cambia el email: el nuevo sirve para entrar y el antiguo no', async () => {
    const user = await createUser('paciente');
    await requestChange(user, 'nuevo@example.com');
    const token = await tokenFor('nuevo@example.com');

    expect((await confirm(token)).status).toBe(200);
    expect((await login('nuevo@example.com')).status).toBe(200);
    expect((await login(user.email)).status).toBe(401);

    const stored = await User.findById(user.id).select('+pendingEmail +emailChangeTokenHash');
    expect(stored?.pendingEmail).toBeUndefined();
    expect(stored?.emailChangeTokenHash).toBeUndefined();
  });

  it('el enlace solo se puede usar una vez', async () => {
    const user = await createUser('paciente');
    await requestChange(user, 'nuevo@example.com');
    const token = await tokenFor('nuevo@example.com');

    expect((await confirm(token)).status).toBe(200);
    expect((await confirm(token)).status).toBe(400);
  });

  it('un enlace caducado no sirve', async () => {
    const user = await createUser('paciente');
    await requestChange(user, 'nuevo@example.com');
    const token = await tokenFor('nuevo@example.com');
    await User.updateOne({ _id: user.id }, { emailChangeExpires: new Date(Date.now() - 1000) });

    expect((await confirm(token)).status).toBe(400);
    expect((await User.findById(user.id))?.email).toBe(user.email);
  });

  it('si el email se ocupó mientras tanto, la confirmación se rechaza (409)', async () => {
    const user = await createUser('paciente');
    await requestChange(user, 'nuevo@example.com');
    const token = await tokenFor('nuevo@example.com');

    await User.create({ name: 'Otra', email: 'nuevo@example.com', password: 'x', role: 'paciente', emailVerified: true });
    expect((await confirm(token)).status).toBe(409);
    expect((await User.findById(user.id))?.email).toBe(user.email);
  });

  it('pedir otra vez dentro del minuto no envía nada más; el segundo enlace reemplaza al primero', async () => {
    const user = await createUser('paciente');
    await requestChange(user, 'nuevo@example.com');
    const first = await tokenFor('nuevo@example.com');

    expect((await requestChange(user, 'nuevo@example.com')).status).toBe(200);
    expect(callsTo('confirmEmailChange', 'nuevo@example.com')).toHaveLength(1);

    await User.updateOne({ _id: user.id }, { emailChangeSentAt: new Date(Date.now() - 2 * 60_000) });
    await requestChange(user, 'nuevo@example.com');
    const second = await tokenFor('nuevo@example.com', 2);

    expect(second).not.toBe(first);
    expect((await confirm(first)).status).toBe(400);
    expect((await confirm(second)).status).toBe(200);
  });

  it('el propio usuario no puede cambiar su email con PUT /users/:id', async () => {
    const user = await createUser('paciente');
    const res = await request(app).put(`/api/users/${user.id}`).set(auth(user)).send({ email: 'nuevo@example.com' });
    expect(res.status).toBe(403);
  });
});
