# 03 · Referencia de la API

Base: `http://localhost:3000` · Formato: JSON · Autenticación: cabecera `Authorization: Bearer <token>` donde se indica 🔒.

**Errores comunes a toda la API:** `401` sin sesión, con token inválido/caducado, o si la cuenta fue borrada o desactivada; `429` si se superan los límites de intentos (ver [arquitectura](01-arquitectura.md#protección-del-servidor)). Los errores responden `{ "message": "..." }` (los de validación añaden `"errors": [{ "field", "message" }]` con **todos** los campos inválidos) con un código HTTP adecuado (400 datos no válidos o id mal formado, 401 sin sesión, 403 sin permiso, 404 no existe, 409 duplicado). Ver [01 · Arquitectura](01-arquitectura.md#manejo-de-errores).

Leyenda: ✅ funciona · ⚠️ funciona con salvedades · ❌ roto (detalles en [06 · Problemas conocidos](06-problemas-conocidos.md)).

## Resumen

| Método | Ruta | Quién | Descripción | Estado |
|---|---|---|---|---|
| GET | `/` | todos | Comprobación de vida (texto) | ✅ |
| GET | `/health` | todos | 200 `{status:"ok",db:"up"}` si la base de datos responde; 503 si no | ✅ |
| POST | `/api/auth/register` | todos | Registro (paciente o psicólogo) | ✅ |
| POST | `/api/auth/login` | todos | Login, devuelve JWT | ✅ |
| GET | `/api/auth/me` | 🔒 | Usuario de la sesión actual | ✅ |
| POST | `/api/auth/verify-email` | todos | Confirma el email con el enlace del correo | ✅ |
| POST | `/api/auth/resend-verification` | todos | Pide un nuevo enlace de confirmación | ✅ |
| POST | `/api/auth/change-email` | 🔒 | Pide cambiar el email (con contraseña actual) | ✅ |
| POST | `/api/auth/logout` | 🔒 | Cierra la sesión actual | ✅ |
| POST | `/api/auth/logout-all` | 🔒 | Cierra todas las sesiones del usuario | ✅ |
| GET | `/api/auth/sessions` | 🔒 | Lista las sesiones abiertas (marca la actual) | ✅ |
| DELETE | `/api/auth/sessions/:id` | 🔒 | Cierra una sesión concreta | ✅ |
| POST | `/api/auth/confirm-email-change` | todos | Aplica el cambio de email con el enlace del nuevo correo | ✅ |
| POST | `/api/auth/forgot-password` | todos | Pide un enlace para restablecer la contraseña | ✅ |
| POST | `/api/auth/reset-password` | todos | Cambia la contraseña con el token del enlace | ✅ |
| GET | `/api/users` | 🔒 admin | Listar usuarios | ✅ |
| GET | `/api/users/:id` | 🔒 | Perfil propio, o perfil público de un psicólogo | ✅ |
| PUT | `/api/users/:id` | 🔒 uno mismo o admin | Actualizar usuario | ✅ |
| DELETE | `/api/users/:id` | 🔒 uno mismo o admin | Eliminar cuenta (anonimiza y limpia sus citas y franjas) | ✅ |
| PUT | `/api/users/:id/verification` | 🔒 admin | Aprobar, rechazar o volver a pendiente a un psicólogo, con la revisión de sus documentos | ✅ |
| POST | `/api/schedule` | 🔒 psicólogo o admin | Crear franja horaria | ✅ |
| GET | `/api/psychologists` | 🔒 | Listado de psicólogos (búsqueda y paginación) | ✅ |
| GET | `/api/schedule/:psychologistId` | 🔒 | Franjas de un psicólogo (con filtros y paginación) | ✅ |
| PUT | `/api/schedule/:id` | 🔒 su psicólogo o admin | Cambiar día/hora de una franja libre | ✅ |
| DELETE | `/api/schedule/:id` | 🔒 su psicólogo o admin | Borrar una franja libre | ✅ |
| GET | `/api/appointments/appointment` | 🔒 paciente o psicólogo | Mis citas (paginadas) | ✅ |
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
- `timezone` opcional: zona IANA (p. ej. `"America/Bogota"`); por defecto `UTC`; `400` si no es válida.
- `password`: entre 8 caracteres y 72 bytes → si no, `400`.
- Límites: `name` ≤ 100 caracteres, `email` con formato válido (≤ 254), `studies` lista de textos (≤ 30 elementos de ≤ 200 caracteres).
- **El email se normaliza** (sin espacios y en minúsculas): `Ana@Example.com` = `ana@example.com`, en el registro, el login y la recuperación.
- `name`, `email`, `password` obligatorios → si faltan, `400`. `studies` debe ser una lista de textos.
- Email ya usado → `409`.
- Tras guardar intenta enviar el correo `confirmation`; si falla, solo lo registra en el log.
- `201 { "message": "Usuario registrado…", "user": {…} }`. **No devuelve token**: el usuario queda con `emailVerified: false` y recibe un correo con el enlace de confirmación. Hasta confirmarlo, el login responde `403`.
- Los psicólogos quedan con `approved: false` hasta que un administrador los aprueba (ver `PUT /api/users/:id`).

### `POST /api/auth/change-email` 🔒

```json
{ "email": "nueva@example.com", "password": "contraseña-actual" }
```

- Pide cambiar el email de tu cuenta. **Exige la contraseña actual**: una sesión abierta por sí sola no basta.
- Envía un enlace de confirmación **a la nueva dirección** y un aviso **a la actual** (sin mencionar la nueva). Hasta confirmar, el email no cambia.
- `200 { "message": "Te hemos enviado un enlace de confirmación a la nueva dirección." }`.
- `400` si la contraseña no es correcta, si es tu mismo email actual o si el formato no es válido. `409` si el email ya lo usa otra cuenta.
- Como mucho una solicitud por minuto (la segunda no envía nada, pero responde igual). Límite por IP compartido con registro y recuperación.

### `POST /api/auth/confirm-email-change`

```json
{ "token": "<token del enlace>" }
```

- `200 { "message": "Correo actualizado…" }`. El enlace caduca en **24 horas** y solo se puede usar una vez.
- `400` si el enlace no es válido o caducó. `409` si, mientras tanto, otra cuenta ha tomado ese email.
- Tras confirmar, el nuevo email sirve para iniciar sesión y el antiguo ya no.

### Cierre de sesión y sesiones abiertas

Cada login crea una **sesión** en el servidor, y el token apunta a ella. El token solo vale mientras su sesión exista:

- `POST /api/auth/logout` → `200`. Cierra la sesión actual. A partir de ahí, ese token responde `401`.
- `POST /api/auth/logout-all` → `200`. Cierra todas las sesiones del usuario, incluida la que lo pide.
- `GET /api/auth/sessions` → `[{ "_id", "createdAt", "expiresAt", "current": true|false }]`. Para pantallas tipo “dispositivos conectados”. No expone el token ni identificadores internos de la sesión.
- `DELETE /api/auth/sessions/:id` → `200`. Cierra una sesión concreta del propio usuario. `404` si no existe o es de otro usuario.

Se cierran **todas** las sesiones al cambiar o restablecer la contraseña y al borrar la cuenta. Las sesiones caducan a la vez que el token (1 hora) y se borran solas.

Un token sin sesión (cerrada, caducada, o firmado a mano) responde `401` “La sesión no es válida: vuelve a iniciar sesión”.

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
| Uno mismo | `name`, `description`, `studies`, `password`, `timezone` |
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
  "pages": 1,
  "items": [
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
{ "day": "2026-12-15", "hour": "10:00", "repeatWeeks": 8 }
```
Como administrador hay que añadir `"psychologist": "<idPsicologo>"`.

- `day` (`YYYY-MM-DD`, fecha real) y `hour` (`HH:mm`) se interpretan **en la zona horaria del psicólogo** (`timezone` de su perfil); el servidor guarda el instante real en `startsAt` (UTC), teniendo en cuenta el horario de verano.
- `repeatWeeks` (opcional, entero de 1 a 26, por defecto 1): crea una franja por semana, siempre a la misma hora local. Las que ya existen se omiten y se listan en `skipped`.

- Psicólogo que indica otro `psychologist` → `403`. Paciente → `403`.
- `400` si `day`/`hour` no tienen el formato correcto, si la franja ya ha empezado (se puede crear para hoy si aún no ha empezado), si `repeatWeeks` no es válido, o si esa hora **no existe** por un cambio de hora (en ese caso no se crea ninguna).
- El destinatario no es psicólogo (o está desactivado) → `404`. Un psicólogo **pendiente de aprobación** → `403` (“Tu cuenta de psicólogo está pendiente de aprobación”). Si **todas** las franjas ya existían → `409`.
- `201 { "message": "Horario creado exitosamente", "schedules": [{...}], "skipped": ["2027-01-05"] }` (siempre una lista, aunque sea de una franja).
- Cada franja: `_id`, `psychologist`, `day` (día del calendario del psicólogo, medianoche UTC), `hour`, `timezone`, `startsAt` (instante real, UTC), `isAvailable`, `createdAt`.

### `GET /api/schedule/:psychologistId` 🔒

Franjas de un psicólogo, **ordenadas por instante de inicio (`startsAt`)**. Filtros opcionales:

| Parámetro | Descripción |
|---|---|
| `available=true` | Solo franjas **libres y que aún no han empezado** (las que se pueden reservar ahora) |
| `available=false` | Solo las ocupadas |
| `from=YYYY-MM-DD` | Desde ese día del calendario del psicólogo, incluido |
| `to=YYYY-MM-DD` | Hasta ese día del calendario del psicólogo, incluido |

Ejemplo: `GET /api/schedule/6740...?available=true&from=2026-12-01&to=2026-12-31`

Paginación: `page` (desde 1, por defecto 1) y `limit` (por defecto 20, máximo 50). Ver [formato de las listas](#listas-paginadas).

- Sin filtros devuelve todas (pasadas y ocupadas incluidas).
- `400` si `available` no es `true`/`false`, si las fechas no tienen formato `YYYY-MM-DD`, si `from` es posterior a `to`, si `page`/`limit` no son enteros positivos, o si el id está mal formado.
- Un psicólogo que no existe devuelve una lista vacía (`items: []`, `total: 0`).

### `PUT /api/schedule/:id` 🔒 su psicólogo o admin

Cambia el día y/o la hora de una franja **libre**.

```json
{ "hour": "12:30" }
```

- Campos permitidos: `day` y `hour` (mismo formato que al crear, en la zona **actual** del psicólogo: la franja pasa a guardarse con ella). Cualquier otro → `403`; ninguno → `400`. No se puede mover a una fecha pasada (`400`).
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
- `time` = `schedule.startsAt` (el instante real de la franja), crea la cita `pendiente` y marca la franja como ocupada de forma atómica.
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

### Listas paginadas

Todas las listas que pueden crecer usan el mismo formato:

```json
{ "total": 42, "page": 2, "limit": 20, "pages": 3, "items": [ … ] }
```

- `total`: cuántos elementos hay en total con los filtros aplicados.
- `pages`: número de páginas (mínimo 1).
- `items`: los elementos de la página pedida. Una página fuera de rango devuelve `items: []`.
- `page` (desde 1, por defecto 1) y `limit` (por defecto 20, máximo 50; un valor mayor se recorta a 50). Valores no válidos → `400`.

Listas paginadas: `GET /api/psychologists`, `GET /api/schedule/:psychologistId` y `GET /api/appointments/appointment`.

### `GET /api/appointments/appointment` 🔒 paciente o psicólogo

Devuelve **tus** citas ordenadas por fecha, paginadas (`page`, `limit`; ver [formato de las listas](#listas-paginadas)), con la franja (`scheduleId`) incluida:

- Paciente: cada cita trae `psychologistId` con `name`, `studies` y `description`.
- Psicólogo: cada cita trae `patientId` con `name` y `email`.
- Nunca se incluye la contraseña.
- Un administrador recibe `403` (no tiene citas propias).

### `PATCH /api/appointments/appointment/cancel/:id` 🔒 paciente o psicólogo de la cita, o admin

Sin body. Pasa la cita a `cancelada` y libera la franja.

- `200 { "message": "Cita cancelada correctamente", "appointment": {...} }`.
- `400` si la cita no está `pendiente` (ya cancelada o completada), o si **su hora ya pasó** · `403` si no es tu cita · `404` si no existe.

### `PATCH /api/appointments/appointment/update/:id` 🔒 psicólogo de la cita o admin

Único cambio permitido: marcar la cita como completada.

```json
{ "state": "completada" }
```

- `200 { "message": "Cita actualizada correctamente", "updatedAppointment": {...} }`.
- `400`: la cita no está `pendiente`, todavía no ha ocurrido, o `state` no es `completada` (para cancelar hay que usar el endpoint de cancelar).
- `403`: otro campo en el body, o no eres el psicólogo de la cita (el paciente tampoco puede).
