# syntax=docker/dockerfile:1

# ---- Compilación: instala todo y genera dist/ ------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Imagen final: solo dependencias de producción y el código compilado ---------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

# No se ejecuta como root
USER node
EXPOSE 3000

# 200 si la API y la base de datos responden (GET /health)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# `node` directamente (no `npm start`) para que las señales de Docker lleguen al servidor y se apague ordenadamente
CMD ["node", "dist/index.js"]
