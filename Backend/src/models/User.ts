import { Schema, model, Document, Types } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: 'paciente' | 'psicologo' | 'administrador';
  isActive?: boolean;
  studies?: string[];             
  description?: string;
  createdAt: Date;
  schedules?: Types.ObjectId[];   
  /** SHA-256 del token de recuperación enviado por correo (nunca el token en claro). */
  passwordResetTokenHash?: string;
  passwordResetExpires?: Date;
}

const UserSchema = new Schema<IUser>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['paciente', 'psicologo', 'administrador'], default: 'paciente' },
  isActive: { type: Boolean, default: true },
  studies: { type: [String], default: [] },  
  description: { type: String },
  createdAt: { type: Date, default: Date.now },
  schedules: [{ type: Schema.Types.ObjectId, ref: 'Schedule' }],
  passwordResetTokenHash: { type: String, select: false },
  passwordResetExpires: { type: Date, select: false },
});

export default model<IUser>('User', UserSchema);
