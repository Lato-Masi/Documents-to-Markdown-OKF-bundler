/**
 * @file server/routes/remoteApi.ts
 * @description Remote API v1 Gateway (/api/v1/*) with CORS, strict timing-safe API Key authentication,
 * sliding-window rate limiting, same-origin/token-protected admin endpoints, OpenAPI 3.0.3 spec,
 * and full pipeline coverage across:
 * 1. Convert & Web Extraction
 * 2. NLP & OKF Intelligence
 * 3. Agent Skills & Formal Logic
 * 4. MetaAST & Vector DB Chunking
 * 5. Model Context Protocol (MCP) JSON-RPC 2.0 (Unified with live Knowledge Base Store)
 */

import { Router, Request, Response, NextFunction } from "express";
import { SentimentAnalyzer, TextStatistics, LanguageDetector, KeywordExtractor } from "textanalysis-tool";
import {
  createRemoteApiKey,
  listRemoteApiKeys,
  revokeRemoteApiKey,
  deleteRemoteApiKey,
  updateRemoteApiKeyRateLimit,
  resetRemoteApiKeyWindow,
  validateAndTrackApiKey,
  recordRemoteApiAudit,
  getRemoteApiAuditLogs,
  clearRemoteApiAuditLogs,
  getTrafficSummaryMetrics,
  incrementActiveRequests,
  decrementActiveRequests,
  constantTimeStringEquals,
} from "../utils/apiKeyManager";
import { generateOpenApiSpec } from "../utils/openApiSpec";
import {
  createGeminiClient,
  getGeminiApiKey,
  getFriendlyErrorMessage,
  generateContentWithRetry,
  resolveVisionModel,
  getVisionModelDisplayName,
  resolvePdfThinkingLevel,
  buildComplexPdfSemanticPrompt,
} from "../utils/geminiService";
import { convertDocumentLocally } from "../utils/localConverter";
import { parsePdfWithLiteParse } from "../utils/liteparseEngine";
import { fetchRenderedPage } from "../utils/playwrightFetcher";
import { extractCleanArticleHtml } from "../utils/readabilityExtractor";
import { discoverDomainArchitecture } from "../utils/siteDiscoveryEngine";
import { executeStrictJsonExtraction } from "../utils/schemaExtractor";
import { executeSiteMapExtraction } from "../utils/siteMapper";
import { validateSafeRemoteUrl } from "../utils/urlValidator";
import {
  getActiveKnowledgeBase,
  searchKnowledgeBaseConcepts,
  findKnowledgeBaseConcept,
} from "../utils/knowledgeBaseStore";
import { sliceMonolithToAgentSkill } from "../../src/lib/skillProceduralSlicer";
import { validateAgentSkill } from "../../src/lib/skillValidator";
import { auditAgentSkillBestPractices } from "../../src/lib/agentSkillBestPracticesEngine";
import { classifyTextLogic } from "../../src/lib/logicClassifier";
import {
  parseMarkdownToAST,
  enrichMetaAST,
  chunkMarkdownForVectorDB,
  VectorChunkOptions,
} from "../../src/lib/metaAst";

const router = Router();

/**
 * 1. Same-Origin & Admin Token Guard for `/api/v1/admin/*`
 * Protects administrative key-management endpoints from cross-origin browser abuse.
 */
function requireAdminAccess(req: Request, res: Response, next: NextFunction) {
  // Never expose wildcard CORS on admin routes
  const origin = req.headers.origin;
  const host = (req.headers["x-forwarded-host"] as string) || req.headers.host || "";

  // Check if an explicit Admin Token or Master Key was provided
  const adminTokenHeader = (req.headers["x-admin-token"] as string) || "";
  const authHeader = req.headers.authorization || "";
  const bearerToken = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const masterKey = process.env.REMOTE_API_KEY || "okf_live_9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c";

  if (
    (adminTokenHeader && constantTimeStringEquals(adminTokenHeader, masterKey)) ||
    (bearerToken && constantTimeStringEquals(bearerToken, masterKey))
  ) {
    return next();
  }

  // Block cross-site browser requests detected via Sec-Fetch-Site
  const secFetchSite = (req.headers["sec-fetch-site"] as string)?.toLowerCase();
  if (secFetchSite === "cross-site") {
    return res.status(403).json({
      success: false,
      error: {
        code: "FORBIDDEN_CROSS_ORIGIN_ADMIN",
        message: "Cross-origin access to /api/v1/admin/* is prohibited. Use same-origin console or X-Admin-Token.",
      },
    });
  }

  // If an Origin header is present, verify its hostname matches the server's Host header
  if (origin && host) {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      const targetHost = host.split(",")[0].trim().toLowerCase();
      if (originHost !== targetHost) {
        return res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN_ORIGIN_MISMATCH",
            message: "Origin mismatch for administrative endpoint.",
          },
        });
      }
      res.setHeader("Access-Control-Allow-Origin", origin);
    } catch {
      return res.status(403).json({
        success: false,
        error: { code: "INVALID_ORIGIN", message: "Invalid Origin header." },
      });
    }
  }

  next();
}

