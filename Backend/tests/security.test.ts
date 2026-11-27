import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import User from '../src/models/User';
import { createApp } from '../src/app';
import { app, auth, createUser, sessionToken, TestUser } from './helpers';

vi.mock('../src/services/emailService', () => ({ sendEmail: vi.fn().mockResolvedValue({ id: 'test' }) }));

import { sendEmail } from '../src/services/emailService';

/** Token ya emitido hace un minuto (como el de una sesión abierta antes de cambiar la contraseña). */
const oldToken = async (user: TestUser, role = 'paciente'): Promise<string> => {
  // Sesión creada, pero el token lleva una fecha de emisión de hace un minuto.
  const token = await sessionToken(user.id, role as 'paciente');
  const payload = jwt.decode(token) as { jti: string };
  return jwt.sign({ id: user.id, role, jti: payload.jti, iat: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET!, { expiresIn: '1h' });
};
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const me = (token: string) => request(app).get('/api/appointments/appointment').set(bearer(token)); // 200 para pacientes

describe('sesiones: el token se valida contra la base de datos', () => {
  it('un usuario borrado pierde el acceso al instante', async () => {
    const user = await createUser('paciente');
    expect((await me(user.token)).status).toBe(200);

    await User.deleteOne({ _id: user.id });
    const res = await me(user.token);
    expect(res.status).toBe(401);
  });

  it('un usuario desactivado pierde el acceso al instante', async () => {
    const user = await createUser('paciente');
    await User.updateOne({ _id: user.id }, { isActive: false });
    expect((await me(user.token)).status).toBe(401);

    await User.updateOne({ _id: user.id }, { isActive: true });
    expect((await me(user.token)).status).toBe(200); // reactivado: vuelve a funcionar
  });

  it('un cambio de rol se aplica al instante, aunque el token diga otra cosa', async () => {
    const psychologist = await createUser('psicologo');
    const body = { day: new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10), hour: '10:00' };
    expect((await request(app).post('/api/schedule').set(auth(psychologist)).send(body)).status).toBe(201);

    // el administrador lo degrada a paciente; su token (con rol psicologo) deja de dar permisos de psicólogo
    await User.updateOne({ _id: psychologist.id }, { role: 'paciente' });
    expect((await request(app).post('/api/schedule').set(auth(psychologist)).send({ ...body, hour: '11:00' })).status).toBe(403);

    // y al revés: un token de paciente no sirve para hacerse administrador
    const patient = await createUser('paciente');
    // Un token firmado a mano no tiene sesión en la BD: se rechaza antes de mirar el rol.
    const forged = jwt.sign({ id: patient.id, role: 'administrador' }, process.env.JWT_SECRET!);
    expect((await request(app).get('/api/users').set(bearer(forged))).status).toBe(401);
  });

  it('al cambiar la contraseña por PUT /users/:id, las sesiones anteriores caducan', async () => {
    const user = await createUser('paciente');
    const before = await oldToken(user);
    expect((await me(before)).status).toBe(200);

    const change = await request(app).put(`/api/users/${user.id}`).set(auth(user)).send({ password: 'clave-nueva-123' });
    expect(change.status).toBe(200);

    expect((await me(before)).status).toBe(401);
    const login = await request(app).post('/api/auth/login').send({ email: user.email, password: 'clave-nueva-123' });
    expect(login.status).toBe(200);
    expect((await me(login.body.token)).status).toBe(200); // la sesión nueva sí vale
  });

  it('al restablecer la contraseña con el enlace, las sesiones anteriores caducan', async () => {
    const user = await createUser('paciente');
    const before = await oldToken(user);

    await request(app).post('/api/auth/forgot-password').send({ email: user.email });
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalled());
    const link = vi.mocked(sendEmail).mock.calls.at(-1)![3] as string;
    const token = new URL(link).searchParams.get('token');

    expect((await request(app).post('/api/auth/reset-password').send({ token, password: 'clave-nueva-123' })).status).toBe(200);
    expect((await me(before)).status).toBe(401);
  });

  it('un token con otro algoritmo (none, HS512) se rechaza', async () => {
    const user = await createUser('paciente');
    const noAlgorithmHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ id: user.id, role: 'administrador' })).toString('base64url');
    expect((await me(`${noAlgorithmHeader}.${payload}.`)).status).toBe(401);

    const hs512 = jwt.sign({ id: user.id, role: 'paciente' }, process.env.JWT_SECRET!, { algorithm: 'HS512' });
    expect((await me(hs512)).status).toBe(401);
  });
});

describe('login y cuentas desactivadas', () => {
  it('una cuenta desactivada no puede iniciar sesión (403) tras acertar la contraseña', async () => {
    const user = await createUser('paciente', 'secreto123');
    await User.updateOne({ _id: user.id }, { isActive: false });

    const right = await request(app).post('/api/auth/login').send({ email: user.email, password: 'secreto123' });
    const wrong = await request(app).post('/api/auth/login').send({ email: user.email, password: 'incorrecta' });
    expect(right.status).toBe(403);
    expect(wrong.status).toBe(401); // con contraseña incorrecta no se revela nada
  });
});

