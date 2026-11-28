/**
 * Documentación OpenAPI 3 de la API.
 *
 * Las entradas (body, query, params) se generan a partir de los MISMOS esquemas de zod que usa
 * `validate(...)`, así que no pueden desincronizarse. Las respuestas se describen aquí a mano.
 * Un test comprueba que cada ruta de Express está documentada y que `docs/openapi.json` está al día.
 */
import { OpenAPIRegistry, OpenApiGeneratorV3, RouteConfig } from '@asteasolutions/zod-to-openapi';
import { ZodTypeAny } from 'zod';
import { z } from '../validation/zod';

type RouteParameter = NonNullable<RouteConfig['request']>['query'];
import * as s from '../validation/schemas';
import { ROLES } from '../middlewares/auth';
import { DOCUMENT_REVIEW_STATUSES, PSYCHOLOGIST_DOCUMENT_KEYS, VERIFICATION_STATUSES } from '../utils/verification';

const registry = new OpenAPIRegistry();

const bearer = registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'Token de `POST /api/auth/login`. Caduca en 1 hora o al cerrar la sesión.',
});

// --- Piezas comunes ------------------------------------------------------------------------

const objectId = z
  .string()
  .openapi({ example: '6740c1f2a9b3c4d5e6f70812', description: 'Identificador de MongoDB (24 caracteres hexadecimales)' });
const dateTime = z.string().openapi({ format: 'date-time', example: '2026-12-15T15:00:00.000Z' });

const ErrorResponse = registry.register(
  'Error',
  z
    .object({
      message: z.string().openapi({ example: 'No tienes permiso para esta acción' }),
      errors: z
        .array(z.object({ field: z.string(), message: z.string() }))
        .optional()
        .openapi({ description: 'Solo en errores de validación (400): todos los campos inválidos' }),
    })
    .openapi({ description: 'Formato de todos los errores' })
);

const Message = registry.register('Message', z.object({ message: z.string() }));

const page = <T extends ZodTypeAny>(item: T) =>
  z.object({
    total: z.number().int().openapi({ description: 'Elementos en total con los filtros aplicados' }),
    page: z.number().int(),
    limit: z.number().int(),
    pages: z.number().int().openapi({ description: 'Número de páginas (mínimo 1)' }),
    items: z.array(item),
  });

const StoredFileInfo = z.object({
  contentType: z.string().openapi({ example: 'application/pdf' }),
  size: z.number().int(),
  uploadedAt: dateTime,
});

const DocumentReview = registry.register(
  'DocumentReview',
  z.object({
    key: z.enum(PSYCHOLOGIST_DOCUMENT_KEYS),
    status: z.enum(DOCUMENT_REVIEW_STATUSES),
    note: z.string().openapi({ description: 'Motivo si el documento se rechazó' }),
    file: StoredFileInfo.optional().openapi({ description: 'Solo si el archivo ya se subió' }),
  })
);

const User = registry.register(
  'User',
  z
    .object({
      _id: objectId,
      name: z.string(),
      email: z.string().openapi({ format: 'email' }),
      role: z.enum(ROLES),
      isActive: z.boolean(),
      emailVerified: z.boolean(),
      timezone: z.string().openapi({ example: 'America/Bogota' }),
      studies: z.array(z.string()),
      description: z.string().optional(),
      schedules: z.array(objectId),
      approved: z.boolean().openapi({ description: 'true solo si verificationStatus es aprobado' }),
      verificationStatus: z.enum(VERIFICATION_STATUSES),
      verificationMessage: z.string().optional().openapi({ description: 'Motivo del rechazo' }),
      verificationDocuments: z.array(DocumentReview).openapi({ description: 'Solo psicólogos' }),
      verificationUpdatedAt: dateTime.optional(),
      createdAt: dateTime,
    })
    .openapi({ description: 'Perfil completo (propio o visto por un administrador). Nunca incluye la contraseña.' })
);

const PublicPsychologist = registry.register(
  'PublicPsychologist',
  z.object({ _id: objectId, name: z.string(), studies: z.array(z.string()), description: z.string().optional() })
);

const PublicProfile = registry.register(
  'PublicProfile',
  z
    .object({
      _id: objectId,
      name: z.string(),
      role: z.literal('psicologo'),
      studies: z.array(z.string()),
      description: z.string().optional(),
    })
    .openapi({ description: 'Perfil público de un psicólogo (sin email)' })
);

