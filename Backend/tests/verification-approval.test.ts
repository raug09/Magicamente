import { beforeEach, describe, expect, it, vi } from 'vitest';
import Appointment from '../src/models/appointment';
import Schedule from '../src/models/Schedule';
import User from '../src/models/User';
import { app, auth, createScheduleFor, createUser, futureDay, request, TestUser } from './helpers';

vi.mock('../src/services/emailService', () => ({ sendEmail: vi.fn().mockResolvedValue({ id: 'test' }) }));

import { sendEmail } from '../src/services/emailService';

const register = (body: object) => request(app).post('/api/auth/register').send(body);
const login = (email: string, password = 'secreto123') => request(app).post('/api/auth/login').send({ email, password });
const verify = (token: unknown) => request(app).post('/api/auth/verify-email').send({ token });
const resend = (email: unknown) => request(app).post('/api/auth/resend-verification').send({ email });

/** Llamadas al envío de correo de un tipo y destinatario concretos. */
const mailsTo = (template: string, email: string) =>
  (vi.mocked(sendEmail).mock.calls as unknown as unknown[][]).filter((call) => call[0] === template && call[1] === email);

/** Token que llegó en el último correo de verificación enviado a ese email. */
const tokenFromLastMail = async (email: string, expected = 1): Promise<string> => {
  await vi.waitFor(() => expect(mailsTo('verifyEmail', email).length).toBeGreaterThanOrEqual(expected));
  const last = mailsTo('verifyEmail', email).at(-1)!;
  return new URL(last[3] as string).searchParams.get('token')!;
};

beforeEach(() => {
  vi.mocked(sendEmail).mockClear();
});

