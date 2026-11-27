import { describe, expect, it } from 'vitest';
import Schedule from '../src/models/Schedule';
import User from '../src/models/User';
import { app, auth, createUser, futureDay, request } from './helpers';

describe('POST /api/schedule', () => {
  it('un paciente no puede crear horarios', async () => {
    const psychologist = await createUser('psicologo');
    const patient = await createUser('paciente');
    const res = await request(app)
      .post('/api/schedule')
      .set(auth(patient))
      .send({ psychologist: psychologist.id, day: futureDay(), hour: '10:00' });
    expect(res.status).toBe(403);
    expect(await Schedule.countDocuments()).toBe(0);
  });

  it('un psicólogo crea horarios para sí mismo sin indicar psychologist', async () => {
    const psychologist = await createUser('psicologo');
    const res = await request(app).post('/api/schedule').set(auth(psychologist)).send({ day: futureDay(), hour: '10:00' });

    expect(res.status).toBe(201);
    expect(res.body.schedule.psychologist).toBe(psychologist.id);
    expect((await User.findById(psychologist.id))?.schedules).toHaveLength(1);
  });

  it('un psicólogo no puede crear horarios para otro psicólogo', async () => {
    const psychologist = await createUser('psicologo');
    const other = await createUser('psicologo');
    const res = await request(app)
      .post('/api/schedule')
      .set(auth(psychologist))
      .send({ psychologist: other.id, day: futureDay(), hour: '10:00' });
    expect(res.status).toBe(403);
  });

  it('un administrador puede crear horarios para un psicólogo', async () => {
    const admin = await createUser('administrador');
    const psychologist = await createUser('psicologo');
    const res = await request(app)
      .post('/api/schedule')
      .set(auth(admin))
      .send({ psychologist: psychologist.id, day: futureDay(), hour: '10:00' });
    expect(res.status).toBe(201);
  });

  it('un administrador no puede crear horarios para alguien que no es psicólogo', async () => {
    const admin = await createUser('administrador');
    const patient = await createUser('paciente');
    const res = await request(app)
      .post('/api/schedule')
      .set(auth(admin))
      .send({ psychologist: patient.id, day: futureDay(), hour: '10:00' });
    expect(res.status).toBe(404);
  });

  it('rechaza duplicados, fechas pasadas y horas mal formadas', async () => {
    const psychologist = await createUser('psicologo');
    const post = (body: object) => request(app).post('/api/schedule').set(auth(psychologist)).send(body);

    expect((await post({ day: futureDay(), hour: '10:00' })).status).toBe(201);
    expect((await post({ day: futureDay(), hour: '10:00' })).status).toBe(409);
    expect((await post({ day: '2020-01-01', hour: '10:00' })).status).toBe(400);
    expect((await post({ day: futureDay(), hour: '25:00' })).status).toBe(400);
    expect((await post({ day: 'mañana', hour: '10:00' })).status).toBe(400);
  });
});

describe('GET /api/schedule/:psychologistId', () => {
  it('cualquier usuario autenticado ve los horarios de un psicólogo', async () => {
    const psychologist = await createUser('psicologo');
    const patient = await createUser('paciente');
    await request(app).post('/api/schedule').set(auth(psychologist)).send({ day: futureDay(), hour: '10:00' });

    const res = await request(app).get(`/api/schedule/${psychologist.id}`).set(auth(patient));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});
