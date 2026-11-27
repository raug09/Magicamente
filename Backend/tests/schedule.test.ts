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

describe('GET /api/schedule/:psychologistId (filtros)', () => {
  const get = (user: Parameters<typeof auth>[0], psychologistId: string, query = '') =>
    request(app).get(`/api/schedule/${psychologistId}${query}`).set(auth(user));

  const seed = async () => {
    const psychologist = await createUser('psicologo');
    const patient = await createUser('paciente');
    const mk = (day: string, hour: string, isAvailable = true) =>
      Schedule.create({ psychologist: psychologist.id, day: new Date(day), hour, isAvailable });

    await mk(futureDay(12), '09:00');
    await mk(futureDay(10), '11:00');
    await mk(futureDay(10), '09:00');
    await mk(futureDay(11), '09:00', false); // ocupada
    await mk('2020-01-01', '09:00'); // pasada pero marcada como libre
    await mk(new Date().toISOString().slice(0, 10), '00:00'); // hoy a medianoche: ya empezó
    return { psychologist, patient };
  };

  it('sin filtros devuelve todas, ordenadas por fecha y hora', async () => {
    const { psychologist, patient } = await seed();
    const res = await get(patient, psychologist.id);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(6);
    const keys = res.body.map((s: { day: string; hour: string }) => `${s.day}${s.hour}`);
    expect(keys).toEqual([...keys].sort());
  });

  it('available=true devuelve solo libres y futuras', async () => {
    const { psychologist, patient } = await seed();
    const res = await get(patient, psychologist.id, '?available=true');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body.every((s: { isAvailable: boolean }) => s.isAvailable)).toBe(true);
    expect(res.body.map((s: { hour: string }) => s.hour)).toEqual(['09:00', '11:00', '09:00']);
  });

  it('available=false devuelve solo las ocupadas', async () => {
    const { psychologist, patient } = await seed();
    const res = await get(patient, psychologist.id, '?available=false');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].isAvailable).toBe(false);
  });

  it('from y to acotan por día, ambos incluidos', async () => {
    const { psychologist, patient } = await seed();
    const range = await get(patient, psychologist.id, `?available=true&from=${futureDay(10)}&to=${futureDay(11)}`);
    expect(range.body).toHaveLength(2);

    const onlyFrom = await get(patient, psychologist.id, `?available=true&from=${futureDay(12)}`);
    expect(onlyFrom.body).toHaveLength(1);

    const onlyTo = await get(patient, psychologist.id, `?to=2020-12-31`);
    expect(onlyTo.body).toHaveLength(1); // solo la de 2020
  });

  it('valida los parámetros', async () => {
    const { psychologist, patient } = await seed();
    expect((await get(patient, psychologist.id, '?available=quizas')).status).toBe(400);
    expect((await get(patient, psychologist.id, '?from=15/12/2026')).status).toBe(400);
    expect((await get(patient, psychologist.id, '?to=2026-13-45')).status).toBe(400);
    expect((await get(patient, psychologist.id, `?from=${futureDay(12)}&to=${futureDay(10)}`)).status).toBe(400);
  });

  it('un psicólogo inexistente devuelve una lista vacía y un id mal formado, 400', async () => {
    const patient = await createUser('paciente');
    expect((await get(patient, '000000000000000000000000')).body).toEqual([]);
    expect((await get(patient, 'no-es-un-id')).status).toBe(400);
  });
});

