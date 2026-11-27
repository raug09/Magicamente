import { Router } from 'express';
import { register, login, forgotPassword, resetPassword, me } from '../controllers/authController';
import { asyncHandler } from '../middlewares/asyncHandler';
import { isAuthenticated } from '../middlewares/auth';

const router = Router();

// Registro público: solo roles paciente o psicologo.
router.post('/register', asyncHandler(register));

router.post('/login', asyncHandler(login));

// Usuario de la sesión actual.
router.get('/me', isAuthenticated, asyncHandler(me));

// Recuperación de contraseña: se pide un enlace por correo y luego se usa el token recibido.
router.post('/forgot-password', asyncHandler(forgotPassword));
router.post('/reset-password', asyncHandler(resetPassword));

export default router;
