import { describe, expect, it } from 'vitest';
import Appointment from '../src/models/appointment';
import Schedule from '../src/models/Schedule';
import { app, auth, createScheduleFor, createUser, request } from './helpers';

const book = (patient: Parameters<typeof auth>[0], body: object) =>
  request(app).post('/api/appointments/appointment').set(auth(patient)).send(body);

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
});

describe('cancelar y modificar citas', () => {
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
    const res = await request(app).patch(`/api/appointments/appointment/cancel/${appointmentId}`).set(auth(stranger));
    expect(res.status).toBe(403);
    expect((await Appointment.findById(appointmentId))?.state).toBe('pendiente');
    expect((await Schedule.findById(schedule._id))?.isAvailable).toBe(false);
  });

  it('el paciente de la cita puede cancelarla y el horario queda libre', async () => {
    const { patient, appointmentId, schedule } = await setup();
    const res = await request(app).patch(`/api/appointments/appointment/cancel/${appointmentId}`).set(auth(patient));
    expect(res.status).toBe(200);
    expect((await Schedule.findById(schedule._id))?.isAvailable).toBe(true);
  });

  it('el psicólogo de la cita también puede cancelarla', async () => {
    const { psychologist, appointmentId } = await setup();
    const res = await request(app).patch(`/api/appointments/appointment/cancel/${appointmentId}`).set(auth(psychologist));
    expect(res.status).toBe(200);
  });

  it('cancelar una cita inexistente devuelve 404', async () => {
    const patient = await createUser('paciente');
    const res = await request(app)
      .patch('/api/appointments/appointment/cancel/000000000000000000000000')
      .set(auth(patient));
    expect(res.status).toBe(404);
  });

  it('un usuario ajeno no puede modificar la cita', async () => {
    const { stranger, appointmentId } = await setup();
    const res = await request(app)
      .patch(`/api/appointments/appointment/update/${appointmentId}`)
      .set(auth(stranger))
      .send({ state: 'completada' });
    expect(res.status).toBe(403);
  });

  it('no se pueden modificar campos fuera de la lista permitida', async () => {
    const { patient, stranger, appointmentId } = await setup();
    const res = await request(app)
      .patch(`/api/appointments/appointment/update/${appointmentId}`)
      .set(auth(patient))
      .send({ patientId: stranger.id });
    expect(res.status).toBe(403);
    expect((await Appointment.findById(appointmentId))?.patientId.toString()).toBe(patient.id);
  });

  it('rechaza estados inválidos', async () => {
    const { patient, appointmentId } = await setup();
    const res = await request(app)
      .patch(`/api/appointments/appointment/update/${appointmentId}`)
      .set(auth(patient))
      .send({ state: 'inventado' });
    expect(res.status).toBe(400);
  });

  it('un participante puede cambiar el estado (más de 24 h antes)', async () => {
    const { psychologist, appointmentId } = await setup();
    const res = await request(app)
      .patch(`/api/appointments/appointment/update/${appointmentId}`)
      .set(auth(psychologist))
      .send({ state: 'completada' });
    expect(res.status).toBe(200);
    expect(res.body.updatedAppointment.state).toBe('completada');
  });
});
