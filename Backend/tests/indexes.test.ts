import { describe, expect, it } from 'vitest';
import Appointment from '../src/models/appointment';
import Schedule from '../src/models/Schedule';
import User from '../src/models/User';

/** Claves de los índices de una colección, como listas de campos (p. ej. "patientId,time"). */
const keysOf = async (collection: { indexes(): Promise<unknown> }): Promise<string[]> =>
  ((await collection.indexes()) as Array<{ key: Record<string, number> }>).map((index) => Object.keys(index.key).join(','));

describe('índices de consultas frecuentes', () => {
  it('citas: por paciente, por psicólogo y para el recordatorio', async () => {
    const keys = await keysOf(Appointment.collection);
    expect(keys).toEqual(expect.arrayContaining(['patientId,time', 'psychologistId,time', 'state,reminderSent,time']));
  });

  it('franjas: por psicólogo y fecha de inicio, y el índice único de día y hora', async () => {
    const keys = await keysOf(Schedule.collection);
    expect(keys).toEqual(expect.arrayContaining(['psychologist,startsAt', 'psychologist,day,hour']));
  });

  it('usuarios: el listado de psicólogos', async () => {
    const keys = await keysOf(User.collection);
    expect(keys).toEqual(expect.arrayContaining(['role,approved,isActive']));
  });
});