describe('PUT y DELETE /api/schedule/:id', () => {
  const put = (user: Parameters<typeof auth>[0], id: string, body: object) =>
    request(app).put(`/api/schedule/${id}`).set(auth(user)).send(body);
  const del = (user: Parameters<typeof auth>[0], id: string) =>
    request(app).delete(`/api/schedule/${id}`).set(auth(user));

  const setup = async () => {
    const psychologist = await createUser('psicologo');
    const other = await createUser('psicologo');
    const patient = await createUser('paciente');
    const create = await request(app).post('/api/schedule').set(auth(psychologist)).send({ day: futureDay(10), hour: '10:00' });
    return { psychologist, other, patient, id: create.body.schedule._id as string };
  };

  it('el psicólogo cambia la hora y el día de una franja libre', async () => {
    const { psychologist, id } = await setup();
    const res = await put(psychologist, id, { hour: '12:30' });
    expect(res.status).toBe(200);
    expect(res.body.schedule.hour).toBe('12:30');

    const moved = await put(psychologist, id, { day: futureDay(20) });
    expect(moved.status).toBe(200);
    expect((await Schedule.findById(id))?.day.toISOString().slice(0, 10)).toBe(futureDay(20));
  });

  it('no se puede modificar la franja de otro psicólogo, ni un paciente', async () => {
    const { other, patient, id } = await setup();
    expect((await put(other, id, { hour: '12:00' })).status).toBe(403);
    expect((await put(patient, id, { hour: '12:00' })).status).toBe(403);
    expect((await del(other, id)).status).toBe(403);
    expect((await del(patient, id)).status).toBe(403);
    expect((await Schedule.findById(id))?.hour).toBe('10:00');
  });

  it('un administrador puede modificar y borrar cualquiera', async () => {
    const { id } = await setup();
    const admin = await createUser('administrador');
    expect((await put(admin, id, { hour: '08:00' })).status).toBe(200);
    expect((await del(admin, id)).status).toBe(200);
  });

  it('valida los datos y rechaza campos no permitidos', async () => {
    const { psychologist, other, id } = await setup();
    expect((await put(psychologist, id, {})).status).toBe(400);
    expect((await put(psychologist, id, { hour: '25:00' })).status).toBe(400);
    expect((await put(psychologist, id, { day: 'mañana' })).status).toBe(400);
    expect((await put(psychologist, id, { day: '2020-01-01' })).status).toBe(400);
    expect((await put(psychologist, id, { isAvailable: false })).status).toBe(403);
    expect((await put(psychologist, id, { psychologist: other.id })).status).toBe(403);
  });

  it('no permite chocar con otra franja del mismo psicólogo', async () => {
    const { psychologist, id } = await setup();
    await request(app).post('/api/schedule').set(auth(psychologist)).send({ day: futureDay(10), hour: '15:00' });
    expect((await put(psychologist, id, { hour: '15:00' })).status).toBe(409);
    expect((await put(psychologist, id, { hour: '10:00' })).status).toBe(200); // sin cambios reales
  });

  it('una franja con cita reservada no se puede modificar ni borrar', async () => {
    const { psychologist, patient, id } = await setup();
    const booked = await request(app)
      .post('/api/appointments/appointment')
      .set(auth(patient))
      .send({ scheduleId: id });
    expect(booked.status).toBe(201);

    expect((await put(psychologist, id, { hour: '12:00' })).status).toBe(409);
    expect((await del(psychologist, id)).status).toBe(409);
    expect(await Schedule.findById(id)).not.toBeNull();

    // al cancelar la cita, vuelve a poderse gestionar
    await request(app).patch(`/api/appointments/appointment/cancel/${booked.body.appointment._id}`).set(auth(patient));
    expect((await del(psychologist, id)).status).toBe(200);
  });

  it('al borrar, la franja desaparece de la lista del psicólogo', async () => {
    const { psychologist, id } = await setup();
    expect((await User.findById(psychologist.id))?.schedules).toHaveLength(1);

    expect((await del(psychologist, id)).status).toBe(200);
    expect(await Schedule.findById(id)).toBeNull();
    expect((await User.findById(psychologist.id))?.schedules).toHaveLength(0);
  });

  it('devuelve 404 si no existe y 400 si el id está mal formado', async () => {
    const psychologist = await createUser('psicologo');
    expect((await put(psychologist, '000000000000000000000000', { hour: '10:00' })).status).toBe(404);
    expect((await del(psychologist, '000000000000000000000000')).status).toBe(404);
    expect((await del(psychologist, 'no-es-un-id')).status).toBe(400);
  });
});