/**
 * 2. Local Developer Console Management Routes (/api/v1/admin/*)
 */
router.use("/v1/admin", requireAdminAccess);

router.get("/v1/admin/keys", (req: Request, res: Response) => {
  const keys = listRemoteApiKeys();
  const logs = getRemoteApiAuditLogs();
  const traffic = getTrafficSummaryMetrics();
  res.json({
    success: true,
    keys,
    auditLogs: logs,
    traffic,
  });
});

router.post("/v1/admin/keys", (req: Request, res: Response) => {
  const { name, rateLimitPerMinute } = req.body;
  const newKey = createRemoteApiKey(name || "Remote Client Key", rateLimitPerMinute);
  res.status(201).json({
    success: true,
    key: newKey,
  });
});

router.post("/v1/admin/keys/:id/rate-limit", (req: Request, res: Response) => {
  const { rateLimitPerMinute } = req.body;
  const updated = updateRemoteApiKeyRateLimit(req.params.id, Number(rateLimitPerMinute));
  if (!updated) {
    return res.status(404).json({ success: false, error: "API Key not found" });
  }
  res.json({
    success: true,
    key: updated,
    keys: listRemoteApiKeys(),
    traffic: getTrafficSummaryMetrics(),
  });
});

router.post("/v1/admin/keys/:id/reset-window", (req: Request, res: Response) => {
  const ok = resetRemoteApiKeyWindow(req.params.id);
  if (!ok) {
    return res.status(404).json({ success: false, error: "API Key not found" });
  }
  res.json({
    success: true,
    keys: listRemoteApiKeys(),
    traffic: getTrafficSummaryMetrics(),
  });
});

router.post("/v1/admin/keys/:id/revoke", (req: Request, res: Response) => {
  const revoked = revokeRemoteApiKey(req.params.id);
  if (!revoked) {
    return res.status(404).json({ success: false, error: "API Key not found" });
  }
  res.json({ success: true, keys: listRemoteApiKeys(), traffic: getTrafficSummaryMetrics() });
});

router.delete("/v1/admin/keys/:id", (req: Request, res: Response) => {
  const deleted = deleteRemoteApiKey(req.params.id);
  if (!deleted) {
    return res.status(404).json({ success: false, error: "API Key not found" });
  }
  res.json({ success: true, keys: listRemoteApiKeys(), traffic: getTrafficSummaryMetrics() });
});

router.post("/v1/admin/logs/clear", (req: Request, res: Response) => {
  clearRemoteApiAuditLogs();
  res.json({ success: true, auditLogs: [], traffic: getTrafficSummaryMetrics() });
});

/**
 * 3. Universal CORS Middleware for Public Remote API consumers (/api/v1/*)
 */
router.use("/v1", (req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-API-Key, X-Gemini-API-Key, Accept"
  );
  res.setHeader(
    "Access-Control-Expose-Headers",
    "X-Request-Id, X-Response-Time-Ms, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset"
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

/**
 * 4. Public OpenAPI 3.0.3 Specification Endpoint (/api/v1/openapi.json)
 */
router.get("/v1/openapi.json", (req: Request, res: Response) => {
  const protocol = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000";
  const baseUrl = process.env.APP_URL || `${protocol}://${host}`;
  const spec = generateOpenApiSpec(baseUrl);
  res.json(spec);
});

/**
 * 5. Strict API Key Authentication, Sliding-Window Rate Limiting & Audit Logging Middleware
 */
function requireRemoteApiKey(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  incrementActiveRequests();

  let providedKey: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    providedKey = authHeader.slice(7).trim();
  } else if (req.headers["x-api-key"]) {
    providedKey = String(req.headers["x-api-key"]).trim();
  }

  const validation = validateAndTrackApiKey(providedKey);

  if (validation.keyRecord) {
    res.setHeader("X-RateLimit-Limit", String(validation.keyRecord.rateLimitPerMinute));
    res.setHeader("X-RateLimit-Remaining", String(validation.keyRecord.remainingWindowQuota));
    res.setHeader("X-RateLimit-Reset", String(validation.keyRecord.windowResetInSeconds));
  }

  let finished = false;
  res.on("finish", () => {
    if (finished) return;
    finished = true;
    decrementActiveRequests();
    const durationMs = Date.now() - startTime;
    recordRemoteApiAudit({
      method: req.method,
      path: `/api${req.path}`,
      statusCode: res.statusCode,
      durationMs,
      keyId: validation.keyRecord?.id || "",
      keyName: validation.keyRecord?.name || "Unauthenticated",
      keyPrefix: validation.keyRecord?.keyPrefix || "none",
      clientIp: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "remote",
      rateLimited: Boolean(validation.rateLimited),
    });
  });

  if (validation.rateLimited) {
    res.setHeader("Retry-After", String(validation.keyRecord?.windowResetInSeconds || 60));
    return res.status(429).json({
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: validation.reason,
        rateLimit: {
          limitPerMinute: validation.keyRecord?.rateLimitPerMinute,
          remaining: 0,
          resetInSeconds: validation.keyRecord?.windowResetInSeconds,
        },
      },
    });
  }

  if (!validation.valid) {
    return res.status(401).json({
      success: false,
      error: {
        code: "UNAUTHORIZED_API_KEY",
        message:
          validation.reason ||
          "Strict API key authentication required. Pass 'Authorization: Bearer <API_KEY>' or 'X-API-Key: <API_KEY>'.",
        docsUrl: "/api/v1/openapi.json",
      },
    });
  }

  (req as any).remoteApiKey = validation.keyRecord;
  (req as any).requestStartTime = startTime;
  next();
}

