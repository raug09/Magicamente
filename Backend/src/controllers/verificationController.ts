import { Request, Response } from 'express';
import { AppError } from '../utils/AppError';
import { DocumentKey } from '../utils/verification';
import { getDocumentUrlService, uploadDocumentService } from '../services/verificationDocumentService';

/** Sube o reemplaza un documento. El archivo va en un formulario multipart, en el campo "file". */
export const uploadDocument = async (req: Request, res: Response) => {
  if (!req.file) {
    throw new AppError(400, 'Adjunta el archivo en el campo "file"');
  }
  const user = await uploadDocumentService(req.user!.id, req.params.key as DocumentKey, req.file.buffer);
  res.status(200).json({
    message: 'Documento recibido. Quedó pendiente de revisión.',
    verificationStatus: user?.verificationStatus,
    verificationDocuments: user?.toJSON().verificationDocuments,
  });
};

/** Enlace temporal para abrir uno de MIS documentos. */
export const getOwnDocumentUrl = async (req: Request, res: Response) => {
  res.status(200).json(await getDocumentUrlService(req.user!, req.user!.id, req.params.key as DocumentKey));
};

/** Enlace temporal para que un administrador abra el documento de un psicólogo (queda registrado). */
export const getUserDocumentUrl = async (req: Request, res: Response) => {
  res.status(200).json(await getDocumentUrlService(req.user!, req.params.id, req.params.key as DocumentKey));
};
