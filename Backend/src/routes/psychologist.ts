import { Router } from 'express';
import { listPsychologists } from '../controllers/psychologistController';
import { isAuthenticated } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/asyncHandler';
import { validate } from '../validation/validate';
import { listPsychologistsQuery } from '../validation/schemas';

const router = Router();

// Cualquier usuario autenticado puede ver el listado de psicólogos.
router.get('/', isAuthenticated, validate({ query: listPsychologistsQuery }), asyncHandler(listPsychologists));

export default router;
