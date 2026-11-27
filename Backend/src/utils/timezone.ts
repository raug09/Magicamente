import { AppError } from './AppError';

/** ¿Es un nombre de zona horaria IANA válido (p. ej. "America/Bogota")? Acepta también "UTC". */
export const isValidTimeZone = (timeZone: unknown): timeZone is string => {
  if (typeof timeZone !== 'string' || timeZone.trim() === '' || timeZone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
};

export const assertValidTimeZone = (timeZone: unknown): string => {
  if (!isValidTimeZone(timeZone)) {
    throw new AppError(400, 'timezone debe ser una zona horaria válida (p. ej. "America/Bogota" o "Europe/Madrid")');
  }
  return timeZone;
};

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const HOUR_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Una fecha `YYYY-MM-DD` que además existe en el calendario (rechaza 2026-02-30). */
export const parseDayString = (day: string): { year: number; month: number; date: number } | null => {
  const match = DAY_PATTERN.exec(day);
  if (!match) return null;
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, date));
  const exists = check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === date;
  return exists ? { year, month, date } : null;
};

/** Suma días de calendario a una fecha `YYYY-MM-DD` (sin zonas horarias de por medio). */
export const addDays = (day: string, days: number): string => {
  const parsed = parseDayString(day);
  if (!parsed) throw new AppError(400, 'day debe ser una fecha válida (p. ej. "2026-12-15")');
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.date + days)).toISOString().slice(0, 10);
};

/** La hora de pared de un instante en una zona, expresada como si fuera UTC (en ms). */
const wallClockAsUtc = (utcMs: number, timeZone: string): number => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((part) => part.type === type)!.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
};

/**
 * Convierte "día y hora de pared en una zona" al instante UTC real.
 *   zonedTimeToUtc('2026-12-15', '10:00', 'America/Bogota') → 2026-12-15T15:00:00.000Z
 * Tiene en cuenta el horario de verano. Si esa hora no existe (el reloj salta hacia delante) lanza 400;
 * si existe dos veces (el reloj retrocede) devuelve la primera.
 */
export const zonedTimeToUtc = (day: string, hour: string, timeZone: string): Date => {
  const parsedDay = parseDayString(day);
  const parsedHour = HOUR_PATTERN.exec(hour);
  if (!parsedDay) throw new AppError(400, 'day debe ser una fecha válida (p. ej. "2026-12-15")');
  if (!parsedHour) throw new AppError(400, 'hour debe tener formato HH:mm');

  const wanted = Date.UTC(parsedDay.year, parsedDay.month - 1, parsedDay.date, Number(parsedHour[1]), Number(parsedHour[2]));
  const offsetAt = (utcMs: number) => wallClockAsUtc(utcMs, timeZone) - utcMs;

  // Dos pasadas: la segunda corrige el desfase cuando hay un cambio de hora entre la estimación y el resultado.
  let guess = wanted - offsetAt(wanted);
  guess = wanted - offsetAt(guess);

  if (wallClockAsUtc(guess, timeZone) !== wanted) {
    throw new AppError(400, `La hora ${hour} del ${day} no existe en ${timeZone} (cambio de hora): elige otra.`);
  }
  return new Date(guess);
};

/** Las `count` ocurrencias semanales de una franja, cada una con su instante UTC correcto (mismo día y hora locales). */
export const weeklyOccurrences = (day: string, hour: string, timeZone: string, count: number) =>
  Array.from({ length: count }, (_, week) => {
    const occurrenceDay = addDays(day, 7 * week);
    return { day: occurrenceDay, startsAt: zonedTimeToUtc(occurrenceDay, hour, timeZone) };
  });
