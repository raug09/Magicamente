import { expect, test } from '@playwright/test';

// Datos que siembra Backend/scripts/e2e-seed.ts (mismo archivo de constantes).
const PATIENT_EMAIL = 'paciente.e2e@example.com';
const PASSWORD = 'secreto123';
const PSYCHOLOGIST = 'Ana E2E Pérez';

const login = async (page: import('@playwright/test').Page, email: string, password: string) => {
  await page.goto('/entrar');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
};

test('sin sesión, las páginas privadas llevan al login', async ({ page }) => {
  await page.goto('/citas');
  await expect(page).toHaveURL(/\/entrar$/);
});

test('una contraseña incorrecta muestra el error del servidor', async ({ page }) => {
  await login(page, PATIENT_EMAIL, 'otra-clave-123');
  await expect(page.getByRole('alert')).toContainText('Credenciales inválidas');
  await expect(page).toHaveURL(/\/entrar$/);
});

test('registro: crea la cuenta y pide revisar el correo', async ({ page }) => {
  const email = `nuevo.${Date.now()}@example.com`;
  await page.goto('/registro');
  await page.getByLabel('Nombre').fill('Nuevo Paciente');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('alert')).toContainText('Revisa tu correo');
});

test('paciente: busca, reserva una cita y la cancela', async ({ page }) => {
  await login(page, PATIENT_EMAIL, PASSWORD);
  await expect(page).toHaveURL(/\/psicologos$/);

  // Buscar por nombre y abrir el perfil.
  await page.getByPlaceholder('Buscar por nombre').fill('Ana E2E');
  await page.getByRole('link', { name: PSYCHOLOGIST }).click();
  await expect(page.getByRole('heading', { name: PSYCHOLOGIST })).toBeVisible();

  // Reservar la franja de las 10:00 (hora de Bogotá).
  await page.getByRole('button', { name: '10:00', exact: true }).click();
  await expect(page.getByText('Cita reservada')).toBeVisible();

  // Aparece en mis citas como pendiente y se puede cancelar.
  await page.getByRole('link', { name: 'Mis citas' }).click();
  await expect(page.getByText('Pendiente', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByText('Cita cancelada')).toBeVisible();
  await expect(page.getByText('Cancelada', { exact: true })).toBeVisible();

  // La franja vuelve a estar libre para otra reserva.
  await page.getByRole('link', { name: 'Psicólogos' }).click();
  await page.getByRole('link', { name: PSYCHOLOGIST }).click();
  await expect(page.getByRole('button', { name: '10:00', exact: true })).toBeVisible();
});

test('salir borra la sesión', async ({ page }) => {
  await login(page, PATIENT_EMAIL, PASSWORD);
  await expect(page).toHaveURL(/\/psicologos$/);
  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  expect(await page.evaluate(() => sessionStorage.getItem('magicamente.token'))).toBeNull();
});