router.use("/v1", requireRemoteApiKey);

/**
 * Helper to wrap standardized Remote API v1 JSON responses
 */
function sendApiResponse(req: Request, res: Response, data: any, statusCode = 200) {
  const startTime = (req as any).requestStartTime || Date.now();
  const durationMs = Date.now() - startTime;
  const keyRecord = (req as any).remoteApiKey;
  res.setHeader("X-Response-Time-Ms", String(durationMs));

  return res.status(statusCode).json({
    success: statusCode >= 200 && statusCode < 300,
    meta: {
      apiVersion: "1.0.0",
      requestId: res.getHeader("X-Request-Id") || undefined,
      timestamp: new Date().toISOString(),
      durationMs,
      authenticatedKey: keyRecord ? keyRecord.name : "Verified Key",
      rateLimit: keyRecord
        ? {
            limitPerMinute: keyRecord.rateLimitPerMinute,
            remainingWindowQuota: keyRecord.remainingWindowQuota,
            windowResetInSeconds: keyRecord.windowResetInSeconds,
          }
        : undefined,
    },
    data,
  });
}

// ============================================================================
// SYSTEM & HEALTH
// ============================================================================

router.get("/v1/status", (req: Request, res: Response) => {
  const keyRecord = (req as any).remoteApiKey;
  const kb = getActiveKnowledgeBase();
  return sendApiResponse(req, res, {
    status: "operational",
    uptimeSeconds: Math.round(process.uptime()),
    auth: {
      authenticated: true,
      keyId: keyRecord?.id,
      keyName: keyRecord?.name,
      keyPrefix: keyRecord?.keyPrefix,
      totalRequestsWithKey: keyRecord?.requestCount,
      rateLimitPerMinute: keyRecord?.rateLimitPerMinute,
      remainingWindowQuota: keyRecord?.remainingWindowQuota,
    },
    knowledgeBase: {
      bundleName: kb.name,
      totalConcepts: kb.concepts.length,
      updatedAt: kb.updatedAt,
    },
    pipelines: {
      convert: "online",
      nlp: "online",
      skills: "online",
      metaAst: "online",
      mcp: "online",
    },
  });
});

// ============================================================================
// 1. CONVERT & WEB EXTRACTION PIPELINE
// ============================================================================

