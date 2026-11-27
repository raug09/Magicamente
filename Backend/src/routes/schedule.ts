import { Router } from 'express';
import { createSchedule, getSchedulesByPsychologist } from '../controllers/scheduleController';
import { isAuthenticated, requireRole } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/asyncHandler';

const router = Router();

// Crear una franja: solo psicólogos (para sí mismos) o administradores.
router.post('/', isAuthenticated, requireRole('psicologo', 'administrador'), asyncHandler(createSchedule));

// Franjas de un psicólogo: cualquier usuario autenticado.
router.get('/:psychologistId', isAuthenticated, asyncHandler(getSchedulesByPsychologist));

export default router;
