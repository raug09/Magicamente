import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import User from '../src/models/User';
import Schedule from '../src/models/Schedule';
import { hashPassword } from '../src/services/authService';
import { Role } from '../src/middlewares/auth';

export const app = createApp({ rateLimit: false });

export interface TestUser {
  id: string;
  token: string;
  email: string;
}

let counter = 0;

/** Crea un usuario directamente en la BD (así también se pueden crear administradores) y devuelve su token. */
export const createUser = async (role: Role, password = 'secreto123'): Promise<TestUser> => {
  counter++;
  const email = `${role}${counter}@example.com`;
  const user = await User.create({ name: `${role} ${counter}`, email, password: await hashPassword(password), role });
  const token = jwt.sign({ id: user._id, role }, process.env.JWT_SECRET!, { expiresIn: '1h' });
  return { id: String(user._id), token, email };
};

export const auth = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });

/** Fecha (medianoche UTC) dentro de `days` días, en formato YYYY-MM-DD. */
export const futureDay = (days = 10) => {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
};

export const createScheduleFor = (psychologistId: string, days = 10, hour = '10:00') =>
  Schedule.create({ psychologist: psychologistId, day: new Date(futureDay(days)), hour });

export { request };
