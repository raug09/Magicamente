# 04 · Flujos de negocio

## 1. Registro y login

```mermaid
sequenceDiagram
  participant U as Usuario
  participant API
  participant DB as MongoDB
  participant R as Resend
  U->>API: POST /api/auth/register {name,email,password,role,studies}
  API->>API: role ∈ {paciente, psicologo}? si no, 400
  API->>DB: ¿existe email? si sí, 409
  API->>DB: guardar User (password con bcrypt)
  API-->>R: correo "Confirmación de Registro" (si falla, solo log)
  API->>U: 201
  U->>API: POST /api/auth/login {email,password}
  API->>DB: buscar por email + bcrypt.compare
  API->>U: 200 {token} (JWT 1h con id y role) · 401 si falla
```

No hay verificación de email, recuperación de contraseña (existe la plantilla `resetPassword` pero ningún endpoint) ni cierre de sesión.

## 2. Publicar disponibilidad (psicólogo)

1. El psicólogo hace login.
2. Por cada franja: `POST /api/schedule { day, hour }`. El psicólogo es siempre el usuario autenticado (un administrador puede indicar `psychologist`).
3. Se valida la fecha (futura), el formato `HH:mm`, que el destinatario sea psicólogo y que no haya otra franja igual (409). Se crea el `Schedule` y se añade a `user.schedules`.

Cada franja es un hueco único (una fecha y una hora). El campo `recurrent` existe pero no genera franjas repetidas.

## 3. Reservar una cita (paciente)

```mermaid
flowchart TD
  A[POST /api/appointments/appointment<br/>solo rol paciente, body: scheduleId] --> B{¿Existe schedule?}
  B -- no --> X1[error: El horario no existe]
  B -- sí --> C{¿isAvailable?}
  C -- no --> X2[error: ocupado]
  C -- sí --> D[time = day + hour en UTC]
  D --> E{¿time en el pasado?}
  E -- sí --> X3[error: fecha pasada]
  E -- no --> F{¿paciente ya tiene cita a esa hora?}
  F -- sí --> X4[error: duplicada]
  F -- no --> G[crear Appointment 'pendiente'<br/>paciente = token, psicólogo = dueño del horario]
  G --> H[schedule.isAvailable = false]
  H --> OK[201]
```

Todos los `error` salen con código **201** (ver problemas). La comprobación de disponibilidad y la creación no son atómicas: dos reservas simultáneas pueden pasar la validación, aunque el índice único de `scheduleId` hará fallar a la segunda con un 500.

**¿Cómo encuentra el paciente a un psicólogo?** Si conoce su id, puede ver su perfil público con `GET /api/users/:id`. Pero todavía no hay un listado de psicólogos (`GET /api/users` es solo para administradores). Hay que añadirlo (ver hoja de ruta).

## 4. Modificar o cancelar

- **Cancelar**: estado → `'cancelled'` y la franja vuelve a estar disponible. Pero esa franja ya no se puede volver a reservar por el índice único de `scheduleId`.
- **Modificar**: solo el campo `state` (`pendiente`, `completada`, `cancelada`) y solo si faltan más de 24 h. Pasar a `cancelada` por aquí no libera la franja: para cancelar usa el endpoint de cancelación.
- Ambas solo las puede hacer el paciente o el psicólogo de la cita, o un administrador (si no, 403).

## 5. Recordatorios automáticos (`config/cronJobs.ts`)

- Expresión `"0 * * * *"` → al minuto 0 de **cada hora**.
- `sendAppointmentReminders()` busca citas en estado `pendiente`, con `reminderSent` distinto de `true` y que empiecen en las **próximas 24 horas**.
- Para cada una, primero marca `reminderSent: true` de forma atómica (así dos procesos no envían el mismo aviso) y luego envía `appointmentReminder` al paciente.
- Si el envío falla, vuelve a poner `reminderSent: false` para reintentarlo en la siguiente hora.
- Resultado: **un solo correo por cita**, entre 23 y 24 horas antes (o en la siguiente ejecución horaria, si se reserva con menos de 24 h de antelación).
- El correo muestra la fecha completa y la hora con minutos (“martes, 15 de diciembre de 2026 a las 10:00”) en la zona `APP_TIMEZONE` (por defecto `UTC`, la misma en la que se guardan las horas).

## 6. Plantillas de correo (`config/emailTemplates.ts`)

| Nombre | Parámetros | Uso |
|---|---|---|
| `confirmation` | `name` | Registro |
| `resetPassword` | `name`, `resetLink` | Sin uso |
| `appointmentReminder` | `name`, `date`, `hour` | Cron |

Remitente: `EMAIL_FROM` (por defecto `Soporte <support@magicamente.online>`). Sin `RESEND_API_KEY` los correos no se envían: se muestra un aviso en consola. El dominio tiene que estar verificado en la cuenta de Resend asociada a `RESEND_API_KEY`.
