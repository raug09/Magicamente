import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    // Una sola base de datos en memoria compartida: los ficheros se ejecutan en serie.
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 20_000,
  },
});
