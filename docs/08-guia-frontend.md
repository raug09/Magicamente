# 08 · Guía para el frontend

Documento pensado para quien construya el frontend (persona o sesión de Claude) **sin haber visto el backend**. Contiene el contrato de la API, los flujos de pantalla, los casos límite y lo que falta. La referencia completa de endpoints está en [03 · API](03-api.md); aquí está lo que el frontend necesita para usarla bien.

## Estado del frontend

El frontend vive en **`Frontend/`** (este mismo repositorio, un solo CI). Hoy existe el **MVP del paciente**:

- Registro, confirmación de email, login y cierre de sesión.
- Listado de psicólogos con búsqueda y paginación.
- Horarios libres de un psicólogo, agrupados por día y en la zona horaria del usuario, y reserva de una cita.
- Mis citas (paginadas) con cancelación.

Todavía **no** están: recuperar contraseña, cambiar email, sesiones abiertas, perfil y zona horaria, la agenda del psicólogo, la verificación con subida de documentos y el panel de administración. Son las siguientes fases (ver §9).

### Decisiones tomadas

| Tema | Decisión |
|---|---|
| Stack | Vite + React + TypeScript |
| Componentes | Mantine 9 |
| Rutas | React Router 7 |
| Peticiones | TanStack Query (caché y estados de carga) + un único cliente HTTP en `src/api/client.ts` |
| Token | `sessionStorage`: se borra al cerrar la pestaña |
| Tipos de la API | Generados desde `docs/openapi.json` (`npm run api:types`); el CI falla si quedan desactualizados |
| Textos | Español; código e identificadores en inglés |
| Publicación | Cloudflare Pages |

### Estructura

```
Frontend/src/
  api/         cliente HTTP, tipos generados (schema.d.ts) y atajos (types.ts)
  auth/        sesión (sessionStorage), proveedor de usuario y rutas protegidas
  components/  Layout, ErrorAlert
  features/    una carpeta por área: auth, psychologists, appointments
  lib/         fechas y zonas horarias (format.ts)
  test/        configuración de pruebas
```

### Cómo ejecutarlo

```bash
cd Backend && npm run dev        # API en http://localhost:3000
cd Frontend && npm install && npm run dev   # http://localhost:5173
```

En desarrollo, Vite reenvía `/api` al backend, así que **no hace falta CORS**. El backend solo se necesita configurar para producción (ver abajo).

### Publicar en Cloudflare Pages

- Carpeta raíz: `Frontend` · comando de compilación: `npm run build` · carpeta de salida: `dist`.
- Variable de compilación: `VITE_API_URL=https://<tu-api>` (la dirección pública del backend).
- En el backend, `CORS_ORIGIN` debe incluir la dirección de Pages (p. ej. `https://magicamente.pages.dev`), o el navegador bloqueará las peticiones.
- Las rutas de la app (`/citas`, `/psicologos/...`) necesitan que Pages sirva `index.html` para cualquier ruta. Vite lo gestiona en producción; si al recargar sale un 404, añade un archivo `_redirects` con `/* /index.html 200` en `Frontend/public/`.

### Pruebas

- `npm test`: pruebas unitarias (cliente HTTP, fechas y zonas horarias).
- **Extremo a extremo** (`npm run e2e`, carpeta `Frontend/e2e/`): Playwright contra el backend real y MongoDB. En el CI lo hace el job `e2e` de `.github/workflows/frontend.yml`, que siembra los datos con `Backend/scripts/e2e-seed.ts`. Cubre: sin sesión → login, contraseña incorrecta, registro, buscar → reservar → cancelar y salir.
- Para ejecutarlo en local: MongoDB en marcha, `Backend` arrancado con `.env` y `npx ts-node --transpile-only scripts/e2e-seed.ts`, y luego `npm run e2e` en `Frontend/`.

## 1. Datos de conexión

| Cosa | Valor |
|---|---|
| Base | `http://localhost:3000` en desarrollo. Todas las rutas empiezan por `/api` |
| Formato | JSON en ambos sentidos (`Content-Type: application/json`) |
| CORS | El backend **solo** acepta el origen configurado en `FRONTEND_URL` (por defecto `http://localhost:5173`, el puerto de Vite) o en `CORS_ORIGIN`. Si el frontend corre en otra dirección, hay que cambiar esa variable en `Backend/.env` |
| Documentación interactiva | `http://localhost:3000/api/docs` (Swagger UI: prueba cada ruta con el botón **Authorize** y tu token). El esquema OpenAPI está en `/api/docs/openapi.json` y, versionado, en [`docs/openapi.json`](openapi.json) |
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

### Verificación del psicólogo y subida de documentos

`verificationStatus` en `GET /api/auth/me`:

