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
    expect(res.body.schedules).toHaveLength(1);
    expect(res.body.schedules[0].psychologist).toBe(psychologist.id);
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
    expect(res.body.items).toHaveLength(1);
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
    expect(res.body.items).toHaveLength(6);
    const keys = res.body.items.map((s: { day: string; hour: string }) => `${s.day}${s.hour}`);
    expect(keys).toEqual([...keys].sort());
  });

  it('available=true devuelve solo libres y futuras', async () => {
    const { psychologist, patient } = await seed();
    const res = await get(patient, psychologist.id, '?available=true');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(3);
    expect(res.body.items.every((s: { isAvailable: boolean }) => s.isAvailable)).toBe(true);
    expect(res.body.items.map((s: { hour: string }) => s.hour)).toEqual(['09:00', '11:00', '09:00']);
  });

  it('available=false devuelve solo las ocupadas', async () => {
    const { psychologist, patient } = await seed();
    const res = await get(patient, psychologist.id, '?available=false');
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].isAvailable).toBe(false);
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
    return { psychologist, other, patient, id: create.body.schedules[0]._id as string };
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

describe('zona horaria del psicólogo', () => {
  const setup = async (timezone: string) => {
    const psychologist = await createUser('psicologo');
    await User.updateOne({ _id: psychologist.id }, { timezone });
    const patient = await createUser('paciente');
    return { psychologist, patient };
  };
  const create = (user: Parameters<typeof auth>[0], body: object) =>
    request(app).post('/api/schedule').set(auth(user)).send(body);

  it('day y hour se interpretan en la zona del psicólogo y se guarda el instante real', async () => {
    const { psychologist } = await setup('America/Bogota');
    const res = await create(psychologist, { day: futureDay(10), hour: '10:00' });

    expect(res.status).toBe(201);
    const [schedule] = res.body.schedules;
    expect(schedule.timezone).toBe('America/Bogota');
    expect(schedule.hour).toBe('10:00');
    expect(schedule.day).toBe(`${futureDay(10)}T00:00:00.000Z`);
    expect(schedule.startsAt).toBe(`${futureDay(10)}T15:00:00.000Z`); // 10:00 en Bogotá = 15:00 UTC
  });

  it('la cita empieza en el instante real de la franja', async () => {
    const { psychologist, patient } = await setup('Asia/Tokyo');
    const created = await create(psychologist, { day: futureDay(10), hour: '09:00' });
    const scheduleId = created.body.schedules[0]._id;

    const booked = await request(app).post('/api/appointments/appointment').set(auth(patient)).send({ scheduleId });
    expect(booked.status).toBe(201);
    // 09:00 en Tokio (UTC+9) = 00:00 UTC del mismo día
    expect(booked.body.appointment.time).toBe(`${futureDay(10)}T00:00:00.000Z`);
  });

  it('available=true usa el instante real: una franja del día de hoy ya empezada no cuenta', async () => {
    const { psychologist, patient } = await setup('UTC');
    const today = new Date().toISOString().slice(0, 10);
    await Schedule.create({ psychologist: psychologist.id, day: new Date(today), hour: '00:00' }); // ya pasó
    await create(psychologist, { day: futureDay(5), hour: '10:00' });

    const res = await request(app).get(`/api/schedule/${psychologist.id}?available=true`).set(auth(patient));
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].startsAt).toBe(`${futureDay(5)}T10:00:00.000Z`);
  });

  it('se puede crear una franja para el día de hoy del psicólogo si todavía no ha empezado', async () => {
    // En UTC-12 el día de hoy y las 23:59 locales terminan 12 h después que en UTC.
    const timezone = 'Etc/GMT+12';
    const { psychologist } = await setup(timezone);
    const localToday = new Date().toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD

    const res = await create(psychologist, { day: localToday, hour: '23:59' });
    expect(res.status).toBe(201); // antes se rechazaba: "hoy" a medianoche UTC contaba como pasado
    expect(new Date(res.body.schedules[0].startsAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('una hora que no existe por el cambio de hora da 400 y no crea nada', async () => {
    const { psychologist } = await setup('America/New_York');
    const res = await create(psychologist, { day: '2027-03-14', hour: '02:30', repeatWeeks: 3 });
    expect(res.status).toBe(400);
    expect(await Schedule.countDocuments()).toBe(0);
  });

  it('al editar, se recalcula el instante con la zona actual del psicólogo', async () => {
    const { psychologist } = await setup('America/Bogota');
    const created = await create(psychologist, { day: futureDay(10), hour: '10:00' });
    const id = created.body.schedules[0]._id;

    await User.updateOne({ _id: psychologist.id }, { timezone: 'Europe/Madrid' });
    const res = await request(app).put(`/api/schedule/${id}`).set(auth(psychologist)).send({ hour: '10:00' });
    expect(res.status).toBe(200);
    expect(res.body.schedule.timezone).toBe('Europe/Madrid');
    expect(['09:00', '08:00']).toContain(res.body.schedule.startsAt.slice(11, 16)); // 09:00Z invierno, 08:00Z verano
  });
});

describe('franjas recurrentes (repeatWeeks)', () => {
  const create = (user: Parameters<typeof auth>[0], body: object) =>
    request(app).post('/api/schedule').set(auth(user)).send(body);

  it('crea una franja por semana a la misma hora', async () => {
    const psychologist = await createUser('psicologo');
    const res = await create(psychologist, { day: futureDay(10), hour: '10:00', repeatWeeks: 4 });

    expect(res.status).toBe(201);
    expect(res.body.schedules).toHaveLength(4);
    expect(res.body.skipped).toEqual([]);
    const days = res.body.schedules.map((s: { day: string }) => s.day.slice(0, 10));
    const base = new Date(`${futureDay(10)}T00:00:00Z`).getTime();
    expect(days).toEqual([0, 7, 14, 21].map((d) => new Date(base + d * 86_400_000).toISOString().slice(0, 10)));
    expect((await User.findById(psychologist.id))?.schedules).toHaveLength(4);
  });

  it('omite las que ya existen y devuelve cuáles', async () => {
    const psychologist = await createUser('psicologo');
    await create(psychologist, { day: futureDay(17), hour: '10:00' }); // coincide con la 2.ª semana

    const res = await create(psychologist, { day: futureDay(10), hour: '10:00', repeatWeeks: 3 });
    expect(res.status).toBe(201);
    expect(res.body.schedules).toHaveLength(2);
    expect(res.body.skipped).toEqual([futureDay(17)]);
    expect(await Schedule.countDocuments()).toBe(3);
  });

  it('si ya existían todas, responde 409', async () => {
    const psychologist = await createUser('psicologo');
    await create(psychologist, { day: futureDay(10), hour: '10:00', repeatWeeks: 2 });
    expect((await create(psychologist, { day: futureDay(10), hour: '10:00', repeatWeeks: 2 })).status).toBe(409);
  });

  it('valida repeatWeeks (entero de 1 a 26)', async () => {
    const psychologist = await createUser('psicologo');
    for (const repeatWeeks of [0, 27, -1, 1.5, '3', null]) {
      expect((await create(psychologist, { day: futureDay(10), hour: '10:00', repeatWeeks })).status).toBe(400);
    }
    expect((await create(psychologist, { day: futureDay(10), hour: '10:00', repeatWeeks: 26 })).body.schedules).toHaveLength(26);
  });

  it('day exige formato YYYY-MM-DD y una fecha real', async () => {
    const psychologist = await createUser('psicologo');
    for (const day of ['2026-02-30', '15/12/2026', `${futureDay(10)}T10:00:00Z`, 20261215, undefined]) {
      expect((await create(psychologist, { day, hour: '10:00' })).status).toBe(400);
    }
  });
});
