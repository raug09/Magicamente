/**
 * Cliente HTTP de la API. Único punto que habla con el backend.
 *  - Añade `Authorization: Bearer <token>` si hay sesión.
 *  - Un 401 cierra la sesión (el resto de la app vuelve al login).
 *  - Los errores llegan como `ApiError` con el mensaje del servidor y, en validación, los campos.
 */
import { clearToken, getToken } from '../auth/session';

export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors: FieldError[] = [],
    public retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Listener que se avisa cuando el servidor responde 401 (sesión caducada o cerrada). */
let onUnauthorized: (() => void) | undefined;
export const setUnauthorizedHandler = (handler: () => void) => {
  onUnauthorized = handler;
};

type Query = Record<string, string | number | boolean | undefined>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  /** Sin sesión: no se envía el token (login, registro, recuperación…). */
  anonymous?: boolean;
}

const buildUrl = (path: string, query?: Query) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
};

export const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const { method = 'GET', body, query, anonymous = false } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = anonymous ? null : getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.');
  }

  const data = response.status === 204 ? null : await response.json().catch(() => null);

  if (response.status === 401 && token) {
    clearToken();
    onUnauthorized?.();
  }

  if (!response.ok) {
    const retry = Number(response.headers.get('Retry-After'));
    const message =
      response.status === 429
        ? `Demasiados intentos. Espera ${retry || 'unos minutos'} y vuelve a intentarlo.`
        : (data?.message ?? 'Algo salió mal. Inténtalo de nuevo.');
    throw new ApiError(response.status, message, data?.errors ?? [], retry || undefined);
  }

  return data as T;
};
