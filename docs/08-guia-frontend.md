# 08 · Guía para el frontend

Documento pensado para quien construya el frontend (persona o sesión de Claude) **sin haber visto el backend**. Contiene el contrato de la API, los flujos de pantalla, los casos límite y lo que falta. La referencia completa de endpoints está en [03 · API](03-api.md); aquí está lo que el frontend necesita para usarla bien.

> El repositorio todavía **no tiene frontend**. Sugerencia: crear una carpeta `Frontend/` en este mismo repositorio (un solo repo, un solo CI, la documentación a mano). Si prefieres un repositorio aparte, esta guía y `docs/03-api.md` son lo único que hay que copiar.

## 1. Datos de conexión

| Cosa | Valor |
|---|---|
| Base | `http://localhost:3000` en desarrollo. Todas las rutas empiezan por `/api` |
| Formato | JSON en ambos sentidos (`Content-Type: application/json`) |
| CORS | El backend **solo** acepta el origen configurado en `FRONTEND_URL` (por defecto `http://localhost:5173`, el puerto de Vite) o en `CORS_ORIGIN`. Si el frontend corre en otra dirección, hay que cambiar esa variable en `Backend/.env` |
| Errores | Siempre `{ "message": "texto en español" }` (algunos 400 de validación añaden `"errors": [campos]`) |

## 2. Sesión y autenticación

1. `POST /api/auth/login` → `{ "token": "<jwt>" }`.
2. Enviar `Authorization: Bearer <token>` en toda petición protegida.
3. El token **dura 1 hora y no hay refresh token**: pasada la hora hay que volver a iniciar sesión.
4. **`GET /api/auth/me`** devuelve el usuario de la sesión (`_id`, `name`, `email`, `role`, `studies`, `description`, `isActive`, `createdAt`). Llámalo al arrancar la app si hay un token guardado: si responde `401`, la sesión no vale; si responde `200`, ya tienes el usuario y su rol. **No decodifiques el JWT en el cliente.**
5. El registro (`POST /api/auth/register`) **ya devuelve la sesión iniciada**: `{ message, token, user }`. No hace falta un login extra.

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
POST /api/auth/register   { "name", "email", "password", "role"?: "paciente"|"psicologo", "studies"?: ["…"] }
→ 201 { "message": "Usuario registrado correctamente", "token": "…", "user": { "_id", "name", "email", "role", … } }
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
→ 200 { "total": 3, "page": 1, "limit": 20,
        "psychologists": [ { "_id", "name", "studies": [], "description" } ] }
   (limit máx. 50; solo psicólogos activos; orden por nombre; sin email)

GET /api/schedule/:psychologistId?available=true&from=2026-12-01&to=2026-12-31
→ 200 [ { "_id", "psychologist", "day": "2026-12-15T00:00:00.000Z", "hour": "10:00",
          "isAvailable": true, "recurrent": false, "createdAt" } ]
   (ordenadas por día y hora; available=true = libres y futuras)

POST /api/appointments/appointment   { "scheduleId" }
→ 201 { "message": "Cita agendada correctamente", "appointment": { "_id", "patientId", "psychologistId",
        "scheduleId", "state": "pendiente", "time", "hour", "reminderSent": false } }
→ 400 franja pasada · 404 franja no existe · 409 ocupada, o ya tienes otra cita a esa hora
```

Solo se envía `scheduleId`: el paciente sale del token y el psicólogo, de la franja. **Ante un 409, vuelve a pedir las franjas**: alguien reservó antes.

### Mis citas

```http
GET /api/appointments/appointment
→ 200 [ { "_id", "state", "time", "hour", "scheduleId": { …franja completa… },
          "psychologistId": { "_id", "name", "studies", "description" }   ← si eres paciente
          "patientId":      { "_id", "name", "email" }                    ← si eres psicólogo
        } ]   (ordenadas por fecha ascendente)
→ 403 si eres administrador
```

```http
PATCH /api/appointments/appointment/cancel/:id         → 200 { "message", "appointment" }
   400 si la cita no está pendiente (ya cancelada o completada) · 403 si no es tuya · 404

PATCH /api/appointments/appointment/update/:id  { "state": "completada" }   (solo el psicólogo de la cita)
   400 si aún no ha ocurrido, o no está pendiente · 403 si no eres su psicólogo
```

Estados de una cita: `pendiente` → `cancelada` (cancelar) o `completada` (psicólogo, después de la hora). No hay más transiciones. Una franja cancelada vuelve a estar libre y se puede volver a reservar.

### Psicólogo: agenda

```http
POST   /api/schedule        { "day": "2026-12-15", "hour": "10:00" }       → 201 { "message", "schedule" }
PUT    /api/schedule/:id    { "day"?: "…", "hour"?: "…" }                   → 200 { "message", "schedule" }
DELETE /api/schedule/:id                                                    → 200 { "message" }
GET    /api/schedule/:miId  (sin filtros = todas, incluidas ocupadas y pasadas)
```

- `day` debe ser **posterior a ahora** (a medianoche UTC): no se puede crear una franja para el día de hoy.
- `hour` con formato `HH:mm` (24 h).
- `409` al crear/mover si ya existe una franja igual, y **al editar/borrar una franja con cita reservada** (el psicólogo debe cancelar antes la cita).
- Un psicólogo no puede crear franjas para otro (403); un administrador sí, indicando `"psychologist": "<id>"`.

### Perfil

```http
GET /api/users/:id
→ tu propio id (o cualquiera si eres admin): perfil completo sin contraseña
→ id de un psicólogo: solo { _id, name, role, studies, description }
→ otro caso: 404

PUT /api/users/:id   (solo tú mismo o un admin)
   puedes cambiar: name, description, studies (lista de textos), password
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

## 6. Fechas y zonas horarias ⚠️

El backend trabaja **todo en UTC** y, por ahora, no conoce la zona horaria del usuario:

- `day` es una fecha a medianoche UTC (`"2026-12-15T00:00:00.000Z"`).
- `hour` (`"10:00"`) se interpreta como **hora UTC**. La cita real empieza en `day + hour` UTC; el campo `time` de la cita ya trae ese instante calculado.
- Para **mostrar** en hora local: `new Date(appointment.time)` y `toLocaleString(...)` (usa `time`, no `day` + `hour` sueltos).
- Para **crear** una franja a las 10:00 locales hay que convertir a UTC antes de enviar `hour` (y cuidado si al convertir cambia el día).
- Mientras no se decida otra cosa, una opción segura es mostrar y pedir las horas **etiquetadas como UTC**.

Es una decisión pendiente de producto (ver §9) que afecta tanto al backend como al frontend.

## 7. Detalles que conviene saber

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

- [ ] **Decisión de zonas horarias** (campo `timezone` por usuario o convertir en el servidor) — §6.
- [ ] Paginación en “mis citas”.
- [ ] Documentación OpenAPI/Swagger generada (así el frontend puede generar sus tipos automáticamente).

### Frontend (todo)

- [ ] Elegir stack (sugerencia: Vite + React + TypeScript; el CORS por defecto ya apunta al puerto de Vite `5173`).
- [ ] Cliente HTTP con cabecera `Authorization`, manejo global de `401` (→ login) y de `429` (`Retry-After`).
- [ ] Pantallas de §4, empezando por registro/login → listado de psicólogos → reserva → mis citas.
- [ ] Ruta `/reset-password` que lea `token` de la URL.
- [ ] Decidir cómo mostrar fechas y horas (§6).
- [ ] Tests (por ejemplo, Vitest + Testing Library) y un job de CI para el frontend en `.github/workflows/`.
