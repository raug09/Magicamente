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

**Gestionar franjas ya publicadas:** el psicólogo puede cambiar el día o la hora (`PUT /api/schedule/:id`) o borrarla (`DELETE`), **solo si está libre**. Si un paciente la reservó, el psicólogo debe cancelar antes la cita. Ambas operaciones están condicionadas a `isAvailable: true` en la propia escritura, así que una reserva simultánea nunca queda con la franja modificada o borrada.

## 3. Reservar una cita (paciente)

```mermaid
flowchart TD
  A[POST /api/appointments/appointment<br/>solo rol paciente, body: scheduleId] --> B{¿Existe la franja?}
  B -- no --> X1[404]
  B -- sí --> C{¿isAvailable?}
  C -- no --> X2[409 ocupada]
  C -- sí --> D[time = day + hour en UTC]
  D --> E{¿time en el pasado?}
  E -- sí --> X3[400]
  E -- no --> F{¿el paciente ya tiene otra cita viva a esa hora?}
  F -- sí --> X4[409]
  F -- no --> G[marcar franja ocupada<br/>findOneAndUpdate atómico]
  G -- otro llegó antes --> X2
  G --> H[crear Appointment 'pendiente'<br/>paciente = token, psicólogo = dueño de la franja]
  H -- falla --> R[liberar la franja y propagar el error]
  H --> OK[201]
```

La reserva es atómica: la franja se marca ocupada con una sola operación condicionada a `isAvailable: true`, así que si dos pacientes llegan a la vez solo uno recibe 201 y el otro 409. Si crear la cita falla después, la franja se libera.

**¿Cómo encuentra el paciente a un psicólogo?**
1. `GET /api/psychologists?q=ana` → lista de psicólogos activos (nombre, estudios y descripción).
2. `GET /api/schedule/:id?available=true` con el `_id` elegido → solo sus franjas libres y futuras, ordenadas (también acepta `from` y `to`).
3. `POST /api/appointments/appointment` con el `scheduleId`.

## 4. Ver, cancelar y completar

```mermaid
stateDiagram-v2
  [*] --> pendiente: reservar
  pendiente --> cancelada: cancelar (paciente, psicólogo o admin)
  pendiente --> completada: psicólogo/admin, una vez pasada la hora
  cancelada --> [*]
  completada --> [*]
```

- **Mis citas** (`GET /appointment`): el paciente ve las suyas con los datos públicos del psicólogo; el psicólogo ve las suyas con nombre y email del paciente.
- **Cancelar**: solo citas `pendiente`. Pasa a `cancelada` y la franja vuelve a quedar disponible (se puede reservar otra vez). Cancelar una cita que ya no está `pendiente` devuelve 400; esto evita que una segunda cancelación libere una franja que otro paciente ya reservó.
- **Completar** (`PATCH /appointment/update/:id` con `{ "state": "completada" }`): solo el psicólogo de la cita (o un administrador), solo si está `pendiente` y su hora ya pasó.
- Cancelar, completar y consultar solo las puede hacer el paciente o el psicólogo de la cita, o un administrador (si no, 403).

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
