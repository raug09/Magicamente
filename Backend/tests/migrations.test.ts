import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import Appointment from '../src/models/appointment';
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
});
