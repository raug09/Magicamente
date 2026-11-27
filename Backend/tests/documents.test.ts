import { describe, expect, it } from 'vitest';
import User from '../src/models/User';
import DocumentAccessLog from '../src/models/DocumentAccessLog';
import { setStorage } from '../src/storage/documentStorage';
import { cleanupRejectedDocuments } from '../src/services/verificationDocumentService';
import { detectFileType, MAX_DOCUMENT_BYTES } from '../src/utils/fileType';
import { getR2Config } from '../src/config/env';
import { app, auth, createUser, request, TestUser } from './helpers';
import { testStorage } from './memoryStorage';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< >>\nendobj\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('datos')]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('datos')]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.from('programa')]);

const upload = (user: TestUser, key: string, file: Buffer, filename = 'archivo.pdf', contentType = 'application/pdf') =>
  request(app).put(`/api/verification/documents/${key}`).set(auth(user)).attach('file', file, { filename, contentType });

const newPsychologist = async () => {
  const psychologist = await createUser('psicologo');
  await User.updateOne({ _id: psychologist.id }, { approved: false, verificationStatus: 'pendiente' });
  return psychologist;
};

const document = async (userId: string, key: string) =>
  (await User.findById(userId))?.verificationDocuments?.find((d) => d.key === key);

