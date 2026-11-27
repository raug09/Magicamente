/**
 * Token de sesión en sessionStorage: se borra al cerrar la pestaña.
 * Todas las operaciones están protegidas: si el navegador bloquea el almacenamiento, la app sigue funcionando sin sesión guardada.
 */
const KEY = 'magicamente.token';

export const getToken = (): string | null => {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export const setToken = (token: string) => {
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    /* sin almacenamiento: la sesión dura solo esta carga de página */
  }
};

export const clearToken = () => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nada que borrar */
  }
};
