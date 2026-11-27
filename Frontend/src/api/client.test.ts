import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, request, setUnauthorizedHandler } from './client';
import { getToken, setToken } from '../auth/session';

const respond = (status: number, body: unknown = null, headers: Record<string, string> = {}) =>
  vi.fn().mockResolvedValue(
    new Response(body === null ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...headers },
    })
  );

describe('cliente HTTP', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setUnauthorizedHandler(() => undefined);
  });

  it('envía el token guardado y no lo envía en las peticiones anónimas', async () => {
    setToken('abc');
    const fetchMock = respond(200, { ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await request('/api/auth/me');
    await request('/api/auth/login', { method: 'POST', body: { a: 1 }, anonymous: true });

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer abc');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBeUndefined();
  });

  it('un 401 borra la sesión y avisa a la app', async () => {
    setToken('abc');
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    vi.stubGlobal('fetch', respond(401, { message: 'La sesión no es válida' }));

    await expect(request('/api/auth/me')).rejects.toMatchObject({ status: 401 });
    expect(getToken()).toBeNull();
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('un 400 de validación llega con la lista de campos', async () => {
    vi.stubGlobal(
      'fetch',
      respond(400, {
        message: 'email no tiene un formato válido',
        errors: [{ field: 'email', message: 'email no tiene un formato válido' }],
      })
    );

    const error = await request('/api/auth/register', { method: 'POST', body: {}, anonymous: true }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).errors).toEqual([{ field: 'email', message: 'email no tiene un formato válido' }]);
  });

  it('un 429 indica cuánto esperar', async () => {
    vi.stubGlobal('fetch', respond(429, { message: 'Demasiadas peticiones' }, { 'Retry-After': '120' }));

    const error = (await request('/api/auth/login', { method: 'POST', anonymous: true }).catch((e: unknown) => e)) as ApiError;
    expect(error.retryAfterSeconds).toBe(120);
    expect(error.message).toContain('120');
  });

  it('sin conexión muestra un mensaje en español', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const error = (await request('/api/psychologists').catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(0);
    expect(error.message).toMatch(/conexión/);
  });
});
