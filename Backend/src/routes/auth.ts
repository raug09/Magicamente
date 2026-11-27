import { Router } from 'express';
import {
  register,
  login,
  forgotPassword,
  resetPassword,
  me,
  verifyEmail,
  resendVerification,
  requestEmailChange,
  confirmEmailChange,
  logout,
  logoutAll,
  listSessions,
  revokeSession,
} from '../controllers/authController';
import { asyncHandler } from '../middlewares/asyncHandler';
import { isAuthenticated } from '../middlewares/auth';
import { validate } from '../validation/validate';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  resendVerificationSchema,
  verifyEmailSchema,
  requestEmailChangeSchema,
  confirmEmailChangeSchema,
} from '../validation/schemas';

const router = Router();

// Registro público: solo roles paciente o psicologo.
router.post('/register', validate({ body: registerSchema }), asyncHandler(register));

router.post('/login', validate({ body: loginSchema }), asyncHandler(login));

// Usuario de la sesión actual.
router.get('/me', isAuthenticated, asyncHandler(me));

// Recuperación de contraseña: se pide un enlace por correo y luego se usa el token recibido.
router.post('/forgot-password', validate({ body: forgotPasswordSchema }), asyncHandler(forgotPassword));
router.post('/reset-password', validate({ body: resetPasswordSchema }), asyncHandler(resetPassword));

// Verificación de email: el enlace llega al registrarse; si caduca, se pide otro.
router.post('/verify-email', validate({ body: verifyEmailSchema }), asyncHandler(verifyEmail));
router.post('/resend-verification', validate({ body: resendVerificationSchema }), asyncHandler(resendVerification));

// Cambio de email: pedirlo (con sesión y contraseña) y confirmarlo desde el nuevo correo.
router.post('/change-email', isAuthenticated, validate({ body: requestEmailChangeSchema }), asyncHandler(requestEmailChange));
router.post('/confirm-email-change', validate({ body: confirmEmailChangeSchema }), asyncHandler(confirmEmailChange));

// Sesiones: cerrar la actual, cerrar todas, listar y cerrar una concreta.
router.post('/logout', isAuthenticated, asyncHandler(logout));
router.post('/logout-all', isAuthenticated, asyncHandler(logoutAll));
router.get('/sessions', isAuthenticated, asyncHandler(listSessions));
router.delete('/sessions/:id', isAuthenticated, asyncHandler(revokeSession));

export default router;
