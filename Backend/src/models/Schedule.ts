import { Schema, model, Document, Types } from 'mongoose';

export interface ISchedule extends Document {
  psychologist: Types.ObjectId; 
  day: Date;                   
  hour: string;                    
  isAvailable: boolean;
  recurrent: boolean;
  createdAt: Date;
}

const ScheduleSchema = new Schema<ISchedule>({
  psychologist: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  day: { type: Date, required: true },
  hour: { type: String, required: true },
  isAvailable: { type: Boolean, default: true },
  recurrent: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

export default model<ISchedule>('Schedule', ScheduleSchema);
