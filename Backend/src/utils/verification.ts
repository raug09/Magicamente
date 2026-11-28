/**
 * Verificación de psicólogos: estados, documentos requeridos y su revisión.
 * El psicólogo sube cada archivo (ver verificationDocumentService) y un administrador lo revisa y lo marca.
 */

/** Documentos que debe presentar todo psicólogo. El orden es el que se muestra en los correos. */
export const PSYCHOLOGIST_DOCUMENT_KEYS = ['tarjeta_profesional', 'cedula', 'diploma'] as const;
export type DocumentKey = (typeof PSYCHOLOGIST_DOCUMENT_KEYS)[number];

export const DOCUMENT_LABELS: Record<DocumentKey, string> = {
  tarjeta_profesional: 'Tarjeta profesional',
  cedula: 'Cédula de ciudadanía',
  diploma: 'Diploma de psicología',
};

export const VERIFICATION_STATUSES = ['pendiente', 'rechazado', 'aprobado'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/** Estado de la revisión de un documento: pendiente (sin revisar), ok (correcto) o rechazado. */
export const DOCUMENT_REVIEW_STATUSES = ['pendiente', 'ok', 'rechazado'] as const;
export type DocumentReviewStatus = (typeof DOCUMENT_REVIEW_STATUSES)[number];

/** Archivo guardado en el almacenamiento privado. `storageKey` es interno: nunca se envía al cliente. */
export interface StoredFile {
  storageKey: string;
  contentType: string;
  size: number;
  uploadedAt: Date;
}

export interface DocumentReview {
  key: DocumentKey;
  status: DocumentReviewStatus;
  note?: string;
  file?: StoredFile;
}

/** Los documentos rechazados se borran del almacenamiento pasados estos días sin corregir. */
export const REJECTED_DOCUMENT_RETENTION_DAYS = 30;

/** Revisión inicial: todos los documentos sin revisar. */
export const initialDocumentReviews = (): DocumentReview[] =>
  PSYCHOLOGIST_DOCUMENT_KEYS.map((key) => ({ key, status: 'pendiente', note: '' }));
