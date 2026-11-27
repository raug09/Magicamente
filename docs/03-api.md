# 03 · Referencia de la API

Base: `http://localhost:3000` · Formato: JSON · Autenticación: cabecera `Authorization: Bearer <token>` donde se indica 🔒.

**Errores comunes a toda la API:** `401` sin sesión, con token inválido/caducado, o si la cuenta fue borrada o desactivada; `429` si se superan los límites de intentos (ver [arquitectura](01-arquitectura.md#protección-del-servidor)). Los errores responden `{ "message": "..." }` con un código HTTP adecuado (400 datos no válidos o id mal formado, 401 sin sesión, 403 sin permiso, 404 no existe, 409 duplicado). Ver [01 · Arquitectura](01-arquitectura.md#manejo-de-errores).

Leyenda: ✅ funciona · ⚠️ funciona con salvedades · ❌ roto (detalles en [06 · Problemas conocidos](06-problemas-conocidos.md)).

## Resumen

| Método | Ruta | Quién | Descripción | Estado |
|---|---|---|---|---|
| GET | `/` | todos | Comprobación de vida | ✅ |
| POST | `/api/auth/register` | todos | Registro (paciente o psicólogo) | ✅ |
| POST | `/api/auth/login` | todos | Login, devuelve JWT | ✅ |
| GET | `/api/auth/me` | 🔒 | Usuario de la sesión actual | ✅ |
| POST | `/api/auth/forgot-password` | todos | Pide un enlace para restablecer la contraseña | ✅ |
| POST | `/api/auth/reset-password` | todos | Cambia la contraseña con el token del enlace | ✅ |
| GET | `/api/users` | 🔒 admin | Listar usuarios | ✅ |
| GET | `/api/users/:id` | 🔒 | Perfil propio, o perfil público de un psicólogo | ✅ |
| PUT | `/api/users/:id` | 🔒 uno mismo o admin | Actualizar usuario | ✅ |
| DELETE | `/api/users/:id` | 🔒 uno mismo o admin | Eliminar cuenta (anonimiza y limpia sus citas y franjas) | ✅ |
| POST | `/api/schedule` | 🔒 psicólogo o admin | Crear franja horaria | ✅ |
| GET | `/api/psychologists` | 🔒 | Listado de psicólogos (búsqueda y paginación) | ✅ |
| GET | `/api/schedule/:psychologistId` | 🔒 | Franjas de un psicólogo (con filtros) | ✅ |
| PUT | `/api/schedule/:id` | 🔒 su psicólogo o admin | Cambiar día/hora de una franja libre | ✅ |
| DELETE | `/api/schedule/:id` | 🔒 su psicólogo o admin | Borrar una franja libre | ✅ |
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
- `password`: entre 8 caracteres y 72 bytes → si no, `400`.
- `name`, `email`, `password` obligatorios → si faltan, `400`. `studies` debe ser una lista de textos.
- Email ya usado → `409`.
- Tras guardar intenta enviar el correo `confirmation`; si falla, solo lo registra en el log.
- `201 { "message": "Usuario registrado correctamente", "token": "…", "user": {…} }`: devuelve la sesión ya iniciada (mismo token que daría el login), así no hace falta un login extra.

### `POST /api/auth/login`

```json
{ "email": "ana@example.com", "password": "secreto123" }
```

- `200 { "token": "eyJ..." }` · payload `{ id, role, iat, exp }`, caduca en 1 h.
- `401 { "message": "Credenciales inválidas" }` · `400` si faltan campos.
- `403 "Cuenta desactivada"` si la contraseña es correcta pero la cuenta está desactivada (con contraseña incorrecta siempre es `401`).
- Límite: 10 intentos **fallidos** cada 15 minutos por IP; después `429`. Los inicios de sesión correctos no cuentan.
- Para conocer tu `_id` y tu rol usa `GET /api/auth/me`.

### `GET /api/auth/me` 🔒

Devuelve el usuario de la sesión (sin contraseña ni datos internos): `_id`, `name`, `email`, `role`, `isActive`, `studies`, `description`, `schedules`, `createdAt`. `401` si la sesión no es válida.

### `POST /api/auth/forgot-password`

```json
{ "email": "ana@example.com" }
```

- Responde **siempre** `200 { "message": "Si el email está registrado, recibirás un enlace para restablecer tu contraseña" }`, exista o no la cuenta (así no se puede averiguar qué emails están registrados).
- Si la cuenta existe y está activa, se envía un correo con el enlace `<FRONTEND_URL>/reset-password?token=<token>`. El enlace **caduca en 1 hora** y **solo se puede usar una vez**.
- Como mucho **un correo por minuto y cuenta**: si se vuelve a pedir antes, no se envía otro. Pasado ese minuto, el token nuevo invalida el anterior.
- `400` si falta `email` o no es un texto.
- Límite: 10 por hora y IP, compartido con `register` y `reset-password`; después `429`.

### `POST /api/auth/reset-password`

```json
{ "token": "<token del enlace>", "password": "nueva-clave-123" }
```

- `200 { "message": "Contraseña actualizada correctamente" }`. Después, la contraseña antigua deja de funcionar y el token queda consumido.
- `400` si falta algún campo, si la contraseña tiene menos de **8 caracteres** (el token no se gasta), o si el token no es válido, ya se usó o caducó (`"El enlace no es válido o ha caducado"`).
- No permite restablecer cuentas desactivadas.
- El token se guarda hasheado (SHA-256) en la base de datos; nunca en claro.
- Al restablecer, **todas las sesiones abiertas se cierran** (los tokens anteriores devuelven `401`).

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
- `password` debe cumplir la política (8 caracteres–72 bytes) y se guarda hasheada. **Cambiarla cierra las sesiones abiertas, también la actual**: hay que volver a iniciar sesión.
- Devuelve el usuario actualizado (sin `password`), o `404`.

### `DELETE /api/users/:id` 🔒 uno mismo o admin
`200 { "message": "Usuario eliminado correctamente" }` · `404` si no existe o ya estaba eliminado · `409` si es el último administrador.

La cuenta se **anonimiza** (nombre “Usuario eliminado”, email y contraseña inutilizados, datos personales borrados) y se desactiva; el email queda libre. Se cancelan sus citas pendientes (y se avisa por correo a la otra persona), se libera la franja si era paciente, y si era psicólogo se borran sus franjas sin historial. Las citas completadas se conservan. Ver [flujos](04-flujos.md#borrar-una-cuenta).

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

Franjas de un psicólogo, **ordenadas por día y hora**. Filtros opcionales:

| Parámetro | Descripción |
|---|---|
| `available=true` | Solo franjas **libres y futuras** (las que se pueden reservar ahora). Una franja libre cuya hora ya pasó no se incluye |
| `available=false` | Solo las ocupadas |
| `from=YYYY-MM-DD` | Desde ese día, incluido |
| `to=YYYY-MM-DD` | Hasta ese día, incluido |

Ejemplo: `GET /api/schedule/6740...?available=true&from=2026-12-01&to=2026-12-31`

- Sin parámetros devuelve todas (pasadas y ocupadas incluidas).
- `400` si `available` no es `true`/`false`, si las fechas no tienen formato `YYYY-MM-DD` o si `from` es posterior a `to`, o si el id está mal formado.
- Un psicólogo que no existe devuelve `[]`.

### `PUT /api/schedule/:id` 🔒 su psicólogo o admin

Cambia el día y/o la hora de una franja **libre**.

```json
{ "hour": "12:30" }
```

- Campos permitidos: `day` y `hour` (mismas validaciones que al crear). Cualquier otro → `403`; ninguno → `400`.
- `403` si la franja es de otro psicólogo (un administrador puede con cualquiera) · `404` si no existe.
- `409` si ya hay otra franja del psicólogo en ese día y hora, o si la franja tiene una cita reservada (hay que cancelar la cita primero).
- `200 { "message": "Horario actualizado", "schedule": {...} }`.

### `DELETE /api/schedule/:id` 🔒 su psicólogo o admin

Borra una franja **libre** y la quita de la lista del psicólogo.

- `200 { "message": "Horario eliminado" }` · `403` / `404` como arriba.
- `409` si tiene una cita reservada. Una franja cuya cita se canceló vuelve a ser libre y se puede borrar.

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
