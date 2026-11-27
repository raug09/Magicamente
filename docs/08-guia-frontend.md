# 08 · Guía para el frontend

Documento pensado para quien construya el frontend (persona o sesión de Claude) **sin haber visto el backend**. Contiene el contrato de la API, los flujos de pantalla, los casos límite y lo que falta. La referencia completa de endpoints está en [03 · API](03-api.md); aquí está lo que el frontend necesita para usarla bien.

> El repositorio todavía **no tiene frontend**. Sugerencia: crear una carpeta `Frontend/` en este mismo repositorio (un solo repo, un solo CI, la documentación a mano). Si prefieres un repositorio aparte, esta guía y `docs/03-api.md` son lo único que hay que copiar.

## 1. Datos de conexión

| Cosa | Valor |
|---|---|
| Base | `http://localhost:3000` en desarrollo. Todas las rutas empiezan por `/api` |
| Formato | JSON en ambos sentidos (`Content-Type: application/json`) |
| CORS | El backend **solo** acepta el origen configurado en `FRONTEND_URL` (por defecto `http://localhost:5173`, el puerto de Vite) o en `CORS_ORIGIN`. Si el frontend corre en otra dirección, hay que cambiar esa variable en `Backend/.env` |
| Errores | Siempre `{ "message": "texto en español" }`. Los `400` de validación añaden `"errors": [{ "field": "email", "message": "…" }, …]` con **todos** los campos inválidos: úsalo para marcar cada campo del formulario (`message` es el primero, para un aviso general) |

## 2. Sesión y autenticación

1. `POST /api/auth/login` → `{ "token": "<jwt>" }`. Responde `403` si el email aún no está confirmado (ver §5).
2. Enviar `Authorization: Bearer <token>` en toda petición protegida.
3. El token **dura 1 hora y no hay refresh token**: pasada la hora hay que volver a iniciar sesión.
4. **`GET /api/auth/me`** devuelve el usuario de la sesión (`_id`, `name`, `email`, `role`, `studies`, `description`, `isActive`, `createdAt`). Llámalo al arrancar la app si hay un token guardado: si responde `401`, la sesión no vale; si responde `200`, ya tienes el usuario y su rol. **No decodifiques el JWT en el cliente.**
5. El registro (`POST /api/auth/register`) **ya no devuelve sesión**: hay que confirmar el email primero. Tras el registro, muestra “revisa tu correo” y ofrece reenviar el enlace.

### Cuándo se invalida la sesión (siempre `401`)

El backend consulta la base de datos en cada petición. Un `401` significa “vuelve a iniciar sesión” y puede ser por:

- token caducado, mal formado o ausente;
- la cuenta fue borrada o desactivada;
- se cambió o restableció la contraseña después de emitir ese token (**también al cambiarla uno mismo** con `PUT /api/users/:id`: el cliente debe pedir login otra vez);
- el rol del usuario cambia **al instante** (si un administrador lo cambia, el siguiente `403`/`200` ya refleja el nuevo rol sin reloguear; conviene releer el rol tras cualquier `403` inesperado).

Regla general en el cliente: ante cualquier `401` en una ruta protegida → borrar el token y llevar a la pantalla de login.

### Dónde guardar el token

Es un JWT en cabecera (no cookie `HttpOnly`). `localStorage` es lo más sencillo pero es legible por cualquier script de la página: evita cargar scripts de terceros, no pongas contenido HTML sin escapar y usa una política CSP en producción.

## 3. Códigos de error y qué hacer

| Código | Significado | Qué mostrar |
|---|---|---|
| 400 | Datos no válidos (campo ausente, formato, id mal formado, regla de negocio) | Mostrar `message` junto al formulario |
| 401 | Sesión no válida o caducada | Ir a login (en el propio login: “credenciales incorrectas”) |
| 403 | Sin permiso para esa acción | Mostrar `message`; no reintentar |
| 404 | No existe (o no tienes acceso a verlo) | “No encontrado” |
| 409 | Conflicto: franja ocupada, email ya registrado, franja duplicada, cita ya ocupada… | Mostrar `message` y **refrescar los datos** (alguien más pudo reservar antes) |
| 429 | Demasiadas peticiones | “Inténtalo de nuevo en unos minutos”. Lee la cabecera `Retry-After` (segundos) |
| 500 | Error del servidor | Mensaje genérico |

