import { Router } from 'express';
import { isAuthenticated, isAdmin } from '../middlewares/auth';
import { getUser, updateUser, deleteUser, listUsers } from '../controllers/userController';

const router = Router();

// Obtener usuario (solo autenticado)
router.get('/:id', isAuthenticated, getUser);

// Actualizar usuario (solo el propio o administrador, la lógica de validación se puede hacer dentro del controlador)
router.put('/:id', isAuthenticated, updateUser);

// Eliminar usuario (solo el propio o administrador)
router.delete('/:id', isAuthenticated, deleteUser);

// Ruta para que el administrador liste todos los usuarios
router.get('/', isAuthenticated, isAdmin, listUsers);

export default router;
