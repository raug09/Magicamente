import User, { IUser } from '../models/User';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { sendEmail } from "../services/emailService";

export const registerService = async (name: string, email: string, password: string, role: string, studies: string[]): Promise<IUser> => {
  
    
  // Verificar si el usuario ya existe
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new Error('El email ya está en uso');
  }

  // Encriptar la contraseña
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Crear el usuario con rol "paciente" por defecto
  const newUser: IUser = new User({
    name,
    email,
    password: hashedPassword,
    role,
    studies,
  });

  await newUser.save();
  
  try {
    await sendEmail("confirmation", email, name);
  } catch (error) {
    console.error("Error al enviar email de confirmación:", error);
    // No hacemos throw aquí porque ya guardamos el usuario
  }
  
  return newUser;
};

export const loginService = async (email: string, password: string): Promise<string> => {
  // Buscar el usuario por email
  const user = await User.findOne({ email });
  if (!user) {
    throw new Error('Credenciales inválidas');
  }

  // Verificar la contraseña
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new Error('Credenciales inválidas');
  }

  // Generar el token JWT
  const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: '1h' }
  );

  return token;
};
