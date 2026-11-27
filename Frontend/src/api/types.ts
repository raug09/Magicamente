import type { components, paths } from './schema';

/** Atajos a los tipos generados desde docs/openapi.json (`npm run api:types`). */
export type User = components['schemas']['User'];
export type Schedule = components['schemas']['Schedule'];
export type MyAppointment = components['schemas']['MyAppointment'];
export type PublicPsychologist = components['schemas']['PublicPsychologist'];
export type Page<T> = { total: number; page: number; limit: number; pages: number; items: T[] };

export type { paths };
