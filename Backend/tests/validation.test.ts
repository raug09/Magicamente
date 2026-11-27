import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import User from '../src/models/User';
import { app, auth, createUser, request } from './helpers';

const register = (body: object) => request(app).post('/api/auth/register').send(body);
const valid = { name: 'Ana', email: 'ana@example.com', password: 'secreto123' };

describe('validación de entrada (zod)', () => {
  it('los errores traen un mensaje y la lista de campos inválidos', async () => {
    const res = await register({ name: '', email: 'no-es-un-email', password: 5 });

    expect(res.status).toBe(400);
    expect(typeof res.body.message).toBe('string');
    expect(res.body.errors).toBeInstanceOf(Array);
    const fields = res.body.errors.map((e: { field: string }) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'email', 'password']));
    expect(res.body.errors[0]).toEqual({ field: expect.any(String), message: expect.any(String) });
  });

  it('los campos desconocidos se descartan: no se puede colar isActive, role ni deletedAt', async () => {
    const res = await register({ ...valid, isActive: false, deletedAt: '2020-01-01', schedules: ['x'], passwordResetTokenHash: 'x' });
    expect(res.status).toBe(201);

    const stored = await User.findOne({ email: 'ana@example.com' }).select('+passwordResetTokenHash');
    expect(stored?.isActive).toBe(true);
    expect(stored?.deletedAt).toBeUndefined();
    expect(stored?.schedules).toHaveLength(0);
    expect(stored?.passwordResetTokenHash).toBeUndefined();
  });

  it('valida longitudes y tipos', async () => {
    expect((await register({ ...valid, name: 'a'.repeat(101) })).status).toBe(400);
    expect((await register({ ...valid, studies: 'Clínica' })).status).toBe(400);
    expect((await register({ ...valid, studies: [1, 2] })).status).toBe(400);
    expect((await register({ ...valid, studies: Array(31).fill('x') })).status).toBe(400);
    expect((await register({ ...valid, role: 'administrador' })).status).toBe(400);
    expect((await register({ ...valid, timezone: 'Marte/Olympus' })).status).toBe(400);
    expect((await register({ ...valid, email: 'a'.repeat(250) + '@example.com' })).status).toBe(400);
    expect(await User.countDocuments()).toBe(0);
  });

  it('un cuerpo vacío o sin JSON da 400, no 500', async () => {
    expect((await request(app).post('/api/auth/register')).status).toBe(400);
    expect((await request(app).post('/api/auth/login').send({})).status).toBe(400);
    expect((await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{malo')).status).toBe(400);
  });

  it('PUT /users/:id: tipos válidos pero campos ajenos siguen dando 403', async () => {
    const user = await createUser('paciente');
    const put = (body: object) => request(app).put(`/api/users/${user.id}`).set(auth(user)).send(body);

    expect((await put({ name: 5 })).status).toBe(400);
    expect((await put({ studies: 'x' })).status).toBe(400);
    expect((await put({ name: '' })).status).toBe(400);
    expect((await put({ isActive: false })).status).toBe(403);
    expect((await put({ role: 'administrador' })).status).toBe(403);
    expect((await put({ name: 'Nuevo nombre', description: 'Algo' })).status).toBe(200);
  });

  it('un administrador debe enviar tipos correctos al cambiar email, rol o isActive', async () => {
    const admin = await createUser('administrador');
    const user = await createUser('paciente');
    const put = (body: object) => request(app).put(`/api/users/${user.id}`).set(auth(admin)).send(body);

    expect((await put({ email: 'no-es-un-email' })).status).toBe(400);
    expect((await put({ role: 'superusuario' })).status).toBe(400);
    expect((await put({ isActive: 'no' })).status).toBe(400);
    expect((await put({ email: 'Nuevo@Example.com', isActive: true })).body.email).toBe('nuevo@example.com');
  });

  it('la validación llega después de la autenticación: sin sesión es 401, no 400', async () => {
    expect((await request(app).post('/api/schedule').send({})).status).toBe(401);
    expect((await request(app).put('/api/users/000000000000000000000000').send({ name: 5 })).status).toBe(401);
  });
});

describe('emails normalizados (minúsculas y sin espacios)', () => {
  it('se guardan en minúsculas y el login no distingue mayúsculas', async () => {
    const res = await register({ ...valid, email: '  Ana@Example.COM ' });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('ana@example.com');
    await User.updateOne({ email: 'ana@example.com' }, { emailVerified: true });

    for (const email of ['ana@example.com', 'ANA@EXAMPLE.COM', ' Ana@example.com ']) {
      const login = await request(app).post('/api/auth/login').send({ email, password: 'secreto123' });
      expect(login.status).toBe(200);
    }
  });

  it('no se pueden registrar dos cuentas que solo difieren en mayúsculas', async () => {
    expect((await register(valid)).status).toBe(201);
    expect((await register({ ...valid, email: 'ANA@example.com' })).status).toBe(409);
  });
});

describe('GET /health', () => {
  it('responde 200 si la base de datos está conectada', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'up' });
  });

  it('responde 503 si la base de datos no está conectada', async () => {
    Object.defineProperty(mongoose.connection, 'readyState', { get: () => 0, configurable: true });
    try {
      const res = await request(app).get('/health');
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ status: 'error', db: 'down' });
    } finally {
      delete (mongoose.connection as unknown as { readyState?: number }).readyState; // vuelve el getter original
    }
  });
});
