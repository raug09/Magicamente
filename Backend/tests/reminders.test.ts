import { beforeEach, describe, expect, it, vi } from 'vitest';
import Appointment from '../src/models/appointment';
import { createScheduleFor, createUser } from './helpers';

vi.mock('../src/services/emailService', () => ({ sendEmail: vi.fn().mockResolvedValue({ id: 'test' }) }));

import { sendEmail } from '../src/services/emailService';
import { formatAppointmentDate, sendAppointmentReminders } from '../src/config/cronJobs';

const HOUR = 60 * 60 * 1000;

const createAppointment = async (inHours: number, state: 'pendiente' | 'cancelada' = 'pendiente') => {
  const psychologist = await createUser('psicologo');
  const patient = await createUser('paciente');
  const schedule = await createScheduleFor(psychologist.id);
  const appointment = await Appointment.create({
    patientId: patient.id,
    psychologistId: psychologist.id,
    scheduleId: schedule._id,
    time: new Date(Date.now() + inHours * HOUR),
    hour: '10:00',
    state,
  });
  return { appointment, patient };
};

describe('recordatorios de citas', () => {
  beforeEach(() => {
    vi.mocked(sendEmail).mockClear();
  });

  it('envía un solo recordatorio por cita aunque el cron se ejecute varias veces', async () => {
    const { appointment, patient } = await createAppointment(20);

    expect(await sendAppointmentReminders()).toBe(1);
    expect(await sendAppointmentReminders()).toBe(0);
    expect(await sendAppointmentReminders()).toBe(0);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0]).toBe('appointmentReminder');
    expect(vi.mocked(sendEmail).mock.calls[0][1]).toBe(patient.email);
    expect((await Appointment.findById(appointment._id))?.reminderSent).toBe(true);
  });

  it('no avisa de citas a más de 24 h, pasadas o canceladas', async () => {
    await createAppointment(30);
    await createAppointment(-2);
    await createAppointment(5, 'cancelada');

    expect(await sendAppointmentReminders()).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('si el envío falla, lo reintenta en la siguiente ejecución', async () => {
    const { appointment } = await createAppointment(10);
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error('Resend caído'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await sendAppointmentReminders()).toBe(0);
    expect((await Appointment.findById(appointment._id))?.reminderSent).toBe(false);

    expect(await sendAppointmentReminders()).toBe(1);
  });

  it('formatea fecha completa y hora con minutos', () => {
    const { date, hour } = formatAppointmentDate(new Date('2026-12-15T09:30:00Z'), 'UTC');
    expect(date).toContain('15');
    expect(date).toContain('diciembre');
    expect(date).toContain('2026');
    expect(hour).toBe('09:30');
  });
});
