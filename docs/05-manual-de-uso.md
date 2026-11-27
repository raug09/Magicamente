# 05 · Manual de uso

## Requisitos

- Node.js 18 o superior (probado con 22) y npm.
- MongoDB 6+ local, en Docker (`docker run -d -p 27017:27017 mongo:7`) o en MongoDB Atlas.
- Opcional: una cuenta de [Resend](https://resend.com) con el dominio remitente verificado. Sin ella todo funciona, pero los correos no se envían: aparecen como aviso en la consola.

## Instalación

```bash
git clone https://github.com/raug09/Magicamente.git
cd Magicamente/Backend
npm install
cp .env.example .env
```

Edita `Backend/.env`:

| Variable | Obligatoria | Por defecto | Para qué |
|---|---|---|---|
| `JWT_SECRET` | **sí** | — (el servidor no arranca sin ella) | Firma de tokens. Usa una cadena larga y aleatoria, p. ej. `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `MONGO_URI` | recomendable | `mongodb://localhost:27017/magicamente` | Conexión a MongoDB |
| `PORT` | no | `3000` | Puerto HTTP |
| `RESEND_API_KEY` | para enviar correos | — | Envío de correo |
| `EMAIL_FROM` | no | `Soporte <support@magicamente.online>` | Remitente |
| `APP_TIMEZONE` | no | `UTC` | Zona horaria de las fechas en los correos |

## Ejecución

```bash
npm run dev                  # desarrollo con recarga automática
npm run build && npm start   # producción (compila a dist/)
```

Deberías ver `Conectado a MongoDB` y `Servidor escuchando en el puerto 3000`. Si tenías datos de una versión anterior, el arranque también los migra (citas `cancelled` → `cancelada` y el índice de franjas); verás `[migración] ...` en el log si cambió algo. Si falta `JWT_SECRET`, el proceso termina con `Faltan variables de entorno obligatorias: JWT_SECRET`.

## Tests

```bash
npm test             # tests de integración
npm run typecheck    # tipos de src/ y tests/
```

Los tests arrancan una MongoDB en memoria: **no necesitan** tu base de datos ni tu `.env`. La primera vez descargan el binario de MongoDB (~100 MB) desde `fastdl.mongodb.org`, así que hace falta conexión a internet. GitHub Actions los ejecuta en cada push (`.github/workflows/backend.yml`).

## Recorrido completo con `curl`

Usa una fecha futura en `day`.

```bash
API=http://localhost:3000
json() { node -pe "JSON.parse(require('fs').readFileSync(0)).$1"; }

# 1. Registrar un psicólogo y un paciente
curl -s -X POST $API/api/auth/register -H 'Content-Type: application/json' \
  -d '{"name":"Dra. Ana","email":"ana@example.com","password":"secreto123","role":"psicologo","studies":["Clínica"]}'
curl -s -X POST $API/api/auth/register -H 'Content-Type: application/json' \
  -d '{"name":"Luis","email":"luis@example.com","password":"secreto123"}'

# 2. Login de cada uno
PSI_TOKEN=$(curl -s -X POST $API/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"ana@example.com","password":"secreto123"}' | json token)
PAC_TOKEN=$(curl -s -X POST $API/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"luis@example.com","password":"secreto123"}' | json token)

# 3. El id del psicólogo (en la práctica, el paciente lo obtiene del listado del paso 5)
PSI_ID=$(node -pe "JSON.parse(Buffer.from('$PSI_TOKEN'.split('.')[1],'base64url')).id")

# 4. El psicólogo publica una franja (siempre para sí mismo)
SCHEDULE_ID=$(curl -s -X POST $API/api/schedule -H "Authorization: Bearer $PSI_TOKEN" -H 'Content-Type: application/json' \
  -d '{"day":"2026-12-15","hour":"10:00"}' | json schedule._id)

# 5. El paciente busca psicólogos, y mira las franjas del elegido
curl -s "$API/api/psychologists?q=ana" -H "Authorization: Bearer $PAC_TOKEN"
curl -s $API/api/schedule/$PSI_ID -H "Authorization: Bearer $PAC_TOKEN"

# 6. Reservar: solo hace falta el scheduleId
APPOINTMENT_ID=$(curl -s -X POST $API/api/appointments/appointment -H "Authorization: Bearer $PAC_TOKEN" \
  -H 'Content-Type: application/json' -d "{\"scheduleId\":\"$SCHEDULE_ID\"}" | json appointment._id)

# 7. Mis citas (paciente o psicólogo)
curl -s $API/api/appointments/appointment -H "Authorization: Bearer $PAC_TOKEN"

# 8. Cancelar (paciente o psicólogo de la cita); la franja queda libre para reservarse de nuevo
curl -s -X PATCH $API/api/appointments/appointment/cancel/$APPOINTMENT_ID -H "Authorization: Bearer $PAC_TOKEN"

# 9. Tras la sesión, el psicólogo la marca como completada
curl -s -X PATCH $API/api/appointments/appointment/update/$APPOINTMENT_ID -H "Authorization: Bearer $PSI_TOKEN" \
  -H 'Content-Type: application/json' -d '{"state":"completada"}'
```

## Crear el primer administrador

El registro público ya no permite el rol `administrador`. Regístrate como paciente y promuévete a mano en la base de datos:

```js
// mongosh
use magicamente
db.users.updateOne({ email: "admin@example.com" }, { $set: { role: "administrador" } })
```

Vuelve a hacer login para obtener un token con el rol nuevo. A partir de ahí, ese administrador puede cambiar roles con `PUT /api/users/:id`.

## Correos

- **Confirmación** al registrarse.
- **Recordatorio**: una vez por cita, unas 24 h antes. El cron se ejecuta al minuto 0 de cada hora.

Sin `RESEND_API_KEY` verás en consola `[email] RESEND_API_KEY no definido; no se envía ...`. Si Resend rechaza un envío, revisa la API key y que el dominio de `EMAIL_FROM` esté verificado en tu cuenta.

## Solución de problemas

| Síntoma | Causa probable |
|---|---|
| `Faltan variables de entorno obligatorias: JWT_SECRET` | Falta `Backend/.env` o la variable |
| `No se pudo iniciar el servidor: ... ECONNREFUSED` | `MONGO_URI` incorrecta o Mongo no está arrancado |
| `401 Token no válido` | El token caducó (1 h) o `JWT_SECRET` cambió desde que se emitió |
| `403` al editar un usuario | Solo puedes editar tu cuenta, y solo `name`, `description`, `studies`, `password` |
| `403` al crear un horario | Solo los psicólogos (para sí mismos) o los administradores |
| `409` al reservar | La franja ya está ocupada, o ya tienes otra cita a esa hora |
| `400` al cancelar | La cita ya no está `pendiente` (ya cancelada o completada) |
| `npm test` se queda descargando o falla con `fastdl.mongodb.org` | Sin acceso a internet o host bloqueado por la red |