const Schedule = registry.register(
  'Schedule',
  z.object({
    _id: objectId,
    psychologist: objectId,
    day: dateTime.openapi({ description: 'Día del calendario del psicólogo, a medianoche UTC', example: '2026-12-15T00:00:00.000Z' }),
    hour: z.string().openapi({ example: '10:00', description: 'Hora local del psicólogo' }),
    timezone: z.string().openapi({ example: 'America/Bogota' }),
    startsAt: dateTime.openapi({ description: 'Instante real de inicio (UTC). Úsalo para mostrar la hora en la zona de quien mira.' }),
    isAvailable: z.boolean(),
    createdAt: dateTime,
  })
);

const appointmentFields = {
  _id: objectId,
  state: z.enum(['pendiente', 'completada', 'cancelada']),
  time: dateTime.openapi({ description: 'Instante real de la cita (UTC)' }),
  hour: z.string().openapi({ example: '10:00' }),
  reminderSent: z.boolean(),
};

const Appointment = registry.register(
  'Appointment',
  z.object({ ...appointmentFields, patientId: objectId, psychologistId: objectId, scheduleId: objectId })
);

const MyAppointment = registry.register(
  'MyAppointment',
  z
    .object({
      ...appointmentFields,
      scheduleId: Schedule,
      patientId: z
        .union([objectId, z.object({ _id: objectId, name: z.string(), email: z.string() })])
        .openapi({ description: 'Objeto (name, email) cuando quien pide es el psicólogo' }),
      psychologistId: z
        .union([objectId, PublicPsychologist])
        .openapi({ description: 'Objeto (name, studies, description) cuando quien pide es el paciente' }),
    })
    .openapi({ description: 'Cita con la franja y la otra persona incluidas' })
);

const SessionInfo = registry.register(
  'Session',
  z.object({
    _id: objectId,
    createdAt: dateTime,
    expiresAt: dateTime,
    current: z.boolean().openapi({ description: 'true si es la sesión de este token' }),
  })
);

const DocumentUrl = registry.register(
  'DocumentUrl',
  z.object({
    url: z.string().openapi({ format: 'uri', description: 'Enlace temporal firmado' }),
    expiresInSeconds: z.number().int().openapi({ example: 300 }),
    contentType: z.string().openapi({ example: 'application/pdf' }),
  })
);

// --- Ayudas para declarar rutas ------------------------------------------------------------

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: 'Datos no válidos',
  401: 'Sin sesión o sesión no válida',
  403: 'Sin permiso',
  404: 'No existe',
  409: 'Conflicto (duplicado u ocupado)',
  413: 'Archivo demasiado grande (más de 5 MB)',
  429: 'Demasiados intentos',
  503: 'Servicio no configurado',
};

const json = (schema: ZodTypeAny, description: string) => ({ description, content: { 'application/json': { schema } } });

interface Route {
  method: RouteConfig['method'];
  path: string;
  tag: string;
  summary: string;
  description?: string;
  /** Sin `auth: false`, la ruta exige sesión. */
  auth?: boolean;
  body?: ZodTypeAny;
  query?: RouteParameter;
  params?: RouteParameter;
  ok: { status?: number; schema: ZodTypeAny; description: string };
  errors?: number[];
}

/** Convierte `/users/:id` en `/users/{id}` y deduce los parámetros de ruta que no vengan con esquema. */
const add = ({ method, path, tag, summary, description, auth = true, body, query, params, ok, errors = [] }: Route) => {
  const openApiPath = path.replace(/:(\w+)/g, '{$1}');
  const pathParams = [...path.matchAll(/:(\w+)/g)].map((match) => match[1]);
  const paramsSchema = params ?? (pathParams.length ? z.object(Object.fromEntries(pathParams.map((name) => [name, objectId]))) : undefined);

  const statusCodes = new Set([...(auth ? [401] : []), ...errors, 429]);
  registry.registerPath({
    method,
    path: openApiPath,
    tags: [tag],
    summary,
    description,
    security: auth ? [{ [bearer.name]: [] }] : undefined,
    request: {
      params: paramsSchema,
      query,
      body: body ? { required: true, content: { 'application/json': { schema: body } } } : undefined,
    },
    responses: {
      [ok.status ?? 200]: json(ok.schema, ok.description),
      ...Object.fromEntries([...statusCodes].sort().map((code) => [code, json(ErrorResponse, ERROR_DESCRIPTIONS[code])])),
    },
  });
};

