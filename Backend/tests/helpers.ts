import crypto from 'crypto';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import Session from '../src/models/Session';
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

/** Crea una sesión en la BD y devuelve un JWT que apunta a ella (como hace el login). */
export const sessionToken = async (userId: unknown, role: Role): Promise<string> => {
  const jti = crypto.randomUUID();
  await Session.create({ userId, jti, expiresAt: new Date(Date.now() + 60 * 60 * 1000) });
  return jwt.sign({ id: userId, role, jti }, process.env.JWT_SECRET!, { expiresIn: '1h' });
};

/** Crea un usuario directamente en la BD (así también se pueden crear administradores) y devuelve su token. */
export const createUser = async (role: Role, password = 'secreto123'): Promise<TestUser> => {
  counter++;
  const email = `${role}${counter}@example.com`;
  const user = await User.create({
    name: `${role} ${counter}`,
    email,
    password: await hashPassword(password),
    role,
    emailVerified: true,
    approved: true,
  });
  const token = await sessionToken(user._id, role);
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