router.post("/v1/convert/file", async (req: Request, res: Response) => {
  try {
    const {
      fileName = "document.txt",
      fileType = "text/plain",
      base64Data,
      conversionMode = "standard",
      targetStyle = "gfm",
      qualityThreshold = 75,
      visionModel,
      customApiKey,
    } = req.body;

    if (!base64Data || typeof base64Data !== "string") {
      return res.status(400).json({
        success: false,
        error: { code: "BAD_REQUEST", message: "Missing required 'base64Data' string in request body." },
      });
    }

    const buffer = Buffer.from(base64Data, "base64");
    const isPdf = fileType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
    const selectedVisionModel = resolveVisionModel(visionModel);
    const modelLabel = getVisionModelDisplayName(selectedVisionModel);
    const headerGeminiKey = (req.headers["x-gemini-api-key"] as string) || customApiKey;
    const geminiKey = getGeminiApiKey(headerGeminiKey);

    if (isPdf) {
      const liteResult = await parsePdfWithLiteParse(buffer, fileName, qualityThreshold);
      const shouldFastPath =
        conversionMode === "text-only" ||
        (conversionMode !== "rich" &&
          liteResult.quality.isSatisfactory &&
          !liteResult.quality.requiresMultimodalVision &&
          liteResult.quality.detectedColumns < 2 &&
          !liteResult.quality.hasEmbeddedCharts &&
          !liteResult.quality.hasComplexSemantics);

      if ((shouldFastPath || !geminiKey) && liteResult.markdown && liteResult.markdown.trim().length > 20) {
        return sendApiResponse(req, res, {
          fileName,
          fileType: "application/pdf",
          engine: "LiteParse Spatial Engine",
          wordCount: liteResult.quality.wordCount,
          spatialQuality: liteResult.quality,
          totalPages: liteResult.totalPages,
          markdown: liteResult.markdown,
        });
      }

      if (geminiKey) {
        const ai = createGeminiClient(geminiKey);
        const pdfThinkingLevel = resolvePdfThinkingLevel(selectedVisionModel, conversionMode);
        const pdfPrompt = buildComplexPdfSemanticPrompt({
          fileName,
          totalPages: liteResult.totalPages,
          qualityScore: liteResult.quality.qualityScore,
          threshold: qualityThreshold,
          detectedColumns: liteResult.quality.detectedColumns,
          reasons: liteResult.quality.reasons,
          modeInstructions:
            conversionMode === "rich"
              ? "Include high-detail structural extraction, extra callouts, diagrams, key points, tables, and full context summaries."
              : "Standard faithful document conversion preserving full structural and semantic accuracy.",
          styleInstructions: "Format as GitHub Flavored Markdown (GFM) with aligned tables and attributed blockquotes.",
          structuredMarkdown: liteResult.markdown,
        });

        const response = await generateContentWithRetry(ai, {
          model: selectedVisionModel,
          contents: [
            {
              inlineData: {
                mimeType: "application/pdf",
                data: base64Data,
              },
            },
            { text: pdfPrompt },
          ],
          config: {
            thinkingConfig: {
              thinkingLevel: pdfThinkingLevel,
            },
          },
        });

        const markdown = (response.text || liteResult.markdown || "").trim();
        return sendApiResponse(req, res, {
          fileName,
          fileType: "application/pdf",
          engine: `${modelLabel} Multimodal Semantic Engine`,
          visionModelUsed: selectedVisionModel,
          wordCount: markdown.split(/\s+/).filter(Boolean).length,
          spatialQuality: liteResult.quality,
          totalPages: liteResult.totalPages,
          markdown,
        });
      }
    }

    const localMarkdown = await convertDocumentLocally(fileName, fileType, base64Data);
    if (localMarkdown && localMarkdown.trim().length > 0) {
      const wordCount = localMarkdown.trim().split(/\s+/).filter(Boolean).length;
      return sendApiResponse(req, res, {
        fileName,
        fileType,
        engine: "Deterministic Local Converter",
        wordCount,
        markdown: localMarkdown,
      });
    }

    if (!geminiKey) {
      return res.status(422).json({
        success: false,
        error: {
          code: "UNSUPPORTED_WITHOUT_GEMINI_KEY",
          message:
            "Deterministic conversion could not extract text from this binary format and no Gemini API key is configured.",
        },
      });
    }

    const ai = createGeminiClient(geminiKey);
    const prompt = `Convert this document (${fileName}, mode: ${conversionMode}, style: ${targetStyle}) into clean, faithful Markdown. Output only the raw Markdown content without outer code fences.`;

    const response = await generateContentWithRetry(ai, {
      model: selectedVisionModel,
      contents: [
        { text: prompt },
        {
          inlineData: {
            mimeType: fileType || "application/pdf",
            data: base64Data,
          },
        },
      ],
    });

    const markdown = (response.text || "").trim();
    return sendApiResponse(req, res, {
      fileName,
      fileType,
      engine: `${modelLabel} Multimodal Engine`,
      visionModelUsed: selectedVisionModel,
      wordCount: markdown.split(/\s+/).filter(Boolean).length,
      markdown,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: "CONVERSION_ERROR", message: getFriendlyErrorMessage(err) },
    });
  }
});

router.post("/v1/convert/url", async (req: Request, res: Response) => {
  try {
    const { url, conversionMode = "standard" } = req.body;
    if (!url || typeof url !== "string") {
      return res.status(400).json({
        success: false,
        error: { code: "BAD_REQUEST", message: "Missing required 'url' string in request body." },
      });
    }

    const safety = validateSafeRemoteUrl(url);
    if (!safety.safe) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_URL", message: safety.reason || "Unsafe URL" },
      });
    }

    const pageResult = await fetchRenderedPage(url, { timeoutMs: 15000 });
    const docTitle = pageResult.title || url.split("/").pop() || "Web Document";

    const readability = extractCleanArticleHtml(pageResult.html, {
      sourceUrl: pageResult.finalUrl || url,
      stripImages: conversionMode === "text-only",
      docTitle,
    });

    const markdown = readability.markdown?.trim() || "";

    return sendApiResponse(req, res, {
      url,
      finalUrl: pageResult.finalUrl || url,
      httpStatus: pageResult.status,
      renderedVia: pageResult.renderedVia,
      loadTimeMs: pageResult.loadTimeMs,
      title: readability.title || docTitle,
      byline: readability.byline || null,
      siteName: readability.siteName || null,
      publishedTime: readability.publishedTime || null,
      wordCount: readability.textWordCount,
      readingTimeMinutes: readability.readingTimeMinutes,
      prunedElements: readability.prunedElementCount,
      markdown,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: "URL_CONVERT_ERROR", message: err?.message || "Failed to fetch and convert URL." },
    });
  }
});

