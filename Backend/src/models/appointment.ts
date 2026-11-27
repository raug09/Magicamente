import mongoose, { Schema, Document } from 'mongoose';

export const APPOINTMENT_STATES = ['pendiente', 'completada', 'cancelada'] as const;
export type AppointmentState = (typeof APPOINTMENT_STATES)[number];

export interface IAppointment extends Document {
  patientId: mongoose.Types.ObjectId;
  psychologistId: mongoose.Types.ObjectId;
  scheduleId: mongoose.Types.ObjectId;
  state: AppointmentState;
  time: Date;
  hour: string;
  reminderSent: boolean;
}

const appointmentSchema = new Schema<IAppointment>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    psychologistId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    scheduleId: { type: Schema.Types.ObjectId, ref: 'Schedule', required: true },
    state: { type: String, enum: APPOINTMENT_STATES, default: 'pendiente' },
    time: { type: Date, required: true },
    hour: { type: String, required: true },
    // Evita reenviar el recordatorio en cada ejecución del cron.
    reminderSent: { type: Boolean, default: false },
  },
  // Los índices se sincronizan a mano al arrancar (config/migrations.ts): así se reemplaza
  // el índice único antiguo sin depender del orden de creación automática.
  { autoIndex: false }
);

// Una franja solo puede tener UNA cita viva (pendiente o completada). Las canceladas no cuentan,
// así que una franja cancelada se puede volver a reservar.
appointmentSchema.index(
  { scheduleId: 1 },
  { unique: true, partialFilterExpression: { state: { $in: ['pendiente', 'completada'] } } }
);

export default mongoose.model<IAppointment>('Appointment', appointmentSchema);
