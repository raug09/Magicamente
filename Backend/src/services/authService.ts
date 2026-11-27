import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User, { IUser } from '../models/User';
import { sendEmail } from './emailService';
import { getJwtSecret } from '../config/env';
import { AppError } from '../utils/AppError';
import { Role } from '../middlewares/auth';

/** Roles que se pueden elegir en el registro público. Los administradores se crean aparte. */
export const SELF_REGISTER_ROLES: Role[] = ['paciente', 'psicologo'];

export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  role?: Role;
  studies?: string[];
}

export const registerService = async ({ name, email, password, role = 'paciente', studies }: RegisterInput): Promise<IUser> => {
  if (!SELF_REGISTER_ROLES.includes(role)) {
    throw new AppError(400, `Rol no permitido en el registro. Usa: ${SELF_REGISTER_ROLES.join(', ')}`);
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new AppError(409, 'El email ya está en uso');
  }

  const newUser = new User({
    name,
    email,
    password: await hashPassword(password),
    role,
    studies,
  });
  await newUser.save();

  try {
    await sendEmail('confirmation', email, name);
  } catch (error) {
    // El usuario ya está guardado: un fallo de correo no debe romper el registro.
    console.error('Error al enviar email de confirmación:', error);
  }

  return newUser;
};

export const loginService = async (email: string, password: string): Promise<string> => {
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new AppError(401, 'Credenciales inválidas');
  }

  return jwt.sign({ id: user._id, role: user.role }, getJwtSecret(), { expiresIn: '1h' });
};
