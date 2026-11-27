# 07 · Hoja de ruta para retomar el proyecto

Propuesta ordenada por dependencia y riesgo. Las referencias (S1, F2…) apuntan a [06 · Problemas conocidos](06-problemas-conocidos.md).

## Fase 0 · Poner la base en orden (½ día)

- [ ] Mover `jsonwebtoken`, `bcryptjs` y sus `@types` al `package.json` de `Backend/` y vaciar o borrar el de la raíz (F9).
- [ ] `tsconfig.json`: `"outDir": "./dist"`, `"rootDir": "./src"` y comprobar `npm run build && npm start` (F3).
- [ ] Cambiar `@types/express` a `^4`; mover `ts-node-dev` a devDependencies.
- [ ] Fallar al arrancar si falta `JWT_SECRET` o `MONGO_URI` (S3). Cargar `dotenv` en la primera línea de `index.ts` (`import 'dotenv/config'`).
- [ ] Añadir ESLint + Prettier y un workflow de GitHub Actions que ejecute `tsc --noEmit` y los tests.

## Fase 1 · Cerrar los agujeros críticos (1–2 días)

- [ ] Registro: forzar `role` a `paciente` o `psicologo` (S1).
- [ ] Usuarios: middleware `isSelfOrAdmin`, lista blanca de campos, hashear `password` si cambia (S2).
- [ ] Eliminar `/api/email/send-test` y `/api/notifications/test` o protegerlos con `isAdmin` (S4, S8).
- [ ] Crear `requireRole('psicologo')` y usarlo en `POST /api/schedule`; usar `req.user.id` como psicólogo (S6).
- [ ] Citas: `patientId = req.user.id`; `psychologistId` sacado del `Schedule`; comprobar propiedad en cancelar/modificar (S5, S7).

## Fase 2 · Arreglar los flujos rotos (1–2 días)

- [ ] `getAppointments`: roles correctos y `return` tras cada respuesta (F1, F7).
- [ ] Cron: ejecución diaria o cada hora + campo `reminderSent` en `Appointment`; excluir canceladas; formatear fecha completa en la zona del usuario (F2, F13).
- [ ] Cancelación: `'cancelada'` y `runValidators: true` (F4).
- [ ] Quitar el índice único simple de `scheduleId`, sustituirlo por un índice único parcial sobre citas no canceladas (F5):
  ```ts
  appointmentSchema.index({ scheduleId: 1 }, { unique: true, partialFilterExpression: { state: { $in: ['pendiente', 'completada'] } } });
  ```
  (Hay que borrar el índice antiguo en la base de datos existente: `db.appointments.dropIndex('scheduleId_1')`.)
- [ ] Reserva atómica: `Schedule.findOneAndUpdate({ _id, isAvailable: true }, { isAvailable: false })` y, si devuelve `null`, la franja está ocupada (F15).
- [ ] Códigos HTTP correctos: 400/404/409 para errores de negocio, 401 en login (F6, F11).
- [ ] Unificar el manejo de errores: servicios que lanzan errores tipados (`AppError(status, msg)`) + middleware de errores global (S9, F17).

## Fase 3 · Completar el producto mínimo

- [ ] `GET /api/psychologists` (público o autenticado) con nombre, estudios y descripción.
- [ ] `GET /api/schedule/:id?from=&available=true` con filtros; `PUT`/`DELETE` de franjas (solo si no hay cita).
- [ ] Transiciones de estado de cita: el psicólogo marca `completada` tras la sesión (F10).
- [ ] Recuperación de contraseña (la plantilla `resetPassword` ya existe).
- [ ] Endpoint `GET /api/auth/me` para que el frontend obtenga el usuario sin decodificar el JWT.
- [ ] Decidir la estrategia de zonas horarias (F14).
- [ ] Horarios recurrentes (`recurrent`) o eliminar el campo.

## Fase 4 · Calidad y despliegue

- [ ] Tests de integración con Jest/Vitest + Supertest + `mongodb-memory-server`, empezando por auth y reserva.
- [ ] Validación de entrada con `zod`.
- [ ] `helmet`, `express-rate-limit` en login/registro, CORS restringido al dominio del frontend (S10).
- [ ] Logger (`pino`) en lugar de `console.log`.
- [ ] Dockerfile + `docker-compose.yml` (API + Mongo) para desarrollo.
- [ ] Documentación OpenAPI/Swagger generada a partir de las rutas.

## Preguntas abiertas para el equipo

1. ¿Dónde está (o estará) el **frontend**? ¿Qué URL debe aceptar CORS?
2. ¿Zona horaria de los usuarios? ¿Un solo país o varios?
3. ¿Las franjas son de duración fija? (Hoy no existe el concepto de duración.)
4. ¿Los psicólogos se dan de alta solos o los aprueba un administrador? (`isActive` podría servir para esa aprobación.)
5. ¿Quién es el dueño de la cuenta de Resend y del dominio `magicamente.online`?
