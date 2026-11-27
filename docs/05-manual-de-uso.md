# 05 · Manual de uso

## Requisitos

- Node.js 18 o superior (probado con 22) y npm.
- MongoDB 6+ local, en Docker (`docker run -d -p 27017:27017 mongo:7`) o en MongoDB Atlas.
- Una cuenta de [Resend](https://resend.com) con el dominio remitente verificado (opcional: sin ella todo funciona salvo los correos, que fallan en el log).

## Instalación

```bash
git clone https://github.com/raug09/Magicamente.git
cd Magicamente
npm install            # raíz: bcryptjs y jsonwebtoken (las necesita el backend)
cd Backend
npm install
cp .env.example .env
```

Edita `Backend/.env`:

| Variable | Obligatoria | Defecto en el código | Para qué |
|---|---|---|---|
| `PORT` | no | `3000` | Puerto HTTP |
| `MONGO_URI` | sí | `mongodb://localhost:27017/tu_base_de_datos` | Conexión a MongoDB |
| `JWT_SECRET` | **sí** | `'secret'` (inseguro) | Firma de tokens |
| `RESEND_API_KEY` | para correos | — | Envío de correo |

## Ejecución

```bash
npm run dev      # desarrollo, recarga automática
```

Deberías ver `Servidor escuchando en el puerto 3000` y `Conectado a MongoDB`. Además, cada minuto aparecerá `Ejecutando tarea de recordatorio de citas...` (es el cron).

**Producción:** `npm run build && npm start` **no funciona** todavía (falta `outDir` en `tsconfig.json`). Mientras no se arregle, añade `"outDir": "./dist", "rootDir": "./src"` a `compilerOptions` o ejecuta con `npx ts-node src/index.ts`.

## Recorrido completo con `curl`

Las variables de shell hacen el ejemplo copiable. Usa una fecha futura en `day`.

```bash
API=http://localhost:3000

# 1. Registrar un psicólogo y un paciente
curl -s -X POST $API/api/auth/register -H 'Content-Type: application/json' \
  -d '{"name":"Dra. Ana","email":"ana@example.com","password":"secreto123","role":"psicologo","studies":["Clínica"]}'

curl -s -X POST $API/api/auth/register -H 'Content-Type: application/json' \
  -d '{"name":"Luis","email":"luis@example.com","password":"secreto123"}'

# 2. Login de cada uno
PSI_TOKEN=$(curl -s -X POST $API/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"ana@example.com","password":"secreto123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
PAC_TOKEN=$(curl -s -X POST $API/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"luis@example.com","password":"secreto123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

# 3. Sacar los ids del JWT (payload)
jwt_id() { node -pe "JSON.parse(Buffer.from('$1'.split('.')[1],'base64url')).id"; }
PSI_ID=$(jwt_id $PSI_TOKEN); PAC_ID=$(jwt_id $PAC_TOKEN)

# 4. El psicólogo publica una franja
curl -s -X POST $API/api/schedule -H "Authorization: Bearer $PSI_TOKEN" -H 'Content-Type: application/json' \
  -d "{\"psychologist\":\"$PSI_ID\",\"day\":\"2026-12-15\",\"hour\":\"10:00\"}"

# 5. El paciente consulta las franjas del psicólogo y elige una
curl -s $API/api/schedule/$PSI_ID -H "Authorization: Bearer $PAC_TOKEN"
SCHEDULE_ID=...   # copia el _id de una franja con isAvailable: true

# 6. Reservar (revisa que la respuesta no contenga appointment.error)
curl -s -X POST $API/api/appointments/appointment -H "Authorization: Bearer $PAC_TOKEN" -H 'Content-Type: application/json' \
  -d "{\"patientId\":\"$PAC_ID\",\"psychologistId\":\"$PSI_ID\",\"scheduleId\":\"$SCHEDULE_ID\"}"
APPOINTMENT_ID=...

# 7. Cancelar
curl -s -X PATCH $API/api/appointments/appointment/cancel/$APPOINTMENT_ID -H "Authorization: Bearer $PAC_TOKEN"
```

`GET /api/appointments/appointment` (“mis citas”) devuelve siempre 403 por un fallo conocido. Mientras tanto, consulta la colección `appointments` directamente en MongoDB.

## Crear el primer administrador

Hoy basta con registrarse con `"role":"administrador"` (es un agujero de seguridad que hay que cerrar). Cuando se cierre, la forma recomendada será promoverlo a mano:

```js
// mongosh
use magicamente
db.users.updateOne({ email: "admin@example.com" }, { $set: { role: "administrador" } })
```

## Probar los correos

```bash
curl -s -X POST $API/api/email/send-test -H 'Content-Type: application/json' \
  -d '{"email":"tu-correo@example.com","nombre":"Prueba"}'
```

Si Resend rechaza el envío, revisa la API key y que `magicamente.online` esté verificado en tu cuenta.

## Solución de problemas

| Síntoma | Causa probable |
|---|---|
| `Cannot find module 'jsonwebtoken'` / `'bcryptjs'` | Falta `npm install` en la **raíz** del repo |
| `Error al conectar a MongoDB` y el proceso termina | `MONGO_URI` incorrecta o Mongo no está arrancado |
| `Token no válido` | El token caducó (1 h) o `JWT_SECRET` cambió desde que se emitió |
| `Cannot set headers after they are sent` en el log | Fallo conocido en respuestas 404/401/403 (falta `return`) |
| `E11000 duplicate key ... scheduleId` | Esa franja ya se usó en una cita (aunque esté cancelada) |
| Correos de recordatorio repetidos cada minuto | Fallo conocido del cron |
| `npm start` → `Cannot find module dist/index.js` | Falta `outDir` en `tsconfig.json` |
