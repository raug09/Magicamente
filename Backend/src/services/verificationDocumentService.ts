import crypto from 'crypto';
import User from '../models/User';
import DocumentAccessLog from '../models/DocumentAccessLog';
import { getStorage } from '../storage/documentStorage';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { detectFileType } from '../utils/fileType';
import { DocumentKey, DocumentReview, REJECTED_DOCUMENT_RETENTION_DAYS, DOCUMENT_LABELS } from '../utils/verification';
import { reviewsOf } from './verificationService';

/** Cuánto vale un enlace temporal para abrir un documento. */
export const SIGNED_URL_TTL_SECONDS = 300;

const quietRemove = async (key: string): Promise<boolean> => {
  try {
    await getStorage().remove(key);
    return true;
  } catch (error) {
    logger.error({ err: error }, 'No se pudo borrar un documento del almacenamiento');
    return false;
  }
};

/**
 * Un psicólogo sube (o reemplaza) uno de sus documentos.
 *  - El tipo se comprueba por el contenido del archivo (PDF, JPG o PNG), no por la extensión.
 *  - El documento queda «pendiente de revisión»; si la solicitud estaba rechazada, vuelve a pendiente.
 *  - Una cuenta ya aprobada no puede cambiar sus documentos desde aquí.
 */
export const uploadDocumentService = async (userId: string, key: DocumentKey, buffer: Buffer) => {
  const detected = detectFileType(buffer);
  if (!detected) {
    throw new AppError(400, 'Formato no válido: sube un PDF, JPG o PNG');
  }

  const user = await User.findOne({ _id: userId, role: 'psicologo', deletedAt: null });
  if (!user) throw new AppError(404, 'Usuario no encontrado');
  if (user.verificationStatus === 'aprobado') {
    throw new AppError(409, 'Tu cuenta ya está aprobada. Si necesitas cambiar un documento, contacta al equipo.');
  }

  const reviews = reviewsOf(user);
  const previous = reviews.find((r) => r.key === key)?.file?.storageKey;

  const storageKey = `verification/${userId}/${key}/${crypto.randomUUID()}.${detected.extension}`;
  await getStorage().put(storageKey, buffer, detected.contentType);

  const file = { storageKey, contentType: detected.contentType, size: buffer.length, uploadedAt: new Date() };
  if (!user.verificationDocuments?.length) {
    await User.updateOne({ _id: user._id, 'verificationDocuments.0': { $exists: false } }, { $set: { verificationDocuments: reviews } });
  }
  await User.updateOne(
    { _id: user._id, 'verificationDocuments.key': key },
    { $set: { 'verificationDocuments.$.file': file, 'verificationDocuments.$.status': 'pendiente', 'verificationDocuments.$.note': '' } }
  );
  // Corregir un documento devuelve la solicitud a revisión (y borra el motivo anterior).
  await User.updateOne(
    { _id: user._id, verificationStatus: 'rechazado' },
    { $set: { verificationStatus: 'pendiente', verificationUpdatedAt: new Date() }, $unset: { verificationMessage: '' } }
  );

  if (previous) await quietRemove(previous);
  return User.findById(user._id).select('-password');
};

/**
 * Enlace temporal para abrir un documento. Lo puede pedir su dueño (psicólogo) o un administrador;
 * cada acceso queda registrado.
 */
export const getDocumentUrlService = async (requester: { id: string; role: string }, ownerId: string, key: DocumentKey) => {
  if (requester.role !== 'administrador' && requester.id !== ownerId) {
    throw new AppError(403, 'Solo puedes abrir tus propios documentos');
  }
  const owner = await User.findOne({ _id: ownerId, role: 'psicologo', deletedAt: null });
  if (!owner) throw new AppError(404, 'Usuario no encontrado');

  const review = reviewsOf(owner).find((r) => r.key === key);
  if (!review?.file) {
    throw new AppError(404, `${DOCUMENT_LABELS[key]}: todavía no se ha subido`);
  }

  const url = await getStorage().signedUrl(review.file.storageKey, SIGNED_URL_TTL_SECONDS);
  await DocumentAccessLog.create({
    ownerId: owner._id,
    documentKey: key,
    accessedBy: requester.id,
    accessedByRole: requester.role === 'administrador' ? 'administrador' : 'psicologo',
  });
  return { url, expiresInSeconds: SIGNED_URL_TTL_SECONDS, contentType: review.file.contentType };
};

/**
 * Borra del almacenamiento y de la base de datos todos los archivos de un psicólogo.
 * Devuelve true solo si había archivos y TODOS se borraron; si alguno falla, no toca la base de datos
 * (así se reintenta la próxima vez) y devuelve false.
 */
export const deleteAllDocumentsOf = async (userId: unknown): Promise<boolean> => {
  const user = await User.findById(userId);
  if (!user) return false;
  const files = reviewsOf(user).filter((r): r is DocumentReview & { file: NonNullable<DocumentReview['file']> } => Boolean(r.file));
  let allRemoved = true;
  for (const review of files) {
    if (!(await quietRemove(review.file.storageKey))) allRemoved = false;
  }
  if (allRemoved && files.length > 0) {
    await User.updateOne(
      { _id: user._id },
      { $unset: { 'verificationDocuments.$[].file': '' }, $set: { 'verificationDocuments.$[].status': 'pendiente' } }
    );
    return true;
  }
  return false;
};

/**
 * Borra los documentos que ya no deben conservarse:
 *  - los de solicitudes que siguen rechazadas pasados 30 días sin corregirlas;
 *  - los de cuentas eliminadas (por si el almacenamiento falló justo al eliminar la cuenta).
 * Es idempotente: se ejecuta cada noche. Devuelve cuántos psicólogos quedaron sin archivos.
 */
export const cleanupRejectedDocuments = async (now = new Date()): Promise<number> => {
  const cutoff = new Date(now.getTime() - REJECTED_DOCUMENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const candidates = await User.find({
    $or: [{ verificationStatus: 'rechazado', verificationUpdatedAt: { $lte: cutoff } }, { deletedAt: { $ne: null } }],
    'verificationDocuments.file.storageKey': { $exists: true },
  }).select('_id');

  let cleaned = 0;
  for (const { _id } of candidates) {
    try {
      if (await deleteAllDocumentsOf(_id)) cleaned++;
    } catch (error) {
      logger.error({ err: error, userId: String(_id) }, 'No se pudieron borrar los documentos de una solicitud rechazada');
    }
  }
  return cleaned;
};
