import { Router } from 'express';
import {
  createSchedule,
  deleteSchedule,
  getSchedulesByPsychologist,
  updateSchedule,
} from '../controllers/scheduleController';
import { isAuthenticated, requireRole } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/asyncHandler';

const router = Router();

const canManageSchedules = [isAuthenticated, requireRole('psicologo', 'administrador')];

// Crear una franja: solo psicólogos (para sí mismos) o administradores.
router.post('/', ...canManageSchedules, asyncHandler(createSchedule));

// Franjas de un psicólogo (filtros: ?available=true&from=&to=): cualquier usuario autenticado.
router.get('/:psychologistId', isAuthenticated, asyncHandler(getSchedulesByPsychologist));

// Modificar o borrar una franja libre: su psicólogo o un administrador.
router.put('/:id', ...canManageSchedules, asyncHandler(updateSchedule));
router.delete('/:id', ...canManageSchedules, asyncHandler(deleteSchedule));

export default router;
