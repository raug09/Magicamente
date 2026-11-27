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
| GET | `/api/psychologists` | 🔒 | Listado de psicólogos (búsqueda y paginación) | ✅ |
| GET | `/api/schedule/:psychologistId` | 🔒 | Franjas de un psicólogo | ✅ |
| GET | `/api/appointments/appointment` | 🔒 paciente o psicólogo | Mis citas | ✅ |
| POST | `/api/appointments/appointment` | 🔒 paciente | Reservar cita | ✅ |
| PATCH | `/api/appointments/appointment/cancel/:id` | 🔒 participante o admin | Cancelar cita | ✅ |
| PATCH | `/api/appointments/appointment/update/:id` | 🔒 psicólogo de la cita o admin | Marcar como completada | ✅ |

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

## Psicólogos

### `GET /api/psychologists` 🔒

Listado de psicólogos **activos** para que un paciente elija. Lo puede usar cualquier usuario autenticado.

| Parámetro | Por defecto | Descripción |
|---|---|---|
| `q` | — | Texto a buscar en el nombre, sin distinguir mayúsculas (se toma literal) |
| `page` | `1` | Página (entero ≥ 1) |
| `limit` | `20` | Resultados por página (entero ≥ 1, máximo 50; un valor mayor se recorta a 50) |

```json
{
  "total": 3,
  "page": 1,
  "limit": 20,
  "psychologists": [
    { "_id": "6740...", "name": "Ana Pérez", "studies": ["Psicología clínica"], "description": "Terapia cognitiva" }
  ]
}
```

- Ordenado por nombre. Solo se exponen `_id`, `name`, `studies` y `description`: nunca email, contraseña ni horarios.
- No aparecen los usuarios con `isActive: false`.
- Parámetros no válidos (`page=0`, `limit=abc`, `q` repetido) → `400`.
- Con el `_id` se piden sus franjas: `GET /api/schedule/:psychologistId` y se filtra por `isAvailable`.

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
- Calcula `time` = `schedule.day` + `schedule.hour` (UTC), crea la cita `pendiente` y marca la franja como ocupada de forma atómica.
- `201 { "message": "Cita agendada correctamente", "appointment": {...} }`.
- Errores:

| Código | Motivo |
|---|---|
| 400 | Falta `scheduleId`, id mal formado o franja en el pasado |
| 403 | No eres paciente |
| 404 | La franja no existe |
| 409 | La franja ya está ocupada, o ya tienes otra cita a esa misma hora |

- Una franja cancelada vuelve a estar disponible y se puede reservar de nuevo (por el mismo paciente o por otro). Las citas canceladas no cuentan como conflicto de horario.
- Si dos pacientes reservan a la vez la misma franja, uno recibe 201 y el otro 409.

### `GET /api/appointments/appointment` 🔒 paciente o psicólogo

Devuelve **tus** citas ordenadas por fecha, con la franja (`scheduleId`) incluida:

- Paciente: cada cita trae `psychologistId` con `name`, `studies` y `description`.
- Psicólogo: cada cita trae `patientId` con `name` y `email`.
- Nunca se incluye la contraseña.
- Un administrador recibe `403` (no tiene citas propias).

### `PATCH /api/appointments/appointment/cancel/:id` 🔒 paciente o psicólogo de la cita, o admin

Sin body. Pasa la cita a `cancelada` y libera la franja.

- `200 { "message": "Cita cancelada correctamente", "appointment": {...} }`.
- `400` si la cita no está `pendiente` (ya cancelada o completada) · `403` si no es tu cita · `404` si no existe.

### `PATCH /api/appointments/appointment/update/:id` 🔒 psicólogo de la cita o admin

Único cambio permitido: marcar la cita como completada.

```json
{ "state": "completada" }
```

- `200 { "message": "Cita actualizada correctamente", "updatedAppointment": {...} }`.
- `400`: la cita no está `pendiente`, todavía no ha ocurrido, o `state` no es `completada` (para cancelar hay que usar el endpoint de cancelar).
- `403`: otro campo en el body, o no eres el psicólogo de la cita (el paciente tampoco puede).
