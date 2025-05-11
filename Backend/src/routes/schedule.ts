// routes/schedule.ts
import { Router } from 'express';
import { createSchedule, getSchedulesByPsychologist } from '../controllers/scheduleController';
import { isAuthenticated } from '../middlewares/auth';


const router = Router();

// Crear un horario (POST /api/schedule)
router.post('/', isAuthenticated, createSchedule);

// Obtener todos los horarios de un psicólogo (GET /api/schedule/:psychologistId)
router.get('/:psychologistId', isAuthenticated, getSchedulesByPsychologist);

export default router;