const documentKey = z.object({ key: z.enum(PSYCHOLOGIST_DOCUMENT_KEYS) });

// --- Sistema -------------------------------------------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/health',
  tags: ['Sistema'],
  summary: 'Estado del servidor y de la base de datos',
  responses: {
    200: json(z.object({ status: z.literal('ok'), db: z.literal('up') }), 'Todo funciona'),
    503: json(z.object({ status: z.literal('error'), db: z.literal('down') }), 'La base de datos no responde'),
  },
});

// --- Auth ----------------------------------------------------------------------------------

const A = 'Auth';
add({
  method: 'post',
  path: '/api/auth/register',
  tag: A,
  auth: false,
  body: s.registerSchema,
  summary: 'Registro (paciente o psicólogo)',
  description:
    'No devuelve sesión: llega un correo para confirmar el email y, hasta entonces, el login responde 403. Los psicólogos quedan en verificación pendiente.',
  ok: { status: 201, schema: z.object({ message: z.string(), user: User }), description: 'Cuenta creada' },
  errors: [400, 409],
});
add({
  method: 'post',
  path: '/api/auth/login',
  tag: A,
  auth: false,
  body: s.loginSchema,
  summary: 'Iniciar sesión',
  description: '10 intentos fallidos cada 15 minutos por IP. 403 si el email no está confirmado o la cuenta está desactivada.',
  ok: { schema: z.object({ token: z.string() }), description: 'Token JWT (1 hora)' },
  errors: [400, 403],
});
add({ method: 'get', path: '/api/auth/me', tag: A, summary: 'Usuario de la sesión', ok: { schema: User, description: 'Perfil propio' } });
add({
  method: 'post',
  path: '/api/auth/forgot-password',
  tag: A,
  auth: false,
  body: s.forgotPasswordSchema,
  summary: 'Pedir enlace para restablecer la contraseña',
  description: 'Responde igual exista o no la cuenta. El enlace caduca en 1 hora.',
  ok: { schema: Message, description: 'Solicitud recibida' },
  errors: [400],
});
add({
  method: 'post',
  path: '/api/auth/reset-password',
  tag: A,
  auth: false,
  body: s.resetPasswordSchema,
  summary: 'Restablecer la contraseña con el token del enlace',
  description: 'Cierra todas las sesiones abiertas.',
  ok: { schema: Message, description: 'Contraseña cambiada' },
  errors: [400],
});
add({
  method: 'post',
  path: '/api/auth/verify-email',
  tag: A,
  auth: false,
  body: s.verifyEmailSchema,
  summary: 'Confirmar el email con el token del correo',
  ok: { schema: Message, description: 'Email confirmado' },
  errors: [400],
});
add({
  method: 'post',
  path: '/api/auth/resend-verification',
  tag: A,
  auth: false,
  body: s.resendVerificationSchema,
  summary: 'Pedir otro enlace de confirmación',
  description: 'Responde igual exista o no la cuenta.',
  ok: { schema: Message, description: 'Solicitud recibida' },
  errors: [400],
});
add({
  method: 'post',
  path: '/api/auth/change-email',
  tag: A,
  body: s.requestEmailChangeSchema,
  summary: 'Pedir cambio de email',
  description: 'Exige la contraseña actual. El cambio se aplica al confirmar el enlace enviado a la nueva dirección.',
  ok: { schema: Message, description: 'Enlace enviado' },
  errors: [400, 409],
});
add({
  method: 'post',
  path: '/api/auth/confirm-email-change',
  tag: A,
  auth: false,
  body: s.confirmEmailChangeSchema,
  summary: 'Confirmar el cambio de email',
  ok: { schema: Message, description: 'Email cambiado' },
  errors: [400, 409],
});
add({
  method: 'post',
  path: '/api/auth/logout',
  tag: A,
  summary: 'Cerrar la sesión actual',
  ok: { schema: Message, description: 'Sesión cerrada' },
});
add({
  method: 'post',
  path: '/api/auth/logout-all',
  tag: A,
  summary: 'Cerrar todas las sesiones',
  ok: { schema: Message, description: 'Sesiones cerradas' },
});
add({
  method: 'get',
  path: '/api/auth/sessions',
  tag: A,
  summary: 'Sesiones abiertas',
  ok: { schema: z.array(SessionInfo), description: 'De la más reciente a la más antigua' },
});
add({
  method: 'delete',
  path: '/api/auth/sessions/:id',
  tag: A,
  summary: 'Cerrar una sesión concreta',
  ok: { schema: Message, description: 'Sesión cerrada' },
  errors: [400, 404],
});

