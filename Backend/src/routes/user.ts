import { Router } from 'express';
import { isAuthenticated, isAdmin, isSelfOrAdmin } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/asyncHandler';
import { validate } from '../validation/validate';
import { updateUserSchema } from '../validation/schemas';
import { getUser, updateUser, deleteUser, listUsers, setVerification } from '../controllers/userController';
import { verificationSchema } from '../validation/schemas';

const router = Router();

// Solo administradores: listar todos los usuarios.
router.get('/', isAuthenticated, isAdmin, asyncHandler(listUsers));

// Perfil completo propio (o admin); de otros, solo el perfil público si es psicólogo.
router.get('/:id', isAuthenticated, asyncHandler(getUser));

// Solo la propia cuenta o un administrador.
router.put('/:id', isAuthenticated, isSelfOrAdmin(), validate({ body: updateUserSchema }), asyncHandler(updateUser));
router.delete('/:id', isAuthenticated, isSelfOrAdmin(), asyncHandler(deleteUser));

// Verificación de un psicólogo: solo administradores.
router.put('/:id/verification', isAuthenticated, isAdmin, validate({ body: verificationSchema }), asyncHandler(setVerification));

export default router;
