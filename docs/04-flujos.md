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

No hay verificación de email ni botón de “cerrar sesión” en el servidor: el cliente borra su token. Aun así, un token deja de valer al instante si se borra o desactiva al usuario, o si cambia su contraseña (ver [arquitectura](01-arquitectura.md#autenticación-y-autorización)).

### Recuperación de contraseña

```mermaid
sequenceDiagram
  participant U as Usuario
  participant F as Frontend
  participant API
  participant DB as MongoDB
  participant R as Resend
  U->>F: "Olvidé mi contraseña" (email)
  F->>API: POST /api/auth/forgot-password {email}
  API->>DB: ¿existe, activa y sin petición en el último minuto?
  API->>DB: guarda SHA-256(token) + caducidad (1 h)
  API-->>R: correo con <FRONTEND_URL>/reset-password?token=...  (en segundo plano)
  API->>F: 200 mensaje genérico (igual exista o no el email)
  U->>F: abre el enlace del correo y escribe la nueva contraseña
  F->>API: POST /api/auth/reset-password {token, password}
  API->>DB: findOneAndUpdate atómico: hash válido y no caducado → nueva contraseña + passwordChangedAt + borra el token (cierra las sesiones abiertas)
  API->>F: 200 (o 400 si es inválido, caducado o ya usado)
```

Decisiones de seguridad:
- El token son 32 bytes aleatorios (`crypto.randomBytes`); la base de datos solo guarda su hash, así que una filtración de la BD no permite restablecer cuentas.
- La respuesta es idéntica exista o no el email, y el correo se envía en segundo plano para que el tiempo de respuesta tampoco lo delate.
- Un solo uso garantizado por una operación atómica; dos peticiones simultáneas con el mismo token no pueden ganar las dos.
- Dos límites contra el abuso: un correo por minuto y cuenta, y 10 peticiones por hora y IP.
- El nombre del usuario se escapa en el HTML del correo.

**El frontend** debe tener una pantalla `/reset-password` que lea `token` de la URL y llame a `reset-password`. Configura su dirección en `FRONTEND_URL`.

## 2. Publicar disponibilidad (psicólogo)

1. El psicólogo hace login.
2. `POST /api/schedule { day, hour, repeatWeeks? }`. El psicólogo es siempre el usuario autenticado (un administrador puede indicar `psychologist`).
3. `day` y `hour` se interpretan **en la zona horaria del psicólogo** y se convierten al instante UTC real (`startsAt`). Se calculan antes todas las ocurrencias semanales (si una cae en un cambio de hora inexistente, no se crea ninguna) y se validan: formato, que la primera no haya empezado y que el destinatario sea un psicólogo activo.
4. Se crea una franja por semana (`repeatWeeks`, hasta 26), omitiendo las que ya existían (`skipped`); si ya existían todas, `409`. Todas se añaden a `user.schedules`.

Cada franja es un hueco único (una fecha y una hora) e independiente: las de una serie semanal se mueven o se borran por separado. Cada semana conserva la hora local aunque cambie el horario de verano.

**Gestionar franjas ya publicadas:** el psicólogo puede cambiar el día o la hora (`PUT /api/schedule/:id`) o borrarla (`DELETE`), **solo si está libre**. Si un paciente la reservó, el psicólogo debe cancelar antes la cita. Ambas operaciones están condicionadas a `isAvailable: true` en la propia escritura, así que una reserva simultánea nunca queda con la franja modificada o borrada.

## 3. Reservar una cita (paciente)

```mermaid
flowchart TD
  A[POST /api/appointments/appointment<br/>solo rol paciente, body: scheduleId] --> B{¿Existe la franja?}
  B -- no --> X1[404]
  B -- sí --> C{¿isAvailable?}
  C -- no --> X2[409 ocupada]
  C -- sí --> D[time = schedule.startsAt, el instante real UTC]
  D --> E{¿startsAt en el pasado?}
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

## Borrar una cuenta

`DELETE /api/users/:id` (uno mismo o administrador) **no borra el registro**: lo anonimiza, para que el historial de citas completadas siga teniendo sentido sin conservar datos personales.

1. **Se bloquea la cuenta**: nombre → “Usuario eliminado”, email → `deleted-<id>@deleted.invalid` (el email original queda libre), contraseña inutilizable, `isActive: false`, `deletedAt`, se borran estudios y descripción y se invalidan las sesiones.
2. **Citas pendientes** → `cancelada`. Si el eliminado era el paciente, la franja vuelve a estar libre. Se envía el correo `appointmentCancelled` a la otra persona (si falla, no se interrumpe el borrado).
3. **Si era psicólogo**: se borran sus franjas sin ninguna cita; las que tienen citas (aunque sean históricas) se conservan como no reservables. Deja de aparecer en `/api/psychologists`, y no se pueden reservar sus franjas restantes (`409`).
4. **Último administrador**: no se puede eliminar (`409`).

Los pasos se ejecutan en orden y cada uno es independiente (sin transacción, MongoDB necesitaría un clúster con réplicas); si el servidor se cayera a mitad, la cuenta ya está bloqueada y las citas pendientes que quedaran se podrían cancelar a mano.

## 5. Recordatorios automáticos (`config/cronJobs.ts`)

- Expresión `"0 * * * *"` → al minuto 0 de **cada hora**.
- `sendAppointmentReminders()` busca citas en estado `pendiente`, con `reminderSent` distinto de `true` y que empiecen en las **próximas 24 horas**.
- Para cada una, primero marca `reminderSent: true` de forma atómica (así dos procesos no envían el mismo aviso) y luego envía `appointmentReminder` al paciente.
- Si el envío falla, vuelve a poner `reminderSent: false` para reintentarlo en la siguiente hora.
- Resultado: **un solo correo por cita**, entre 23 y 24 horas antes (o en la siguiente ejecución horaria, si se reserva con menos de 24 h de antelación).
- El correo muestra la fecha completa y la hora con minutos (“martes, 15 de diciembre de 2026 a las 10:00”) en **la zona horaria del paciente** (`user.timezone`).

## 6. Plantillas de correo (`config/emailTemplates.ts`)

| Nombre | Parámetros | Uso |
|---|---|---|
| `confirmation` | `name` | Registro |
| `resetPassword` | `name`, `resetLink` | Recuperación de contraseña |
| `appointmentReminder` | `name`, `date`, `hour` | Cron |
| `appointmentCancelled` | `name`, `date`, `hour` | Aviso a la otra persona al eliminar una cuenta con citas pendientes |

Remitente: `EMAIL_FROM` (por defecto `Soporte <support@magicamente.online>`). Sin `RESEND_API_KEY` los correos no se envían: se muestra un aviso en consola. El dominio tiene que estar verificado en la cuenta de Resend asociada a `RESEND_API_KEY`.
