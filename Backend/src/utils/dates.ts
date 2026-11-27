import { getAppTimezone } from '../config/env';

/** Formatea fecha y hora de una cita para un correo, en la zona horaria indicada. */
export const formatAppointmentDate = (date: Date, timeZone = getAppTimezone()) => ({
  date: date.toLocaleDateString('es-ES', { timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  hour: date.toLocaleTimeString('es-ES', { timeZone, hour: '2-digit', minute: '2-digit' }),
});
