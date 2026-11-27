import { Schema, model, Document, Types } from 'mongoose';
import { zonedTimeToUtc } from '../utils/timezone';

export interface ISchedule extends Document {
  psychologist: Types.ObjectId;
  /** Día del calendario del psicólogo (medianoche UTC), p. ej. 2026-12-15T00:00:00.000Z. */
  day: Date;
  /** Hora de pared del psicólogo, "HH:mm". */
  hour: string;
  /** Zona horaria del psicólogo al crear la franja; `day` y `hour` están expresados en ella. */
  timezone: string;
  /** Instante real (UTC) en que empieza la franja: `day` + `hour` en `timezone`. */
  startsAt: Date;
  isAvailable: boolean;
  createdAt: Date;
}

const ScheduleSchema = new Schema<ISchedule>(
  {
    psychologist: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    day: { type: Date, required: true },
    hour: { type: String, required: true },
    timezone: { type: String, default: 'UTC' },
    startsAt: { type: Date },
    isAvailable: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
  },
  // Los índices se sincronizan al arrancar (config/migrations.ts), no automáticamente.
  { autoIndex: false }
);

// Una franja por día y hora para cada psicólogo. La base de datos rechaza duplicados aunque
// dos peticiones lleguen a la vez (el código de error es 11000).
ScheduleSchema.index({ psychologist: 1, day: 1, hour: 1 }, { unique: true });

// `startsAt` siempre es coherente con día, hora y zona, incluso si una franja se crea sin indicarlo.
ScheduleSchema.pre('validate', function (next) {
  if (!this.startsAt && this.day && this.hour) {
    this.startsAt = zonedTimeToUtc(this.day.toISOString().slice(0, 10), this.hour, this.timezone || 'UTC');
  }
  next();
});

ScheduleSchema.path('startsAt').required(true);

export default model<ISchedule>('Schedule', ScheduleSchema);
