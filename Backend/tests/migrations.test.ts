import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import Appointment from '../src/models/appointment';
import Schedule from '../src/models/Schedule';
import User from '../src/models/User';
import { runMigrations } from '../src/config/migrations';

describe('migraciones', () => {
  it("corrige el estado inválido 'cancelled' y es idempotente", async () => {
    const id = new mongoose.Types.ObjectId();
    // insertOne directo: Mongoose rechazaría 'cancelled' por el enum
    await Appointment.collection.insertOne({
      patientId: id,
      psychologistId: id,
      scheduleId: id,
      state: 'cancelled',
      time: new Date(),
      hour: '10:00',
    });

    await runMigrations();
    await runMigrations();

    expect((await Appointment.findOne({ scheduleId: id }))?.state).toBe('cancelada');
  });

  it('sustituye el índice único antiguo de scheduleId por el parcial', async () => {
    await Appointment.collection.dropIndexes();
    await Appointment.collection.createIndex({ scheduleId: 1 }, { unique: true, name: 'scheduleId_1' });

    await runMigrations();

    const indexes = await Appointment.collection.indexes();
    const scheduleIndex = indexes.find((i) => i.name === 'scheduleId_1');
    expect(scheduleIndex?.unique).toBe(true);
    expect(scheduleIndex?.partialFilterExpression).toBeTruthy();
  });

  it('completa franjas antiguas con startsAt (día + hora en UTC) y timezone', async () => {
    const id = new mongoose.Types.ObjectId();
    await Schedule.collection.insertOne({ psychologist: id, day: new Date('2026-12-15'), hour: '10:30', isAvailable: true, recurrent: false });

    await runMigrations();
    await runMigrations();

    const migrated = await Schedule.findOne({ psychologist: id });
    expect(migrated?.startsAt.toISOString()).toBe('2026-12-15T10:30:00.000Z');
    expect(migrated?.timezone).toBe('UTC');
  });

  it('da zona horaria a los usuarios antiguos', async () => {
    await User.collection.insertOne({ name: 'Antiguo', email: 'antiguo@example.com', password: 'x', role: 'paciente' });
    await runMigrations();
    expect((await User.findOne({ email: 'antiguo@example.com' }))?.timezone).toBe('UTC');
  });
});
