import { Router } from 'express';
import multer from 'multer';
import { isAuthenticated, requireRole } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/asyncHandler';
import { validate } from '../validation/validate';
import { documentKeyParams } from '../validation/schemas';
import { getOwnDocumentUrl, uploadDocument } from '../controllers/verificationController';
import { MAX_DOCUMENT_BYTES } from '../utils/fileType';

const router = Router();

// El archivo se recibe en memoria (máx. 5 MB, uno solo) y se sube al almacenamiento privado.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 } });

router.put(
  '/documents/:key',
  isAuthenticated,
  requireRole('psicologo'),
  validate({ params: documentKeyParams }),
  upload.single('file'),
  asyncHandler(uploadDocument)
);

router.get(
  '/documents/:key/url',
  isAuthenticated,
  requireRole('psicologo'),
  validate({ params: documentKeyParams }),
  asyncHandler(getOwnDocumentUrl)
);

export default router;
