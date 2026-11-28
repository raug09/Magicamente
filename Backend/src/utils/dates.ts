import { getAppTimezone } from '../config/env';

/** Formatea fecha y hora de una cita para un correo, en la zona horaria indicada (por defecto, la de la aplicación). */
export const formatAppointmentDate = (date: Date, timeZone?: string) => {
  const zone = timeZone || getAppTimezone();
  return {
    date: date.toLocaleDateString('es-ES', { timeZone: zone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    hour: date.toLocaleTimeString('es-ES', { timeZone: zone, hour: '2-digit', minute: '2-digit' }),
  };
};