// --- Usuarios ------------------------------------------------------------------------------

const U = 'Usuarios';
add({
  method: 'get',
  path: '/api/users',
  tag: U,
  summary: 'Listar usuarios (administrador)',
  ok: { schema: z.array(User), description: 'Todos los usuarios no eliminados' },
  errors: [403],
});
add({
  method: 'get',
  path: '/api/users/:id',
  tag: U,
  summary: 'Ver un usuario',
  description: 'Perfil completo si es el propio o si pide un administrador; de un psicólogo aprobado, el perfil público; en otro caso 404.',
  ok: { schema: z.union([User, PublicProfile]), description: 'Perfil' },
  errors: [400, 404],
});
add({
  method: 'put',
  path: '/api/users/:id',
  tag: U,
  body: s.updateUserSchema,
  summary: 'Actualizar un usuario (uno mismo o administrador)',
  description:
    'Uno mismo: name, description, studies, password, timezone. Un administrador además: email, role, isActive. Otro campo → 403. Cambiar la contraseña cierra todas las sesiones.',
  ok: { schema: User, description: 'Usuario actualizado' },
  errors: [400, 403, 404],
});
add({
  method: 'delete',
  path: '/api/users/:id',
  tag: U,
  summary: 'Eliminar una cuenta (uno mismo o administrador)',
  description: 'Anonimiza la cuenta, cancela sus citas pendientes y borra sus documentos.',
  ok: { schema: Message, description: 'Cuenta eliminada' },
  errors: [400, 403, 404, 409],
});
add({
  method: 'put',
  path: '/api/users/:id/verification',
  tag: U,
  body: s.verificationSchema,
  summary: 'Verificar a un psicólogo (administrador)',
  description: 'Aprobar exige los tres documentos subidos y en ok. Rechazar exige message. Se envía correo al aprobar o rechazar.',
  ok: { schema: User, description: 'Usuario actualizado' },
  errors: [400, 403, 404],
});
add({
  method: 'get',
  path: '/api/users/:id/verification/documents/:key/url',
  tag: U,
  params: z.object({ id: objectId, key: z.enum(PSYCHOLOGIST_DOCUMENT_KEYS) }),
  summary: 'Abrir un documento de un psicólogo (administrador)',
  description: 'Enlace de 5 minutos. Cada apertura queda registrada.',
  ok: { schema: DocumentUrl, description: 'Enlace temporal' },
  errors: [400, 403, 404, 503],
});

// --- Verificación (el psicólogo) -----------------------------------------------------------

const V = 'Verificación';
registry.registerPath({
  method: 'put',
  path: '/api/verification/documents/{key}',
  tags: [V],
  summary: 'Subir o reemplazar un documento (psicólogo)',
  description:
    'PDF, JPG o PNG de hasta 5 MB en el campo `file`. El tipo se comprueba por el contenido. 409 si la cuenta ya está aprobada. 30 peticiones por hora.',
  security: [{ [bearer.name]: [] }],
  request: {
    params: documentKey,
    body: {
      required: true,
      content: { 'multipart/form-data': { schema: z.object({ file: z.string().openapi({ type: 'string', format: 'binary' }) }) } },
    },
  },
  responses: {
    200: json(
      z.object({ message: z.string(), verificationStatus: z.enum(VERIFICATION_STATUSES), verificationDocuments: z.array(DocumentReview) }),
      'Documento recibido, pendiente de revisión'
    ),
    ...Object.fromEntries([400, 401, 403, 409, 413, 429, 503].map((code) => [code, json(ErrorResponse, ERROR_DESCRIPTIONS[code])])),
  },
});
add({
  method: 'get',
  path: '/api/verification/documents/:key/url',
  tag: V,
  params: documentKey,
  summary: 'Abrir uno de mis documentos (psicólogo)',
  description: 'Enlace de 5 minutos. Cada apertura queda registrada.',
  ok: { schema: DocumentUrl, description: 'Enlace temporal' },
  errors: [400, 403, 404, 503],
});

