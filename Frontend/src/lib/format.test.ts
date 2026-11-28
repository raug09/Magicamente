import { describe, expect, it } from 'vitest';
import { dayKey, formatTime, hasStarted } from './format';

describe('fechas en la zona del usuario', () => {
  // 2026-12-15 20:30 UTC = 15:30 en Bogotá (UTC-5), y ya es 16 de diciembre en Tokio (UTC+9).
  const instant = '2026-12-15T20:30:00.000Z';

  it('muestra la hora en la zona indicada', () => {
    expect(formatTime(instant, 'America/Bogota')).toBe('15:30');
    expect(formatTime(instant, 'Asia/Tokyo')).toBe('05:30');
  });

  it('agrupa por el día de esa zona', () => {
    expect(dayKey(instant, 'America/Bogota')).toBe('2026-12-15');
    expect(dayKey(instant, 'Asia/Tokyo')).toBe('2026-12-16');
  });

  it('sabe si una cita ya empezó', () => {
    const now = new Date('2026-12-15T21:00:00.000Z');
    expect(hasStarted(instant, now)).toBe(true);
    expect(hasStarted('2026-12-16T00:00:00.000Z', now)).toBe(false);
  });
});

describe('formatDay', () => {
  it('pone en mayúscula solo la primera letra', async () => {
    const { formatDay } = await import('./format');
    expect(formatDay('2027-01-05T15:00:00.000Z', 'America/Bogota')).toBe('Martes, 5 de enero');
  });
});
