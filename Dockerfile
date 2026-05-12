# ──────────────────────────────────────────────────────────────────────────────
# Stage 1: Build
# ──────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Copy dependency manifests first (layer cache optimization)
COPY package.json package-lock.json ./

# Install all dependencies (including devDeps needed for build)
RUN npm ci

# Copy source code
COPY . .

# Build the production bundle
RUN npm run build

# ──────────────────────────────────────────────────────────────────────────────
# Stage 2: Serve with Nginx
# ──────────────────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx config for SPA routing support
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
