import { Router } from 'express';
import { register, login, forgotPassword, resetPassword, me } from '../controllers/authController';
import { asyncHandler } from '../middlewares/asyncHandler';
import { isAuthenticated } from '../middlewares/auth';
import { validate } from '../validation/validate';
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from '../validation/schemas';

const router = Router();

// Registro público: solo roles paciente o psicologo.
router.post('/register', validate({ body: registerSchema }), asyncHandler(register));

router.post('/login', validate({ body: loginSchema }), asyncHandler(login));

// Usuario de la sesión actual.
router.get('/me', isAuthenticated, asyncHandler(me));

// Recuperación de contraseña: se pide un enlace por correo y luego se usa el token recibido.
router.post('/forgot-password', validate({ body: forgotPasswordSchema }), asyncHandler(forgotPassword));
router.post('/reset-password', validate({ body: resetPasswordSchema }), asyncHandler(resetPassword));

export default router;
