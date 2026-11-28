# 09 · Despliegue (pruebas, sin coste previsto)

Guía para publicar Magicamente con servicios gratuitos y poder enseñarlo y probarlo desde el celular. **No es una configuración para pacientes reales** (ver «Límites» al final).

> **Qué está verificado y qué no.** Los límites de cada servicio salen de su documentación publicada y de búsquedas web, no de cuentas creadas por nosotros. Los nombres exactos de los botones y menús de cada panel pueden haber cambiado: guíate por lo que veas en pantalla. **Comprueba al registrarte si algún servicio pide tarjeta**; no lo hemos podido confirmar.

## Qué va dónde

| Pieza | Servicio | Coste previsto |
|---|---|---|
| Frontend (`Frontend/`) | Cloudflare (Workers, sitio estático) | Gratis |
| Backend (`Backend/`, imagen Docker) | Render, plan gratuito | Gratis; **se duerme tras 15 min sin tráfico** y tarda ~1 min en despertar |
| Base de datos | MongoDB Atlas, clúster M0 (512 MB) | Gratis |
| Documentos de verificación | Cloudflare R2 (ya creado) | Gratis dentro del nivel gratuito |
| Correos | Resend (ya configurado) | Según tu plan de Resend |

El orden importa, porque cada pieza necesita la dirección de la anterior: **1) base de datos → 2) backend → 3) frontend → 4) volver al backend a poner la dirección del frontend.**

## 1. Base de datos (MongoDB Atlas)

1. Crea una cuenta en MongoDB Atlas y un clúster **M0 (Free)**. Elige una región cercana al backend (p. ej. AWS Virginia si el backend va en Virginia). **Si ya tienes un clúster, reutilízalo** (el plan gratuito solo permite uno por proyecto) pero con una **base de datos nueva**: así no se tocan datos antiguos, porque el backend migra en el sitio cualquier dato viejo que encuentre al arrancar.
2. **Database Access:** crea un usuario de base de datos con una contraseña larga y aleatoria. Usa solo letras y números (si lleva símbolos hay que codificarlos en la dirección de conexión).
3. **Network Access:** el plan gratuito de Render no tiene IP fija, así que hay que permitir `0.0.0.0/0` (cualquier IP). Es el motivo por el que la contraseña del paso 2 debe ser fuerte.
4. **Connect → Drivers:** copia la dirección de conexión (`mongodb+srv://…`). Añade el nombre de la base antes del `?`, y si reutilizas un clúster, **usa un nombre distinto al de la base antigua**: `…mongodb.net/magicamente_pruebas?…`. MongoDB la crea sola al guardar el primer dato. Esa dirección es tu `MONGO_URI`. **Es un secreto: no la pegues en el chat ni en el repositorio.**

## 2. Backend (Render)

1. En Render: **New → Web Service**, conecta el repositorio `raug09/Magicamente`.
2. Rama: la que quieras desplegar. Mientras el trabajo siga en `ccr-5a742e1c-qu0a4h`, elige esa; cuando se fusione a la principal, cámbiala.
3. Configuración:
   - **Language / Runtime:** Docker.
   - **Root Directory:** `Backend` (ahí están el `Dockerfile` y el código).
   - **Instance Type:** Free.
   - **Health Check Path:** `/health`.
4. **Variables de entorno** (en «Environment»). Todas son secretas o de configuración: pégalas solo en el panel.

| Variable | Valor |
|---|---|
| `JWT_SECRET` | Cadena larga y aleatoria: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `MONGO_URI` | La dirección de Atlas del paso 1 |
| `TRUST_PROXY` | `1` (Render pone un proxy delante; sin esto el límite de intentos bloquearía a todos a la vez) |
| `APP_TIMEZONE` | `America/Bogota` |
| `RESEND_API_KEY` | Tu clave de Resend |
| `EMAIL_FROM` | El remitente, p. ej. `Soporte <support@magicamente.online>` |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Los mismos que usaste en GitHub para la prueba de R2 |
| `FRONTEND_URL` y `CORS_ORIGIN` | **Déjalas para el paso 4**, cuando exista la dirección del frontend |

   `PORT` lo lee el backend de la variable de entorno; si Render te pide un puerto, usa el que te indique.
   La documentación Swagger (`/api/docs`) queda **desactivada** en producción por defecto.
