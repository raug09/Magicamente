import User from '../models/User';

export interface ListPsychologistsOptions {
  /** Texto a buscar en el nombre (sin distinguir mayúsculas). */
  q?: string;
  page: number;
  limit: number;
}

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Campos públicos de un psicólogo: nunca email, contraseña ni horarios. */
const PUBLIC_FIELDS = 'name studies description';

export const listPsychologists = async ({ q, page, limit }: ListPsychologistsOptions) => {
  const filter: Record<string, unknown> = {
    role: 'psicologo',
    approved: { $ne: false }, // los psicólogos pendientes de aprobación no aparecen
    isActive: { $ne: false }, // los desactivados no aparecen
  };
  if (q) {
    filter.name = { $regex: escapeRegex(q), $options: 'i' };
  }

  const [total, psychologists] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter)
      .select(PUBLIC_FIELDS)
      .sort({ name: 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
  ]);

  return { total, page, limit, psychologists };
};
