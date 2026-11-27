import { z } from 'zod';
import { ROLES } from '../middlewares/auth';
import { isValidTimeZone, parseDayString } from '../utils/timezone';

// --- Piezas reutilizables ------------------------------------------------------------------

const text = (name: string, max = 200) =>
  z
    .string({ required_error: `${name} es obligatorio`, invalid_type_error: `${name} debe ser un texto` })
    .trim()
    .min(1, `${name} es obligatorio`)
    .max(max, `${name} es demasiado largo (máximo ${max} caracteres)`);

/** Email normalizado: sin espacios y en minúsculas, para que "Ana@Example.com" y "ana@example.com" sean la misma cuenta. */
const emailField = z
  .string({ required_error: 'email es obligatorio', invalid_type_error: 'email debe ser un texto' })
  .trim()
  .toLowerCase()
  .min(1, 'email es obligatorio')
  .max(254, 'email es demasiado largo');

const validEmail = emailField.email('email no tiene un formato válido');

/** La política de longitud (8–72 bytes) se aplica en el servicio; aquí solo el tipo. */
const passwordField = z
  .string({ required_error: 'password es obligatorio', invalid_type_error: 'password debe ser un texto' })
  .min(1, 'password es obligatorio');

const timezoneField = z
  .string({ invalid_type_error: 'timezone debe ser un texto' })
  .refine(isValidTimeZone, 'timezone debe ser una zona horaria válida (p. ej. "America/Bogota" o "Europe/Madrid")');

const studiesField = z
  .array(text('studies', 200), { invalid_type_error: 'studies debe ser una lista de textos' })
  .max(30, 'studies admite como máximo 30 elementos');

const DAY_MESSAGE = 'day debe ser una fecha válida con formato YYYY-MM-DD (p. ej. "2026-12-15")';
const dayField = z
  .string({ required_error: DAY_MESSAGE, invalid_type_error: DAY_MESSAGE })
  .refine((value) => parseDayString(value) !== null, DAY_MESSAGE);

const HOUR_MESSAGE = 'hour debe tener formato HH:mm';
const hourField = z
  .string({ required_error: HOUR_MESSAGE, invalid_type_error: HOUR_MESSAGE })
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, HOUR_MESSAGE);

// --- Auth ----------------------------------------------------------------------------------

export const registerSchema = z.object({
  name: text('name', 100),
  email: validEmail,
  password: passwordField,
  role: z.enum(['paciente', 'psicologo'], { errorMap: () => ({ message: 'role debe ser paciente o psicologo' }) }).optional(),
  studies: studiesField.optional(),
  timezone: timezoneField.optional(),
});

export const loginSchema = z.object({ email: emailField, password: passwordField });

export const forgotPasswordSchema = z.object({ email: validEmail });

export const verifyEmailSchema = z.object({ token: text('token', 200) });

export const resendVerificationSchema = z.object({ email: validEmail });

export const requestEmailChangeSchema = z.object({ email: validEmail, password: passwordField });

export const confirmEmailChangeSchema = z.object({ token: text('token', 200) });

export const resetPasswordSchema = z.object({
  token: text('token', 200),
  password: passwordField,
});

// --- Usuarios ------------------------------------------------------------------------------

/**
 * Valida el tipo de cada campo editable. Los campos que el usuario no puede cambiar se dejan pasar
 * (`passthrough`) para que el servicio los rechace con 403 en lugar de ignorarlos en silencio.
 */
export const updateUserSchema = z
  .object({
    name: text('name', 100).optional(),
    description: z.string({ invalid_type_error: 'description debe ser un texto' }).max(2000, 'description es demasiado larga').optional(),
    studies: studiesField.optional(),
    password: passwordField.optional(),
    timezone: timezoneField.optional(),
    email: validEmail.optional(),
    role: z.enum(ROLES, { errorMap: () => ({ message: `role debe ser uno de: ${ROLES.join(', ')}` }) }).optional(),
    isActive: z.boolean({ invalid_type_error: 'isActive debe ser true o false' }).optional(),
    approved: z.boolean({ invalid_type_error: 'approved debe ser true o false' }).optional(),
  })
  .passthrough();

// --- Psicólogos ----------------------------------------------------------------------------

const positiveInt = (name: string) =>
  z
    .string({ invalid_type_error: `${name} debe ser un entero positivo` })
    .regex(/^\d+$/, `${name} debe ser un entero positivo`)
    .transform(Number)
    .refine((value) => value >= 1, `${name} debe ser un entero positivo`);

export const MAX_PAGE_SIZE = 50;

/** Paginación compartida: `page` desde 1, `limit` por defecto 20 y máximo 50. */
export const pagination = {
  page: positiveInt('page').default('1'),
  limit: positiveInt('limit')
    .default('20')
    .transform((value) => Math.min(value, MAX_PAGE_SIZE)),
};

export const listPsychologistsQuery = z.object({
  q: z.string({ invalid_type_error: 'q debe ser un texto' }).trim().max(100, 'q es demasiado largo').optional(),
  ...pagination,
});

// --- Franjas -------------------------------------------------------------------------------

const REPEAT_MESSAGE = 'repeatWeeks debe ser un entero entre 1 y 26';

export const createScheduleSchema = z.object({
  day: dayField,
  hour: hourField,
  repeatWeeks: z
    .number({ invalid_type_error: REPEAT_MESSAGE })
    .int(REPEAT_MESSAGE)
    .min(1, REPEAT_MESSAGE)
    .max(26, REPEAT_MESSAGE)
    .optional(),
  /** Solo lo usa un administrador (un psicólogo siempre crea las suyas). */
  psychologist: z.string({ invalid_type_error: 'psychologist debe ser un texto' }).optional(),
});

export const updateScheduleSchema = z.object({ day: dayField.optional(), hour: hourField.optional() }).passthrough();

export const listSchedulesQuery = z
  .object({
    available: z
      .enum(['true', 'false'], { errorMap: () => ({ message: 'available debe ser true o false' }) })
      .transform((value) => value === 'true')
      .optional(),
    from: dayField.optional(),
    to: dayField.optional(),
    ...pagination,
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, { message: 'from no puede ser posterior a to' });

// --- Citas ---------------------------------------------------------------------------------

export const createAppointmentSchema = z.object({ scheduleId: text('scheduleId', 64) });

/** El servicio decide qué estados se aceptan; aquí solo el tipo. Otros campos pasan para dar 403. */
export const updateAppointmentSchema = z.object({ state: z.string({ invalid_type_error: 'state debe ser un texto' }).optional() }).passthrough();

export const listAppointmentsQuery = z.object({ ...pagination });
