import { Router } from 'express';
import { scheduleAppointment, cancelAppointment, getAppointments, updateAppointment  } from '../controllers/appointmentController';
import { isAuthenticated } from '../middlewares/auth';

const router = Router();

router.get('/appointment', isAuthenticated, getAppointments);
router.post('/appointment', isAuthenticated, scheduleAppointment);
router.patch('/appointment/cancel/:id', isAuthenticated, cancelAppointment);
router.patch('/appointment/update/:id', isAuthenticated, updateAppointment);

export default router;
