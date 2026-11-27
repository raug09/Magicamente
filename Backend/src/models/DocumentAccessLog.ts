import { Schema, model, Document, Types } from 'mongoose';

/** Quién abrió qué documento y cuándo. Los documentos de identidad son datos sensibles: cada acceso queda registrado. */
export interface IDocumentAccessLog extends Document {
  /** Psicólogo dueño del documento. */
  ownerId: Types.ObjectId;
  documentKey: string;
  /** Quien lo abrió (el propio psicólogo o un administrador). */
  accessedBy: Types.ObjectId;
  accessedByRole: 'psicologo' | 'administrador';
  accessedAt: Date;
}

const DocumentAccessLogSchema = new Schema<IDocumentAccessLog>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  documentKey: { type: String, required: true },
  accessedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  accessedByRole: { type: String, enum: ['psicologo', 'administrador'], required: true },
  accessedAt: { type: Date, default: Date.now },
});

export default model<IDocumentAccessLog>('DocumentAccessLog', DocumentAccessLogSchema);
