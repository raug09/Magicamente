import { Request, Response } from 'express';
import { getUserService, updateUserService, deleteUserService, listUsersService } from '../services/userService';

export const getUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = await getUserService(id);
    if (!user) {
       res.status(404).json({ message: 'Usuario no encontrado' });
    }
     res.status(200).json(user);
  } catch (error: any) {
     res.status(500).json({ message: error.message || 'Error al obtener el usuario' });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const updatedUser = await updateUserService(id, updateData);
    if (!updatedUser) {
       res.status(404).json({ message: 'Usuario no encontrado' });
    }
     res.status(200).json(updatedUser);
  } catch (error: any) {
     res.status(500).json({ message: error.message || 'Error al actualizar el usuario' });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deletedUser = await deleteUserService(id);
    if (!deletedUser) {
       res.status(404).json({ message: 'Usuario no encontrado' });
    }
     res.status(200).json({ message: 'Usuario eliminado correctamente' });
  } catch (error: any) {
     res.status(500).json({ message: error.message || 'Error al eliminar el usuario' });
  }
};

export const listUsers = async (req: Request, res: Response) => {
  try {
    const users = await listUsersService();
     res.status(200).json(users);
  } catch (error: any) {
     res.status(500).json({ message: error.message || 'Error al obtener los usuarios' });
  }
};
