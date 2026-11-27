import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { API_ROUTERS, createApp } from '../src/app';
import { getOpenApiDocument } from '../src/docs/openapi';
import { OPENAPI_FILE, serializeOpenApi } from '../scripts/export-openapi';
import { app, request } from './helpers';

interface RouteLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

/** Todas las rutas de los routers de la API, como "get /api/users/{id}". */
const expressRoutes = () =>
  API_ROUTERS.flatMap(([prefix, router]) =>
    (router.stack as RouteLayer[])
      .filter((layer) => layer.route)
      .flatMap(({ route }) =>
        Object.keys(route!.methods).map((method) => `${method} ${(prefix + route!.path).replace(/\/$/, '').replace(/:(\w+)/g, '{$1}')}`)
      )
  );

const documentedRoutes = () =>
  Object.entries(getOpenApiDocument().paths).flatMap(([path, item]) => Object.keys(item as object).map((method) => `${method} ${path}`));

describe('documentación OpenAPI', () => {
  it('documenta todas las rutas de la API, y solo las que existen', () => {
    const express = expressRoutes().sort();
    const documented = documentedRoutes()
      .filter((route) => route !== 'get /health')
      .sort();
    expect(express.length).toBeGreaterThan(20);
    expect(documented).toEqual(express);
  });

  it('las rutas con sesión declaran el token y la respuesta 401', () => {
    const { paths } = getOpenApiDocument();
    const login = paths['/api/auth/login'].post!;
    const me = paths['/api/auth/me'].get!;
    expect(login.security).toBeUndefined();
    expect(me.security).toEqual([{ bearerAuth: [] }]);
    expect(me.responses['401']).toBeDefined();
  });

  it('docs/openapi.json está al día (si falla: npm run openapi)', () => {
    expect(readFileSync(OPENAPI_FILE, 'utf8')).toBe(serializeOpenApi());
  });

  it('sirve el esquema y la interfaz en /api/docs', async () => {
    const spec = await request(app).get('/api/docs/openapi.json');
    expect(spec.status).toBe(200);
    expect(spec.body.openapi).toBe('3.0.3');

    const ui = await request(app).get('/api/docs/');
    expect(ui.status).toBe(200);
    expect(ui.text).toContain('swagger-ui');
  });

  it('se puede desactivar', async () => {
    const withoutDocs = createApp({ rateLimit: false, apiDocs: false });
    expect((await request(withoutDocs).get('/api/docs/openapi.json')).status).toBe(404);
    expect((await request(withoutDocs).get('/api/docs/')).status).toBe(404);
  });
});
