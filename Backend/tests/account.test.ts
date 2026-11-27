import { beforeEach, describe, expect, it, vi } from 'vitest';
import User from '../src/models/User';
import Appointment from '../src/models/appointment';
import Schedule from '../src/models/Schedule';
import { app, auth, createScheduleFor, createUser, request, TestUser } from './helpers';

vi.mock('../src/services/emailService', () => ({ sendEmail: vi.fn().mockResolvedValue({ id: 'test' }) }));

import { sendEmail } from '../src/services/emailService';

const book = (patient: TestUser, scheduleId: string) =>
  request(app).post('/api/appointments/appointment').set(auth(patient)).send({ scheduleId });
const del = (actor: TestUser, id: string) => request(app).delete(`/api/users/${id}`).set(auth(actor));

beforeEach(() => {
  vi.mocked(sendEmail).mockClear();
});

describe('GET /api/auth/me', () => {
  it('devuelve el usuario de la sesión, sin contraseña ni datos internos', async () => {
    const user = await createUser('psicologo');
    const res = await request(app).get('/api/auth/me').set(auth(user));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ _id: user.id, email: user.email, role: 'psicologo' });
    expect(res.body.password).toBeUndefined();
    expect(res.body.passwordResetTokenHash).toBeUndefined();
    expect(res.body.passwordChangedAt).toBeUndefined();
  });

  it('exige sesión', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
  });
});