| Estado | Qué ve el psicólogo | Qué puede hacer |
|---|---|---|
| `pendiente` | “Tu cuenta está pendiente de aprobación” | Iniciar sesión, subir documentos. No publica franjas ni aparece en el listado |
| `rechazado` | El `verificationMessage` y sus documentos | Corregir y volver a subir los señalados |
| `aprobado` | — | Todo. Ya **no puede cambiar** sus documentos (409) |

`verificationDocuments` lista los tres documentos (`tarjeta_profesional`, `cedula`, `diploma`) con su `status` (`pendiente`, `ok` o `rechazado`), su `note` y, si ya lo subió, `file: { contentType, size, uploadedAt }`. **Resalta los rechazados** y muestra la nota. Los psicólogos aprobados se ven por `approved: true`.

**Subir un documento** — `PUT /api/verification/documents/:key`, `multipart/form-data`, archivo en el campo `file`:

```ts
const form = new FormData();
form.append('file', fileInput.files[0]);          // PDF, JPG o PNG, máx. 5 MB
await fetch(`${API}/api/verification/documents/cedula`, {
  method: 'PUT',
  headers: { Authorization: `Bearer ${token}` },   // NO pongas Content-Type: el navegador lo añade con el boundary
  body: form,
});
```

- Valida en el formulario el tipo y el tamaño (5 MB) para avisar antes de subir; el servidor los vuelve a comprobar y responde `400` (formato) o `413` (tamaño).
- Corregir un documento de una solicitud rechazada la devuelve a `pendiente` automáticamente.
- **Ver un documento ya subido:** `GET /api/verification/documents/:key/url` devuelve `{ url, expiresInSeconds }`. Abre esa URL enseguida (caduca a los 5 minutos); no la guardes ni la compartas.
- **Administrador:** `GET /api/users/:id/verification/documents/:key/url` abre el de cualquier psicólogo. Después decide con `PUT /api/users/:id/verification`.
- Si el servidor responde `503` al subir, el almacenamiento no está configurado: muestra un aviso de “servicio no disponible”.
- **Retención:** si la solicitud sigue rechazada 30 días sin corregirla, los archivos se borran y el psicólogo debe subirlos otra vez. Muéstralo si ves documentos rechazados sin `file`.

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
- Las listas (psicólogos, franjas, mis citas) vienen paginadas: `{ total, page, limit, pages, items }`, máximo 50 por página.

## 8. Cómo desarrollar el frontend contra el backend

```bash
cd Backend && cp .env.example .env     # JWT_SECRET y MONGO_URI como mínimo
npm install && npm run dev             # http://localhost:3000
```

- Pon en `Backend/.env`: `FRONTEND_URL=http://localhost:5173` (o la dirección real de tu frontend) para el CORS y para el enlace del correo de recuperación.
- Sin `RESEND_API_KEY` los correos **no se envían** y el token de recuperación no aparece en ningún lado: para probar el flujo de recuperación completo necesitas una clave de Resend (o consultar el token directamente en la base de datos).
- Datos de prueba: ver el recorrido con `curl` del [manual](05-manual-de-uso.md#recorrido-completo-con-curl).
- **Tipos de TypeScript generados**: `npx openapi-typescript ../docs/openapi.json -o src/api/schema.d.ts` (desde `Frontend/`) crea los tipos de todas las peticiones y respuestas. Vuelve a generarlos cuando cambie `docs/openapi.json`.
- Los límites de intentos (`429`) pueden molestar en desarrollo: son por IP y se reinician al reiniciar el backend.

## 9. Pendientes

### Backend que facilitaría el frontend (por orden de utilidad)

- [x] Paginación en “mis citas”.
- [x] Documentación OpenAPI/Swagger generada: `docs/openapi.json` y `/api/docs` (ver §8 para generar los tipos).

### Frontend

- [x] Stack elegido (Vite + React + TypeScript, Mantine, React Router, TanStack Query).
- [x] Cliente HTTP con `Authorization`, `401` → cierra sesión, `429` con `Retry-After`.
- [x] MVP del paciente: registro, confirmación de email, login, listado, reserva y mis citas.
- [x] Mostrar fechas con `startsAt`/`time` y `Intl.DateTimeFormat` en la zona del usuario (§6).
- [x] Pruebas unitarias y job de CI (`.github/workflows/frontend.yml`), que además comprueba que los tipos de la API no se han quedado viejos.
- [ ] Fase 2: recuperar contraseña (`/reset-password` lee `token` de la URL), cambiar email, sesiones abiertas.
- [ ] Fase 3: perfil con selector de zona horaria; agenda del psicólogo (crear, repetir, mover, borrar).
- [ ] Fase 4: verificación del psicólogo (estado, motivo de rechazo, subida de documentos).
- [ ] Fase 5: panel de administrador (usuarios, revisión de documentos).
- [x] Pruebas de extremo a extremo con Playwright contra el backend real (job `e2e` en CI).