describe('subida de documentos', () => {
  it('un psicólogo sube un PDF: queda pendiente de revisión, sin exponer la clave interna', async () => {
    const psychologist = await newPsychologist();
    const res = await upload(psychologist, 'cedula', PDF);

    expect(res.status).toBe(200);
    const cedula = res.body.verificationDocuments.find((d: { key: string }) => d.key === 'cedula');
    expect(cedula.status).toBe('pendiente');
    expect(cedula.file).toMatchObject({ contentType: 'application/pdf', size: PDF.length });
    expect(JSON.stringify(res.body)).not.toContain('storageKey');
    expect(JSON.stringify(res.body)).not.toContain('verification/');

    // el archivo está en el almacenamiento, con una clave que no lleva el nombre original
    const [key] = [...testStorage.objects.keys()];
    expect(key).toMatch(new RegExp(`^verification/${psychologist.id}/cedula/[0-9a-f-]{36}\\.pdf$`));
    expect(testStorage.objects.get(key)?.body.equals(PDF)).toBe(true);
  });

  it('/auth/me tampoco expone la clave del archivo', async () => {
    const psychologist = await newPsychologist();
    await upload(psychologist, 'diploma', PNG, 'diploma.png', 'image/png');
    const me = await request(app).get('/api/auth/me').set(auth(psychologist));
    expect(me.status).toBe(200);
    expect(JSON.stringify(me.body)).not.toContain('storageKey');
    expect(me.body.verificationDocuments.find((d: { key: string }) => d.key === 'diploma').file.contentType).toBe('image/png');
  });

  it('acepta JPG y PNG además de PDF', async () => {
    const psychologist = await newPsychologist();
    expect((await upload(psychologist, 'tarjeta_profesional', JPG, 'foto.jpg', 'image/jpeg')).status).toBe(200);
    expect((await upload(psychologist, 'cedula', PNG, 'foto.png', 'image/png')).status).toBe(200);
  });

  it('el tipo se comprueba por el contenido: un texto o un ejecutable renombrados como PDF se rechazan', async () => {
    const psychologist = await newPsychologist();
    const text = await upload(psychologist, 'cedula', Buffer.from('esto no es un pdf'), 'cedula.pdf', 'application/pdf');
    const exe = await upload(psychologist, 'cedula', EXE, 'virus.pdf', 'application/pdf');
    expect(text.status).toBe(400);
    expect(exe.status).toBe(400);
    expect(testStorage.objects.size).toBe(0);
  });

  it('rechaza archivos de más de 5 MB (413)', async () => {
    const psychologist = await newPsychologist();
    const big = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(MAX_DOCUMENT_BYTES)]);
    const res = await upload(psychologist, 'cedula', big);
    expect(res.status).toBe(413);
    expect(testStorage.objects.size).toBe(0);
  });

  it('sin archivo, con otro campo o con un documento inexistente: 400', async () => {
    const psychologist = await newPsychologist();
    expect((await request(app).put('/api/verification/documents/cedula').set(auth(psychologist))).status).toBe(400);
    const wrongField = await request(app)
      .put('/api/verification/documents/cedula')
      .set(auth(psychologist))
      .attach('otro', PDF, { filename: 'a.pdf', contentType: 'application/pdf' });
    expect(wrongField.status).toBe(400);
    expect((await upload(psychologist, 'pasaporte', PDF)).status).toBe(400);
  });

  it('solo los psicólogos suben documentos (paciente y administrador: 403; sin sesión: 401)', async () => {
    const patient = await createUser('paciente');
    const admin = await createUser('administrador');
    expect((await upload(patient, 'cedula', PDF)).status).toBe(403);
    expect((await upload(admin, 'cedula', PDF)).status).toBe(403);
    const anonymous = await request(app).put('/api/verification/documents/cedula').attach('file', PDF, 'a.pdf');
    expect(anonymous.status).toBe(401);
  });

  it('reemplazar un documento borra el archivo anterior del almacenamiento', async () => {
    const psychologist = await newPsychologist();
    await upload(psychologist, 'cedula', PDF);
    const firstKey = [...testStorage.objects.keys()][0];

    await upload(psychologist, 'cedula', PNG, 'nueva.png', 'image/png');
    expect(testStorage.objects.size).toBe(1);
    expect(testStorage.objects.has(firstKey)).toBe(false);
  });

  it('tres subidas simultáneas guardan los tres documentos', async () => {
    const psychologist = await newPsychologist();
    const results = await Promise.all(
      ['tarjeta_profesional', 'cedula', 'diploma'].map((key) => upload(psychologist, key, PDF))
    );
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);

    const stored = (await User.findById(psychologist.id))?.verificationDocuments ?? [];
    expect(stored).toHaveLength(3);
    expect(stored.every((d) => d.file?.storageKey)).toBe(true);
    expect(testStorage.objects.size).toBe(3);
  });

  it('una cuenta ya aprobada no puede cambiar sus documentos (409)', async () => {
    const psychologist = await createUser('psicologo'); // aprobado
    const res = await upload(psychologist, 'cedula', PDF);
    expect(res.status).toBe(409);
    expect(testStorage.objects.size).toBe(0);
  });

  it('corregir un documento rechazado devuelve la solicitud a pendiente y borra el motivo', async () => {
    const admin = await createUser('administrador');
    const psychologist = await newPsychologist();
    await upload(psychologist, 'cedula', PDF);
    await request(app)
      .put(`/api/users/${psychologist.id}/verification`)
      .set(auth(admin))
      .send({ status: 'rechazado', message: 'La cédula no se ve', documents: [{ key: 'cedula', status: 'rechazado', note: 'Borrosa' }] });
    expect((await User.findById(psychologist.id))?.verificationStatus).toBe('rechazado');

    const res = await upload(psychologist, 'cedula', PNG, 'cedula.png', 'image/png');
    expect(res.status).toBe(200);
    expect(res.body.verificationStatus).toBe('pendiente');

    const stored = await User.findById(psychologist.id);
    expect(stored?.verificationMessage).toBeUndefined();
    expect((await document(psychologist.id, 'cedula'))?.status).toBe('pendiente');
    expect((await document(psychologist.id, 'cedula'))?.note).toBe('');
  });

  it('si el almacenamiento no está configurado responde 503', async () => {
    const psychologist = await newPsychologist();
    const saved = { ...process.env };
    for (const name of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) delete process.env[name];
    setStorage(null);
    try {
      expect((await upload(psychologist, 'cedula', PDF)).status).toBe(503);
    } finally {
      Object.assign(process.env, saved);
      setStorage(testStorage);
    }
  });
});

