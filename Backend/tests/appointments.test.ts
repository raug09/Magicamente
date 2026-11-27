import { describe, expect, it } from 'vitest';
import Appointment from '../src/models/appointment';
import Schedule from '../src/models/Schedule';
import { app, auth, createScheduleFor, createUser, request, TestUser } from './helpers';

const book = (patient: TestUser, body: object) =>
  request(app).post('/api/appointments/appointment').set(auth(patient)).send(body);
const cancel = (user: TestUser, id: string) =>
  request(app).patch(`/api/appointments/appointment/cancel/${id}`).set(auth(user));
const update = (user: TestUser, id: string, body: object) =>
  request(app).patch(`/api/appointments/appointment/update/${id}`).set(auth(user)).send(body);

describe('POST /api/appointments/appointment', () => {
  it('el paciente sale del token y el psicólogo del horario, no del body', async () => {
    const psychologist = await createUser('psicologo');
    const otherPsychologist = await createUser('psicologo');
    const patient = await createUser('paciente');
    const victim = await createUser('paciente');
    const schedule = await createScheduleFor(psychologist.id);

    const res = await book(patient, {
      scheduleId: String(schedule._id),
      patientId: victim.id,
      psychologistId: otherPsychologist.id,
    });

    expect(res.status).toBe(201);
    const appointment = await Appointment.findOne();
    expect(appointment?.patientId.toString()).toBe(patient.id);
    expect(appointment?.psychologistId.toString()).toBe(psychologist.id);
    expect((await Schedule.findById(schedule._id))?.isAvailable).toBe(false);
  });

  it('solo los pacientes pueden reservar', async () => {
    const psychologist = await createUser('psicologo');
    const schedule = await createScheduleFor(psychologist.id);
    const res = await book(psychologist, { scheduleId: String(schedule._id) });
    expect(res.status).toBe(403);
    expect(await Appointment.countDocuments()).toBe(0);
  });

  it('los errores de negocio ya no devuelven 201', async () => {
    const psychologist = await createUser('psicologo');
    const patient = await createUser('paciente');
    const other = await createUser('paciente');
    const schedule = await createScheduleFor(psychologist.id);
    const scheduleId = String(schedule._id);

    expect((await book(patient, {})).status).toBe(400); // falta scheduleId
    expect((await book(patient, { scheduleId: 'no-es-un-id' })).status).toBe(400);
    expect((await book(patient, { scheduleId: '000000000000000000000000' })).status).toBe(404);

    expect((await book(patient, { scheduleId })).status).toBe(201);
    expect((await book(other, { scheduleId })).status).toBe(409); // ya ocupada
  });

  it('rechaza franjas en el pasado', async () => {
    const psychologist = await createUser('psicologo');
    const patient = await createUser('paciente');
    const past = await Schedule.create({ psychologist: psychologist.id, day: new Date('2020-01-01'), hour: '10:00' });
    expect((await book(patient, { scheduleId: String(past._id) })).status).toBe(400);
  });

  it('el mismo paciente no puede tener dos citas a la misma hora', async () => {
    const psychologistA = await createUser('psicologo');
    const psychologistB = await createUser('psicologo');
    const patient = await createUser('paciente');
    const a = await createScheduleFor(psychologistA.id);
    const b = await createScheduleFor(psychologistB.id); // mismo día y hora

    expect((await book(patient, { scheduleId: String(a._id) })).status).toBe(201);
    const res = await book(patient, { scheduleId: String(b._id) });
    expect(res.status).toBe(409);
    expect((await Schedule.findById(b._id))?.isAvailable).toBe(true); // no se bloquea
  });

  it('dos reservas simultáneas de la misma franja: solo una gana', async () => {
    const psychologist = await createUser('psicologo');
    const p1 = await createUser('paciente');
    const p2 = await createUser('paciente');
    const schedule = await createScheduleFor(psychologist.id);

    const [r1, r2] = await Promise.all([
      book(p1, { scheduleId: String(schedule._id) }),
      book(p2, { scheduleId: String(schedule._id) }),
    ]);

    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    expect(await Appointment.countDocuments()).toBe(1);
  });
});

