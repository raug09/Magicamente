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

## ✅ Hecho: bloque de seguridad

- Sesiones validadas contra la BD (borrado, desactivado, cambio de rol y de contraseña surten efecto al instante), política de contraseña común, límite de intentos por IP, `helmet` y CORS restringido (S10–S15).

## ✅ Hecho: cuenta y sesión

- `GET /api/auth/me`, registro que devuelve la sesión y borrado de cuentas sin datos huérfanos (F16).

## ✅ Hecho: zonas horarias y franjas recurrentes

- `timezone` por usuario, `startsAt` como instante real, `repeatWeeks`, franjas para hoy (F12, F14).

## ✅ Hecho: pulido

- Validación con `zod`, logger `pino`, Docker (`Dockerfile`, `docker-compose.yml`, `/health`, apagado ordenado) y un job de CI que arranca la API con una MongoDB real.

## Siguiente · Completar el producto mínimo


## Calidad y despliegue

- [ ] ESLint + Prettier.
- [ ] Documentación OpenAPI/Swagger.

## ✅ Hecho: críticos (en curso de revisión)

- Verificación de email al registrarse (enlace de 24 h, un solo uso, login bloqueado hasta confirmar).
- Aprobación de psicólogos por un administrador (pueden entrar, pero no publicar ni aparecer hasta aprobarlos).
- No se pueden cancelar citas cuya hora ya pasó.
- Índice único de franjas (psicólogo + día + hora) en la base de datos.

Pendiente de probar de extremo a extremo: los correos reales (hace falta `RESEND_API_KEY`).

## ✅ Hecho: cambio de email

- Cambio de email con contraseña actual, enlace al nuevo correo (24 h, un solo uso), aviso al actual y comprobación de duplicados al confirmar.

## Pendientes de producto

- [ ] **Pago de las citas.** No existe ningún cobro. Hay que decidir: ¿quién cobra (la plataforma o el psicólogo)?, ¿cuándo (al reservar o antes de la cita)?, ¿qué pasa con cancelaciones y reembolsos?, ¿qué pasarela (Stripe, MercadoPago, Wompi u otra) y en qué países?, ¿comisión de la plataforma?
- [ ] ¿Quién aprueba a los psicólogos y con qué criterios (títulos, licencia)? Hoy lo hace un administrador a mano.
- [ ] ¿Se notifica al psicólogo cuando lo aprueban o lo rechazan?

## Frontend

Todo lo que necesita quien lo construya, y su lista de pendientes, está en [08 · Guía para el frontend](08-guia-frontend.md).

## Preguntas abiertas para el equipo

1. ¿Dónde está (o estará) el **frontend**? ¿Qué URL debe aceptar CORS?
2. ¿Zona horaria de los usuarios? ¿Un solo país o varios?
3. ¿Las franjas son de duración fija? (Hoy no existe el concepto de duración.)
4. ¿Los psicólogos se dan de alta solos o los aprueba un administrador? (`isActive` podría servir para esa aprobación.)
5. ¿Quién es el dueño de la cuenta de Resend y del dominio `magicamente.online`?
