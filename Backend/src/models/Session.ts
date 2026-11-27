import { Schema, model, Document, Types } from 'mongoose';

/**
 * Sesión de inicio de sesión. Cada login crea una; su `jti` viaja dentro del JWT.
 * Si la sesión no existe (cerrada, caducada, contraseña cambiada, cuenta borrada), el token deja de valer.
 */
export interface ISession extends Document {
  userId: Types.ObjectId;
  jti: string;
  createdAt: Date;
  /** Caducidad: coincide con la del token. MongoDB borra las sesiones caducadas solo (índice TTL). */
  expiresAt: Date;
}

const SessionSchema = new Schema<ISession>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  jti: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
});

export default model<ISession>('Session', SessionSchema);