describe('POST /api/auth/register devuelve la sesión iniciada', () => {
  it('incluye un token válido y el usuario', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Luis', email: 'luis@example.com', password: 'secreto123' });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Luis', email: 'luis@example.com', role: 'paciente' });
    expect(res.body.user.password).toBeUndefined();

    const me = await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${res.body.token}` });
    expect(me.status).toBe(200);
    expect(me.body._id).toBe(res.body.user._id);
  });
});

describe('DELETE /api/users/:id elimina la cuenta sin dejar datos huérfanos', () => {
  it('un paciente: se anonimiza, pierde el acceso y su cita pendiente se cancela y libera la franja', async () => {
    const psychologist = await createUser('psicologo');
    const patient = await createUser('paciente');
    const schedule = await createScheduleFor(psychologist.id);
    expect((await book(patient, String(schedule._id))).status).toBe(201);

    expect((await del(patient, patient.id)).status).toBe(200);

    // cuenta anonimizada
    const stored = await User.findById(patient.id);
    expect(stored?.name).toBe('Usuario eliminado');
    expect(stored?.email).toBe(`deleted-${patient.id}@deleted.invalid`);
    expect(stored?.isActive).toBe(false);
    expect(stored?.deletedAt).toBeTruthy();

    // sin acceso: ni con el token ni con la contraseña
    expect((await request(app).get('/api/auth/me').set(auth(patient))).status).toBe(401);
    const login = await request(app).post('/api/auth/login').send({ email: patient.email, password: 'secreto123' });
    expect(login.status).toBe(401);

    // cita cancelada y franja libre otra vez
    expect((await Appointment.findOne())?.state).toBe('cancelada');
    expect((await Schedule.findById(schedule._id))?.isAvailable).toBe(true);

    // se avisa al psicólogo
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(1));
    expect(vi.mocked(sendEmail).mock.calls[0][0]).toBe('appointmentCancelled');
    expect(vi.mocked(sendEmail).mock.calls[0][1]).toBe(psychologist.email);
  });

  it('el email queda libre para volver a registrarse', async () => {
    const patient = await createUser('paciente');
    await del(patient, patient.id);

    const again = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Nuevo', email: patient.email, password: 'secreto123' });
    expect(again.status).toBe(201);
  });

  it('una cuenta eliminada no aparece en el listado de administrador ni en su perfil', async () => {
    const admin = await createUser('administrador');
    const patient = await createUser('paciente');
    await del(patient, patient.id);

    const list = await request(app).get('/api/users').set(auth(admin));
    expect(list.body.map((u: { _id: string }) => u._id)).not.toContain(patient.id);
    expect((await request(app).get(`/api/users/${patient.id}`).set(auth(admin))).status).toBe(404);
    expect((await request(app).put(`/api/users/${patient.id}`).set(auth(admin)).send({ name: 'x' })).status).toBe(404);
    expect((await del(admin, patient.id)).status).toBe(404); // ya eliminada
  });

  it('se conserva el historial: las citas completadas siguen existiendo', async () => {
    const psychologist = await createUser('psicologo');
    const patient = await createUser('paciente');
    const schedule = await createScheduleFor(psychologist.id);
    await book(patient, String(schedule._id));
    await Appointment.updateOne({}, { state: 'completada' });

    await del(patient, patient.id);
    expect((await Appointment.findOne())?.state).toBe('completada');
    expect((await Schedule.findById(schedule._id))?.isAvailable).toBe(false); // sigue ocupada por el historial
  });

  it('un psicólogo: sus franjas libres se borran, las que tienen historial se conservan, y se avisa a sus pacientes', async () => {
    const psychologist = await createUser('psicologo');
    const patient = await createUser('paciente');
    const free = await createScheduleFor(psychologist.id, 10);
    const booked = await createScheduleFor(psychologist.id, 11);
    await book(patient, String(booked._id));

    expect((await del(psychologist, psychologist.id)).status).toBe(200);

    expect(await Schedule.findById(free._id)).toBeNull();
    expect((await Schedule.findById(booked._id))?.isAvailable).toBe(false);
    expect((await Appointment.findOne())?.state).toBe('cancelada');

    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(1));
    expect(vi.mocked(sendEmail).mock.calls[0][1]).toBe(patient.email);

    // ya no aparece como psicólogo
    const list = await request(app).get('/api/psychologists').set(auth(patient));
    expect(list.body.total).toBe(0);
    expect((await request(app).get(`/api/users/${psychologist.id}`).set(auth(patient))).status).toBe(404);
  });

  it('si el correo falla, el borrado se completa igualmente', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error('Resend caído'));
    const psychologist = await createUser('psicologo');
    const patient = await createUser('paciente');
    await book(patient, String((await createScheduleFor(psychologist.id))._id));

    expect((await del(patient, patient.id)).status).toBe(200);
    expect((await Appointment.findOne())?.state).toBe('cancelada');
  });

  it('no se puede eliminar al último administrador, pero sí si hay otro', async () => {
    const admin = await createUser('administrador');
    const res = await del(admin, admin.id);
    expect(res.status).toBe(409);
    expect((await User.findById(admin.id))?.deletedAt).toBeUndefined();

    const second = await createUser('administrador');
    expect((await del(admin, admin.id)).status).toBe(200);
    expect((await del(second, second.id)).status).toBe(409); // ahora el último es el segundo
  });

  it('un administrador desactivado no cuenta como administrador disponible', async () => {
    const admin = await createUser('administrador');
    const inactive = await createUser('administrador');
    await User.updateOne({ _id: inactive.id }, { isActive: false });
    expect((await del(admin, admin.id)).status).toBe(409);
  });
});

describe('reservar con un psicólogo que ya no está disponible', () => {
  it('un psicólogo desactivado no se puede reservar (409)', async () => {
    const psychologist = await createUser('psicologo');
    const patient = await createUser('paciente');
    const schedule = await createScheduleFor(psychologist.id);
    await User.updateOne({ _id: psychologist.id }, { isActive: false });

    const res = await book(patient, String(schedule._id));
    expect(res.status).toBe(409);
    expect(await Appointment.countDocuments()).toBe(0);
    expect((await Schedule.findById(schedule._id))?.isAvailable).toBe(true);
  });
});

describe('zona horaria del usuario', () => {
  it('se puede indicar al registrarse y aparece en /auth/me', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Luis', email: 'luis@example.com', password: 'secreto123', timezone: 'America/Bogota' });
    expect(res.status).toBe(201);
    expect(res.body.user.timezone).toBe('America/Bogota');

    const me = await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${res.body.token}` });
    expect(me.body.timezone).toBe('America/Bogota');
  });

  it('por defecto es UTC y una zona inválida se rechaza al registrarse', async () => {
    const ok = await request(app).post('/api/auth/register').send({ name: 'A', email: 'a@example.com', password: 'secreto123' });
    expect(ok.body.user.timezone).toBe('UTC');

    const bad = await request(app)
      .post('/api/auth/register')
      .send({ name: 'B', email: 'b@example.com', password: 'secreto123', timezone: 'Marte/Olympus' });
    expect(bad.status).toBe(400);
  });

  it('cada uno puede cambiar la suya, y se valida', async () => {
    const user = await createUser('paciente');
    const put = (timezone: unknown) => request(app).put(`/api/users/${user.id}`).set(auth(user)).send({ timezone });

    const ok = await put('Europe/Madrid');
    expect(ok.status).toBe(200);
    expect(ok.body.timezone).toBe('Europe/Madrid');
    expect((await put('Marte/Olympus')).status).toBe(400);
    expect((await put(5)).status).toBe(400);
    expect((await User.findById(user.id))?.timezone).toBe('Europe/Madrid');
  });
});