5. Despliega. Cuando termine, abre `https://<tu-servicio>.onrender.com/health`. Debe responder `{"status":"ok","db":"up"}`. La primera vez puede tardar hasta un minuto.

## 3. Frontend (Cloudflare)

Cloudflare publica ahora los sitios estáticos con su flujo de **Workers** (importar un repositorio). La configuración está en `Frontend/wrangler.jsonc`: carpeta de salida `dist` y modo «aplicación de una sola página», para que `/citas` o `/psicologos/…` no den 404 al recargar.

1. En Cloudflare: **Workers & Pages → Create → Import a repository** (o «Conectar con Git»), elige `raug09/Magicamente`.
2. **Nombre del proyecto:** `magicamente`. Tiene que ser **igual** al `name` de `Frontend/wrangler.jsonc`; si lo cambias, cambia también ese archivo.
3. **Comando de compilación:** `npm run build`. **Implementar comando:** déjalo en `npx wrangler deploy`.
4. Abre **Configuración avanzada** y rellena:
   - **Directorio raíz:** `Frontend`
   - **Rama de producción:** la rama que despliegas (mientras el trabajo siga sin fusionarse, `ccr-5a742e1c-qu0a4h`; la principal aún no tiene el frontend).
   - **Variables de compilación** (no las «de ejecución»): `VITE_API_URL` = `https://<tu-servicio>.onrender.com`, sin `/` al final. Vite la incrusta al compilar, así que si la cambias hay que volver a desplegar.
5. Pulsa **Implementar**. Obtendrás una dirección `https://magicamente.<tu-subdominio>.workers.dev`.

El formulario de creación no deja elegir la rama (Cloudflare usa la principal y la primera compilación falla con «root directory not found»). Se cambia después en **Configuración → Compilaciones → Rama de producción**. Cambiarla **no lanza** una compilación nueva: hay que reintentar desde **Implementaciones** o subir un cambio a esa rama.

## 4. Conectar frontend y backend

En Render, añade o corrige y vuelve a desplegar:

| Variable | Valor |
|---|---|
| `FRONTEND_URL` | la dirección de Cloudflare (`https://magicamente.….workers.dev`) (sin `/` final). Los correos enlazan a esta dirección. |
| `CORS_ORIGIN` | La misma dirección. Si no coincide **exactamente**, el navegador bloqueará las peticiones. |

## 5. Primer administrador

El registro público no permite crear administradores. Regístrate desde la web, confirma el correo y, en Atlas (**Browse Collections → `magicamente` → `users`**), edita tu usuario y cambia `role` a `administrador`. Vuelve a iniciar sesión. Más detalle en el [manual](05-manual-de-uso.md#crear-el-primer-administrador).

## Comprobación final

- [ ] `https://<api>/health` responde `ok` y `db: up`.
- [ ] La web carga y puedes registrarte; llega el correo y su enlace abre `/verify-email` en la web.
- [ ] Puedes entrar, ver el listado de psicólogos y recargar `/citas` sin error 404.
- [ ] En el navegador no aparecen errores de CORS (consola, pestaña Red).

## Límites de esta configuración

- **El backend duerme.** La primera visita tras un rato tarda ~1 minuto, y las **tareas programadas** (recordatorios de citas cada hora y limpieza nocturna de documentos rechazados) **no se ejecutan mientras duerme**. Para pacientes reales hace falta un backend siempre activo (en Render, un plan de pago; ver su página de precios).
- **Atlas M0** puede pausar clústeres inactivos y limita las operaciones por segundo. Es suficiente para pruebas.
- **`0.0.0.0/0` en Atlas** expone el puerto de la base de datos a internet; solo la protege la contraseña. Con un backend de pago e IP fija se debe restringir.
- **Copias de seguridad:** el plan gratuito no garantiza respaldos útiles. No guardes datos reales de pacientes aquí.
