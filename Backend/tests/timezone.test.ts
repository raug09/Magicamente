import { describe, expect, it } from 'vitest';
import { addDays, isValidTimeZone, parseDayString, weeklyOccurrences, zonedTimeToUtc } from '../src/utils/timezone';
import { formatAppointmentDate } from '../src/utils/dates';

const iso = (date: Date) => date.toISOString();

describe('zonedTimeToUtc', () => {
  it('zona sin horario de verano (Bogotá, UTC-5)', () => {
    expect(iso(zonedTimeToUtc('2026-12-15', '10:00', 'America/Bogota'))).toBe('2026-12-15T15:00:00.000Z');
    expect(iso(zonedTimeToUtc('2026-07-15', '10:00', 'America/Bogota'))).toBe('2026-07-15T15:00:00.000Z');
  });

  it('UTC y zonas con minutos de desfase (India, UTC+5:30)', () => {
    expect(iso(zonedTimeToUtc('2026-12-15', '10:00', 'UTC'))).toBe('2026-12-15T10:00:00.000Z');
    expect(iso(zonedTimeToUtc('2026-12-15', '10:00', 'Asia/Kolkata'))).toBe('2026-12-15T04:30:00.000Z');
  });

  it('respeta el horario de verano: Nueva York', () => {
    expect(iso(zonedTimeToUtc('2026-12-15', '10:00', 'America/New_York'))).toBe('2026-12-15T15:00:00.000Z'); // EST -5
    expect(iso(zonedTimeToUtc('2026-07-15', '10:00', 'America/New_York'))).toBe('2026-07-15T14:00:00.000Z'); // EDT -4
  });

  it('respeta el horario de verano: Madrid', () => {
    expect(iso(zonedTimeToUtc('2026-12-15', '10:00', 'Europe/Madrid'))).toBe('2026-12-15T09:00:00.000Z'); // CET +1
    expect(iso(zonedTimeToUtc('2026-07-15', '10:00', 'Europe/Madrid'))).toBe('2026-07-15T08:00:00.000Z'); // CEST +2
  });

  it('el día puede cambiar al pasar a UTC (zona al este y al oeste)', () => {
    expect(iso(zonedTimeToUtc('2026-12-15', '23:00', 'America/Bogota'))).toBe('2026-12-16T04:00:00.000Z');
    expect(iso(zonedTimeToUtc('2026-12-15', '02:00', 'Asia/Tokyo'))).toBe('2026-12-14T17:00:00.000Z');
  });

  it('una hora que no existe (el reloj salta hacia delante) da error 400', () => {
    // En Nueva York, el 8 de marzo de 2026 a las 02:00 el reloj pasa a las 03:00
    expect(() => zonedTimeToUtc('2026-03-08', '02:30', 'America/New_York')).toThrow(/no existe/);
    expect(iso(zonedTimeToUtc('2026-03-08', '03:30', 'America/New_York'))).toBe('2026-03-08T07:30:00.000Z');
    expect(iso(zonedTimeToUtc('2026-03-08', '01:30', 'America/New_York'))).toBe('2026-03-08T06:30:00.000Z');
  });

  it('una hora que ocurre dos veces (el reloj retrocede) devuelve una de las dos', () => {
    // En Nueva York, el 1 de noviembre de 2026 a las 02:00 el reloj vuelve a la 01:00
    const result = iso(zonedTimeToUtc('2026-11-01', '01:30', 'America/New_York'));
    expect(['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z']).toContain(result);
  });

  it('rechaza días y horas inválidos', () => {
    expect(() => zonedTimeToUtc('2026-02-30', '10:00', 'UTC')).toThrow();
    expect(() => zonedTimeToUtc('15/12/2026', '10:00', 'UTC')).toThrow();
    expect(() => zonedTimeToUtc('2026-12-15', '25:00', 'UTC')).toThrow();
    expect(() => zonedTimeToUtc('2026-12-15', '9:00', 'UTC')).toThrow();
  });
});

describe('weeklyOccurrences', () => {
  it('mantiene la misma hora de pared al cruzar el cambio de horario de verano', () => {
    // EE. UU. adelanta el reloj el 8 de marzo de 2026: 10:00 locales pasan de 15:00Z a 14:00Z
    const weeks = weeklyOccurrences('2026-03-01', '10:00', 'America/New_York', 4);
    expect(weeks.map((w) => w.day)).toEqual(['2026-03-01', '2026-03-08', '2026-03-15', '2026-03-22']);
    expect(weeks.map((w) => iso(w.startsAt))).toEqual([
      '2026-03-01T15:00:00.000Z',
      '2026-03-08T14:00:00.000Z',
      '2026-03-15T14:00:00.000Z',
      '2026-03-22T14:00:00.000Z',
    ]);
  });

  it('cruza el fin de año y de mes', () => {
    expect(weeklyOccurrences('2026-12-28', '09:00', 'UTC', 2).map((w) => w.day)).toEqual(['2026-12-28', '2027-01-04']);
  });

  it('si alguna semana cae en un cambio de hora inexistente, falla entera', () => {
    expect(() => weeklyOccurrences('2026-03-01', '02:30', 'America/New_York', 3)).toThrow(/no existe/);
  });
});

describe('utilidades', () => {
  it('addDays suma días de calendario', () => {
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('parseDayString exige una fecha real con formato YYYY-MM-DD', () => {
    expect(parseDayString('2026-12-15')).toEqual({ year: 2026, month: 12, date: 15 });
    expect(parseDayString('2026-02-29')).toBeNull(); // 2026 no es bisiesto
    expect(parseDayString('2028-02-29')).not.toBeNull();
    expect(parseDayString('2026-1-5')).toBeNull();
    expect(parseDayString('mañana')).toBeNull();
  });

  it('isValidTimeZone', () => {
    for (const ok of ['UTC', 'America/Bogota', 'Europe/Madrid', 'Asia/Kolkata']) expect(isValidTimeZone(ok)).toBe(true);
    for (const bad of ['', 'Marte/Olympus', 'bogota', 123, null, undefined, 'x'.repeat(100)]) expect(isValidTimeZone(bad)).toBe(false);
  });

  it('formatAppointmentDate usa la zona indicada y UTC por defecto', () => {
    const instant = new Date('2026-12-15T15:00:00Z');
    expect(formatAppointmentDate(instant, 'America/Bogota').hour).toBe('10:00');
    expect(formatAppointmentDate(instant, 'Europe/Madrid').hour).toBe('16:00');
    expect(formatAppointmentDate(instant).hour).toBe('15:00');
    expect(formatAppointmentDate(instant, undefined).date).toContain('diciembre');
  });
});
