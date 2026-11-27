import { afterEach, describe, expect, it } from 'vitest';
import { assertRequiredEnv, getJwtSecret } from '../src/config/env';

describe('variables de entorno', () => {
  const original = process.env.JWT_SECRET;
  afterEach(() => {
    process.env.JWT_SECRET = original;
  });

  it('falla si JWT_SECRET no está definido (no hay secreto por defecto)', () => {
    delete process.env.JWT_SECRET;
    expect(() => assertRequiredEnv()).toThrow(/JWT_SECRET/);
    expect(() => getJwtSecret()).toThrow(/JWT_SECRET/);
  });

  it('falla si JWT_SECRET está vacío', () => {
    process.env.JWT_SECRET = '   ';
    expect(() => assertRequiredEnv()).toThrow(/JWT_SECRET/);
  });

  it('acepta un JWT_SECRET definido', () => {
    process.env.JWT_SECRET = 'algo';
    expect(() => assertRequiredEnv()).not.toThrow();
  });
});

import { getFrontendUrl } from '../src/config/env';

describe('FRONTEND_URL', () => {
  const original = process.env.FRONTEND_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = original;
  });

  it('tiene un valor por defecto y se limpia la barra final', () => {
    delete process.env.FRONTEND_URL;
    expect(getFrontendUrl()).toBe('http://localhost:5173');
    process.env.FRONTEND_URL = 'https://app.magicamente.online//';
    expect(getFrontendUrl()).toBe('https://app.magicamente.online');
  });
});

import { getCorsOrigins, getTrustProxy } from '../src/config/env';

describe('TRUST_PROXY', () => {
  const original = process.env.TRUST_PROXY;
  afterEach(() => {
    if (original === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = original;
  });

  it('sin definir no se confía en ningún proxy; admite número y booleanos', () => {
    delete process.env.TRUST_PROXY;
    expect(getTrustProxy()).toBeUndefined();
    process.env.TRUST_PROXY = '1';
    expect(getTrustProxy()).toBe(1);
    process.env.TRUST_PROXY = 'true';
    expect(getTrustProxy()).toBe(true);
    process.env.TRUST_PROXY = 'valor-raro';
    expect(getTrustProxy()).toBeUndefined();
  });
});

describe('CORS_ORIGIN', () => {
  const original = { cors: process.env.CORS_ORIGIN, frontend: process.env.FRONTEND_URL };
  afterEach(() => {
    for (const [key, value] of [['CORS_ORIGIN', original.cors], ['FRONTEND_URL', original.frontend]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('por defecto es el origen del frontend', () => {
    delete process.env.CORS_ORIGIN;
    process.env.FRONTEND_URL = 'https://app.magicamente.online/ruta';
    expect(getCorsOrigins()).toEqual(['https://app.magicamente.online']);
  });

  it('acepta lista y comodín', () => {
    process.env.CORS_ORIGIN = 'https://a.com/, https://b.com';
    expect(getCorsOrigins()).toEqual(['https://a.com', 'https://b.com']);
    process.env.CORS_ORIGIN = '*';
    expect(getCorsOrigins()).toBe('*');
  });
});