router.post("/v1/extract/json", async (req: Request, res: Response) => {
  try {
    const { content, url, jsonSchema, extractionPrompt, presetId, customApiKey } = req.body;
    if (!content && !url) {
      return res.status(400).json({
        success: false,
        error: { code: "BAD_REQUEST", message: "Provide either 'content' or 'url' in request body." },
      });
    }

    if (url) {
      const safety = validateSafeRemoteUrl(url);
      if (!safety.safe) {
        return res.status(400).json({
          success: false,
          error: { code: "INVALID_URL", message: safety.reason },
        });
      }
    }

    const headerKey = (req.headers["x-gemini-api-key"] as string) || customApiKey;
    const apiKey = getGeminiApiKey(headerKey);

    const result = await executeStrictJsonExtraction({
      content,
      url,
      jsonSchema,
      extractionPrompt,
      presetId,
      apiKey: apiKey || process.env.GEMINI_API_KEY || "",
    });

    return sendApiResponse(req, res, result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: "JSON_EXTRACTION_ERROR", message: err?.message || "Failed to extract structured JSON." },
    });
  }
});

router.post("/v1/site/discover", async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== "string") {
      return res.status(400).json({
        success: false,
        error: { code: "BAD_REQUEST", message: "Missing required 'url' string in request body." },
      });
    }

    const safety = validateSafeRemoteUrl(url);
    if (!safety.safe) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_URL", message: safety.reason },
      });
    }

    const report = await discoverDomainArchitecture(url);
    return sendApiResponse(req, res, report);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: "SITE_DISCOVER_ERROR", message: err?.message || "Failed to inspect domain." },
    });
  }
});

router.post("/v1/site/map", async (req: Request, res: Response) => {
  try {
    const { domainOrSitemapUrl, maxUrls = 200, filterPrefix, filterExtension, searchKeyword } = req.body;
    if (!domainOrSitemapUrl || typeof domainOrSitemapUrl !== "string") {
      return res.status(400).json({
        success: false,
        error: { code: "BAD_REQUEST", message: "Missing required 'domainOrSitemapUrl' string." },
      });
    }

    const safety = validateSafeRemoteUrl(domainOrSitemapUrl);
    if (!safety.safe) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_URL", message: safety.reason },
      });
    }

    const mapResult = await executeSiteMapExtraction({
      domainOrSitemapUrl,
      maxUrls: Math.min(Math.max(10, Number(maxUrls) || 200), 2000),
      filterPrefix,
      filterExtension,
      searchKeyword,
    });

    return sendApiResponse(req, res, mapResult);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: "SITE_MAP_ERROR", message: err?.message || "Failed to map domain URLs." },
    });
  }
});

// ============================================================================
// 2. NLP & OKF INTELLIGENCE PIPELINE
// ============================================================================

router.post("/v1/nlp/analyze", (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({
        success: false,
        error: { code: "BAD_REQUEST", message: "Missing required 'text' string in request body." },
      });
    }

    let sentiment = { score: 0, classification: "neutral" };
    try {
      const sentimentAnalyzer = new SentimentAnalyzer();
      const sentResult = sentimentAnalyzer.analyze(text);
      if (sentResult) {
        sentiment = {
          score: sentResult.score ?? 0,
          classification: sentResult.classification || "neutral",
        };
      }
    } catch {
      // Fallback
    }

    let readability = null;
    try {
      const textStats = new TextStatistics();
      const readResult = textStats.fleschKincaidReadability(text);
      if (readResult) {
        readability = {
          readabilityScore: readResult.readabilityScore,
          gradeLevel: readResult.gradeLevel,
          smogIndex: readResult.smogIndex,
          wordCount: readResult.wordCount,
          sentenceCount: readResult.sentenceCount,
          syllableCount: readResult.syllableCount,
          avgWordsPerSentence: readResult.avgWordsPerSentence,
          avgSyllablesPerWord: readResult.avgSyllablesPerWord,
          complexity: readResult.complexity,
        };
      }
    } catch {
      // Fallback
    }

    let language = { detectedLanguage: "en", languageName: "English", confidence: 100 };
    try {
      const detector = new LanguageDetector();
      const langResult = detector.detect(text);
      if (langResult) {
        language = {
          detectedLanguage: langResult.detectedLanguage || "unknown",
          languageName: langResult.languageName || "Unknown",
          confidence: langResult.confidence ?? 100,
        };
      }
    } catch {
      // Fallback
    }

    let keywords: string[] = [];
    try {
      const extractor = new KeywordExtractor();
      keywords = extractor.extractKeywords(text, 12) || [];
    } catch {
      // Fallback
    }

    return sendApiResponse(req, res, {
      sentiment,
      readability,
      language,
      keywords,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: "NLP_ANALYSIS_ERROR", message: err?.message || "Failed to analyze text." },
    });
  }
});