describe('verificación de email', () => {
  it('al registrarse se envía un correo con enlace de verificación', async () => {
    await register({ name: 'Luis', email: 'luis@example.com', password: 'secreto123' });
    const token = await tokenFromLastMail('luis@example.com');

    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const stored = await User.findOne({ email: 'luis@example.com' }).select('+emailVerificationTokenHash');
    expect(stored?.emailVerified).toBe(false);
    expect(stored?.emailVerificationTokenHash).toBeTruthy();
    expect(stored?.emailVerificationTokenHash).not.toBe(token); // solo se guarda el hash
  });

  it('sin verificar no se puede iniciar sesión, pero la contraseña incorrecta sigue dando 401', async () => {
    await register({ name: 'Luis', email: 'luis@example.com', password: 'secreto123' });
    const blocked = await login('luis@example.com');
    const wrong = await login('luis@example.com', 'otra-clave');

    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toMatch(/confirmar tu email/);
    expect(wrong.status).toBe(401);
  });

  it('con el enlace se confirma el email y ya se puede iniciar sesión', async () => {
    await register({ name: 'Luis', email: 'luis@example.com', password: 'secreto123' });
    const token = await tokenFromLastMail('luis@example.com');

    expect((await verify(token)).status).toBe(200);
    expect((await login('luis@example.com')).status).toBe(200);
  });

  it('el enlace solo se puede usar una vez', async () => {
    await register({ name: 'Luis', email: 'luis@example.com', password: 'secreto123' });
    const token = await tokenFromLastMail('luis@example.com');

    expect((await verify(token)).status).toBe(200);
    expect((await verify(token)).status).toBe(400);
  });

  it('un enlace caducado no sirve', async () => {
    await register({ name: 'Luis', email: 'luis@example.com', password: 'secreto123' });
    const token = await tokenFromLastMail('luis@example.com');
    await User.updateOne({ email: 'luis@example.com' }, { emailVerificationExpires: new Date(Date.now() - 1000) });

    const res = await verify(token);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/caducado/);
    expect((await User.findOne({ email: 'luis@example.com' }))?.emailVerified).toBe(false);
  });

  it('tokens inventados o mal formados dan 400', async () => {
    expect((await verify('a'.repeat(64))).status).toBe(400);
    expect((await verify(undefined)).status).toBe(400);
    expect((await verify({ $ne: null })).status).toBe(400);
  });

  it('reenviar: genera un enlace nuevo que invalida el anterior, con un minuto de espera', async () => {
    await register({ name: 'Luis', email: 'luis@example.com', password: 'secreto123' });
    const first = await tokenFromLastMail('luis@example.com');

    // dentro del minuto no se envía nada
    expect((await resend('luis@example.com')).status).toBe(200);
    expect(mailsTo('verifyEmail', 'luis@example.com')).toHaveLength(1);

    // pasado el minuto sí
    await User.updateOne({ email: 'luis@example.com' }, { emailVerificationSentAt: new Date(Date.now() - 2 * 60_000) });
    expect((await resend('luis@example.com')).status).toBe(200);
    const second = await tokenFromLastMail('luis@example.com', 2);

    expect(second).not.toBe(first);
    expect((await verify(first)).status).toBe(400);
    expect((await verify(second)).status).toBe(200);
  });

  it('reenviar responde igual para cuentas inexistentes o ya verificadas, y no envía nada', async () => {
    const verified = await createUser('paciente');
    const unknown = await resend('nadie@example.com');
    const known = await resend(verified.email);

    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('reenviar exige un email con formato válido', async () => {
    expect((await resend('no-es-un-email')).status).toBe(400);
    expect((await resend(undefined)).status).toBe(400);
  });
});

describe('aprobación de psicólogos', () => {
  const approveRequest = (admin: TestUser, id: string, approved: boolean) =>
    request(app).put(`/api/users/${id}`).set(auth(admin)).send({ approved });

  it('los psicólogos empiezan sin aprobar y los pacientes ya aprobados', async () => {
    await register({ name: 'Ana', email: 'ana@example.com', password: 'secreto123', role: 'psicologo' });
    await register({ name: 'Luis', email: 'luis@example.com', password: 'secreto123' });

    expect((await User.findOne({ email: 'ana@example.com' }))?.approved).toBe(false);
    expect((await User.findOne({ email: 'luis@example.com' }))?.approved).toBe(true);
  });

  it('un psicólogo pendiente puede iniciar sesión pero no publicar franjas', async () => {
    const psychologist = await createUser('psicologo');
    await User.updateOne({ _id: psychologist.id }, { approved: false });

    expect((await login(psychologist.email)).status).toBe(200);
    const res = await request(app)
      .post('/api/schedule')
      .set(auth(psychologist))
      .send({ day: futureDay(10), hour: '10:00' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/pendiente de aprobación/);
  });

  it('un psicólogo pendiente no aparece en el listado ni se puede reservar', async () => {
    const patient = await createUser('paciente');
    const psychologist = await createUser('psicologo');
    const schedule = await createScheduleFor(psychologist.id);
    await User.updateOne({ _id: psychologist.id }, { approved: false });

    const list = await request(app).get('/api/psychologists').set(auth(patient));
    expect(list.body.total).toBe(0);
    expect((await request(app).get(`/api/users/${psychologist.id}`).set(auth(patient))).status).toBe(404);

    const booked = await request(app)
      .post('/api/appointments/appointment')
      .set(auth(patient))
      .send({ scheduleId: String(schedule._id) });
    expect(booked.status).toBe(409);
  });

  it('un paciente no puede aprobarse a sí mismo ni a otros', async () => {
    const patient = await createUser('paciente');
    expect((await approveRequest(patient, patient.id, true)).status).toBe(403);
  });

  it('el administrador aprueba a un psicólogo, que entonces ya puede publicar', async () => {
    const admin = await createUser('administrador');
    const psychologist = await createUser('psicologo');
    await User.updateOne({ _id: psychologist.id }, { approved: false });

    expect((await approveRequest(admin, psychologist.id, true)).status).toBe(200);
    const res = await request(app)
      .post('/api/schedule')
      .set(auth(psychologist))
      .send({ day: futureDay(10), hour: '10:00' });
    expect(res.status).toBe(201);
  });

  it('el administrador puede revocar la aprobación', async () => {
    const admin = await createUser('administrador');
    const psychologist = await createUser('psicologo');
    expect((await approveRequest(admin, psychologist.id, false)).status).toBe(200);

    const patient = await createUser('paciente');
    expect((await request(app).get('/api/psychologists').set(auth(patient))).body.total).toBe(0);
  });

  it('solo se aprueba a psicólogos (400 para pacientes) y el valor debe ser booleano', async () => {
    const admin = await createUser('administrador');
    const patient = await createUser('paciente');
    expect((await approveRequest(admin, patient.id, true)).status).toBe(400);
    expect((await request(app).put(`/api/users/${patient.id}`).set(auth(admin)).send({ approved: 'si' })).status).toBe(400);
  });
});

describe('cancelar una cita que ya pasó', () => {
  it('no se puede cancelar aunque siga pendiente (400)', async () => {
    const psychologist = await createUser('psicologo');
    const patient = await createUser('paciente');
    const schedule = await createScheduleFor(psychologist.id);
    const past = await Appointment.create({
      patientId: patient.id,
      psychologistId: psychologist.id,
      scheduleId: schedule._id,
      time: new Date(Date.now() - 60 * 60 * 1000),
      hour: '10:00',
    });

    const res = await request(app).patch(`/api/appointments/appointment/cancel/${String(past._id)}`).set(auth(patient));
    expect(res.status).toBe(400);
    expect((await Appointment.findById(past._id))?.state).toBe('pendiente');
  });
});

describe('franjas duplicadas', () => {
  it('la base de datos rechaza dos franjas con el mismo psicólogo, día y hora', async () => {
    const psychologist = await createUser('psicologo');
    await createScheduleFor(psychologist.id, 10, '10:00');

    await expect(
      Schedule.create({ psychologist: psychologist.id, day: new Date(futureDay(10)), hour: '10:00', startsAt: new Date() })
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('la misma hora con otro psicólogo sí se permite', async () => {
    const a = await createUser('psicologo');
    const b = await createUser('psicologo');
    await createScheduleFor(a.id, 10, '10:00');
    await expect(createScheduleFor(b.id, 10, '10:00')).resolves.toBeTruthy();
  });

  it('crear una serie repetida reporta como omitidas las que ya existían', async () => {
    const psychologist = await createUser('psicologo');
    const res = await request(app)
      .post('/api/schedule')
      .set(auth(psychologist))
      .send({ day: futureDay(10), hour: '10:00', repeatWeeks: 2 });
    expect(res.status).toBe(201);
    const again = await request(app)
      .post('/api/schedule')
      .set(auth(psychologist))
      .send({ day: futureDay(10), hour: '10:00', repeatWeeks: 3 });
    expect(again.body.skipped).toHaveLength(2);
    expect(again.body.schedules).toHaveLength(1);
  });
});
