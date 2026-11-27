# 06 · Problemas conocidos

Resultado de revisar el código el 27/11/2026 (commit `35fec23`). `tsc --noEmit` compila sin errores; los problemas son de lógica, seguridad y configuración.

Prioridad: 🔴 crítico (bloquea producción o funcionalidad) · 🟠 importante · 🟡 menor.

## Seguridad

| # | Prio | Problema | Dónde | Arreglo sugerido |
|---|---|---|---|---|
| S1 | 🔴 | Cualquiera puede **registrarse como `administrador`** (el `role` viene del body) | `authController.register`, `authService.registerService` | Ignorar `role` en el registro público, o permitir solo `paciente`/`psicologo`; crear admins a mano o desde un endpoint de admin |
| S2 | 🔴 | **Cualquier usuario autenticado puede leer, editar o borrar a cualquier otro**, incluido cambiar su `role` o su `password` | `routes/user.ts`, `userController` | Comprobar `req.user.id === id` o rol admin; lista blanca de campos editables; hashear la contraseña si cambia |
| S3 | 🔴 | `JWT_SECRET` con respaldo `'secret'` | `middlewares/auth.ts`, `authService.ts` | Fallar al arrancar si no está definido |
| S4 | 🔴 | `POST /api/email/send-test` **sin autenticación**: relé de spam con tu dominio | `routes/emailRoutes.ts` | Eliminar o restringir a admin |
| S5 | 🟠 | Citas: `patientId` viene del body; cancelar/modificar no comprueban propiedad | `appointmentController`, `appointmentService` | Usar `req.user.id` como paciente y validar que la cita pertenece al usuario |
| S6 | 🟠 | Cualquier usuario (incluido un paciente) puede crear horarios a nombre de cualquier psicólogo | `scheduleController.createSchedule` | Exigir rol `psicologo` y `psychologist = req.user.id` |
| S7 | 🟠 | `updateAppointment` hace `Object.assign` con el body completo | `appointmentService.updateAppointment` | Lista blanca (`state`), validar transiciones |
| S8 | 🟡 | Dirección de correo personal escrita en el código | `notificationController.ts` | Eliminar el endpoint |
| S9 | 🟡 | Los errores 500 devuelven el objeto de error interno al cliente | varios controladores | Middleware de errores centralizado |
| S10 | 🟡 | Sin rate limiting en login, CORS abierto a `*`, sin `helmet` | `index.ts` | `express-rate-limit`, `cors({ origin })`, `helmet` |
| S11 | 🟡 | `isActive` no se comprueba en login ni en el middleware | `authService`, `auth.ts` | Rechazar usuarios inactivos |

## Fallos funcionales

| # | Prio | Problema | Dónde |
|---|---|---|---|
| F1 | 🔴 | `GET /api/appointments/appointment` **siempre devuelve 403**: compara con `'patient'`/`'psychologist'` en vez de `'paciente'`/`'psicologo'`. Después además intenta responder 200 → *headers already sent* | `appointmentController.getAppointments` |
| F2 | 🔴 | **El cron se ejecuta cada minuto** y reenvía el recordatorio a cada cita de mañana (~1440 correos por cita). Tampoco excluye canceladas | `config/cronJobs.ts` |
| F3 | 🔴 | `npm start` falla: `tsconfig.json` no tiene `outDir`, `tsc` escribe los `.js` en `src/` | `Backend/tsconfig.json` |
| F4 | 🟠 | Cancelar guarda `state: 'cancelled'`, que no está en el enum (`'cancelada'`). `findByIdAndUpdate` no valida, así que se guarda un valor inválido | `appointmentService.cancelAppointment` |
| F5 | 🟠 | Índice **único** en `Appointment.scheduleId`: una franja cancelada vuelve a estar disponible pero **no se puede volver a reservar** (E11000 → 500) | `models/appointment.ts` |
| F6 | 🟠 | Los errores de negocio al reservar se devuelven con **201** dentro de `appointment.error` | `appointmentService.scheduleAppointment` + controlador |
| F7 | 🟠 | Falta `return` tras `res.status(404/401/403)` → el código sigue y vuelve a responder (*Cannot set headers after they are sent*) | `userController` (get/update/delete), `appointmentController` (cancel, get) |
| F8 | 🟠 | No hay forma de que un paciente **descubra psicólogos** (listar usuarios es solo admin) | rutas |
| F9 | 🟠 | Dependencias del backend (`jsonwebtoken`, `bcryptjs`) declaradas en el `package.json` de la raíz; `jsonwebtoken` además como devDependency → una instalación de producción (`--omit=dev`) rompe | `package.json` raíz |
| F10 | 🟠 | No se puede marcar una cita como `completada` después de celebrarse (regla de 24 h aplicada a cualquier cambio) | `appointmentService.updateAppointment` |
| F11 | 🟡 | Login fallido y email duplicado devuelven 500 (deberían ser 401 y 409) | `authController` |
| F12 | 🟡 | Crear horario compara `day` (medianoche) con `now`: imposible crear franjas para hoy | `scheduleController.createSchedule` |
| F13 | 🟡 | El recordatorio muestra solo el día del mes y la hora UTC (“el 15 a las 10”) | `cronJobs.ts` |
| F14 | 🟡 | Las horas se interpretan en UTC; sin gestión de zona horaria | `appointmentService`, `Schedule.hour` |
| F15 | 🟡 | Reserva no atómica (comprobar `isAvailable` y luego crear): condición de carrera | `appointmentService.scheduleAppointment` |
| F16 | 🟡 | Borrar un usuario deja horarios y citas huérfanos | `userService.deleteUserService` |
| F17 | 🟡 | IDs mal formados producen 500 (CastError) en lugar de 400 | todos los `:id` |

## Deuda técnica

- Sin tests, sin linter/formatter, sin CI.
- Sin validación de entrada (sugerencia: `zod` o `express-validator`).
- Dos servicios de correo duplicados (`emailService` y `notificationService`); `config/emailConfig.ts` vacío.
- `asyncHandler` solo se usa en `/auth`; manejo de errores inconsistente (unos servicios lanzan, otros devuelven `{error}`).
- Muchos `console.log` de depuración con emojis; sin logger.
- `@types/express@5` con `express@4` (tipos de otra versión mayor).
- `ts-node-dev` en `dependencies` (debería ser devDependency); `ts-node` y `ts-node-dev` a la vez.
- Nombre de archivo inconsistente: `models/appointment.ts` frente a `User.ts` y `Schedule.ts`.
- Campo `recurrent` y plantilla `resetPassword` sin uso.
- Mezcla de idiomas en mensajes de respuesta (inglés y español).
- `README` original solo tenía la insignia de DeepWiki.
