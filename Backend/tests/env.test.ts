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