describe('cancelar citas', () => {
  const setup = async () => {
    const psychologist = await createUser('psicologo');
    const patient = await createUser('paciente');
    const stranger = await createUser('paciente');
    const schedule = await createScheduleFor(psychologist.id);
    await book(patient, { scheduleId: String(schedule._id) });
    const appointment = (await Appointment.findOne())!;
    return { psychologist, patient, stranger, schedule, appointmentId: String(appointment._id) };
  };

  it('un usuario ajeno no puede cancelar la cita', async () => {
    const { stranger, appointmentId, schedule } = await setup();
    expect((await cancel(stranger, appointmentId)).status).toBe(403);
    expect((await Appointment.findById(appointmentId))?.state).toBe('pendiente');
    expect((await Schedule.findById(schedule._id))?.isAvailable).toBe(false);
  });

  it("al cancelar, el estado es 'cancelada' y el horario queda libre", async () => {
    const { patient, appointmentId, schedule } = await setup();
    const res = await cancel(patient, appointmentId);
    expect(res.status).toBe(200);
    expect(res.body.appointment.state).toBe('cancelada');
    expect((await Appointment.findById(appointmentId))?.state).toBe('cancelada');
    expect((await Schedule.findById(schedule._id))?.isAvailable).toBe(true);
  });

  it('el psicólogo de la cita también puede cancelarla', async () => {
    const { psychologist, appointmentId } = await setup();
    expect((await cancel(psychologist, appointmentId)).status).toBe(200);
  });

  it('cancelar una cita inexistente devuelve 404', async () => {
    const patient = await createUser('paciente');
    expect((await cancel(patient, '000000000000000000000000')).status).toBe(404);
  });

  it('una franja cancelada se puede volver a reservar', async () => {
    const { patient, stranger, appointmentId, schedule } = await setup();
    await cancel(patient, appointmentId);

    const res = await book(stranger, { scheduleId: String(schedule._id) });
    expect(res.status).toBe(201);
    expect(await Appointment.countDocuments({ state: 'cancelada' })).toBe(1);
    expect(await Appointment.countDocuments({ state: 'pendiente' })).toBe(1);
  });

  it('el mismo paciente puede volver a reservar tras cancelar', async () => {
    const { patient, appointmentId, schedule } = await setup();
    await cancel(patient, appointmentId);
    expect((await book(patient, { scheduleId: String(schedule._id) })).status).toBe(201);
  });

  it('cancelar dos veces no libera una franja que ya reservó otro paciente', async () => {
    const { patient, stranger, appointmentId, schedule } = await setup();
    expect((await cancel(patient, appointmentId)).status).toBe(200);
    expect((await book(stranger, { scheduleId: String(schedule._id) })).status).toBe(201);

    const again = await cancel(patient, appointmentId);
    expect(again.status).toBe(400);
    expect((await Schedule.findById(schedule._id))?.isAvailable).toBe(false);
  });
});

