import { Router } from 'express';
import { scheduleAppointment, cancelAppointment, getAppointments, updateAppointment } from '../controllers/appointmentController';
import { isAuthenticated, requireRole } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/asyncHandler';

const router = Router();

router.get('/appointment', isAuthenticated, getAppointments);
// Solo pacientes reservan; el paciente es siempre el usuario autenticado.
router.post('/appointment', isAuthenticated, requireRole('paciente'), asyncHandler(scheduleAppointment));
// Cancelar/modificar: paciente o psicólogo de la cita, o administrador.
router.patch('/appointment/cancel/:id', isAuthenticated, asyncHandler(cancelAppointment));
router.patch('/appointment/update/:id', isAuthenticated, asyncHandler(updateAppointment));

export default router;