describe('abrir documentos (enlace temporal)', () => {
  it('el psicólogo abre el suyo: enlace de 5 minutos y acceso registrado', async () => {
    const psychologist = await newPsychologist();
    await upload(psychologist, 'cedula', PDF);

    const res = await request(app).get('/api/verification/documents/cedula/url').set(auth(psychologist));
    expect(res.status).toBe(200);
    expect(res.body.expiresInSeconds).toBe(300);
    expect(res.body.url).toMatch(/^https:\/\/storage\.test\/verification\//);
    expect(res.body.contentType).toBe('application/pdf');

    const log = await DocumentAccessLog.findOne({ ownerId: psychologist.id });
    expect(log).toMatchObject({ documentKey: 'cedula', accessedByRole: 'psicologo' });
  });

  it('un administrador abre el documento de un psicólogo y queda registrado quién lo abrió', async () => {
    const admin = await createUser('administrador');
    const psychologist = await newPsychologist();
    await upload(psychologist, 'diploma', PNG, 'd.png', 'image/png');

    const res = await request(app).get(`/api/users/${psychologist.id}/verification/documents/diploma/url`).set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.contentType).toBe('image/png');

    const log = await DocumentAccessLog.findOne({ ownerId: psychologist.id });
    expect(String(log?.accessedBy)).toBe(admin.id);
    expect(log?.accessedByRole).toBe('administrador');
  });

  it('ni un paciente ni otro psicólogo pueden abrir documentos ajenos', async () => {
    const owner = await newPsychologist();
    await upload(owner, 'cedula', PDF);
    const patient = await createUser('paciente');
    const other = await newPsychologist();

    expect((await request(app).get(`/api/users/${owner.id}/verification/documents/cedula/url`).set(auth(patient))).status).toBe(403);
    expect((await request(app).get(`/api/users/${owner.id}/verification/documents/cedula/url`).set(auth(other))).status).toBe(403);
    expect((await request(app).get('/api/verification/documents/cedula/url').set(auth(other))).status).toBe(404); // el suyo no existe
    expect(await DocumentAccessLog.countDocuments()).toBe(0);
  });

  it('un documento que no se ha subido da 404 y un nombre inválido, 400', async () => {
    const admin = await createUser('administrador');
    const psychologist = await newPsychologist();
    expect((await request(app).get(`/api/users/${psychologist.id}/verification/documents/cedula/url`).set(auth(admin))).status).toBe(404);
    expect((await request(app).get(`/api/users/${psychologist.id}/verification/documents/otro/url`).set(auth(admin))).status).toBe(400);
  });
});

describe('retención: borrado de documentos', () => {
  const rejectedSince = async (daysAgo: number) => {
    const admin = await createUser('administrador');
    const psychologist = await newPsychologist();
    await upload(psychologist, 'cedula', PDF);
    await upload(psychologist, 'diploma', PNG, 'd.png', 'image/png');
    await request(app)
      .put(`/api/users/${psychologist.id}/verification`)
      .set(auth(admin))
      .send({ status: 'rechazado', message: 'Corrige los documentos' });
    await User.updateOne({ _id: psychologist.id }, { verificationUpdatedAt: new Date(Date.now() - daysAgo * 86_400_000) });
    return psychologist;
  };

  it('a los 30 días de rechazada, se borran los archivos del almacenamiento y de la base de datos', async () => {
    const psychologist = await rejectedSince(31);
    expect(testStorage.objects.size).toBe(2);

    expect(await cleanupRejectedDocuments()).toBe(1);
    expect(testStorage.objects.size).toBe(0);
    const stored = await User.findById(psychologist.id);
    expect(stored?.verificationDocuments?.every((d) => !d.file?.storageKey)).toBe(true);
    expect(stored?.verificationStatus).toBe('rechazado'); // sigue rechazada: debe volver a subirlos
  });

  it('antes de los 30 días no se borra nada', async () => {
    await rejectedSince(10);
    expect(await cleanupRejectedDocuments()).toBe(0);
    expect(testStorage.objects.size).toBe(2);
  });

  it('las solicitudes pendientes o aprobadas no se tocan, aunque sean antiguas', async () => {
    const psychologist = await newPsychologist();
    await upload(psychologist, 'cedula', PDF);
    await User.updateOne({ _id: psychologist.id }, { verificationUpdatedAt: new Date(Date.now() - 90 * 86_400_000) });
    expect(await cleanupRejectedDocuments()).toBe(0);
    expect(testStorage.objects.size).toBe(1);
  });

  it('es idempotente: una segunda pasada no encuentra nada', async () => {
    await rejectedSince(40);
    expect(await cleanupRejectedDocuments()).toBe(1);
    expect(await cleanupRejectedDocuments()).toBe(0);
  });

  it('si el almacenamiento falla al borrar, no se pierde la referencia y se reintenta después', async () => {
    const psychologist = await rejectedSince(40);
    testStorage.failRemove = true;
    expect(await cleanupRejectedDocuments()).toBe(0); // no se cuenta como limpiada
    expect(testStorage.objects.size).toBe(2);
    expect((await document(psychologist.id, 'cedula'))?.file?.storageKey).toBeTruthy();

    testStorage.failRemove = false;
    expect(await cleanupRejectedDocuments()).toBe(1);
    expect(testStorage.objects.size).toBe(0);
  });

  it('eliminar la cuenta borra sus documentos del almacenamiento', async () => {
    const admin = await createUser('administrador');
    const psychologist = await newPsychologist();
    await upload(psychologist, 'cedula', PDF);
    expect(testStorage.objects.size).toBe(1);

    expect((await request(app).delete(`/api/users/${psychologist.id}`).set(auth(admin))).status).toBe(200);
    expect(testStorage.objects.size).toBe(0);
  });

  it('si el borrado de la cuenta no pudo quitar los archivos, la limpieza nocturna lo completa', async () => {
    const admin = await createUser('administrador');
    const psychologist = await newPsychologist();
    await upload(psychologist, 'cedula', PDF);

    testStorage.failRemove = true;
    await request(app).delete(`/api/users/${psychologist.id}`).set(auth(admin));
    expect(testStorage.objects.size).toBe(1);

    testStorage.failRemove = false;
    expect(await cleanupRejectedDocuments()).toBe(1);
    expect(testStorage.objects.size).toBe(0);
  });
});

