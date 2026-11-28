import { Router } from 'express';
import { scheduleAppointment, cancelAppointment, getAppointments, updateAppointment } from '../controllers/appointmentController';
import { isAuthenticated, requireRole } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/asyncHandler';
import { validate } from '../validation/validate';
import { createAppointmentSchema, listAppointmentsQuery, updateAppointmentSchema } from '../validation/schemas';

const router = Router();

// Mis citas (paciente o psicólogo).
router.get('/appointment', isAuthenticated, validate({ query: listAppointmentsQuery }), asyncHandler(getAppointments));
// Solo pacientes reservan; el paciente es siempre el usuario autenticado.
router.post(
  '/appointment',
  isAuthenticated,
  requireRole('paciente'),
  validate({ body: createAppointmentSchema }),
  asyncHandler(scheduleAppointment)
);
// Cancelar: paciente o psicólogo de la cita, o administrador.
router.patch('/appointment/cancel/:id', isAuthenticated, asyncHandler(cancelAppointment));
// Marcar como completada: psicólogo de la cita o administrador, una vez pasada la hora.
router.patch('/appointment/update/:id', isAuthenticated, validate({ body: updateAppointmentSchema }), asyncHandler(updateAppointment));

export default router;