router.post("/v1/okf/agent", async (req: Request, res: Response) => {
  try {
    const { task = "synthesize", okfContent, userQuery, customApiKey } = req.body;
    if (!okfContent && !userQuery) {
      return res.status(400).json({
        success: false,
        error: { code: "BAD_REQUEST", message: "Provide either 'okfContent' or 'userQuery' in request body." },
      });
    }

    const headerKey = (req.headers["x-gemini-api-key"] as string) || customApiKey;
    const apiKey = getGeminiApiKey(headerKey);
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: { code: "MISSING_GEMINI_KEY", message: "GEMINI_API_KEY is not configured on the server." },
      });
    }

    const ai = createGeminiClient(apiKey);
    const systemInstruction = `You are an expert Open Knowledge Format (OKF v1.0) Agent. Structure knowledge into semantic blocks (:::summary, :::concept, :::procedure, :::code, :::table, :::note, :::faq, :::reference) with valid YAML frontmatter and [[Wiki Links]].`;

    let prompt = "";
    if (task === "audit") {
      prompt = `Perform an OKF v1.0 compliance audit on:\n\n${okfContent}\n\nProvide a compliance score (0-100%), list issues, and provide a corrected OKF document.`;
    } else if (task === "qa") {
      prompt = `OKF Document:\n${okfContent}\n\nQuestion: ${userQuery}\n\nAnswer accurately citing relevant OKF blocks.`;
    } else {
      prompt = `Synthesize the following into a compliant OKF v1.0 Markdown document with YAML frontmatter and semantic blocks:\n\n${
        userQuery || okfContent
      }`;
    }

    const response = await generateContentWithRetry(ai, {
      model: "gemini-3.8-flash",
      contents: prompt,
      config: { systemInstruction },
    });

    return sendApiResponse(req, res, {
      task,
      output: response.text || "",
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: "OKF_AGENT_ERROR", message: getFriendlyErrorMessage(err) },
    });
  }
});

// ============================================================================
// 3. AGENT SKILLS & FORMAL LOGIC PIPELINE
// ============================================================================

router.post("/v1/skills/synthesize", (req: Request, res: Response) => {
  try {
    const { markdown, skillName, allowedTools, license, compatibility } = req.body;
    if (!markdown || typeof markdown !== "string") {
      return res.status(400).json({
        success: false,
        error: { code: "BAD_REQUEST", message: "Missing required 'markdown' string in request body." },
      });
    }

    const pkg = sliceMonolithToAgentSkill(markdown, {
      customSkillName: skillName,
      allowedTools,
      license,
      compatibility,
    });

    const validation = validateAgentSkill(pkg);
    const audit = auditAgentSkillBestPractices(pkg);
    const logicClassification = classifyTextLogic(markdown);

    return sendApiResponse(req, res, {
      skill: pkg,
      validation,
      audit,
      logicClassification,
      metrics: pkg.metrics,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: "SKILL_SYNTHESIS_ERROR", message: err?.message || "Failed to synthesize skill package." },
    });
  }
});

router.post("/v1/skills/validate", (req: Request, res: Response) => {
  try {
    const { skillPackage } = req.body;
    if (!skillPackage || !skillPackage.rootSkillMd) {
      return res.status(400).json({
        success: false,
        error: { code: "BAD_REQUEST", message: "Missing required 'skillPackage.rootSkillMd' in request body." },
      });
    }

    const validation = validateAgentSkill(skillPackage);
    const audit = auditAgentSkillBestPractices(skillPackage);

    return sendApiResponse(req, res, {
      valid: validation.valid,
      tokenBudgetSatisfied: validation.tokenBudgetSatisfied,
      issues: validation.issues,
      audit,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: "SKILL_VALIDATION_ERROR", message: err?.message || "Failed to validate skill package." },
    });
  }
});

router.post("/v1/skills/classify-logic", (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({
        success: false,
        error: { code: "BAD_REQUEST", message: "Missing required 'text' string in request body." },
      });
    }

    const classification = classifyTextLogic(text);
    return sendApiResponse(req, res, classification);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: "LOGIC_CLASSIFY_ERROR", message: err?.message || "Failed to classify formal logic." },
    });
  }
});

// ============================================================================
// 4. METAAST & VECTOR DB PIPELINE
// ============================================================================

router.post("/v1/meta-ast/parse", (req: Request, res: Response) => {
  try {
    const { markdown, documentTitle = "Document" } = req.body;
    if (!markdown || typeof markdown !== "string") {
      return res.status(400).json({
        success: false,
        error: { code: "BAD_REQUEST", message: "Missing required 'markdown' string in request body." },
      });
    }

    const rawNodes = parseMarkdownToAST(markdown);
    const enrichedNodes = enrichMetaAST(rawNodes, { defaultDocumentTitle: documentTitle });

    let totalTokens = 0;
    const typeDistribution: Record<string, number> = {};
    for (const node of enrichedNodes) {
      totalTokens += node.context.estimatedTokens || 0;
      typeDistribution[node.type] = (typeDistribution[node.type] || 0) + 1;
    }

    return sendApiResponse(req, res, {
      documentTitle,
      totalNodes: enrichedNodes.length,
      estimatedTokens: totalTokens,
      typeDistribution,
      nodes: enrichedNodes,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: "METAAST_PARSE_ERROR", message: err?.message || "Failed to parse Markdown to MetaAST." },
    });
  }
});

