/**
 * @file server.ts
 * @description Full-stack Express application entrypoint.
 *
 * Mounts REST routes for multimodal document processing, NLP analysis, Remote API v1, and MCP JSON-RPC endpoints.
 * Includes production security headers, request correlation IDs, global JSON error boundary middleware,
 * and graceful shutdown persistence hooks.
 */

import express, { Request, Response, NextFunction } from "express";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import convertRouter from "./server/routes/convert";
import analysisRouter from "./server/routes/analysis";
import mcpRouter from "./server/routes/mcp";
import skillsRouter from "./server/routes/skills";
import metaAstRouter from "./server/routes/metaAst";
import remoteApiRouter from "./server/routes/remoteApi";
import { flushStoreToDiskSync } from "./server/utils/apiKeyManager";

// Load environment variables from .env
dotenv.config();

/**
 * Initializes and starts the Express HTTP server.
 */
async function startServer() {
  const app = express();
  const PORT = 3000;

  // Disable X-Powered-By header to avoid fingerprinting
  app.disable("x-powered-by");

  // Bind to 0.0.0.0:3000 immediately to ensure startup TCP health probes succeed instantly
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Open Knowledge Server running on http://0.0.0.0:${PORT}`);
  });

  // Baseline Security & Request Correlation Middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const reqId = (req.headers["x-request-id"] as string) || `req_${crypto.randomBytes(6).toString("hex")}`;
    res.setHeader("X-Request-Id", reqId);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  // Health check endpoint (Available immediately for container probes)
  app.get("/api/health", (req: Request, res: Response) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  // Middleware: Allow high-resolution document and image payloads up to 50MB
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Register Remote API v1 Gateway (/api/v1/* with strict API key authentication & CORS)
  app.use("/api", remoteApiRouter);

  // Register Core Subsystem REST Routes
  // 1. Multimodal OCR, spatial inspection, web scraping & RAG agent endpoints
  app.use("/api", convertRouter);
  // 2. Readability, sentiment, entity extraction & complexity analysis
  app.use("/api", analysisRouter);
  // 3. Model Context Protocol (MCP) JSON-RPC 2.0 tools & knowledge base sync
  app.use("/api", mcpRouter);
  // 4. Agent Skills procedural synthesis, validation & formal logic compiler
  app.use("/api", skillsRouter);
  // 5. MetaAST Lexer, Parser & Vector DB Ingestion endpoints
  app.use("/api", metaAstRouter);

  // Unmatched /api/* 404 JSON Handler
  app.use("/api/*", (req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: "API_ENDPOINT_NOT_FOUND",
        message: `Endpoint ${req.method} ${req.originalUrl} does not exist.`,
        docsUrl: "/api/v1/openapi.json",
      },
    });
  });

  // Global Express Error Boundary Middleware (Catches malformed JSON SyntaxErrors & unhandled API errors)
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      return next(err);
    }

    if (err instanceof SyntaxError && "body" in err) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_JSON_PAYLOAD",
          message: "Malformed JSON in request body. Verify syntax before sending.",
        },
      });
    }

    if (err?.type === "entity.too.large") {
      return res.status(413).json({
        success: false,
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "Request payload exceeds the 50MB maximum limit.",
        },
      });
    }

    console.error("[Global Server Error Boundary]:", err);
    return res.status(err?.status || 500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: err?.message || "An unexpected server error occurred.",
      },
    });
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
    app.get("*", (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Graceful Shutdown & Disk Persistence Hooks
  const gracefulShutdown = (signal: string) => {
    console.log(`[Server] Received ${signal}. Flushing API store to disk and closing HTTP server...`);
    flushStoreToDiskSync();
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

startServer();
