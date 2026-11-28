import { describe, expect, it } from 'vitest';
import Schedule from '../src/models/Schedule';
import Appointment from '../src/models/appointment';
import { app, auth, createScheduleFor, createUser, futureDay, request } from './helpers';

describe('paginación de citas', () => {
  const setup = async (count: number) => {
    const psychologist = await createUser('psicologo');
    const patient = await createUser('paciente');
    for (let i = 0; i < count; i++) {
      const schedule = await createScheduleFor(psychologist.id, 10 + i, '10:00');
      await Appointment.create({
        patientId: patient.id,
        psychologistId: psychologist.id,
        scheduleId: schedule._id,
        time: new Date(Date.now() + (10 + i) * 86_400_000),
        hour: '10:00',
      });
    }
    return { psychologist, patient };
  };

  it('devuelve total, página, límite, páginas e items', async () => {
    const { patient } = await setup(5);
    const res = await request(app).get('/api/appointments/appointment?page=1&limit=2').set(auth(patient));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 5, page: 1, limit: 2, pages: 3 });
    expect(res.body.items).toHaveLength(2);
  });

  it('las páginas no se solapan y la última tiene el resto', async () => {
    const { patient } = await setup(5);
    const ids = new Set<string>();
    for (const page of [1, 2, 3]) {
      const res = await request(app).get(`/api/appointments/appointment?page=${page}&limit=2`).set(auth(patient));
      for (const item of res.body.items) ids.add(item._id);
    }
    expect(ids.size).toBe(5);
    const last = await request(app).get('/api/appointments/appointment?page=3&limit=2').set(auth(patient));
    expect(last.body.items).toHaveLength(1);
  });

  it('por defecto: página 1 y 20 por página; la página fuera de rango llega vacía', async () => {
    const { patient } = await setup(3);
    const res = await request(app).get('/api/appointments/appointment').set(auth(patient));
    expect(res.body).toMatchObject({ page: 1, limit: 20, pages: 1, total: 3 });

    const far = await request(app).get('/api/appointments/appointment?page=9').set(auth(patient));
    expect(far.body.items).toEqual([]);
    expect(far.body.total).toBe(3);
  });

  it('el límite máximo es 50 y los valores no válidos dan 400', async () => {
    const { patient } = await setup(1);
    const big = await request(app).get('/api/appointments/appointment?limit=500').set(auth(patient));
    expect(big.body.limit).toBe(50);
    for (const query of ['page=0', 'page=abc', 'limit=0', 'limit=-3']) {
      expect((await request(app).get(`/api/appointments/appointment?${query}`).set(auth(patient))).status).toBe(400);
    }
  });

  it('el psicólogo también recibe la lista paginada', async () => {
    const { psychologist } = await setup(3);
    const res = await request(app).get('/api/appointments/appointment?limit=2').set(auth(psychologist));
    expect(res.body).toMatchObject({ total: 3, limit: 2, pages: 2 });
    expect(res.body.items).toHaveLength(2);
  });
});

describe('paginación de franjas', () => {
  it('pagina y mantiene el orden por instante de inicio', async () => {
    const psychologist = await createUser('psicologo');
    const patient = await createUser('paciente');
    for (let i = 0; i < 5; i++) await createScheduleFor(psychologist.id, 10 + i, '10:00');

    const page1 = await request(app).get(`/api/schedule/${psychologist.id}?limit=2&page=1`).set(auth(patient));
    const page2 = await request(app).get(`/api/schedule/${psychologist.id}?limit=2&page=2`).set(auth(patient));

    expect(page1.body).toMatchObject({ total: 5, page: 1, limit: 2, pages: 3 });
    expect(page1.body.items).toHaveLength(2);
    expect(new Date(page1.body.items[0].startsAt) < new Date(page2.body.items[0].startsAt)).toBe(true);
    expect(await Schedule.countDocuments({ psychologist: psychologist.id })).toBe(5);
  });

  it('los filtros se aplican antes de contar', async () => {
    const psychologist = await createUser('psicologo');
    const patient = await createUser('paciente');
    for (let i = 0; i < 4; i++) await createScheduleFor(psychologist.id, 10 + i, '10:00');
    await Schedule.updateOne({ psychologist: psychologist.id, day: new Date(futureDay(10)) }, { isAvailable: false });

    const res = await request(app).get(`/api/schedule/${psychologist.id}?available=true&limit=10`).set(auth(patient));
    expect(res.body.total).toBe(3);
    expect(res.body.items).toHaveLength(3);
  });

  it('valida page y limit en las franjas', async () => {
    const psychologist = await createUser('psicologo');
    const patient = await createUser('paciente');
    expect((await request(app).get(`/api/schedule/${psychologist.id}?page=0`).set(auth(patient))).status).toBe(400);
    expect((await request(app).get(`/api/schedule/${psychologist.id}?limit=x`).set(auth(patient))).status).toBe(400);
  });
});
