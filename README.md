[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/raug09/Magicamente)

# Magicamente — Backend

API REST para una plataforma de **citas con psicólogos**: los psicólogos publican franjas horarias, los pacientes reservan citas y el sistema envía correos (confirmación de registro y recordatorio el día antes de la cita).

> **Estado:** prototipo en desarrollo. Ya están corregidos los agujeros de seguridad conocidos (permisos, sesiones, límite de intentos, `helmet`, CORS), el recordatorio de citas y la recuperación de contraseña, y hay tests de integración con CI. El flujo de citas (reservar, ver, cancelar, completar) funciona de extremo a extremo. Los pacientes pueden buscar psicólogos, ver sus franjas y reservar. Véase [Problemas conocidos](docs/06-problemas-conocidos.md).
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
| Tests | Vitest + Supertest + `mongodb-memory-server` |

## Arranque rápido

```bash
cd Backend
npm install
cp .env.example .env    # rellena al menos JWT_SECRET y MONGO_URI
npm run dev             # http://localhost:3000
npm test                # tests de integración (descarga MongoDB la primera vez)
```

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
| [08 · Guía para el frontend](docs/08-guia-frontend.md) | Contrato de la API por pantalla, sesión, errores, zonas horarias y pendientes para construir el frontend |
| [09 · Despliegue](docs/09-despliegue.md) | Publicar con servicios gratuitos (Atlas, Render, Cloudflare Pages), variables de entorno y límites |
