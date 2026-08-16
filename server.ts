/**
 * @file server.ts
 * @description Full-stack Express application entrypoint.
 *
 * Mounts REST routes for multimodal document processing, NLP analysis, and MCP JSON-RPC endpoints.
 * Integrates Vite middleware in development mode and serves production static assets behind the reverse proxy on port 3000.
 */

import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import convertRouter from "./server/routes/convert";
import analysisRouter from "./server/routes/analysis";
import mcpRouter from "./server/routes/mcp";
import skillsRouter from "./server/routes/skills";

// Load environment variables from .env
dotenv.config();

/**
 * Initializes and starts the Express HTTP server.
 */
async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware: Allow high-resolution document and image payloads up to 50MB
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Register Core Subsystem REST Routes
  // 1. Multimodal OCR, spatial inspection, web scraping & RAG agent endpoints
  app.use("/api", convertRouter);
  // 2. Readability, sentiment, entity extraction & complexity analysis
  app.use("/api", analysisRouter);
  // 3. Model Context Protocol (MCP) JSON-RPC 2.0 tools & knowledge base sync
  app.use("/api", mcpRouter);
  // 4. Agent Skills procedural synthesis, validation & formal logic compiler
  app.use("/api", skillsRouter);

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  // Client Frontend Serving: Vite dev server in development vs. static assets in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Bind to 0.0.0.0:3000 for container reverse proxy routing
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Open Knowledge Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

