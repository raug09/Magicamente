import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import User from '../src/models/User';
import { app, auth, createUser, request } from './helpers';

describe('GET /api/users', () => {
  it('solo un administrador puede listar usuarios', async () => {
    const admin = await createUser('administrador');
    const patient = await createUser('paciente');

    expect((await request(app).get('/api/users').set(auth(patient))).status).toBe(403);

    const res = await request(app).get('/api/users').set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].password).toBeUndefined();
  });
});

describe('GET /api/users/:id', () => {
  it('uno mismo ve su perfil completo', async () => {
    const patient = await createUser('paciente');
    const res = await request(app).get(`/api/users/${patient.id}`).set(auth(patient));
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(patient.email);
    expect(res.body.password).toBeUndefined();
  });

  it('otro usuario no puede ver a un paciente', async () => {
    const patient = await createUser('paciente');
    const other = await createUser('paciente');
    const res = await request(app).get(`/api/users/${patient.id}`).set(auth(other));
    expect(res.status).toBe(404);
  });

  it('cualquiera ve el perfil público de un psicólogo, sin email', async () => {
    const psychologist = await createUser('psicologo');
    const patient = await createUser('paciente');
    const res = await request(app).get(`/api/users/${psychologist.id}`).set(auth(patient));
    expect(res.status).toBe(200);
    expect(res.body.name).toBeTruthy();
    expect(res.body.email).toBeUndefined();
  });

  it('un administrador ve cualquier perfil', async () => {
    const admin = await createUser('administrador');
    const patient = await createUser('paciente');
    const res = await request(app).get(`/api/users/${patient.id}`).set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(patient.email);
  });

  it('un id mal formado devuelve 400', async () => {
    const admin = await createUser('administrador');
    expect((await request(app).get('/api/users/no-es-un-id').set(auth(admin))).status).toBe(400);
  });
});

describe('PUT /api/users/:id', () => {
  it('no se puede editar a otro usuario', async () => {
    const victim = await createUser('paciente');
    const attacker = await createUser('paciente');
    const res = await request(app).put(`/api/users/${victim.id}`).set(auth(attacker)).send({ name: 'hackeado' });
    expect(res.status).toBe(403);
    expect((await User.findById(victim.id))?.name).not.toBe('hackeado');
  });

  it('uno mismo no puede cambiarse el rol', async () => {
    const patient = await createUser('paciente');
    const res = await request(app).put(`/api/users/${patient.id}`).set(auth(patient)).send({ role: 'administrador' });
    expect(res.status).toBe(403);
    expect((await User.findById(patient.id))?.role).toBe('paciente');
  });

  it('uno mismo puede editar su nombre y descripción', async () => {
    const psychologist = await createUser('psicologo');
    const res = await request(app)
      .put(`/api/users/${psychologist.id}`)
      .set(auth(psychologist))
      .send({ name: 'Dra. Ana', description: 'Terapia cognitiva' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Dra. Ana');
    expect(res.body.password).toBeUndefined();
  });

  it('al cambiar la contraseña se guarda hasheada y sirve para el login', async () => {
    const patient = await createUser('paciente');
    const res = await request(app).put(`/api/users/${patient.id}`).set(auth(patient)).send({ password: 'nueva123' });
    expect(res.status).toBe(200);

    const stored = await User.findById(patient.id);
    expect(stored?.password).not.toBe('nueva123');
    expect(await bcrypt.compare('nueva123', stored!.password)).toBe(true);

    const login = await request(app).post('/api/auth/login').send({ email: patient.email, password: 'nueva123' });
    expect(login.status).toBe(200);
  });

  it('un administrador puede cambiar el rol de otro usuario', async () => {
    const admin = await createUser('administrador');
    const patient = await createUser('paciente');
    const res = await request(app).put(`/api/users/${patient.id}`).set(auth(admin)).send({ role: 'psicologo' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('psicologo');
  });

  it('devuelve 404 si el usuario no existe', async () => {
    const admin = await createUser('administrador');
    const res = await request(app).put('/api/users/000000000000000000000000').set(auth(admin)).send({ name: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/users/:id', () => {
  it('no se puede borrar a otro usuario', async () => {
    const victim = await createUser('paciente');
    const attacker = await createUser('psicologo');
    const res = await request(app).delete(`/api/users/${victim.id}`).set(auth(attacker));
    expect(res.status).toBe(403);
    expect(await User.findById(victim.id)).not.toBeNull();
  });

  it('uno mismo puede borrar su cuenta', async () => {
    const patient = await createUser('paciente');
    const res = await request(app).delete(`/api/users/${patient.id}`).set(auth(patient));
    expect(res.status).toBe(200);
    expect((await User.findById(patient.id))?.deletedAt).toBeTruthy(); // anonimizada, no borrada del todo
  });

  it('un administrador puede borrar a cualquiera', async () => {
    const admin = await createUser('administrador');
    const patient = await createUser('paciente');
    expect((await request(app).delete(`/api/users/${patient.id}`).set(auth(admin))).status).toBe(200);
  });
});
