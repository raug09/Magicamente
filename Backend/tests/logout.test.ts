import { describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import Session from '../src/models/Session';
import User from '../src/models/User';
import { app, auth, createUser, request } from './helpers';

vi.mock('../src/services/emailService', () => ({ sendEmail: vi.fn().mockResolvedValue({ id: 'test' }) }));

const login = async (email: string, password = 'secreto123'): Promise<string> => {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.token;
};
const me = (token: string) => request(app).get('/api/auth/me').set({ Authorization: `Bearer ${token}` });
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('login crea una sesión', () => {
  it('cada login abre una sesión nueva, y el token apunta a ella', async () => {
    const user = await createUser('paciente');
    const token = await login(user.email);
    const payload = jwt.decode(token) as { jti: string; id: string };

    expect(payload.jti).toBeTruthy();
    expect(await Session.countDocuments({ userId: user.id })).toBe(2); // la del helper y la del login
    expect(await Session.exists({ jti: payload.jti })).toBeTruthy();
  });

  it('la sesión caduca a la vez que el token (1 hora)', async () => {
    const user = await createUser('paciente');
    const token = await login(user.email);
    const { jti } = jwt.decode(token) as { jti: string };
    const session = await Session.findOne({ jti });
    const msLeft = session!.expiresAt.getTime() - Date.now();
    expect(msLeft).toBeGreaterThan(59 * 60_000);
    expect(msLeft).toBeLessThanOrEqual(60 * 60_000);
  });
});

describe('logout', () => {
  it('cierra la sesión actual: el token deja de valer, las demás siguen', async () => {
    const user = await createUser('paciente');
    const first = await login(user.email);
    const second = await login(user.email);

    expect((await request(app).post('/api/auth/logout').set(bearer(first))).status).toBe(200);
    expect((await me(first)).status).toBe(401);
    expect((await me(second)).status).toBe(200);
  });

  it('un token cerrado no sirve aunque no haya caducado', async () => {
    const user = await createUser('paciente');
    const token = await login(user.email);
    await request(app).post('/api/auth/logout').set(bearer(token));
    const again = await request(app).post('/api/auth/logout').set(bearer(token));
    expect(again.status).toBe(401);
  });

  it('exige sesión', async () => {
    expect((await request(app).post('/api/auth/logout')).status).toBe(401);
  });
});

describe('logout-all', () => {
  it('cierra todas las sesiones del usuario, también la que lo pide', async () => {
    const user = await createUser('paciente');
    const a = await login(user.email);
    const b = await login(user.email);

    expect((await request(app).post('/api/auth/logout-all').set(bearer(a))).status).toBe(200);
    expect((await me(a)).status).toBe(401);
    expect((await me(b)).status).toBe(401);
  });

  it('no afecta a las sesiones de otros usuarios', async () => {
    const user = await createUser('paciente');
    const other = await createUser('paciente');
    const otherToken = await login(other.email);

    await request(app).post('/api/auth/logout-all').set(auth(user));
    expect((await me(otherToken)).status).toBe(200);
  });
});

describe('listar y cerrar sesiones concretas', () => {
  it('lista las sesiones abiertas, marca la actual y no expone el jti', async () => {
    const user = await createUser('paciente');
    const token = await login(user.email);
    const res = await request(app).get('/api/auth/sessions').set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain('jti');
  });

  it('cierra una sesión concreta sin tocar la actual', async () => {
    const user = await createUser('paciente');
    const current = await login(user.email);
    const other = await login(user.email);
    const list = await request(app).get('/api/auth/sessions').set(bearer(current));
    // Cerramos todas las que no son la actual (incluida la del helper): la actual debe seguir.
    const others = list.body.filter((session: { current: boolean }) => !session.current);
    expect(others.length).toBeGreaterThanOrEqual(2);
    for (const session of others) {
      expect((await request(app).delete(`/api/auth/sessions/${session._id}`).set(bearer(current))).status).toBe(200);
    }

    expect((await me(other)).status).toBe(401);
    expect((await me(current)).status).toBe(200);
  });

  it('no se puede cerrar una sesión de otro usuario (404) ni un id mal formado (400)', async () => {
    const user = await createUser('paciente');
    const other = await createUser('paciente');
    const otherToken = await login(other.email);
    const otherSession = (await request(app).get('/api/auth/sessions').set(bearer(otherToken))).body[0]._id;
    const mine = await login(user.email);

    expect((await request(app).delete(`/api/auth/sessions/${otherSession}`).set(bearer(mine))).status).toBe(404);
    expect((await me(otherToken)).status).toBe(200);
    expect((await request(app).delete('/api/auth/sessions/no-es-un-id').set(bearer(mine))).status).toBe(400);
  });
});

describe('las sesiones también se cierran en otros casos', () => {
  it('cambiar la contraseña por PUT /users/:id cierra todas las sesiones', async () => {
    const user = await createUser('paciente');
    const token = await login(user.email);
    const res = await request(app).put(`/api/users/${user.id}`).set(auth(user)).send({ password: 'clave-nueva-123' });
    expect(res.status).toBe(200);
    expect((await me(token)).status).toBe(401);
    expect(await Session.countDocuments({ userId: user.id })).toBe(0);
  });

  it('borrar la cuenta elimina sus sesiones', async () => {
    const user = await createUser('paciente');
    await login(user.email);
    await request(app).delete(`/api/users/${user.id}`).set(auth(user));
    expect(await Session.countDocuments({ userId: user.id })).toBe(0);
    expect((await User.findById(user.id))?.isActive).toBe(false);
  });

  it('un token firmado a mano sin sesión se rechaza', async () => {
    const user = await createUser('administrador');
    const forged = jwt.sign({ id: user.id, role: 'administrador', jti: 'no-existe' }, process.env.JWT_SECRET!, { expiresIn: '1h' });
    expect((await request(app).get('/api/users').set(bearer(forged))).status).toBe(401);
  });
});