Límites por IP: login **10 intentos fallidos / 15 min**; registro + recuperar contraseña **10 / hora** (contador común a las tres rutas); API general 300 / 15 min.

## 4. Roles y pantallas

| Rol | Puede |
|---|---|
| `paciente` (por defecto) | Buscar psicólogos, ver sus franjas libres, reservar, ver y cancelar **sus** citas, editar su perfil |
| `psicologo` | Publicar/editar/borrar sus franjas, ver sus citas (con nombre y email del paciente), cancelarlas, marcarlas como completadas, editar su perfil (`description`, `studies`) |
| `administrador` | Todo lo anterior sobre cualquier usuario, más listar usuarios (`GET /api/users`) y cambiar roles. **No** tiene “mis citas” (`GET /appointments` le da 403) |

El registro público solo permite `paciente` o `psicologo`. El primer administrador se crea a mano en la base de datos (ver [manual](05-manual-de-uso.md#crear-el-primer-administrador)).

### Pantallas mínimas

1. **Registro** · **Login** · **Olvidé mi contraseña** · **`/reset-password?token=…`** (esta ruta es obligatoria: el correo enlaza a `<FRONTEND_URL>/reset-password?token=<token>`).
2. **Paciente:** listado de psicólogos (búsqueda + paginación) → detalle con franjas libres → confirmar reserva → “Mis citas” (con cancelar) → perfil.
3. **Psicólogo:** “Mi agenda” (crear/editar/borrar franjas) → “Mis citas” (cancelar / completar) → perfil público (descripción y estudios).
4. **Administrador (opcional):** tabla de usuarios.

## 5. Contrato por pantalla

### Registro / login

```http
POST /api/auth/register   { "name", "email", "password", "role"?: "paciente"|"psicologo", "studies"?: ["…"], "timezone"?: "America/Bogota" }
→ 201 { "message": "Usuario registrado correctamente", "token": "…", "user": { "_id", "name", "email", "role", "timezone", … } }
→ 400 (campo ausente, rol no permitido, contraseña débil) · 409 (email ya usado)

POST /api/auth/login      { "email", "password" }
→ 200 { "token": "…" }
→ 401 credenciales inválidas · 403 cuenta desactivada
```

**Contraseña:** entre **8 caracteres y 72 bytes** (en el frontend, valida longitud mínima y avisa; el límite de 72 bytes solo importa con emojis o textos larguísimos). Es la misma regla para registro, cambio de contraseña y recuperación.

### Recuperar contraseña

```http
POST /api/auth/forgot-password  { "email" }
→ 200 { "message": "Si el email está registrado, recibirás un enlace…" }   (siempre, exista o no)

POST /api/auth/reset-password   { "token", "password" }
→ 200 { "message": "Contraseña actualizada correctamente" } → llevar a login
→ 400 "El enlace no es válido o ha caducado" (caducado, ya usado o sustituido por uno más reciente) · 400 contraseña débil
```

El mensaje de `forgot-password` es siempre el mismo: **muestra “Si el email existe, te llegará un enlace”**, nunca “email no encontrado”. El enlace dura 1 hora y es de un solo uso; se puede pedir como mucho 1 correo por minuto por cuenta (si se pide antes, no llega otro y la respuesta sigue siendo 200).

### Paciente: buscar y reservar

```http
GET /api/psychologists?q=ana&page=1&limit=20
→ 200 { "total": 3, "page": 1, "limit": 20, "pages": 1,
        "items": [ { "_id", "name", "studies": [], "description" } ] }
   (limit máx. 50; solo psicólogos activos; orden por nombre; sin email)

GET /api/schedule/:psychologistId?available=true&from=2026-12-01&to=2026-12-31&page=1&limit=20
→ 200 { "total", "page", "limit", "pages", "items": [ { "_id", "psychologist", "day": "2026-12-15T00:00:00.000Z", "hour": "10:00",
          "timezone": "America/Bogota", "startsAt": "2026-12-15T15:00:00.000Z",
          "isAvailable": true, "createdAt" } ] }
   (ordenadas por startsAt; available=true = libres y que aún no han empezado;
    from/to se refieren al día del calendario del psicólogo, formato YYYY-MM-DD)

POST /api/appointments/appointment   { "scheduleId" }
→ 201 { "message": "Cita agendada correctamente", "appointment": { "_id", "patientId", "psychologistId",
        "scheduleId", "state": "pendiente", "time", "hour", "reminderSent": false } }
→ 400 franja pasada · 404 franja no existe · 409 ocupada, o ya tienes otra cita a esa hora
```

Solo se envía `scheduleId`: el paciente sale del token y el psicólogo, de la franja. **Ante un 409, vuelve a pedir las franjas**: alguien reservó antes.

### Mis citas

```http
GET /api/appointments/appointment?page=1&limit=20
→ 200 { "total": 42, "page": 1, "limit": 20, "pages": 3,
        "items": [ { "_id", "state", "time", "hour", "scheduleId": { …franja completa… },
                     "psychologistId": { "_id", "name", "studies", "description" }   ← si eres paciente
                     "patientId":      { "_id", "name", "email" }                    ← si eres psicólogo
                   } ] }   (ordenadas por fecha ascendente)
→ 403 si eres administrador
```

⚠️ **Las listas ya no son arrays**: “mis citas”, las franjas de un psicólogo y el listado de psicólogos devuelven `{ total, page, limit, pages, items }`. Lee `items` y usa `pages` para la paginación.

```http
PATCH /api/appointments/appointment/cancel/:id         → 200 { "message", "appointment" }
   400 si la cita no está pendiente (ya cancelada o completada) o si su hora ya pasó · 403 si no es tuya · 404

PATCH /api/appointments/appointment/update/:id  { "state": "completada" }   (solo el psicólogo de la cita)
   400 si aún no ha ocurrido, o no está pendiente · 403 si no eres su psicólogo
```

Estados de una cita: `pendiente` → `cancelada` (cancelar) o `completada` (psicólogo, después de la hora). No hay más transiciones. Una franja cancelada vuelve a estar libre y se puede volver a reservar.

### Psicólogo: agenda

```http
POST   /api/schedule        { "day": "2026-12-15", "hour": "10:00", "repeatWeeks"?: 1–26 }  → 201 { "message", "schedules", "skipped" }
PUT    /api/schedule/:id    { "day"?: "…", "hour"?: "…" }                   → 200 { "message", "schedule" }
DELETE /api/schedule/:id                                                    → 200 { "message" }
GET    /api/schedule/:miId  (sin filtros = todas, incluidas ocupadas y pasadas)
```

- `day` con formato **`YYYY-MM-DD`** (fecha real) y `hour` con formato `HH:mm` (24 h), ambos en la zona horaria del psicólogo (§6). La franja debe empezar en el futuro.
- `409` al crear/mover si ya existe una franja igual, y **al editar/borrar una franja con cita reservada** (el psicólogo debe cancelar antes la cita).
- Un psicólogo no puede crear franjas para otro (403); un administrador sí, indicando `"psychologist": "<id>"`.

### Perfil

```http
GET /api/users/:id
→ tu propio id (o cualquiera si eres admin): perfil completo sin contraseña
→ id de un psicólogo: solo { _id, name, role, studies, description }
→ otro caso: 404

PUT /api/users/:id   (solo tú mismo o un admin)
   puedes cambiar: name, description, studies (lista de textos), password, timezone
   un admin además: email, role, isActive
   cualquier otro campo → 403
```

Cambiar la contraseña desde el perfil **cierra la sesión actual** (vuelve a pedir login).

`DELETE /api/users/:id` elimina la cuenta (tú mismo o un admin). Qué ocurre, para que el frontend lo explique antes de confirmar:

- La cuenta **se anonimiza y se desactiva** (la persona no puede volver a entrar con ese token ni con esa contraseña; el email queda libre para registrarse de nuevo). Es irreversible.
- Sus **citas pendientes se cancelan** y se avisa por correo a la otra persona. Si era el paciente, la franja vuelve a estar libre.
- Si era psicólogo, se borran sus franjas sin historial y desaparece del listado de psicólogos.
- Las citas **completadas** se conservan en el historial de la otra persona. En ellas el nombre de la persona eliminada aparece como **“Usuario eliminado”**: el frontend debe tolerarlo.
- No se puede eliminar al **último administrador**: responde `409` (“No puedes eliminar al último administrador”).
- Tras eliminar la propia cuenta, el frontend debe borrar el token y volver a login (cualquier petición posterior da `401`).

## 6. Fechas y zonas horarias

**Regla de oro: el backend guarda y devuelve instantes reales (UTC, formato ISO con `Z`). El frontend los convierte a la zona del usuario para mostrarlos.** Cada usuario tiene una `timezone` (nombre IANA, p. ej. `"America/Bogota"`, `"Europe/Madrid"`; por defecto `"UTC"`).

### Qué campos usar para mostrar

| Dato | Campo fiable | Cómo mostrarlo |
|---|---|---|
| Cuándo empieza una franja | `startsAt` (ISO UTC) | `new Date(s.startsAt)` → formatear con la zona del usuario que mira |
| Cuándo es una cita | `time` (ISO UTC) | igual |
| Hora “de pared” del psicólogo | `hour` + `timezone` de la franja | Solo informativa: “10:00 (America/Bogota)” |

**No uses `day` + `hour` para calcular instantes**: `day` es el día del calendario *del psicólogo* a medianoche UTC (`"2026-12-15T00:00:00.000Z"` significa “15 de diciembre”, no un instante) y `hour` es su hora local. El instante real es siempre `startsAt`.

```ts
// Mostrar en la zona del usuario que mira (p. ej. user.timezone de /auth/me)
new Intl.DateTimeFormat('es', { timeZone: me.timezone, dateStyle: 'full', timeStyle: 'short' })
  .format(new Date(slot.startsAt));
```

### Qué enviar al crear o mover una franja

`POST /api/schedule` y `PUT /api/schedule/:id` reciben el `day` (`"YYYY-MM-DD"`) y la `hour` (`"HH:mm"`) **tal como los ve el psicólogo, en su propia zona** — el servidor los convierte a UTC con su `timezone` guardada (incluido el horario de verano). El frontend **no convierte nada**: simplemente muestra al psicólogo “Tu zona horaria: X” y le deja elegir día y hora locales. Si el psicólogo cambia de zona (`PUT /api/users/:id { timezone }`), las franjas ya creadas **no se mueven** (su `startsAt` sigue siendo el mismo instante real).

- Si la hora pedida **no existe** por el cambio de hora (p. ej. 02:30 el día que el reloj salta de 02:00 a 03:00), responde `400` con el motivo: muéstralo.
- Si existe dos veces (el reloj retrocede), se usa la primera.

### Zona horaria del usuario

- Al **registrarse**, envía `timezone` con la del navegador: `Intl.DateTimeFormat().resolvedOptions().timeZone`. Es opcional (sin ella, `"UTC"`) y se valida (`400` si no es válida).
- `GET /api/auth/me` la devuelve. Se cambia con `PUT /api/users/:id { "timezone": "Europe/Madrid" }`. Ofrece un selector en el perfil.
- Los **correos** (recordatorios y avisos de cancelación) usan la zona del destinatario.

### Franjas recurrentes

`POST /api/schedule` acepta `"repeatWeeks": N` (entero de 1 a 26): crea esa franja y las N−1 siguientes, **una por semana, siempre a la misma hora local** aunque cambie el horario de verano.

```http
POST /api/schedule  { "day": "2026-12-15", "hour": "10:00", "repeatWeeks": 8 }
→ 201 { "message": "Horario creado exitosamente",
        "schedules": [ { "_id", "day", "hour", "timezone", "startsAt", "isAvailable", … }, … ],
        "skipped": ["2027-01-05"] }          ← días que ya existían (no se duplican)
→ 409 si ya existían todas · 400 si repeatWeeks no es un entero de 1 a 26, o alguna cae en un cambio de hora inexistente (no se crea ninguna)
```

⚠️ **La respuesta de crear franja cambió**: ahora es siempre `schedules` (una lista, aunque sea de una) y `skipped`. Ya no existe `schedule` en singular al crear (`PUT` sí devuelve `schedule`). Cada franja de una serie es **independiente**: se borra o mueve por separado; no hay un “borrar toda la serie”.

### Día de hoy

Ya se pueden crear franjas para **hoy** (en el calendario del psicólogo) siempre que su hora no haya empezado. Una franja ya empezada nunca se puede reservar: `GET /schedule/:id?available=true` ya la excluye.

### Cambiar el email

1. Formulario en el perfil: nuevo email y contraseña actual → `POST /api/auth/change-email { email, password }` (requiere sesión).
2. Mensaje: “Te hemos enviado un enlace a la nueva dirección”. El email **todavía no ha cambiado**.
3. El usuario abre el enlace del correo (`/confirm-email-change?token=…`) → `POST /api/auth/confirm-email-change { token }`.
4. Tras confirmar, la sesión actual sigue abierta; basta con refrescar la pantalla de perfil.

Errores: `400 “La contraseña no es correcta”` (muestra el error en el formulario; **no** cierres la sesión: es un 400, no un 401), `409 “Ese email ya está en uso”`.

### Rutas a las que apuntan los correos

Los botones de los correos llevan a estas rutas de `FRONTEND_URL`. El frontend debe crearlas con estos nombres:

| Ruta | Correo | Qué hace |
|---|---|---|
| `/verify-email?token=…` | Confirmación de email | Llama a `POST /auth/verify-email` |
| `/reset-password?token=…` | Recuperación de contraseña | Formulario de nueva contraseña |
| `/citas` | Recordatorio de cita | Mis citas |
| `/psicologos` | Aviso de cita cancelada | Listado de psicólogos |
| `/confirm-email-change?token=…` | Confirmación de nuevo email | Llama a `POST /auth/confirm-email-change` |
| `/agenda` | Cuenta de psicólogo aprobada | Agenda del psicólogo |
| `/perfil` | Solicitud de psicólogo rechazada | Perfil con el motivo y los documentos |

Las dos últimas son nombres elegidos por el backend; si el frontend usa otras rutas, dilo y se cambian en `config/emailTemplates.ts`.

## 7. Detalles que conviene saber

- **El email se normaliza** (sin espacios, en minúsculas): el frontend puede enviarlo como lo escriba el usuario y mostrar el que devuelve el servidor.
- **Límites de los campos** (el servidor responde 400 si no se cumplen, conviene validarlos también en el formulario): `name` ≤ 100 caracteres; `email` con formato válido; `password` 8 caracteres–72 bytes; `studies` ≤ 30 elementos de ≤ 200 caracteres; `description` ≤ 2000; `repeatWeeks` 1–26.
- Los campos que el servidor no espera se **ignoran** sin error (excepto al editar un usuario, una franja o una cita: ahí un campo que no puedes cambiar da `403`).
- `GET /health` sirve para comprobar que la API y su base de datos responden (útil para una pantalla de “servicio no disponible”).

- Los `_id` son cadenas de 24 caracteres hexadecimales; si pasas otro formato, recibes `400`.
- `GET /api/users` (listado completo) es solo para administradores. Los pacientes encuentran psicólogos con `/api/psychologists`.
- Las respuestas de usuario **nunca** incluyen contraseña ni datos de recuperación.
- Los correos (confirmación, recordatorio 24 h antes de la cita, recuperación) los envía el backend; el frontend no hace nada.
- El recordatorio se envía **una sola vez** por cita pendiente, aproximadamente 24 h antes.
- No hay paginación en “mis citas” ni en las franjas: devuelven todo (usa `from`/`to`/`available` para acotar).

## 8. Cómo desarrollar el frontend contra el backend

```bash
cd Backend && cp .env.example .env     # JWT_SECRET y MONGO_URI como mínimo
npm install && npm run dev             # http://localhost:3000
```

- Pon en `Backend/.env`: `FRONTEND_URL=http://localhost:5173` (o la dirección real de tu frontend) para el CORS y para el enlace del correo de recuperación.
- Sin `RESEND_API_KEY` los correos **no se envían** y el token de recuperación no aparece en ningún lado: para probar el flujo de recuperación completo necesitas una clave de Resend (o consultar el token directamente en la base de datos).
- Datos de prueba: ver el recorrido con `curl` del [manual](05-manual-de-uso.md#recorrido-completo-con-curl).
- Los límites de intentos (`429`) pueden molestar en desarrollo: son por IP y se reinician al reiniciar el backend.

## 9. Pendientes

### Backend que facilitaría el frontend (por orden de utilidad)

- [ ] Paginación en “mis citas”.
- [ ] Documentación OpenAPI/Swagger generada (así el frontend puede generar sus tipos automáticamente).

### Frontend (todo)

- [ ] Elegir stack (sugerencia: Vite + React + TypeScript; el CORS por defecto ya apunta al puerto de Vite `5173`).
- [ ] Cliente HTTP con cabecera `Authorization`, manejo global de `401` (→ login) y de `429` (`Retry-After`).
- [ ] Pantallas de §4, empezando por registro/login → listado de psicólogos → reserva → mis citas.
- [ ] Ruta `/reset-password` que lea `token` de la URL.
- [ ] Mostrar fechas con `startsAt`/`time` y `Intl.DateTimeFormat` (§6); selector de zona horaria en el perfil.
- [ ] Tests (por ejemplo, Vitest + Testing Library) y un job de CI para el frontend en `.github/workflows/`.
