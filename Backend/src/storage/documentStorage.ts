import { AppError } from '../utils/AppError';
import { getR2Config } from '../config/env';
import { R2Storage } from './r2Storage';

/** Almacenamiento privado de los documentos. Hoy lo implementa Cloudflare R2. */
export interface DocumentStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Enlace temporal de lectura (caduca en `expiresInSeconds`). El bucket nunca es público. */
  signedUrl(key: string, expiresInSeconds: number): Promise<string>;
  remove(key: string): Promise<void>;
}

let current: DocumentStorage | null = null;

/** El almacenamiento configurado; 503 si faltan las variables R2_*. */
export const getStorage = (): DocumentStorage => {
  if (current) return current;
  const config = getR2Config();
  if (!config) {
    throw new AppError(503, 'El almacenamiento de documentos no está configurado');
  }
  current = new R2Storage(config);
  return current;
};

/** Sustituye el almacenamiento (los tests usan uno en memoria). `null` lo restablece. */
export const setStorage = (storage: DocumentStorage | null): void => {
  current = storage;
};
