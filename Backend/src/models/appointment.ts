import mongoose, { Schema, Document } from 'mongoose';

export interface IAppointment extends Document {
    patientId: mongoose.Types.ObjectId;
    psychologistId: mongoose.Types.ObjectId;
    scheduleId: mongoose.Types.ObjectId;
    state: 'pendiente' | 'completada' | 'cancelada';
    time: Date;
    hour: string;
}

const appointmentSchema = new Schema<IAppointment>({
    patientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    psychologistId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    scheduleId: { type: Schema.Types.ObjectId, ref: 'Schedule', required: true, unique: true},
    state: { type: String, enum: ['pendiente', 'completada', 'cancelada'], default: 'pendiente' },
    time: { type: Date, required: true },
    hour: { type: String, required: true },
});

export default mongoose.model<IAppointment>('Appointment', appointmentSchema);
