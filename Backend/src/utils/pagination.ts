/** Forma de todas las listas paginadas de la API. */
export interface Page<T> {
  total: number;
  page: number;
  limit: number;
  pages: number;
  items: T[];
}

export const toPage = <T>(items: T[], total: number, page: number, limit: number): Page<T> => ({
  total,
  page,
  limit,
  pages: Math.max(1, Math.ceil(total / limit)),
  items,
});

/** Documentos a saltar para llegar a la página pedida. */
export const skipFor = (page: number, limit: number): number => (page - 1) * limit;
