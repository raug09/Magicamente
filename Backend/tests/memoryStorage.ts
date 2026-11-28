import type { DocumentStorage } from '../src/storage/documentStorage';

/** Almacenamiento en memoria para los tests: no toca Cloudflare. */
export class MemoryStorage implements DocumentStorage {
  objects = new Map<string, { body: Buffer; contentType: string }>();
  /** Para probar qué pasa si el almacenamiento falla al borrar. */
  failRemove = false;

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { body, contentType });
  }

  async signedUrl(key: string, expiresInSeconds: number): Promise<string> {
    if (!this.objects.has(key)) throw new Error('no existe');
    return `https://storage.test/${key}?expires=${expiresInSeconds}`;
  }

  async remove(key: string): Promise<void> {
    if (this.failRemove) throw new Error('fallo simulado');
    this.objects.delete(key);
  }

  reset(): void {
    this.objects.clear();
    this.failRemove = false;
  }
}

export const testStorage = new MemoryStorage();
