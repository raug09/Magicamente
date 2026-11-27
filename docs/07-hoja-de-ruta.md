# 07 · Hoja de ruta para retomar el proyecto

Las referencias (S1, F2…) apuntan a [06 · Problemas conocidos](06-problemas-conocidos.md).

## ✅ Hecho (pasos 1–3)

- Recordatorio: un solo correo por cita, cada hora, sin canceladas (F2, F13).
- Eliminados los endpoints de correo de prueba (S4, S8).
- Registro limitado a paciente/psicólogo; `JWT_SECRET` obligatorio (S1, S3).
- Dependencias en `Backend/`, build a `dist/`, separación `app.ts`/`index.ts` (F3, F9).
- Tests de integración (Vitest + Supertest + MongoDB en memoria) y workflow de CI.
- Permisos de usuarios, horarios y citas (S2, S5, S6, S7); middleware de errores (S9, F7, F11, F17).

## ✅ Hecho (paso 4): flujo de citas

- “Mis citas” funciona para pacientes y psicólogos (F1).
- Cancelación con el estado correcto, solo de citas pendientes, y migración de datos antiguos (F4).
- Una franja cancelada se puede volver a reservar: índice único parcial (F5).
- Reserva atómica y errores 400/404/409 en lugar de 201 (F6, F15).
- `update` solo marca `completada`, por el psicólogo y tras la cita (F10, F18).

## ✅ Hecho: listado de psicólogos (F8)

- `GET /api/psychologists` con búsqueda por nombre, paginación y solo campos públicos.

## ✅ Hecho: gestión de franjas

- `GET /api/schedule/:id` con `available`, `from`, `to` y orden por fecha; `PUT`/`DELETE` de franjas libres.

## ✅ Hecho: recuperación de contraseña

- `forgot-password` / `reset-password` con token hasheado de 1 h y un solo uso (ver [04](04-flujos.md)).

## Siguiente · Completar el producto mínimo

- [ ] `GET /api/auth/me` para que el frontend obtenga el usuario sin decodificar el JWT.
- [ ] Decidir la estrategia de zonas horarias (F14) y franjas para hoy (F12).
- [ ] Horarios recurrentes (`recurrent`) o eliminar el campo.
- [ ] Borrado en cascada o borrado lógico con `isActive` (F16, S11).

## Calidad y despliegue

- [ ] Validación de entrada con `zod`.
- [ ] `helmet`, `express-rate-limit` en login, registro y `forgot-password`, CORS restringido al dominio del frontend (S10, S15).
- [ ] Invalidar los JWT al cambiar la contraseña o desactivar al usuario (S12, S13) y una política de contraseña común (S14).
- [ ] ESLint + Prettier; logger (`pino`) en lugar de `console.log`.
- [ ] Dockerfile + `docker-compose.yml` (API + Mongo).
- [ ] Documentación OpenAPI/Swagger.

## Preguntas abiertas para el equipo

1. ¿Dónde está (o estará) el **frontend**? ¿Qué URL debe aceptar CORS?
2. ¿Zona horaria de los usuarios? ¿Un solo país o varios?
3. ¿Las franjas son de duración fija? (Hoy no existe el concepto de duración.)
4. ¿Los psicólogos se dan de alta solos o los aprueba un administrador? (`isActive` podría servir para esa aprobación.)
5. ¿Quién es el dueño de la cuenta de Resend y del dominio `magicamente.online`?
