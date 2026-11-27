import { defineConfig } from 'vitest/config';

// Pruebas aparte de la configuración de Vite: no necesitan el plugin de React
// (esbuild ya compila JSX con "jsx": "react-jsx").
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
