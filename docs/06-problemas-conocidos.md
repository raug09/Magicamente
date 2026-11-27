# 06 · Problemas conocidos

Revisión inicial del código el 27/11/2026. La tabla de **Resueltos** recoge lo corregido después, en esta misma rama (pasos 1–3 de la hoja de ruta).

Prioridad: 🔴 crítico · 🟠 importante · 🟡 menor.

## Pendientes

### Fallos funcionales

| # | Prio | Problema | Dónde |
|---|---|---|---|
| F12 | 🟡 | Crear horario compara `day` (medianoche) con ahora: imposible crear franjas para hoy | `scheduleController.createSchedule` |
| F14 | 🟡 | Las horas se interpretan en UTC; sin gestión de zona horaria por usuario | `appointmentService`, `Schedule.hour` |
| F16 | 🟡 | Borrar un usuario deja horarios y citas huérfanos | `userService.deleteUserService` |

### Seguridad

| # | Prio | Problema | Arreglo sugerido |
|---|---|---|---|
| S10 | 🟡 | Sin rate limiting en login, CORS abierto a `*`, sin `helmet` | `express-rate-limit`, `cors({ origin })`, `helmet` |
| S11 | 🟡 | `isActive` no se comprueba en login ni en el middleware | Rechazar usuarios inactivos |
| S12 | 🟡 | Un token sigue valiendo hasta 1 h después de cambiar el rol o borrar al usuario (el rol va dentro del JWT) | Comprobar el usuario en BD en `isAuthenticated`, o tokens más cortos |

### Deuda técnica

- Sin validación de entrada declarativa (sugerencia: `zod`); hoy hay validaciones a mano en los controladores.
- Sin linter/formatter.
- Sin logger (`pino`); quedan algunos `console.log` sueltos.
- Nombre de archivo inconsistente: `models/appointment.ts` frente a `User.ts` y `Schedule.ts`.
- Campo `recurrent` y plantilla `resetPassword` sin uso.
- Mezcla de idiomas en mensajes de respuesta (inglés y español).
- El email no se normaliza (mayúsculas/espacios).

## Resueltos

| # | Problema | Solución |
|---|---|---|
| S1 | Registro como `administrador` | El registro solo admite `paciente` y `psicologo` (`400` en otro caso) |
| S2 | Cualquiera podía leer/editar/borrar a cualquiera | `isSelfOrAdmin`, lista blanca de campos por rol, contraseña hasheada al cambiarla; perfil ajeno solo si es psicólogo (público) |
| S3 | `JWT_SECRET` con valor por defecto `'secret'` | `config/env.ts`: el servidor no arranca sin él |
| S4, S8 | Endpoints de correo de prueba abiertos / dirección personal fija | Eliminados junto con `notificationService` y `emailConfig.ts` |
| S5 | `patientId` del body, sin control de propiedad en citas | Paciente del token, psicólogo del horario, `getOwnedAppointment` en cancelar/modificar |
| S6 | Cualquiera creaba horarios de cualquier psicólogo | `requireRole('psicologo','administrador')` y el psicólogo es siempre el autenticado |
| S7 | `updateAppointment` con `Object.assign` del body | Solo `state`, validado contra el enum |
| S9 | Errores internos devueltos al cliente | `errorHandler` centralizado; 500 genérico |
| F2 | Cron cada minuto (~1440 correos por cita), incluía canceladas | Cada hora, `reminderSent` atómico, solo `pendiente` en las próximas 24 h, reintento si falla |
| F3 | `npm start` fallaba (sin `outDir`) | `tsconfig.json` compila `src/` → `dist/` |
| F7 | Respuestas dobles tras 404 en usuarios y cancelar cita | `AppError` + `asyncHandler` |
| F9 | Dependencias en el `package.json` de la raíz | Movidas a `Backend/`; eliminado el de la raíz |
| F11 | Login fallido 500, email duplicado 500 | 401 y 409 |
| F13 | Recordatorio “el 15 a las 10” | Fecha completa y hora con minutos en `APP_TIMEZONE` |
| F17 | Ids mal formados → 500 | 400 |
| — | `@types/express@5` con Express 4, `ts-node-dev` en dependencies | Corregido |
| — | Resend fallaba al arrancar sin API key | Cliente perezoso; sin key se avisa en consola |
| F8 | Los pacientes no podían descubrir psicólogos | `GET /api/psychologists` con búsqueda por nombre, paginación y solo campos públicos |
| — | Sin tests ni CI | Vitest + Supertest + MongoDB en memoria; workflow de GitHub Actions |
| F1 | “Mis citas” siempre devolvía 403 (roles en inglés) y respondía dos veces | Roles `paciente`/`psicologo`, `asyncHandler`; el populate ya no expone contraseñas ni emails ajenos; ordenado por fecha |
| F4 | Cancelar guardaba `'cancelled'` (fuera del enum) | Guarda `'cancelada'` con validación; migración de los datos antiguos al arrancar |
| F5 | Una franja cancelada no se podía volver a reservar (índice único) | Índice único **parcial** (solo citas pendientes o completadas) y las canceladas no cuentan como conflicto de horario |
| F6 | Los errores de reserva respondían 201 | `AppError`: 400, 404 o 409 |
| F10, F18 | No se podía completar una cita tras celebrarse; `update` permitía cambios arbitrarios | `update` solo marca `completada` (psicólogo o admin, cita pendiente y ya pasada); cancelar solo por su endpoint |
| F15 | Reserva no atómica | `findOneAndUpdate` condicionado a `isAvailable: true`; si falla la creación, se libera la franja |
| — | Cancelar dos veces liberaba una franja ya reservada de nuevo | La cancelación solo actúa sobre citas `pendiente` |
