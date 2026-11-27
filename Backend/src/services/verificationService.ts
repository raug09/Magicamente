import User from '../models/User';
import { AppError } from '../utils/AppError';
import { sendEmail } from './emailService';
import { getFrontendUrl } from '../config/env';
import { logger } from '../utils/logger';
import {
  DOCUMENT_LABELS,
  DocumentKey,
  DocumentReview,
  DocumentReviewStatus,
  PSYCHOLOGIST_DOCUMENT_KEYS,
  VerificationStatus,
  initialDocumentReviews,
} from '../utils/verification';
import { DocumentLine } from '../config/emailTemplates';

export interface VerificationInput {
  status: VerificationStatus;
  /** Obligatorio al rechazar: el motivo que verá el psicólogo. */
  message?: string;
  /** Revisión de documentos a aplicar en esta petición. Los que no vienen se mantienen. */
  documents?: Array<{ key: DocumentKey; status: Exclude<DocumentReviewStatus, 'pendiente'>; note?: string }>;
}

/** Mensaje visible en la respuesta según el estado (lo ve el psicólogo en su perfil). */
/** La revisión de documentos de un psicólogo, con su archivo si ya lo subió. Si no hay ninguna, la inicial. */
export const reviewsOf = (user: {
  verificationDocuments?: Array<{
    key?: string;
    status?: string;
    note?: string;
    file?: { storageKey?: string | null; contentType?: string | null; size?: number | null; uploadedAt?: Date | null } | null;
  }>;
}): DocumentReview[] =>
  user.verificationDocuments?.length
    ? user.verificationDocuments.map((r) => ({
        key: r.key as DocumentKey,
        status: r.status as DocumentReviewStatus,
        note: r.note,
        ...(r.file?.storageKey && {
          file: {
            storageKey: r.file.storageKey,
            contentType: r.file.contentType ?? 'application/octet-stream',
            size: r.file.size ?? 0,
            uploadedAt: r.file.uploadedAt ?? new Date(0),
          },
        }),
      }))
    : initialDocumentReviews();

export const statusMessage = (status?: VerificationStatus): string | undefined => {
  if (status === 'rechazado') return 'Tu solicitud fue rechazada. Revisa el motivo y los documentos señalados.';
  if (status === 'pendiente') return 'Tu cuenta está pendiente de aprobación.';
  return undefined;
};

const documentLines = (reviews: DocumentReview[]): DocumentLine[] =>
  PSYCHOLOGIST_DOCUMENT_KEYS.map((key) => {
    const review = reviews.find((r) => r.key === key);
    return { label: DOCUMENT_LABELS[key], status: review?.status ?? 'pendiente', note: review?.note || undefined };
  });

/**
 * Cambia el estado de verificación de un psicólogo (solo administradores, por la ruta).
 *  - aprobado: exige que todos los documentos estén en 'ok'.
 *  - rechazado: exige un mensaje; los documentos marcados como 'rechazado' se resaltan en el correo.
 *  - pendiente: vuelve a la revisión; borra el mensaje de rechazo.
 * Solo se envía correo cuando el estado cambia a aprobado o rechazado.
 */
export const setVerificationService = async (userId: string, input: VerificationInput) => {
  const user = await User.findOne({ _id: userId, deletedAt: null });
  if (!user) throw new AppError(404, 'Usuario no encontrado');
  if (user.role !== 'psicologo') throw new AppError(400, 'Solo se verifica a los psicólogos');

  const reviews = reviewsOf(user);

  for (const update of input.documents ?? []) {
    const review = reviews.find((r) => r.key === update.key);
    if (review) {
      review.status = update.status;
      review.note = update.note ?? '';
    }
  }

  const message = input.message?.trim() ?? '';
  if (input.status === 'rechazado' && !message) {
    throw new AppError(400, 'Para rechazar una solicitud escribe un mensaje para el psicólogo');
  }
  if (input.status === 'aprobado') {
    const withoutFile = reviews.filter((r) => !r.file).map((r) => DOCUMENT_LABELS[r.key]);
    if (withoutFile.length > 0) {
      throw new AppError(400, `Para aprobar, el psicólogo debe haber subido todos los documentos. Falta subir: ${withoutFile.join(', ')}`);
    }
    const pending = reviews.filter((r) => r.status !== 'ok').map((r) => DOCUMENT_LABELS[r.key]);
    if (pending.length > 0) {
      throw new AppError(400, `Para aprobar, todos los documentos deben estar correctos. Falta: ${pending.join(', ')}`);
    }
  }

  const previous = user.verificationStatus;
  const updated = await User.findByIdAndUpdate(
    user._id,
    {
      // Mongoose ignora los `undefined`: para borrar el motivo hay que usar $unset.
      $set: {
        verificationStatus: input.status,
        verificationUpdatedAt: new Date(), // cuenta los 30 días de retención de los documentos rechazados
        verificationDocuments: reviews,
        approved: input.status === 'aprobado', // derivado: lo usan las consultas que filtran psicólogos aprobados
        ...(input.status === 'rechazado' && { verificationMessage: message }),
      },
      ...(input.status !== 'rechazado' && { $unset: { verificationMessage: '' } }),
    },
    { new: true }
  ).select('-password');

  if (previous !== input.status) {
    if (input.status === 'aprobado') {
      sendEmail('verificationApproved', user.email, user.name, `${getFrontendUrl()}/agenda`).catch((error) => {
        logger.error({ err: error }, 'Error al enviar el correo de aprobación');
      });
    }
    if (input.status === 'rechazado') {
      sendEmail('verificationRejected', user.email, user.name, message, documentLines(reviews), `${getFrontendUrl()}/perfil`).catch(
        (error) => logger.error({ err: error }, 'Error al enviar el correo de rechazo')
      );
    }
  }

  return updated;
};
