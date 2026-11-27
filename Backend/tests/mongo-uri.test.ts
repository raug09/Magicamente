import { describe, expect, it } from 'vitest';
import { describeMongoUri } from '../src/config/mongoUri';

describe('describeMongoUri', () => {
  it('una dirección correcta no tiene problemas y no revela la contraseña', () => {
    const report = describeMongoUri(
      'mongodb+srv://magicamente_app:Abc123Xyz789@cluster0.abc12.mongodb.net/magicamente_pruebas?retryWrites=true&w=majority'
    );
    expect(report.problems).toEqual([]);
    expect(report).toMatchObject({
      scheme: 'mongodb+srv',
      username: 'magicamente_app',
      passwordLength: 12,
      host: 'cluster0.abc12.mongodb.net',
      database: 'magicamente_pruebas',
    });
    expect(JSON.stringify(report)).not.toContain('Abc123Xyz789');
  });

  it('detecta los símbolos < > que sobran', () => {
    const report = describeMongoUri('mongodb+srv://user:<MiClave123>@cluster0.abc12.mongodb.net/db?x=1');
    expect(report.problems.join(' ')).toContain('< o >');
  });

  it('detecta una contraseña con @', () => {
    const report = describeMongoUri('mongodb+srv://user:cla@ve123@cluster0.abc12.mongodb.net/db?x=1');
    expect(report.problems.join(' ')).toContain('más de un @');
  });

  it('detecta símbolos sin codificar en la contraseña', () => {
    const report = describeMongoUri('mongodb+srv://user:abc:def@cluster0.abc12.mongodb.net/db?x=1');
    expect(report.problems.join(' ')).toContain('símbolos');
  });

  it('detecta espacios, falta de base de datos y valores vacíos', () => {
    expect(describeMongoUri(' mongodb+srv://user:clave123@cluster0.abc12.mongodb.net/db').problems.join(' ')).toContain('espacios');
    expect(describeMongoUri('mongodb+srv://user:clave123@cluster0.abc12.mongodb.net/?retryWrites=true').problems.join(' ')).toContain(
      'base de datos'
    );
    expect(describeMongoUri('').problems).toEqual(['MONGO_URI está vacía']);
    expect(describeMongoUri('http://algo').problems[0]).toContain('mongodb');
  });
});
