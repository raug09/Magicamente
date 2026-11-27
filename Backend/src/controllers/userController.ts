import { Request, Response } from 'express';
import {
  getUserService,
  getPublicPsychologistService,
  updateUserService,
  deleteUserService,
  listUsersService,
} from '../services/userService';
import { AppError } from '../utils/AppError';

/**
 * Uno mismo y los administradores ven el perfil completo.
 * El resto solo puede ver el perfil público de un psicólogo.
 */
export const getUser = async (req: Request, res: Response) => {
  const { id } = req.params;
  const requester = req.user!;

  const canSeeFullProfile = requester.role === 'administrador' || requester.id === id;
  const user = canSeeFullProfile ? await getUserService(id) : await getPublicPsychologistService(id);

  if (!user) {
    throw new AppError(404, 'Usuario no encontrado');
  }
  res.status(200).json(user);
};

export const updateUser = async (req: Request, res: Response) => {
  const updatedUser = await updateUserService(req.params.id, req.body, req.user!.role);
  if (!updatedUser) {
    throw new AppError(404, 'Usuario no encontrado');
  }
  res.status(200).json(updatedUser);
};

export const deleteUser = async (req: Request, res: Response) => {
  const deletedUser = await deleteUserService(req.params.id);
  if (!deletedUser) {
    throw new AppError(404, 'Usuario no encontrado');
  }
  res.status(200).json({ message: 'Usuario eliminado correctamente' });
};

export const listUsers = async (req: Request, res: Response) => {
  res.status(200).json(await listUsersService());
};
