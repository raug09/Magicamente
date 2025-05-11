import { Router } from 'express';
import { register, login } from '../controllers/authController';
import { asyncHandler } from '../middlewares/asyncHandler';
import { isAuthenticated } from '../middlewares/auth';

const router = Router();

// Ruta para registrar un paciente (registro público)
router.post('/register', asyncHandler(register));

// Ruta para iniciar sesión
router.post('/login', asyncHandler(login));


export default router;
