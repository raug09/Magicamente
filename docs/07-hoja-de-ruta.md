# 07 · Hoja de ruta para retomar el proyecto

Las referencias (S1, F2…) apuntan a [06 · Problemas conocidos](06-problemas-conocidos.md).

## ✅ Hecho (pasos 1–3)

- Recordatorio: un solo correo por cita, cada hora, sin canceladas (F2, F13).
- Eliminados los endpoints de correo de prueba (S4, S8).
- Registro limitado a paciente/psicólogo; `JWT_SECRET` obligatorio (S1, S3).
- Dependencias en `Backend/`, build a `dist/`, separación `app.ts`/`index.ts` (F3, F9).
- Tests de integración (Vitest + Supertest + MongoDB en memoria) y workflow de CI.
- Permisos de usuarios, horarios y citas (S2, S5, S6, S7); middleware de errores (S9, F7, F11, F17).

## Siguiente · Arreglar el flujo de citas (paso 4, ~1 día)

- [ ] `getAppointments`: roles correctos, `asyncHandler` + `AppError` (F1).
- [ ] Cancelación: `'cancelada'` y `runValidators: true` (F4). Migrar los documentos existentes: `db.appointments.updateMany({ state: 'cancelled' }, { $set: { state: 'cancelada' } })`.
- [ ] Sustituir el índice único de `scheduleId` por uno parcial sobre citas no canceladas (F5):
  ```ts
  appointmentSchema.index({ scheduleId: 1 }, { unique: true, partialFilterExpression: { state: { $in: ['pendiente', 'completada'] } } });
  ```
  En una base de datos existente hay que borrar el índice antiguo: `db.appointments.dropIndex('scheduleId_1')`.
- [ ] Reserva atómica: `Schedule.findOneAndUpdate({ _id, isAvailable: true }, { isAvailable: false })`; si devuelve `null`, la franja está ocupada (F15).
- [ ] Errores de reserva con `AppError` (400/404/409) en lugar de 201 (F6).
- [ ] Reglas de estado: el psicólogo marca `completada` tras la sesión; `cancelada` solo por el endpoint de cancelar (F10, F18).

## Después · Completar el producto mínimo

- [ ] `GET /api/psychologists` con nombre, estudios y descripción (F8).
- [ ] `GET /api/schedule/:id?from=&available=true` con filtros; `PUT`/`DELETE` de franjas (solo si no hay cita).
- [ ] `GET /api/auth/me` para que el frontend obtenga el usuario sin decodificar el JWT.
- [ ] Recuperación de contraseña (la plantilla `resetPassword` ya existe).
- [ ] Decidir la estrategia de zonas horarias (F14) y franjas para hoy (F12).
- [ ] Horarios recurrentes (`recurrent`) o eliminar el campo.
- [ ] Borrado en cascada o borrado lógico con `isActive` (F16, S11).

## Calidad y despliegue

- [ ] Validación de entrada con `zod`.
- [ ] `helmet`, `express-rate-limit` en login/registro, CORS restringido al dominio del frontend (S10).
- [ ] ESLint + Prettier; logger (`pino`) en lugar de `console.log`.
- [ ] Dockerfile + `docker-compose.yml` (API + Mongo).
- [ ] Documentación OpenAPI/Swagger.

## Preguntas abiertas para el equipo

1. ¿Dónde está (o estará) el **frontend**? ¿Qué URL debe aceptar CORS?
2. ¿Zona horaria de los usuarios? ¿Un solo país o varios?
3. ¿Las franjas son de duración fija? (Hoy no existe el concepto de duración.)
4. ¿Los psicólogos se dan de alta solos o los aprueba un administrador? (`isActive` podría servir para esa aprobación.)
5. ¿Quién es el dueño de la cuenta de Resend y del dominio `magicamente.online`?