// --- Psicólogos y franjas ------------------------------------------------------------------

add({
  method: 'get',
  path: '/api/psychologists',
  tag: 'Psicólogos',
  query: s.listPsychologistsQuery,
  summary: 'Listado de psicólogos aprobados y activos',
  description: 'Ordenado por nombre. `q` busca en el nombre.',
  ok: { schema: page(PublicPsychologist), description: 'Página de psicólogos' },
  errors: [400],
});

const F = 'Franjas';
add({
  method: 'post',
  path: '/api/schedule',
  tag: F,
  body: s.createScheduleSchema,
  summary: 'Crear franjas (psicólogo aprobado o administrador)',
  description:
    '`day` y `hour` en la zona horaria del psicólogo. `repeatWeeks` crea una por semana; las que ya existen van en `skipped`. Un administrador debe indicar `psychologist`.',
  ok: {
    status: 201,
    schema: z.object({
      message: z.string(),
      schedules: z.array(Schedule),
      skipped: z.array(z.string().openapi({ example: '2027-01-05' })),
    }),
    description: 'Franjas creadas',
  },
  errors: [400, 403, 404, 409],
});
add({
  method: 'get',
  path: '/api/schedule/:psychologistId',
  tag: F,
  query: s.listSchedulesQuery,
  summary: 'Franjas de un psicólogo',
  description: '`available=true`: solo libres y futuras. `from`/`to`: días del calendario del psicólogo. Ordenadas por `startsAt`.',
  ok: { schema: page(Schedule), description: 'Página de franjas' },
  errors: [400],
});
add({
  method: 'put',
  path: '/api/schedule/:id',
  tag: F,
  body: s.updateScheduleSchema,
  summary: 'Mover una franja libre',
  ok: { schema: z.object({ message: z.string(), schedule: Schedule }), description: 'Franja actualizada' },
  errors: [400, 403, 404, 409],
});
add({
  method: 'delete',
  path: '/api/schedule/:id',
  tag: F,
  summary: 'Borrar una franja libre',
  ok: { schema: Message, description: 'Franja borrada' },
  errors: [400, 403, 404, 409],
});

// --- Citas ---------------------------------------------------------------------------------

const C = 'Citas';
add({
  method: 'get',
  path: '/api/appointments/appointment',
  tag: C,
  query: s.listAppointmentsQuery,
  summary: 'Mis citas (paciente o psicólogo)',
  ok: { schema: page(MyAppointment), description: 'Página de citas' },
  errors: [400, 403],
});
add({
  method: 'post',
  path: '/api/appointments/appointment',
  tag: C,
  body: s.createAppointmentSchema,
  summary: 'Reservar una franja (paciente)',
  ok: { status: 201, schema: z.object({ message: z.string(), appointment: Appointment }), description: 'Cita reservada' },
  errors: [400, 403, 404, 409],
});
add({
  method: 'patch',
  path: '/api/appointments/appointment/cancel/:id',
  tag: C,
  summary: 'Cancelar una cita pendiente (participante o administrador)',
  description: 'No se puede cancelar una cita cuya hora ya pasó. Libera la franja.',
  ok: { schema: z.object({ message: z.string(), appointment: Appointment }), description: 'Cita cancelada' },
  errors: [400, 403, 404],
});
add({
  method: 'patch',
  path: '/api/appointments/appointment/update/:id',
  tag: C,
  body: s.updateAppointmentSchema,
  summary: 'Marcar como completada (psicólogo de la cita o administrador)',
  description: 'Solo `{ "state": "completada" }` y después de la hora de la cita.',
  ok: { schema: z.object({ message: z.string(), updatedAppointment: Appointment }), description: 'Cita actualizada' },
  errors: [400, 403, 404],
});

// --- Documento -----------------------------------------------------------------------------

let cached: ReturnType<OpenApiGeneratorV3['generateDocument']> | undefined;

export const getOpenApiDocument = () => {
  cached ??= new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'API de Magicamente',
      version: '1.0.0',
      description:
        'Citas con psicólogos. Errores: `{ message, errors? }`. Listas: `{ total, page, limit, pages, items }` (limit máx. 50). ' +
        'Fechas en ISO 8601 UTC. Guía completa en `docs/03-api.md`.',
    },
    servers: [{ url: '/', description: 'Este servidor' }],
  });
  return cached;
};
