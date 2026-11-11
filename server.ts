/**
 * @file server.ts
 * @description Full-stack Express application entrypoint.
 *
 * Binds immediately to 0.0.0.0:3000 for sub-second startup probe readiness, while asynchronously
 * loading API routers and Vite SPA middleware behind a request-readiness gate so early requests
 * wait cleanly instead of 404ing or timing out.
 */

import express, { Request, Response, NextFunction, Router } from "express";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";

// Load environment variables from .env quietly
dotenv.config({ quiet: true } as any);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Disable X-Powered-By header to avoid fingerprinting
  app.disable("x-powered-by");

  // Bind to 0.0.0.0:3000 immediately (<250ms) before loading heavy document/NLP/Vite modules
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Open Knowledge Server listening on http://0.0.0.0:${PORT}`);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    console.error(`[Server Fatal] Failed to bind port ${PORT}:`, err.message);
    process.exit(1);
  });

  // Baseline Security & Request Correlation Middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const reqId =
      (req.headers["x-request-id"] as string) ||
      `req_${crypto.randomBytes(6).toString("hex")}`;
    res.setHeader("X-Request-Id", reqId);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  // Immediate health check endpoint for container & control-plane probes
  let subsystemsInitialized = false;
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      ready: subsystemsInitialized,
      uptime: process.uptime(),
    });
  });

  // Middleware: Allow high-resolution document and image payloads up to 50MB
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Dynamic router container populated once async initialization completes
  const mainRouter = Router();
  let flushStoreFn: (() => void) | null = null;

  const initPromise = (async () => {
    const [
      { default: remoteApiRouter },
      { default: convertRouter },
      { default: analysisRouter },
      { default: mcpRouter },
      { default: skillsRouter },
      { default: metaAstRouter },
      { flushStoreToDiskSync },
    ] = await Promise.all([
      import("./server/routes/remoteApi"),
      import("./server/routes/convert"),
      import("./server/routes/analysis"),
      import("./server/routes/mcp"),
      import("./server/routes/skills"),
      import("./server/routes/metaAst"),
      import("./server/utils/apiKeyManager"),
    ]);

    flushStoreFn = flushStoreToDiskSync;

    // 1. Remote API v1 Gateway (/api/v1/* with strict API key authentication & CORS)
    mainRouter.use("/api", remoteApiRouter);
    // 2. Multimodal OCR, spatial inspection, web scraping & RAG agent endpoints
    mainRouter.use("/api", convertRouter);
    // 3. Readability, sentiment, entity extraction & complexity analysis
    mainRouter.use("/api", analysisRouter);
    // 4. Model Context Protocol (MCP) JSON-RPC 2.0 tools & knowledge base sync
    mainRouter.use("/api", mcpRouter);
    // 5. Agent Skills procedural synthesis, validation & formal logic compiler
    mainRouter.use("/api", skillsRouter);
    // 6. MetaAST Lexer, Parser & Vector DB Ingestion endpoints
    mainRouter.use("/api", metaAstRouter);

    // Unmatched /api/* 404 JSON Handler
    mainRouter.use("/api/*", (req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        error: {
          code: "API_ENDPOINT_NOT_FOUND",
          message: `Endpoint ${req.method} ${req.originalUrl} does not exist.`,
          docsUrl: "/api/v1/openapi.json",
        },
      });
    });

    // Client Frontend Serving: Vite dev server in development vs. static assets in production
    if (process.env.NODE_ENV !== "production") {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      mainRouter.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      mainRouter.use(express.static(distPath));
      mainRouter.get("*", (_req: Request, res: Response) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }

    subsystemsInitialized = true;
    console.log(`Open Knowledge Server ready (API routes & frontend mounted)`);
  })();

  // Hold incoming requests until routes & Vite middleware finish mounting (eliminates cold-boot 404/502 races)
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!subsystemsInitialized) {
        await initPromise;
      }
      return mainRouter(req, res, next);
    } catch (err) {
      return next(err);
    }
  });

  // Global Express Error Boundary Middleware (Catches malformed JSON SyntaxErrors & unhandled API errors)
  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
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

  // Graceful Shutdown & Disk Persistence Hooks
  const gracefulShutdown = (signal: string) => {
    console.log(
      `[Server] Received ${signal}. Flushing API store to disk and closing HTTP server...`
    );
    if (flushStoreFn) {
      flushStoreFn();
    }
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

startServer().catch((err) => {
  console.error("[Server Startup Fatal]:", err);
  process.exit(1);
});
