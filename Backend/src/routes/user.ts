import { Router } from 'express';
import { isAuthenticated, isAdmin, isSelfOrAdmin } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/asyncHandler';
import { getUser, updateUser, deleteUser, listUsers } from '../controllers/userController';

const router = Router();

// Solo administradores: listar todos los usuarios.
router.get('/', isAuthenticated, isAdmin, asyncHandler(listUsers));

// Perfil completo propio (o admin); de otros, solo el perfil público si es psicólogo.
router.get('/:id', isAuthenticated, asyncHandler(getUser));

// Solo la propia cuenta o un administrador.
router.put('/:id', isAuthenticated, isSelfOrAdmin(), asyncHandler(updateUser));
router.delete('/:id', isAuthenticated, isSelfOrAdmin(), asyncHandler(deleteUser));

export default router;