describe('utilidades de archivo y configuración', () => {
  it('detectFileType reconoce PDF, JPG y PNG por su contenido', () => {
    expect(detectFileType(PDF)?.extension).toBe('pdf');
    expect(detectFileType(JPG)?.extension).toBe('jpg');
    expect(detectFileType(PNG)?.extension).toBe('png');
    expect(detectFileType(EXE)).toBeNull();
    expect(detectFileType(Buffer.alloc(0))).toBeNull();
    expect(detectFileType(Buffer.from('%PDF'))).toBeNull(); // incompleto
  });

  it('getR2Config devuelve null si falta cualquier variable y la configuración si están todas', () => {
    const saved = { ...process.env };
    try {
      for (const name of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) delete process.env[name];
      expect(getR2Config()).toBeNull();
      Object.assign(process.env, { R2_ACCOUNT_ID: 'acc', R2_ACCESS_KEY_ID: 'key', R2_SECRET_ACCESS_KEY: 'secret', R2_BUCKET: 'bucket' });
      expect(getR2Config()).toEqual({ accountId: 'acc', accessKeyId: 'key', secretAccessKey: 'secret', bucket: 'bucket' });
      delete process.env.R2_BUCKET;
      expect(getR2Config()).toBeNull();
    } finally {
      for (const name of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) delete process.env[name];
      Object.assign(process.env, saved);
    }
  });
});

describe('normalización del id de cuenta de R2', () => {
  it('acepta el id solo o la dirección completa del endpoint, con comillas o espacios', async () => {
    const { normalizeR2AccountId } = await import('../src/config/env');
    const id = '0123456789abcdef0123456789abcdef';
    for (const value of [id, ` ${id} `, `"${id}"`, `https://${id}.r2.cloudflarestorage.com`, `https://${id}.r2.cloudflarestorage.com/`, `${id}.r2.cloudflarestorage.com`]) {
      expect(normalizeR2AccountId(value)).toBe(id);
    }
  });

  it('getR2Config usa el id ya normalizado', () => {
    const saved = { ...process.env };
    try {
      const id = '0123456789abcdef0123456789abcdef';
      Object.assign(process.env, {
        R2_ACCOUNT_ID: `https://${id}.r2.cloudflarestorage.com`,
        R2_ACCESS_KEY_ID: 'key',
        R2_SECRET_ACCESS_KEY: 'secret',
        R2_BUCKET: 'bucket',
      });
      expect(getR2Config()?.accountId).toBe(id);
    } finally {
      for (const name of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) delete process.env[name];
      Object.assign(process.env, saved);
    }
  });
});
