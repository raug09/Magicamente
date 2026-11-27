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
