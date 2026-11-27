import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo, /api se reenvía al backend: no hace falta CORS.
const backend = process.env.VITE_BACKEND_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': backend },
  },
  // `npm run preview` (usado por las pruebas de extremo a extremo) también reenvía /api.
  preview: {
    proxy: { '/api': backend },
  },
});
