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

const appointmentSchema = new Schema<IAppointment>({
  patientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  psychologistId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  scheduleId: { type: Schema.Types.ObjectId, ref: 'Schedule', required: true, unique: true },
  state: { type: String, enum: APPOINTMENT_STATES, default: 'pendiente' },
  time: { type: Date, required: true },
  hour: { type: String, required: true },
  // Evita reenviar el recordatorio en cada ejecución del cron.
  reminderSent: { type: Boolean, default: false },
});

export default mongoose.model<IAppointment>('Appointment', appointmentSchema);