describe('GET /api/appointments/appointment (mis citas)', () => {
  it('el paciente ve sus citas con el psicólogo (sin datos sensibles)', async () => {
    const psychologist = await createUser('psicologo');
    const patient = await createUser('paciente');
    const other = await createUser('paciente');
    const mine = await createScheduleFor(psychologist.id, 10);
    const notMine = await createScheduleFor(psychologist.id, 11);
    await book(patient, { scheduleId: String(mine._id) });
    await book(other, { scheduleId: String(notMine._id) });

    const res = await request(app).get('/api/appointments/appointment').set(auth(patient));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].psychologistId.name).toBeTruthy();
    expect(res.body[0].psychologistId.password).toBeUndefined();
    expect(res.body[0].psychologistId.email).toBeUndefined();
    expect(res.body[0].scheduleId.hour).toBe('10:00');
  });

  it('el psicólogo ve las citas de sus pacientes ordenadas por fecha', async () => {
    const psychologist = await createUser('psicologo');
    const patient = await createUser('paciente');
    const later = await createScheduleFor(psychologist.id, 12);
    const sooner = await createScheduleFor(psychologist.id, 10);
    await book(patient, { scheduleId: String(later._id) });
    await book(patient, { scheduleId: String(sooner._id) });

    const res = await request(app).get('/api/appointments/appointment').set(auth(psychologist));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(new Date(res.body[0].time) < new Date(res.body[1].time)).toBe(true);
    expect(res.body[0].patientId.email).toBe(patient.email);
    expect(res.body[0].patientId.password).toBeUndefined();
  });

  it('un administrador no tiene citas propias (403) y sin sesión da 401', async () => {
    const admin = await createUser('administrador');
    expect((await request(app).get('/api/appointments/appointment').set(auth(admin))).status).toBe(403);
    expect((await request(app).get('/api/appointments/appointment')).status).toBe(401);
  });
});

describe('PATCH /api/appointments/appointment/update/:id (completar)', () => {
  const createAppointment = async (daysFromNow: number) => {
    const psychologist = await createUser('psicologo');
    const patient = await createUser('paciente');
    const schedule = await Schedule.create({
      psychologist: psychologist.id,
      day: new Date(new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10)),
      hour: '00:00',
      isAvailable: false,
    });
    const appointment = await Appointment.create({
      patientId: patient.id,
      psychologistId: psychologist.id,
      scheduleId: schedule._id,
      time: new Date(Date.now() + daysFromNow * 86_400_000),
      hour: '00:00',
    });
    return { psychologist, patient, id: String(appointment._id) };
  };

  it('el psicólogo puede completar una cita que ya ocurrió', async () => {
    const { psychologist, id } = await createAppointment(-1);
    const res = await update(psychologist, id, { state: 'completada' });
    expect(res.status).toBe(200);
    expect(res.body.updatedAppointment.state).toBe('completada');
  });

  it('no se puede completar una cita futura', async () => {
    const { psychologist, id } = await createAppointment(5);
    expect((await update(psychologist, id, { state: 'completada' })).status).toBe(400);
  });

  it('el paciente no puede marcarla como completada', async () => {
    const { patient, id } = await createAppointment(-1);
    expect((await update(patient, id, { state: 'completada' })).status).toBe(403);
    expect((await Appointment.findById(id))?.state).toBe('pendiente');
  });

  it('un usuario ajeno no puede modificarla', async () => {
    const { id } = await createAppointment(-1);
    const stranger = await createUser('psicologo');
    expect((await update(stranger, id, { state: 'completada' })).status).toBe(403);
  });

  it('no se puede completar dos veces ni una cita cancelada', async () => {
    const { psychologist, id } = await createAppointment(-1);
    expect((await update(psychologist, id, { state: 'completada' })).status).toBe(200);
    expect((await update(psychologist, id, { state: 'completada' })).status).toBe(400);

    await Appointment.updateOne({ _id: id }, { state: 'cancelada' });
    expect((await update(psychologist, id, { state: 'completada' })).status).toBe(400);
  });

  it('rechaza otros campos y otros estados', async () => {
    const { psychologist, patient, id } = await createAppointment(-1);
    expect((await update(psychologist, id, { patientId: patient.id })).status).toBe(403);
    expect((await update(psychologist, id, { state: 'cancelada' })).status).toBe(400);
    expect((await update(psychologist, id, { state: 'pendiente' })).status).toBe(400);
    expect((await update(psychologist, id, { state: 'inventado' })).status).toBe(400);
    expect((await update(psychologist, id, {})).status).toBe(400);
    expect((await Appointment.findById(id))?.patientId.toString()).toBe(patient.id);
  });
});