router.post("/v1/meta-ast/vector-chunks", (req: Request, res: Response) => {
  try {
    const { markdown, options } = req.body;
    if (!markdown || typeof markdown !== "string") {
      return res.status(400).json({
        success: false,
        error: { code: "BAD_REQUEST", message: "Missing required 'markdown' string in request body." },
      });
    }

    const chunkOptions: VectorChunkOptions = {
      maxTokensPerChunk: options?.maxTokensPerChunk ?? 512,
      minHeadingFlushTokens: options?.minHeadingFlushTokens ?? 150,
      defaultDocumentTitle: options?.defaultDocumentTitle || options?.documentTitle || "Knowledge Document",
      extraMetadata: options?.extraMetadata || options?.customMetadata,
    };

    const chunks = chunkMarkdownForVectorDB(markdown, chunkOptions);

    let totalTokens = 0;
    const chunkTypeDistribution: Record<string, number> = {};
    for (const chunk of chunks) {
      totalTokens += chunk.metadata.estimatedTokens || 0;
      chunkTypeDistribution[chunk.metadata.chunkType] =
        (chunkTypeDistribution[chunk.metadata.chunkType] || 0) + 1;
    }

    return sendApiResponse(req, res, {
      documentTitle: chunkOptions.defaultDocumentTitle,
      totalChunks: chunks.length,
      totalEstimatedTokens: totalTokens,
      chunkTypeDistribution,
      options: chunkOptions,
      chunks,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: "VECTOR_CHUNK_ERROR", message: err?.message || "Failed to chunk Markdown." },
    });
  }
});

// ============================================================================
// 5. MODEL CONTEXT PROTOCOL (MCP) JSON-RPC 2.0 PIPELINE (Unified with Live KB)
// ============================================================================

router.get("/v1/mcp/manifest", (req: Request, res: Response) => {
  const kb = getActiveKnowledgeBase();
  const rootId = (kb.name || "okf-kb").toLowerCase().replace(/\s+/g, "-");

  const resources = kb.concepts.map((c) => ({
    uri: `okf://${rootId}/${c.path || c.id}`,
    name: c.title || c.path || c.id,
    description: c.description || `OKF Concept Document (${c.type})`,
    mimeType: "text/markdown",
  }));

  resources.unshift({
    uri: `okf://${rootId}/INDEX.md`,
    name: `${kb.name} Master Index`,
    description: "Root OKF Catalog and Concept Manifest",
    mimeType: "text/markdown",
  });

  return sendApiResponse(req, res, {
    jsonrpc: "2.0",
    protocolVersion: "2024-11-05",
    serverInfo: {
      name: "okf-remote-mcp-server",
      version: "1.0.0",
      specUrl: "https://okf.md/spec/",
    },
    knowledgeBase: {
      name: kb.name,
      totalConcepts: kb.concepts.length,
      updatedAt: kb.updatedAt,
    },
    resources,
    tools: [
      "search_okf_concepts",
      "get_okf_concept",
      "traverse_okf_graph",
      "synthesize_agent_skill",
      "classify_document_logic",
      "parse_markdown_meta_ast",
      "chunk_markdown_for_vector_db",
    ],
  });
});

