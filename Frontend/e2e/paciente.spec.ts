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

test('recuperar contraseña: pide el enlace sin revelar si la cuenta existe', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click();
  await expect(page).toHaveURL(/\/recuperar$/);
  await page.getByLabel('Email').fill('no-existe.e2e@example.com');
  await page.getByRole('button', { name: 'Enviar enlace' }).click();
  await expect(page.getByRole('alert')).toContainText('Si el email está registrado');
});

test('restablecer contraseña con un enlace no válido muestra el error', async ({ page }) => {
  await page.goto('/reset-password?token=token-que-no-existe');
  await page.getByLabel('Contraseña nueva', { exact: true }).fill('nueva-clave-123');
  await page.getByLabel('Repite la contraseña').fill('nueva-clave-123');
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page.getByRole('alert')).toContainText('no es válido');
});

test('las contraseñas que no coinciden se avisan antes de enviar', async ({ page }) => {
  await page.goto('/reset-password?token=abc');
  await page.getByLabel('Contraseña nueva', { exact: true }).fill('nueva-clave-123');
  await page.getByLabel('Repite la contraseña').fill('otra-clave-456');
  await expect(page.getByText('No coincide con la contraseña')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cambiar contraseña' })).toBeDisabled();
});

test('cambiar email: con contraseña incorrecta muestra error; con la correcta pide confirmación', async ({ page }) => {
  await login(page, PATIENT_EMAIL, PASSWORD);
  await expect(page).toHaveURL(/\/psicologos$/);
  await page.getByRole('link', { name: 'Mi cuenta' }).click();

  await page.getByLabel('Nuevo email').fill(`cambio.${Date.now()}@example.com`);
  await page.getByLabel('Contraseña actual').fill('clave-equivocada-123');
  await page.getByRole('button', { name: 'Enviar enlace de confirmación' }).click();
  await expect(page.getByRole('alert').first()).toBeVisible();

  await page.getByLabel('Contraseña actual').fill(PASSWORD);
  await page.getByRole('button', { name: 'Enviar enlace de confirmación' }).click();
  await expect(page.getByText('Revisa la nueva dirección')).toBeVisible();
});

test('mi cuenta: muestra la sesión actual y permite cerrar todas las sesiones', async ({ page }) => {
  await login(page, PATIENT_EMAIL, PASSWORD);
  await expect(page).toHaveURL(/\/psicologos$/);
  await page.getByRole('link', { name: 'Mi cuenta' }).click();
  await expect(page.getByText('Esta sesión')).toBeVisible();

  await page.getByRole('button', { name: 'Cerrar todas' }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  expect(await page.evaluate(() => sessionStorage.getItem('magicamente.token'))).toBeNull();
});
