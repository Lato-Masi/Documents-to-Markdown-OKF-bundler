# ==============================================================================
# Multi-Stage Dockerfile for OKF Knowledge Engineering & Graph RAG Studio
# Base Image: Node.js 22 LTS on Alpine Linux (Lightweight & Secure)
# ==============================================================================

# --- Stage 1: Build Stage ---
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache libc6-compat

# Copy package manifests for deterministic caching
COPY package.json package-lock.json* ./

# Install all dependencies (including devDependencies required for compilation)
RUN npm ci || npm install

# Copy source code and configuration files
COPY . .

# Build Vite frontend assets and bundle backend server into dist/server.cjs
RUN npm run build

# --- Stage 2: Production Runtime Stage ---
FROM node:22-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Install runtime dependencies only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts || npm install --omit=dev --ignore-scripts

# Copy compiled frontend and bundled server from builder stage
COPY --from=builder /app/dist ./dist

# Create non-root user for security compliance
USER node

# Expose default HTTP port
EXPOSE 3000

# Container Healthcheck against Express /api/health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

# Start the bundled Express + Vite production server
CMD ["node", "dist/server.cjs"]