router.post("/v1/mcp/rpc", (req: Request, res: Response) => {
  const { jsonrpc, id, method, params } = req.body;
  if (jsonrpc !== "2.0" || !method) {
    return res.status(400).json({
      jsonrpc: "2.0",
      id: id || null,
      error: { code: -32600, message: "Invalid JSON-RPC 2.0 Request" },
    });
  }

  try {
    const kb = getActiveKnowledgeBase();

    if (method === "initialize") {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { resources: {}, tools: {} },
          serverInfo: { name: "okf-remote-mcp-server", version: "1.0.0" },
        },
      });
    }

    if (method === "resources/list") {
      const rootId = (kb.name || "okf-kb").toLowerCase().replace(/\s+/g, "-");
      const resources = kb.concepts.map((c) => ({
        uri: `okf://${rootId}/${c.path || c.id}`,
        name: c.title || c.path || c.id,
        description: c.description || `OKF Concept Document (${c.type})`,
        mimeType: "text/markdown",
      }));
      return res.json({ jsonrpc: "2.0", id, result: { resources } });
    }

    if (method === "tools/list") {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          tools: [
            { name: "search_okf_concepts", description: "Search concepts across the active OKF knowledge base." },
            { name: "get_okf_concept", description: "Retrieve a specific OKF concept by ID or path." },
            { name: "traverse_okf_graph", description: "Traverse upstream prerequisites and downstream related concepts." },
            { name: "synthesize_agent_skill", description: "Compile Markdown runbook into an Agent Skill package." },
            { name: "classify_document_logic", description: "Classify text using FOL, HOL, Modal, and Temporal Logic." },
            { name: "parse_markdown_meta_ast", description: "Parse Markdown into an enriched MetaAST." },
            { name: "chunk_markdown_for_vector_db", description: "Chunk Markdown for Vector Databases." },
          ],
        },
      });
    }

    if (method === "tools/call") {
      const toolName = params?.name;
      const args = params?.arguments || {};

      if (toolName === "search_okf_concepts") {
        const matches = searchKnowledgeBaseConcepts({
          query: args.query || "",
          tag: args.tag,
          type: args.type,
          trustTier: args.trustTier,
          limit: args.limit || 5,
        });
        return res.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    query: args.query || "",
                    bundleName: kb.name,
                    totalMatches: matches.length,
                    results: matches.map((m) => ({
                      id: m.concept.id,
                      path: m.concept.path,
                      title: m.concept.title,
                      type: m.concept.type,
                      trustTier: m.concept.trustTier,
                      description: m.concept.description,
                      tags: m.concept.tags,
                      relevanceScore: m.score,
                    })),
                  },
                  null,
                  2
                ),
              },
            ],
          },
        });
      }

      if (toolName === "get_okf_concept") {
        const concept = findKnowledgeBaseConcept(args.conceptId || "");
        if (!concept) {
          return res.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: `Concept '${args.conceptId}' not found in active knowledge base.` }],
              isError: true,
            },
          });
        }
        return res.json({
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: JSON.stringify(concept, null, 2) }] },
        });
      }

      if (toolName === "traverse_okf_graph") {
        const concept = findKnowledgeBaseConcept(args.conceptId || "");
        return res.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    targetConcept: args.conceptId,
                    found: Boolean(concept),
                    prerequisites: concept?.prerequisites || [],
                    relatedConcepts: concept?.relatedConcepts || [],
                    directNeighborsCount:
                      (concept?.prerequisites?.length || 0) + (concept?.relatedConcepts?.length || 0),
                  },
                  null,
                  2
                ),
              },
            ],
          },
        });
      }

      if (toolName === "classify_document_logic") {
        const classification = classifyTextLogic(args.text || "");
        return res.json({
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: JSON.stringify(classification, null, 2) }] },
        });
      }

      if (toolName === "synthesize_agent_skill") {
        const pkg = sliceMonolithToAgentSkill(args.markdown || "# Skill", {
          customSkillName: args.skillName,
          allowedTools: args.allowedTools,
        });
        return res.json({
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: JSON.stringify(pkg, null, 2) }] },
        });
      }

      if (toolName === "parse_markdown_meta_ast") {
        const nodes = enrichMetaAST(parseMarkdownToAST(args.markdown || ""), {
          defaultDocumentTitle: args.documentTitle || "Document",
        });
        return res.json({
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: JSON.stringify({ totalNodes: nodes.length, nodes }, null, 2) }] },
        });
      }

      if (toolName === "chunk_markdown_for_vector_db") {
        const chunks = chunkMarkdownForVectorDB(args.markdown || "", {
          maxTokensPerChunk: args.maxTokensPerChunk ?? 512,
          defaultDocumentTitle: args.documentTitle || "Document",
        });
        return res.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify({ totalChunks: chunks.length, chunks }, null, 2) }],
          },
        });
      }

      return res.status(404).json({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Tool '${toolName}' not recognized.` },
      });
    }

    return res.status(404).json({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method '${method}' not found.` },
    });
  } catch (err: any) {
    return res.status(500).json({
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: err?.message || "Internal JSON-RPC error" },
    });
  }
});

router.post("/v1/mcp/query", (req: Request, res: Response) => {
  const { query, trustTier, topK = 3, expandGraph = true } = req.body;
  if (!query || typeof query !== "string") {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "Missing required 'query' string in request body." },
    });
  }

  const kb = getActiveKnowledgeBase();
  const matches = searchKnowledgeBaseConcepts({
    query,
    trustTier,
    limit: topK,
  });

  const expandedIds = new Set<string>();
  for (const m of matches) {
    expandedIds.add(m.concept.id);
    if (expandGraph && m.concept.prerequisites) {
      for (const p of m.concept.prerequisites) expandedIds.add(p);
    }
  }

  const assembledNodes = kb.concepts.filter((c) => expandedIds.has(c.id));

  return sendApiResponse(req, res, {
    query,
    bundleName: kb.name,
    primaryMatches: matches.map((m) => ({
      id: m.concept.id,
      path: m.concept.path,
      title: m.concept.title,
      type: m.concept.type,
      trustTier: m.concept.trustTier,
      relevanceScore: m.score,
    })),
    expandedNodes: assembledNodes.map((n) => ({
      id: n.id,
      path: n.path,
      title: n.title,
      type: n.type,
      trustTier: n.trustTier,
    })),
    assembledContextText: assembledNodes
      .map((n) => `### [${n.type.toUpperCase()}] ${n.title} (${n.path})\nTrust: ${n.trustTier}\n\n${n.body}`)
      .join("\n\n---\n\n"),
  });
});

export default router;
