import { Router } from 'express';
import { listPsychologists } from '../controllers/psychologistController';
import { isAuthenticated } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/asyncHandler';

const router = Router();

// Cualquier usuario autenticado puede ver el listado de psicólogos.
router.get('/', isAuthenticated, asyncHandler(listPsychologists));

export default router;
