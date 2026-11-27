# 02 · Modelo de datos

MongoDB con tres colecciones (Mongoose pluraliza: `users`, `schedules`, `appointments`).

```mermaid
erDiagram
  USER ||--o{ SCHEDULE : "psicólogo publica"
  USER ||--o{ APPOINTMENT : "paciente reserva"
  USER ||--o{ APPOINTMENT : "psicólogo atiende"
  SCHEDULE ||--o| APPOINTMENT : "ocupa (scheduleId único)"
  USER {
    ObjectId _id
    string name
    string email "único"
    string password "hash bcrypt"
    string role "paciente | psicologo | administrador"
    bool isActive
    string[] studies
    string description
    ObjectId[] schedules
    Date createdAt
  }
  SCHEDULE {
    ObjectId _id
    ObjectId psychologist
    Date day
    string hour "HH:mm"
    bool isAvailable
    bool recurrent
    Date createdAt
  }
  APPOINTMENT {
    ObjectId _id
    ObjectId patientId
    ObjectId psychologistId
    ObjectId scheduleId "único"
    string state "pendiente | completada | cancelada"
    Date time "día + hora en UTC"
    string hour
  }
```

## `User` (`models/User.ts`)

| Campo | Tipo | Reglas | Notas |
|---|---|---|---|
| `name` | String | obligatorio | |
| `email` | String | obligatorio, **único** | Sin normalizar (mayúsculas/espacios cuentan como distintos) |
| `password` | String | obligatorio | Hash bcrypt (10 rondas) al registrarse. **No** se vuelve a hashear si se cambia por `PUT /api/users/:id` |
| `role` | enum | `paciente` (defecto), `psicologo`, `administrador` | Lo elige el cliente al registrarse |
| `isActive` | Boolean | defecto `true` | No se usa en ningún sitio (no bloquea el login) |
| `studies` | [String] | defecto `[]` | Formación del psicólogo |
| `description` | String | | No se puede rellenar al registrarse, solo con `PUT` |
| `schedules` | [ObjectId → Schedule] | | Se añade cada horario creado; nunca se limpia |
| `createdAt` | Date | defecto ahora | |

## `Schedule` (`models/Schedule.ts`)

Una **franja horaria concreta** de un psicólogo (no un horario semanal).

| Campo | Tipo | Reglas | Notas |
|---|---|---|---|
| `psychologist` | ObjectId → User | obligatorio | No se comprueba que el usuario tenga rol `psicologo` |
| `day` | Date | obligatorio | Fecha; se espera medianoche UTC, p. ej. `"2026-12-15"` |
| `hour` | String | obligatorio | Formato `"HH:mm"`, se interpreta **en UTC** al reservar |
| `isAvailable` | Boolean | defecto `true` | `false` cuando hay una cita reservada |
| `recurrent` | Boolean | defecto `false` | **Sin uso**: no existe lógica de recurrencia |
| `createdAt` | Date | defecto ahora | |

Unicidad (`psychologist` + `day` + `hour`) solo se comprueba en código, no con un índice.

## `Appointment` (`models/appointment.ts`)

| Campo | Tipo | Reglas | Notas |
|---|---|---|---|
| `patientId` | ObjectId → User | obligatorio | Se toma del **body**, no del token |
| `psychologistId` | ObjectId → User | obligatorio | Se toma del body; no se comprueba que coincida con el dueño del horario |
| `scheduleId` | ObjectId → Schedule | obligatorio, **índice único** | Impide volver a reservar una franja cancelada (ver problemas) |
| `state` | enum | `pendiente` (defecto), `completada`, `cancelada` | La cancelación escribe `'cancelled'`, fuera del enum |
| `time` | Date | obligatorio | `schedule.day` con `setUTCHours(hora, minutos)` |
| `hour` | String | obligatorio | Copia de `schedule.hour` |

No hay `timestamps` en ningún modelo, ni borrado en cascada (borrar un usuario deja horarios y citas huérfanos).

## Zonas horarias

Todo se guarda en UTC y `hour` se aplica como hora UTC. Si los usuarios están en, por ejemplo, UTC‑5, un horario `"10:00"` corresponde a las 05:00 locales. Hay que decidir una convención (guardar la zona del psicólogo, o que el frontend envíe instantes ISO completos).
