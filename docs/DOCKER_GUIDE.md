# Docker Installation & Deployment Guide

> Step-by-step instructions for containerizing, building, and deploying the **OKF Knowledge Engineering & Graph RAG Studio** with Docker and Docker Compose.

---

## 📋 Prerequisites

Before starting, ensure you have installed:
- **Docker Engine** (version 20.10+ or Docker Desktop)
- **Docker Compose** (version 2.0+)

Verify your installation:
```bash
docker --version
docker compose version
```

---

## 🚀 Quick Start (Docker Compose)

The fastest way to spin up the containerized application is using `docker-compose.yml`:

### 1. Configure Environment Variables (Optional)
Create or edit your `.env` file in the project root:
```bash
cp .env.example .env
```

Add your API keys if you plan to use multimodal OCR or Gemini agents:
```env
GEMINI_API_KEY="your-api-key-here"
APP_URL="http://localhost:3000"
```

### 2. Build and Start the Container
```bash
docker compose up --build -d
```

### 3. Verify Service Status
```bash
docker compose ps
```

Once started, the health check will verify the `/api/health` endpoint. Open your browser and navigate to:
**`http://localhost:3000`**

### 4. Stop the Container
```bash
docker compose down
```

---

## 🛠️ Manual Docker Build & Run (Single Container)

If you prefer building and managing the container directly via Docker CLI:

### 1. Build the Docker Image
```bash
docker build -t okf-knowledge-studio:latest .
```

### 2. Run the Container
```bash
docker run -d \
  --name okf-studio \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e GEMINI_API_KEY="your-api-key-here" \
  -e APP_URL="http://localhost:3000" \
  --restart unless-stopped \
  okf-knowledge-studio:latest
```

### 3. View Real-Time Container Logs
```bash
docker logs -f okf-studio
```

### 4. Stop & Remove the Container
```bash
docker stop okf-studio
docker rm okf-studio
```

---

## 🏗️ Architecture of the Dockerfile

The included `Dockerfile` uses a **multi-stage build** designed for minimal image size, fast startup, and enterprise security:

1. **Stage 1 (`builder`)**:
   - Uses `node:22-alpine`
   - Installs all dependencies (including build tools like Vite, TypeScript, and esbuild)
   - Compiles client assets to `dist/`
   - Bundles the Express server into a standalone CommonJS file (`dist/server.cjs`)
2. **Stage 2 (`runner`)**:
   - Uses a clean `node:22-alpine` base
   - Installs only runtime production dependencies (`--omit=dev`)
   - Copies pre-compiled artifacts from `builder`
   - Runs under the unprivileged `node` non-root user for security
   - Configures an automatic HTTP `HEALTHCHECK` against `http://127.0.0.1:3000/api/health`

---

## 🔍 Useful Docker Commands & Diagnostics

### Inspect Container Health
```bash
docker inspect --format='{{json .State.Health}}' okf-knowledge-studio | jq
```

### Access Container Shell (Debugging)
```bash
docker exec -it okf-knowledge-studio /bin/sh
```

### Test the REST API Health Check Endpoint
```bash
curl http://localhost:3000/api/health
```
Expected response:
```json
{"status":"ok","uptime":12.34}
```

---

## 🌐 Production Reverse Proxy Setup (Nginx / Caddy)

If placing behind an external reverse proxy (e.g. Nginx or Cloud Load Balancer):

```nginx
server {
    listen 80;
    server_name okf.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
