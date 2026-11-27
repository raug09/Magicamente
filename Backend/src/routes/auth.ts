import { Router } from 'express';
import { register, login } from '../controllers/authController';
import { asyncHandler } from '../middlewares/asyncHandler';

const router = Router();

// Registro público: solo roles paciente o psicologo.
router.post('/register', asyncHandler(register));

router.post('/login', asyncHandler(login));

export default router;
