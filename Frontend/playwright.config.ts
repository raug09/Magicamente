import { defineConfig, devices } from '@playwright/test';

// Las pruebas de extremo a extremo necesitan el backend real (y MongoDB) en E2E_API_URL o localhost:3000.
// En el CI lo arranca el workflow; en local: arranca el backend y ejecuta `npm run e2e`.
export default defineConfig({
  testDir: './e2e',
  // Una sola base de datos compartida: los flujos se ejecutan en serie.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
