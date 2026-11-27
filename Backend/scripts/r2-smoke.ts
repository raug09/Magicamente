/**
 * Prueba real contra Cloudflare R2 (no se ejecuta en los tests normales).
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *
 * Comprueba, con un archivo temporal:
 *   1. que se puede subir,
 *   2. que el enlace temporal lo abre y devuelve el mismo contenido,
 *   3. que el bucket NO es público (la misma dirección sin firma se rechaza),
 *   4. que se puede borrar y que después el enlace ya no funciona.
 * No imprime claves ni enlaces: solo el resultado de cada comprobación. Sale con código 1 si algo falla.
 */
import crypto from 'crypto';
import { getR2Config } from '../src/config/env';
import { R2Storage } from '../src/storage/r2Storage';

const config = getR2Config();
if (!config) {
  console.error('Faltan variables R2_* (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET).');
  process.exit(1);
}

const storage = new R2Storage(config);
const key = `smoke-test/${crypto.randomUUID()}.pdf`;
const body = Buffer.from(`%PDF-1.4\nprueba de humo ${new Date().toISOString()}\n`);
let failures = 0;

const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK ' : 'FALLO'} ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures++;
};

(async () => {
  try {
    await storage.put(key, body, 'application/pdf');
    check('subir un archivo', true);
  } catch (error) {
    check('subir un archivo', false, (error as Error).message);
    process.exit(1);
  }

  try {
    const url = await storage.signedUrl(key, 60);
    const response = await fetch(url);
    const downloaded = Buffer.from(await response.arrayBuffer());
    check('abrir con enlace temporal', response.ok && downloaded.equals(body), `HTTP ${response.status}`);
  } catch (error) {
    check('abrir con enlace temporal', false, (error as Error).message);
  }

  try {
    // La misma dirección sin la firma: si el bucket es privado, debe rechazarla (401/403/404, nunca 200).
    const signed = new URL(await storage.signedUrl(key, 60));
    const unsigned = `${signed.origin}${signed.pathname}`;
    const response = await fetch(unsigned);
    check('sin firma NO se puede abrir (bucket privado)', response.status !== 200, `HTTP ${response.status}`);
  } catch (error) {
    check('sin firma NO se puede abrir (bucket privado)', false, (error as Error).message);
  }

  try {
    await storage.remove(key);
    check('borrar el archivo', true);
  } catch (error) {
    check('borrar el archivo', false, (error as Error).message);
  }

  try {
    const response = await fetch(await storage.signedUrl(key, 60));
    check('después de borrar, el enlace ya no funciona', response.status === 404, `HTTP ${response.status}`);
  } catch (error) {
    check('después de borrar, el enlace ya no funciona', false, (error as Error).message);
  }

  console.log(failures === 0 ? 'Todas las comprobaciones pasaron.' : `${failures} comprobación(es) fallaron.`);
  process.exit(failures === 0 ? 0 : 1);
})();
