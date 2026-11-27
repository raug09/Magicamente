[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/raug09/Magicamente)

# Magicamente — Backend

API REST para una plataforma de **citas con psicólogos**: los psicólogos publican franjas horarias, los pacientes reservan citas y el sistema envía correos (confirmación de registro y recordatorio el día antes de la cita).

> **Estado:** prototipo funcional en desarrollo (2 commits). El backend compila, pero tiene varios fallos y agujeros de seguridad que hay que corregir antes de usarlo en producción. Véase [Problemas conocidos](docs/06-problemas-conocidos.md).
> El repositorio **no incluye frontend**.

## Stack

| Pieza | Tecnología |
|---|---|
| Lenguaje | TypeScript 5.7 (CommonJS, `strict`) sobre Node.js ≥ 18 (probado con 22) |
| Servidor HTTP | Express 4.21 |
| Base de datos | MongoDB vía Mongoose 8.9 |
| Autenticación | JWT (`jsonwebtoken`) + contraseñas con `bcryptjs` |
| Correo | [Resend](https://resend.com) |
| Tareas programadas | `node-cron` |

## Arranque rápido

```bash
# 1. Dependencias: hacen falta en la RAÍZ y en Backend/ (ver nota)
npm install
cd Backend && npm install

# 2. Variables de entorno
cp .env.example .env    # y edita los valores

# 3. Desarrollo (recarga automática)
npm run dev             # http://localhost:3000
```

> **Nota:** `jsonwebtoken` y `bcryptjs` están declarados en el `package.json` de la raíz, no en el de `Backend/`. El backend los encuentra porque Node sube a buscar `../node_modules`. Si solo instalas en `Backend/`, el servidor falla al arrancar.

## Documentación

| Documento | Contenido |
|---|---|
| [01 · Arquitectura](docs/01-arquitectura.md) | Estructura de carpetas, capas, ciclo de una petición |
| [02 · Modelo de datos](docs/02-modelo-datos.md) | Colecciones `User`, `Schedule`, `Appointment` y sus relaciones |
| [03 · Referencia de la API](docs/03-api.md) | Todos los endpoints, cuerpos y respuestas |
| [04 · Flujos de negocio](docs/04-flujos.md) | Registro, login, horarios, reservas, recordatorios, correos |
| [05 · Manual de uso](docs/05-manual-de-uso.md) | Instalación, configuración y uso paso a paso con `curl` |
| [06 · Problemas conocidos](docs/06-problemas-conocidos.md) | Fallos, riesgos de seguridad y deuda técnica, por prioridad |
| [07 · Hoja de ruta](docs/07-hoja-de-ruta.md) | Plan propuesto para retomar el proyecto |
