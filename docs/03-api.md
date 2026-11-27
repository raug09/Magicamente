# 03 · Referencia de la API

Base: `http://localhost:3000` · Formato: JSON · Autenticación: cabecera `Authorization: Bearer <token>` donde se indica 🔒.

Leyenda de estado: ✅ funciona · ⚠️ funciona con salvedades · ❌ roto. Los detalles están en [06 · Problemas conocidos](06-problemas-conocidos.md).

## Resumen

| Método | Ruta | Auth | Descripción | Estado |
|---|---|---|---|---|
| GET | `/` | — | Comprobación de vida | ✅ |
| POST | `/api/auth/register` | — | Registro de usuario | ⚠️ |
| POST | `/api/auth/login` | — | Login, devuelve JWT | ✅ |
| GET | `/api/users` | 🔒 admin | Listar usuarios | ✅ |
| GET | `/api/users/:id` | 🔒 | Obtener usuario | ⚠️ |
| PUT | `/api/users/:id` | 🔒 | Actualizar usuario | ⚠️ |
| DELETE | `/api/users/:id` | 🔒 | Borrar usuario | ⚠️ |
| POST | `/api/schedule` | 🔒 | Crear franja horaria | ⚠️ |
| GET | `/api/schedule/:psychologistId` | 🔒 | Franjas de un psicólogo | ✅ |
| GET | `/api/appointments/appointment` | 🔒 | Mis citas | ❌ |
| POST | `/api/appointments/appointment` | 🔒 | Reservar cita | ⚠️ |
| PATCH | `/api/appointments/appointment/cancel/:id` | 🔒 | Cancelar cita | ⚠️ |
| PATCH | `/api/appointments/appointment/update/:id` | 🔒 | Modificar cita | ⚠️ |
| POST | `/api/email/send-test` | — | Correo de prueba | ⚠️ abierto |
| GET | `/api/notifications/test` | 🔒 | Correo de prueba fijo | ⚠️ |

> La ruta de citas repite el nombre: `/api/appointments/appointment`.

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

- `role` es opcional (por defecto `paciente`). **Cualquiera puede registrarse como `administrador`.**
- Tras guardar, intenta enviar el correo `confirmation`; si falla, solo lo registra en el log.
- `201 { "message": "Usuario registrado correctamente" }`. No devuelve el `_id` ni un token.
- `500 { "message": "El email ya está en uso" }` si el email existe (debería ser 409). Cualquier error de validación también da 500.

### `POST /api/auth/login`

```json
{ "email": "ana@example.com", "password": "secreto123" }
```

- `200 { "token": "eyJ..." }` · payload `{ id, role, iat, exp }`, caduca en 1 h.
- `500 { "message": "Credenciales inválidas" }` (debería ser 401).
- Para conocer tu `_id`, decodifica el payload del JWT (la parte central, en base64).

## Usuarios

### `GET /api/users` 🔒 admin
Lista todos los usuarios sin `password`. `403` si no eres administrador.

### `GET /api/users/:id` 🔒
Cualquier usuario autenticado puede leer a cualquier otro (sin `password`).
`404` si no existe (y después el servidor registra un error *headers already sent*). Un id mal formado devuelve `500` (CastError).

### `PUT /api/users/:id` 🔒
Body: cualquier subconjunto de campos (`name`, `description`, `studies`…). Devuelve el usuario actualizado.
**Sin control de propiedad ni de campos**: cualquier usuario puede cambiar el `role` o el `password` (sin hashear) de cualquiera.

### `DELETE /api/users/:id` 🔒
`200 { "message": "Usuario eliminado correctamente" }`. Mismo problema de autorización; no borra horarios ni citas asociados.

## Horarios

### `POST /api/schedule` 🔒

```json
{ "psychologist": "<idPsicologo>", "day": "2026-12-15", "hour": "10:00" }
```

- `400 "No puedes crear horarios en fechas pasadas"` si `day` < ahora (por eso tampoco se puede crear para *hoy*).
- `400 "Psicólogo no encontrado"` / `400 "Ya existe un horario con la misma fecha y hora para este psicólogo."`
- `201 { "message": "Horario creado exitosamente", "schedule": {...} }`
- No comprueba que quien llama sea ese psicólogo, ni siquiera que sea psicólogo.

### `GET /api/schedule/:psychologistId` 🔒
Array con **todas** las franjas del psicólogo (pasadas y ocupadas incluidas). Filtra por `isAvailable` en el cliente.

## Citas

### `POST /api/appointments/appointment` 🔒

```json
{
  "patientId": "<idPaciente>",
  "psychologistId": "<idPsicologo>",
  "scheduleId": "<idHorario>"
}
```

- Calcula `time` = `schedule.day` + `schedule.hour` (UTC), rechaza fechas pasadas y duplicados del mismo paciente a la misma hora, crea la cita en `pendiente` y marca el horario `isAvailable=false`.
- `201 { "message": "Appointment scheduled successfully", "appointment": {...} }`.
- ⚠️ Los errores de negocio **también responden 201**, con `appointment: { "error": "..." }`: `"El horario no existe."`, `"Este horario ya está ocupado."`, `"No puedes agendar citas en fechas pasadas."`, `"Ya tienes una cita programada en este horario."`. El cliente debe mirar `appointment.error`.
- `500` si el `scheduleId` ya se usó antes en otra cita (índice único), aunque esa cita se cancelara.

### `GET /api/appointments/appointment` 🔒 ❌
Debería devolver las citas del paciente o del psicólogo autenticado (con `populate`). **Siempre responde `403 "Acceso no permitido"`** porque compara el rol con `'patient'`/`'psychologist'` en vez de `'paciente'`/`'psicologo'`.

### `PATCH /api/appointments/appointment/cancel/:id` 🔒
Sin body. Pone el estado a `'cancelled'` (valor fuera del enum) y libera el horario (`isAvailable=true`).
`200 { "message": "Appointment canceled successfully", "appointment": {...} }` · `404` si no existe.

### `PATCH /api/appointments/appointment/update/:id` 🔒
Body: campos a sobrescribir (p. ej. `{ "state": "completada" }`).
- `400 "Solo puedes modificar la cita hasta 24 horas antes de la fecha programada."` si faltan < 24 h (eso impide marcarla como `completada` después de la sesión).
- `200 { "message": "Cita actualizada correctamente", "updatedAppointment": {...} }`.
- Copia el body tal cual (`Object.assign`): se puede cambiar paciente, psicólogo o `time` sin tocar los horarios.

## Correo (pruebas)

### `POST /api/email/send-test`
Body `{ "email": "...", "nombre": "..." }`. Envía la plantilla `confirmation`. **Sin autenticación**: cualquiera puede usar el dominio para enviar correos.

### `GET /api/notifications/test` 🔒
Envía un correo fijo a una dirección personal escrita en el código. Solo útil para depurar; conviene eliminarlo.
