import { describe, expect, it } from 'vitest';
import User from '../src/models/User';
import { app, auth, createUser, request } from './helpers';

const list = (user: Parameters<typeof auth>[0], query = '') =>
  request(app).get(`/api/psychologists${query}`).set(auth(user));

const createPsychologist = async (name: string, extra: object = {}) => {
  const user = await createUser('psicologo');
  await User.updateOne({ _id: user.id }, { name, ...extra });
  return user;
};

describe('GET /api/psychologists', () => {
  it('requiere sesión', async () => {
    expect((await request(app).get('/api/psychologists')).status).toBe(401);
  });

  it('un paciente ve solo psicólogos, con campos públicos', async () => {
    const patient = await createUser('paciente');
    await createUser('administrador');
    await createPsychologist('Ana', { studies: ['Clínica'], description: 'Terapia cognitiva' });

    const res = await list(patient);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items).toHaveLength(1);

    const [psychologist] = res.body.items;
    expect(psychologist).toMatchObject({ name: 'Ana', studies: ['Clínica'], description: 'Terapia cognitiva' });
    expect(psychologist._id).toBeTruthy();
    expect(psychologist.email).toBeUndefined();
    expect(psychologist.password).toBeUndefined();
    expect(psychologist.schedules).toBeUndefined();
    expect(psychologist.role).toBeUndefined();
  });

  it('no muestra psicólogos desactivados', async () => {
    const patient = await createUser('paciente');
    await createPsychologist('Activa');
    await createPsychologist('Inactiva', { isActive: false });

    const res = await list(patient);
    expect(res.body.items.map((p: { name: string }) => p.name)).toEqual(['Activa']);
  });

  it('ordena por nombre y busca sin distinguir mayúsculas', async () => {
    const patient = await createUser('paciente');
    await createPsychologist('Carlos Ruiz');
    await createPsychologist('Ana Pérez');
    await createPsychologist('Beatriz Ruiz');

    const all = await list(patient);
    expect(all.body.items.map((p: { name: string }) => p.name)).toEqual([
      'Ana Pérez',
      'Beatriz Ruiz',
      'Carlos Ruiz',
    ]);

    const found = await list(patient, '?q=ruiz');
    expect(found.body.total).toBe(2);
    expect(found.body.items.map((p: { name: string }) => p.name)).toEqual(['Beatriz Ruiz', 'Carlos Ruiz']);
  });

  it('la búsqueda trata el texto literalmente (no como expresión regular)', async () => {
    const patient = await createUser('paciente');
    await createPsychologist('Ana');
    expect((await list(patient, '?q=.*')).body.total).toBe(0);
    expect((await list(patient, '?q=(')).status).toBe(200);
  });

  it('pagina los resultados', async () => {
    const patient = await createUser('paciente');
    for (const name of ['A', 'B', 'C', 'D', 'E']) await createPsychologist(name);

    const page1 = await list(patient, '?limit=2&page=1');
    const page3 = await list(patient, '?limit=2&page=3');
    const page9 = await list(patient, '?limit=2&page=9');

    expect(page1.body).toMatchObject({ total: 5, page: 1, limit: 2 });
    expect(page1.body.items.map((p: { name: string }) => p.name)).toEqual(['A', 'B']);
    expect(page3.body.items.map((p: { name: string }) => p.name)).toEqual(['E']);
    expect(page9.body.items).toEqual([]);
  });

  it('limita el tamaño de página y valida los parámetros', async () => {
    const patient = await createUser('paciente');
    expect((await list(patient, '?limit=500')).body.limit).toBe(50);
    expect((await list(patient, '?limit=0')).status).toBe(400);
    expect((await list(patient, '?page=-1')).status).toBe(400);
    expect((await list(patient, '?page=abc')).status).toBe(400);
    expect((await list(patient, '?q=a&q=b')).status).toBe(400);
  });

  it('también lo pueden usar psicólogos y administradores', async () => {
    const psychologist = await createUser('psicologo');
    const admin = await createUser('administrador');
    expect((await list(psychologist)).status).toBe(200);
    expect((await list(admin)).status).toBe(200);
  });
});
