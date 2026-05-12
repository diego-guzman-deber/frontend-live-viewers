# ──────────────────────────────────────────────────────────────────────────────
# Stage 1: Build
# ──────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Instalar dependencias con lockfile exacto
COPY package.json package-lock.json ./
RUN npm ci

# Copiar fuente y compilar
COPY . .
RUN npm run build

# ──────────────────────────────────────────────────────────────────────────────
# Stage 2: Serve con Nginx
# ──────────────────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# Limpiar contenido por defecto
RUN rm -rf /usr/share/nginx/html/*

# Copiar el build
COPY --from=builder /app/dist /usr/share/nginx/html

# Copiar config de nginx (SPA support)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Dokploy/Traefik enruta al puerto 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
