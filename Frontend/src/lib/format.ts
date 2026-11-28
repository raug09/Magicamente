/**
 * Fechas. El backend guarda instantes en UTC (`startsAt`, `time`): aquí se muestran en la zona horaria
 * del usuario que mira la pantalla, nunca en la del navegador ni en la del psicólogo.
 */

const SHORT_DATE: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
const TIME: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };

/** "Martes, 5 de enero": solo la primera letra en mayúscula, como manda el español. */
export const formatDay = (iso: string, timeZone: string): string => {
  const text = new Intl.DateTimeFormat('es', { ...SHORT_DATE, timeZone }).format(new Date(iso));
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export const formatTime = (iso: string, timeZone: string): string =>
  new Intl.DateTimeFormat('es', { ...TIME, timeZone }).format(new Date(iso));

/** Clave para agrupar por día en la zona del usuario, p. ej. "2026-12-15". */
export const dayKey = (iso: string, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).formatToParts(
    new Date(iso)
  );
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

/** Una cita se puede cancelar solo si aún no ha empezado. */
export const hasStarted = (iso: string, now = new Date()): boolean => new Date(iso).getTime() <= now.getTime();

/** Zona horaria del navegador (para pre-rellenar el registro). Si no se puede leer, UTC. */
export const browserTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};
