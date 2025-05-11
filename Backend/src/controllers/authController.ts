import { Request, Response } from 'express';
import { registerService, loginService } from '../services/authService';

export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role, studies } = req.body;
    await registerService(name, email, password, role, studies);
     res.status(201).json({ message: 'Usuario registrado correctamente' });
  } catch (error: any) {
     res.status(500).json({ message: error.message || 'Error en el registro' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const token = await loginService(email, password);
     res.status(200).json({ token });
  } catch (error: any) {
     res.status(500).json({ message: error.message || 'Error en el login' });
  }
};
