import http from "http";
import express from "express";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import convertRouter from "../server/routes/convert";

describe("Express Convert & Spatial-Inspect API Routes", () => {
  let server: http.Server;
  let baseUrl = "";
  let cachedDocumentHash = "";

  beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: "25mb" }));
    app.use("/api", convertRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it("rejects empty /api/spatial-inspect requests with HTTP 400", async () => {
    const res = await fetch(`${baseUrl}/api/spatial-inspect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: "missing.pdf" }),
    });
    expect(res.status).toBe(400);
  });

  it("loads the built-in Sample Policy Brief via sampleId and serves subsequent threshold lookups via SHA-256 documentHash", async () => {
    const res1 = await fetch(`${baseUrl}/api/spatial-inspect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sampleId: "ark-policy-brief",
        fileName: "ARK-Urban-Primary-Care-NCD-Policy-Brief.pdf",
        qualityThreshold: 75,
      }),
    });

    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.success).toBe(true);
    expect(body1.result.totalPages).toBe(2);
    expect(body1.result.documentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(body1.result.markdown).toContain("## Background");

    cachedDocumentHash = body1.result.documentHash;

    // Instant threshold re-evaluation using only documentHash (zero base64 re-upload)
    const res2 = await fetch(`${baseUrl}/api/spatial-inspect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentHash: cachedDocumentHash,
        qualityThreshold: 90,
      }),
    });

    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.success).toBe(true);
    expect(body2.result.cacheHit).toBe(true);
    expect(body2.result.quality.threshold).toBe(90);
  });

  it("streams the cached 2D Spatial Draft from /api/convert using only documentHash when no API key is active", async () => {
    const originalEnvKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    try {
      const res = await fetch(`${baseUrl}/api/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: "ARK-Urban-Primary-Care-NCD-Policy-Brief.pdf",
          fileType: "application/pdf",
          documentHash: cachedDocumentHash,
          conversionMode: "standard",
          targetStyle: "gfm",
        }),
      });

      expect(res.status).toBe(200);
      const streamedMarkdown = await res.text();
      expect(streamedMarkdown).toContain("Preparedness of Urban Primary Healthcare Centres");
      expect(streamedMarkdown).toContain("| Alcohol | 6.5 | 3.8 |");
      expect(streamedMarkdown).not.toMatch(/!\[[^\]]*\]\(img_p/i);
    } finally {
      if (originalEnvKey !== undefined) {
        process.env.GEMINI_API_KEY = originalEnvKey;
      }
    }
  });

  it("renders a PNG raster dataUrl for the PDF Quality Heatmap viewer via POST /api/pdf-page-preview", async () => {
    const res = await fetch(`${baseUrl}/api/pdf-page-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentHash: cachedDocumentHash,
        pageNum: 1,
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.pageNum).toBe(1);
    expect(body.dataUrl).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
  });
});
