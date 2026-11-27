import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import User from '../src/models/User';
import { app, request } from './helpers';

const register = (body: object) => request(app).post('/api/auth/register').send(body);

describe('POST /api/auth/register', () => {
  it('registra como paciente por defecto y guarda la contraseña hasheada', async () => {
    const res = await register({ name: 'Luis', email: 'luis@example.com', password: 'secreto123' });
    expect(res.status).toBe(201);

    const user = await User.findOne({ email: 'luis@example.com' });
    expect(user?.role).toBe('paciente');
    expect(user?.password).not.toBe('secreto123');
  });

  it('permite registrarse como psicólogo', async () => {
    const res = await register({ name: 'Ana', email: 'ana@example.com', password: 'secreto123', role: 'psicologo', studies: ['Clínica'] });
    expect(res.status).toBe(201);
    expect((await User.findOne({ email: 'ana@example.com' }))?.role).toBe('psicologo');
  });

  it('rechaza registrarse como administrador', async () => {
    const res = await register({ name: 'Eva', email: 'eva@example.com', password: 'secreto123', role: 'administrador' });
    expect(res.status).toBe(400);
    expect(await User.countDocuments()).toBe(0);
  });

  it('rechaza un rol inexistente', async () => {
    const res = await register({ name: 'Eva', email: 'eva@example.com', password: 'secreto123', role: 'superusuario' });
    expect(res.status).toBe(400);
  });

  it('devuelve 409 si el email ya existe', async () => {
    await register({ name: 'Luis', email: 'luis@example.com', password: 'secreto123' });
    const res = await register({ name: 'Luis 2', email: 'luis@example.com', password: 'secreto456' });
    expect(res.status).toBe(409);
  });

  it('devuelve 400 si faltan campos', async () => {
    const res = await register({ email: 'luis@example.com' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('devuelve un JWT con id y rol', async () => {
    await register({ name: 'Ana', email: 'ana@example.com', password: 'secreto123', role: 'psicologo' });
    const res = await request(app).post('/api/auth/login').send({ email: 'ana@example.com', password: 'secreto123' });

    expect(res.status).toBe(200);
    const payload = jwt.verify(res.body.token, process.env.JWT_SECRET!) as { id: string; role: string };
    expect(payload.role).toBe('psicologo');
    expect(payload.id).toBeTruthy();
  });

  it('devuelve 401 con credenciales incorrectas', async () => {
    await register({ name: 'Ana', email: 'ana@example.com', password: 'secreto123' });
    const wrongPassword = await request(app).post('/api/auth/login').send({ email: 'ana@example.com', password: 'otra' });
    const unknownEmail = await request(app).post('/api/auth/login').send({ email: 'nadie@example.com', password: 'x' });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
  });
});

describe('autenticación', () => {
  it('rechaza un token firmado con otro secreto (p. ej. el antiguo "secret")', async () => {
    const forged = jwt.sign({ id: '000000000000000000000000', role: 'administrador' }, 'secret');
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('los endpoints de correo de prueba ya no existen', async () => {
    const email = await request(app).post('/api/email/send-test').send({ email: 'a@example.com', nombre: 'x' });
    const notif = await request(app).get('/api/notifications/test');
    expect(email.status).toBe(404);
    expect(notif.status).toBe(404);
  });
});