describe('política de contraseña común', () => {
  const longEnough = 'clave-valida-123';

  it('el registro exige al menos 8 caracteres', async () => {
    const short = await request(app).post('/api/auth/register').send({ name: 'Ana', email: 'a@example.com', password: 'corta' });
    expect(short.status).toBe(400);
    expect(await User.countDocuments()).toBe(0);

    const ok = await request(app).post('/api/auth/register').send({ name: 'Ana', email: 'a@example.com', password: longEnough });
    expect(ok.status).toBe(201);
  });

  it('cambiar la contraseña por PUT /users/:id exige lo mismo', async () => {
    const user = await createUser('paciente');
    const put = (password: unknown) => request(app).put(`/api/users/${user.id}`).set(auth(user)).send({ password });

    expect((await put('corta')).status).toBe(400);
    expect((await put('')).status).toBe(400);
    expect((await put(12345678)).status).toBe(400);
    expect((await put(longEnough)).status).toBe(200);
  });

  it('rechaza contraseñas de más de 72 bytes (bcrypt las truncaría)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ana', email: 'a@example.com', password: 'a'.repeat(73) });
    expect(res.status).toBe(400);

    const ok = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ana', email: 'b@example.com', password: 'a'.repeat(72) });
    expect(ok.status).toBe(201);
  });
});

describe('límite de intentos por IP', () => {
  const limited = () => createApp({ rateLimit: true });

  it('login: el intento 11 fallido devuelve 429', async () => {
    const server = limited();
    for (let i = 0; i < 10; i++) {
      const res = await request(server).post('/api/auth/login').send({ email: 'nadie@example.com', password: 'incorrecta' });
      expect(res.status).toBe(401);
    }
    const blocked = await request(server).post('/api/auth/login').send({ email: 'nadie@example.com', password: 'incorrecta' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toMatch(/Demasiadas peticiones/);
    expect(blocked.headers['retry-after']).toBeTruthy();
  });

  it('login: los intentos correctos no cuentan', async () => {
    const user = await createUser('paciente', 'secreto123');
    const server = limited();
    for (let i = 0; i < 15; i++) {
      const res = await request(server).post('/api/auth/login').send({ email: user.email, password: 'secreto123' });
      expect(res.status).toBe(200);
    }
  });

  it('forgot-password, registro y reset-password comparten un límite de 10 por hora', async () => {
    const server = limited();
    for (let i = 0; i < 10; i++) {
      expect((await request(server).post('/api/auth/forgot-password').send({ email: `u${i}@example.com` })).status).toBe(200);
    }
    expect((await request(server).post('/api/auth/forgot-password').send({ email: 'otro@example.com' })).status).toBe(429);
    // el contador es común a las tres rutas: ya no se puede registrar ni usar reset-password
    expect((await request(server).post('/api/auth/reset-password').send({ token: 'x', password: 'clave-valida-123' })).status).toBe(429);
    expect((await request(server).post('/api/auth/register').send({ name: 'A', email: 'a@example.com', password: 'clave-valida-123' })).status).toBe(429);
    // pero login y el resto de la API tienen los suyos
    expect((await request(server).post('/api/auth/login').send({ email: 'a@example.com', password: 'incorrecta' })).status).toBe(401);
  });

  it('los contadores son por aplicación: una app nueva empieza de cero', async () => {
    for (let i = 0; i < 11; i++) await request(limited()).post('/api/auth/login').send({ email: 'a@example.com', password: 'incorrecta' });
    const res = await request(limited()).post('/api/auth/login').send({ email: 'a@example.com', password: 'incorrecta' });
    expect(res.status).toBe(401);
  });
});

describe('cabeceras de seguridad y CORS', () => {
  const original = { cors: process.env.CORS_ORIGIN, frontend: process.env.FRONTEND_URL };
  beforeEach(() => {
    delete process.env.CORS_ORIGIN;
    process.env.FRONTEND_URL = 'https://app.magicamente.online';
  });
  afterEach(() => {
    if (original.cors === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = original.cors;
    if (original.frontend === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = original.frontend;
  });

  it('helmet añade cabeceras y se oculta X-Powered-By', async () => {
    const res = await request(createApp({ rateLimit: false })).get('/');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeTruthy();
    expect(res.headers['strict-transport-security']).toBeTruthy();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('por defecto solo se permite el origen del frontend', async () => {
    const server = createApp({ rateLimit: false });
    const allowed = await request(server).get('/').set('Origin', 'https://app.magicamente.online');
    const denied = await request(server).get('/').set('Origin', 'https://malvado.example.com');

    expect(allowed.headers['access-control-allow-origin']).toBe('https://app.magicamente.online');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('CORS_ORIGIN admite una lista de orígenes', async () => {
    process.env.CORS_ORIGIN = 'https://a.example.com, https://b.example.com/';
    const server = createApp({ rateLimit: false });

    expect((await request(server).get('/').set('Origin', 'https://b.example.com')).headers['access-control-allow-origin']).toBe(
      'https://b.example.com'
    );
    expect((await request(server).get('/').set('Origin', 'https://app.magicamente.online')).headers['access-control-allow-origin']).toBeUndefined();
  });

  it('CORS_ORIGIN=* lo abre a cualquiera', async () => {
    process.env.CORS_ORIGIN = '*';
    const res = await request(createApp({ rateLimit: false })).get('/').set('Origin', 'https://cualquiera.example.com');
    expect(res.headers['access-control-allow-origin']).toBeTruthy();
  });
});
