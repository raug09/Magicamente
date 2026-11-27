# 03 · Referencia de la API

Base: `http://localhost:3000` · Formato: JSON · Autenticación: cabecera `Authorization: Bearer <token>` donde se indica 🔒.

Los errores responden `{ "message": "..." }` con un código HTTP adecuado (400 datos no válidos o id mal formado, 401 sin sesión, 403 sin permiso, 404 no existe, 409 duplicado). Ver [01 · Arquitectura](01-arquitectura.md#manejo-de-errores).

Leyenda: ✅ funciona · ⚠️ funciona con salvedades · ❌ roto (detalles en [06 · Problemas conocidos](06-problemas-conocidos.md)).

## Resumen

| Método | Ruta | Quién | Descripción | Estado |
|---|---|---|---|---|
| GET | `/` | todos | Comprobación de vida | ✅ |
| POST | `/api/auth/register` | todos | Registro (paciente o psicólogo) | ✅ |
| POST | `/api/auth/login` | todos | Login, devuelve JWT | ✅ |
| GET | `/api/users` | 🔒 admin | Listar usuarios | ✅ |
| GET | `/api/users/:id` | 🔒 | Perfil propio, o perfil público de un psicólogo | ✅ |
| PUT | `/api/users/:id` | 🔒 uno mismo o admin | Actualizar usuario | ✅ |
| DELETE | `/api/users/:id` | 🔒 uno mismo o admin | Borrar usuario | ⚠️ no borra en cascada |
| POST | `/api/schedule` | 🔒 psicólogo o admin | Crear franja horaria | ✅ |
| GET | `/api/schedule/:psychologistId` | 🔒 | Franjas de un psicólogo | ✅ |
| GET | `/api/appointments/appointment` | 🔒 | Mis citas | ❌ siempre 403 |
| POST | `/api/appointments/appointment` | 🔒 paciente | Reservar cita | ⚠️ errores con 201 |
| PATCH | `/api/appointments/appointment/cancel/:id` | 🔒 participante o admin | Cancelar cita | ⚠️ |
| PATCH | `/api/appointments/appointment/update/:id` | 🔒 participante o admin | Cambiar estado | ⚠️ |

“Participante” = el paciente o el psicólogo de esa cita. La ruta de citas repite el nombre: `/api/appointments/appointment`.

Los antiguos `POST /api/email/send-test` y `GET /api/notifications/test` se **eliminaron** (eran un relé de correo abierto y tenían una dirección personal fija).

---

## Auth

### `POST /api/auth/register`

```json
{
  "name": "Ana Pérez",
  "email": "ana@example.com",
  "password": "secreto123",
  "role": "psicologo",
  "studies": ["Psicología clínica"]
}
```

- `role` opcional: `paciente` (por defecto) o `psicologo`. Cualquier otro valor, incluido `administrador` → `400`.
- `name`, `email`, `password` obligatorios → si faltan, `400`. `studies` debe ser una lista de textos.
- Email ya usado → `409`.
- Tras guardar intenta enviar el correo `confirmation`; si falla, solo lo registra en el log.
- `201 { "message": "Usuario registrado correctamente" }`. No devuelve el `_id` ni un token.

### `POST /api/auth/login`

```json
{ "email": "ana@example.com", "password": "secreto123" }
```

- `200 { "token": "eyJ..." }` · payload `{ id, role, iat, exp }`, caduca en 1 h.
- `401 { "message": "Credenciales inválidas" }` · `400` si faltan campos.
- Para conocer tu `_id`, decodifica el payload del JWT.

## Usuarios

### `GET /api/users` 🔒 admin
Lista todos los usuarios sin `password`. `403` si no eres administrador.

### `GET /api/users/:id` 🔒
- Tu propio id, o cualquier id si eres admin → perfil completo sin `password`.
- Id de un psicólogo → perfil público: `name`, `role`, `studies`, `description` (sin email).
- Cualquier otro caso → `404`.

### `PUT /api/users/:id` 🔒 uno mismo o admin
Campos permitidos:

| Quién | Campos |
|---|---|
| Uno mismo | `name`, `description`, `studies`, `password` |
| Administrador | los anteriores + `email`, `role`, `isActive` |

- Un campo no permitido → `403` indicando cuál. Editar a otro usuario sin ser admin → `403`.
- `password` se guarda hasheada.
- Devuelve el usuario actualizado (sin `password`), o `404`.

### `DELETE /api/users/:id` 🔒 uno mismo o admin
`200 { "message": "Usuario eliminado correctamente" }` · `404` si no existe. No borra horarios ni citas asociados.

## Horarios

### `POST /api/schedule` 🔒 psicólogo o admin

Como psicólogo (la franja es siempre tuya):
```json
{ "day": "2026-12-15", "hour": "10:00" }
```
Como administrador hay que añadir `"psychologist": "<idPsicologo>"`.

- Psicólogo que indica otro `psychologist` → `403`. Paciente → `403`.
- `day` fecha válida y futura (no vale hoy), `hour` en formato `HH:mm` → si no, `400`.
- El destinatario no es psicólogo → `404`. Franja repetida → `409`.
- `201 { "message": "Horario creado exitosamente", "schedule": {...} }`.

### `GET /api/schedule/:psychologistId` 🔒
Array con **todas** las franjas del psicólogo (pasadas y ocupadas incluidas). Filtra por `isAvailable` en el cliente.

## Citas

### `POST /api/appointments/appointment` 🔒 paciente

```json
{ "scheduleId": "<idHorario>" }
```

- El paciente es siempre el usuario autenticado y el psicólogo, el dueño del horario. Si el body trae `patientId` o `psychologistId`, se ignoran.
- Calcula `time` = `schedule.day` + `schedule.hour` (UTC), crea la cita `pendiente` y marca el horario `isAvailable=false`.
- `201 { "message": "Appointment scheduled successfully", "appointment": {...} }`.
- ⚠️ Los errores de negocio **también responden 201**, con `appointment: { "error": "..." }`: `"El horario no existe."`, `"Este horario ya está ocupado."`, `"No puedes agendar citas en fechas pasadas."`, `"Ya tienes una cita programada en este horario."`. El cliente debe mirar `appointment.error`.
- `409` si esa franja ya se usó antes en otra cita, aunque esa cita se cancelara (índice único).

### `GET /api/appointments/appointment` 🔒 ❌
Debería devolver tus citas. **Siempre responde `403`** porque compara el rol con `'patient'`/`'psychologist'` en vez de `'paciente'`/`'psicologo'`.

### `PATCH /api/appointments/appointment/cancel/:id` 🔒 participante o admin
Sin body. Pone el estado a `'cancelled'` (valor fuera del enum, pendiente de corregir) y libera el horario.
`200 { "message": "Appointment canceled successfully", "appointment": {...} }` · `403` si no es tu cita · `404` si no existe.

### `PATCH /api/appointments/appointment/update/:id` 🔒 participante o admin

```json
{ "state": "completada" }
```

- Solo se admite `state` (`pendiente`, `completada`, `cancelada`). Otro campo → `403`; otro valor → `400`.
- Solo si faltan más de 24 h para la cita → si no, `400`. Por eso todavía no se puede marcar como `completada` después de la sesión.
- `200 { "message": "Cita actualizada correctamente", "updatedAppointment": {...} }`.
