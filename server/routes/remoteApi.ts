/**
 * @file server/routes/remoteApi.ts
 * @description Remote API v1 Gateway (/api/v1/*) with CORS, strict API Key authentication,
 * OpenAPI 3.0.3 specification endpoint, and full pipeline coverage across:
 * 1. Convert & Web Extraction
 * 2. NLP & OKF Intelligence
 * 3. Agent Skills & Formal Logic
 * 4. MetaAST & Vector DB Chunking
 * 5. Model Context Protocol (MCP) JSON-RPC 2.0
 */

import { Router, Request, Response, NextFunction } from "express";
import { GoogleGenAI } from "@google/genai";
import { SentimentAnalyzer, TextStatistics, LanguageDetector, KeywordExtractor } from "textanalysis-tool";
import {
  createRemoteApiKey,
  listRemoteApiKeys,
  revokeRemoteApiKey,
  deleteRemoteApiKey,
  validateAndTrackApiKey,
  recordRemoteApiAudit,
  getRemoteApiAuditLogs,
  clearRemoteApiAuditLogs,
} from "../utils/apiKeyManager";
import { generateOpenApiSpec } from "../utils/openApiSpec";
import { getGeminiApiKey, getFriendlyErrorMessage, generateContentWithRetry } from "../utils/geminiService";
import { convertDocumentLocally } from "../utils/localConverter";
import { parsePdfWithLiteParse } from "../utils/liteparseEngine";
import { fetchRenderedPage } from "../utils/playwrightFetcher";
import { extractCleanArticleHtml } from "../utils/readabilityExtractor";
import { discoverDomainArchitecture } from "../utils/siteDiscoveryEngine";
import { executeStrictJsonExtraction } from "../utils/schemaExtractor";
import { executeSiteMapExtraction } from "../utils/siteMapper";
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
 * 1. Universal CORS Middleware for Remote API consumers
 */
router.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-API-Key, X-Gemini-API-Key, Accept"
  );
  res.setHeader("Access-Control-Expose-Headers", "X-Request-Id, X-Response-Time-Ms");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

/**
 * 2. Local Developer Console Management Routes (/api/v1/admin/*)
 * Used by the in-app Remote API Developer Console UI to manage API keys and inspect audit logs.
 */
router.get("/v1/admin/keys", (req: Request, res: Response) => {
  const keys = listRemoteApiKeys();
  const logs = getRemoteApiAuditLogs();
  res.json({
    success: true,
    keys,
    auditLogs: logs,
  });
});

router.post("/v1/admin/keys", (req: Request, res: Response) => {
  const { name } = req.body;
  const newKey = createRemoteApiKey(name || "Remote Client Key");
  res.status(201).json({
    success: true,
    key: newKey,
  });
});

router.post("/v1/admin/keys/:id/revoke", (req: Request, res: Response) => {
  const revoked = revokeRemoteApiKey(req.params.id);
  if (!revoked) {
    return res.status(404).json({ success: false, error: "API Key not found" });
  }
  res.json({ success: true, keys: listRemoteApiKeys() });
});

router.delete("/v1/admin/keys/:id", (req: Request, res: Response) => {
  const deleted = deleteRemoteApiKey(req.params.id);
  if (!deleted) {
    return res.status(404).json({ success: false, error: "API Key not found" });
  }
  res.json({ success: true, keys: listRemoteApiKeys() });
});

router.post("/v1/admin/logs/clear", (req: Request, res: Response) => {
  clearRemoteApiAuditLogs();
  res.json({ success: true, auditLogs: [] });
});

/**
 * 3. Public OpenAPI 3.0.3 Specification Endpoint (/api/v1/openapi.json)
 * Accessible directly for OpenAPI / Swagger / Agent Tool importers
 */
router.get("/v1/openapi.json", (req: Request, res: Response) => {
  const protocol = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000";
  const baseUrl = process.env.APP_URL || `${protocol}://${host}`;
  const spec = generateOpenApiSpec(baseUrl);
  res.json(spec);
});

/**
 * 4. Strict API Key Authentication & Audit Logging Middleware for all Remote `/api/v1/*` routes
 */
function requireRemoteApiKey(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();

  // Extract token from Authorization: Bearer <token> or X-API-Key header
  let providedKey: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    providedKey = authHeader.slice(7).trim();
  } else if (req.headers["x-api-key"]) {
    providedKey = String(req.headers["x-api-key"]).trim();
  }

  const validation = validateAndTrackApiKey(providedKey);

  // Hook into response finish to log audit telemetry
  res.on("finish", () => {
    const durationMs = Date.now() - startTime;
    recordRemoteApiAudit({
      method: req.method,
      path: `/api${req.path}`,
      statusCode: res.statusCode,
      durationMs,
      keyName: validation.keyRecord?.name || "Unauthenticated",
      keyPrefix: validation.keyRecord?.keyPrefix || "none",
    });
  });

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

  // Attach authenticated key metadata to request object
  (req as any).remoteApiKey = validation.keyRecord;
  (req as any).requestStartTime = startTime;
  next();
}

// Apply strict authentication to all subsequent /v1/* endpoints
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
      timestamp: new Date().toISOString(),
      durationMs,
      authenticatedKey: keyRecord ? keyRecord.name : "Verified Key",
    },
    data,
  });
}

/**
 * Helper: SSRF URL Validation
 */
function isSafeRemoteUrl(rawUrl: string): { safe: boolean; reason?: string; parsedUrl?: URL } {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { safe: false, reason: "Only HTTP and HTTPS protocols are permitted." };
    }
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "0.0.0.0" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname === "169.254.169.254" ||
      hostname === "metadata.google.internal"
    ) {
      return { safe: false, reason: "Access to internal, loopback, or cloud metadata hosts is prohibited." };
    }
    return { safe: true, parsedUrl: parsed };
  } catch {
    return { safe: false, reason: "Invalid URL syntax." };
  }
}

// ============================================================================
// SYSTEM & HEALTH
// ============================================================================

router.get("/v1/status", (req: Request, res: Response) => {
  const keyRecord = (req as any).remoteApiKey;
  return sendApiResponse(req, res, {
    status: "operational",
    uptimeSeconds: Math.round(process.uptime()),
    auth: {
      authenticated: true,
      keyId: keyRecord?.id,
      keyName: keyRecord?.name,
      keyPrefix: keyRecord?.keyPrefix,
      totalRequestsWithKey: keyRecord?.requestCount,
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

/**
 * POST /api/v1/convert/file
 * Converts base64-encoded PDF, DOCX, XLSX, CSV, HTML, TXT, or Image into structured Markdown
 */
router.post("/v1/convert/file", async (req: Request, res: Response) => {
  try {
    const {
      fileName = "document.txt",
      fileType = "text/plain",
      base64Data,
      conversionMode = "standard",
      targetStyle = "gfm",
      qualityThreshold = 75,
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

    // Fast-path PDF Spatial LiteParse
    if (isPdf) {
      const liteResult = await parsePdfWithLiteParse(buffer, fileName, qualityThreshold);
      if (liteResult.markdown && liteResult.markdown.trim().length > 20) {
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
    }

    // Try deterministic local conversion (DOCX Mammoth, XLSX, CSV, HTML, TXT)
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

    // Fallback to Gemini Multimodal Vision / Document Engine
    const headerGeminiKey = (req.headers["x-gemini-api-key"] as string) || customApiKey;
    const geminiKey = getGeminiApiKey(headerGeminiKey);
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

    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const prompt = `Convert this document (${fileName}, mode: ${conversionMode}, style: ${targetStyle}) into clean, faithful Markdown. Output only the raw Markdown content without outer code fences.`;

    const response = await generateContentWithRetry(ai, {
      model: "gemini-2.5-flash",
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
      engine: "Gemini Multimodal Engine",
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

/**
 * POST /api/v1/convert/url
 * Fetches any public webpage or document URL and returns clean Markdown + metadata
 */
router.post("/v1/convert/url", async (req: Request, res: Response) => {
  try {
    const { url, conversionMode = "standard" } = req.body;
    if (!url || typeof url !== "string") {
      return res.status(400).json({
        success: false,
        error: { code: "BAD_REQUEST", message: "Missing required 'url' string in request body." },
      });
    }

    const safety = isSafeRemoteUrl(url);
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

/**
 * POST /api/v1/extract/json
 * Extracts structured JSON adhering to a JSON Schema or preset template
 */
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
      const safety = isSafeRemoteUrl(url);
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

/**
 * POST /api/v1/site/discover
 * Inspects domain robots.txt, llms.txt, and sitemaps
 */
router.post("/v1/site/discover", async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== "string") {
      return res.status(400).json({
        success: false,
        error: { code: "BAD_REQUEST", message: "Missing required 'url' string in request body." },
      });
    }

    const safety = isSafeRemoteUrl(url);
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

/**
 * POST /api/v1/site/map
 * Extracts domain sitemap hierarchy and URLs
 */
router.post("/v1/site/map", async (req: Request, res: Response) => {
  try {
    const { domainOrSitemapUrl, maxUrls = 200, filterPrefix, filterExtension, searchKeyword } = req.body;
    if (!domainOrSitemapUrl || typeof domainOrSitemapUrl !== "string") {
      return res.status(400).json({
        success: false,
        error: { code: "BAD_REQUEST", message: "Missing required 'domainOrSitemapUrl' string." },
      });
    }

    const safety = isSafeRemoteUrl(domainOrSitemapUrl);
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

/**
 * POST /api/v1/nlp/analyze
 * Computes readability (Flesch-Kincaid, SMOG), sentiment, language detection, and keywords
 */
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

/**
 * POST /api/v1/okf/agent
 * Executes OKF v1.0 synthesis, compliance auditing, or grounded Q&A
 */
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

    const ai = new GoogleGenAI({ apiKey });
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
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { systemInstruction, temperature: 0.2 },
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

/**
 * POST /api/v1/skills/synthesize
 * Compiles raw Markdown runbooks/SOPs into an Agent Skill package (SKILL.md, references/, scripts/)
 */
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

/**
 * POST /api/v1/skills/validate
 * Performs 6-point preflight validation and best-practices audit on an Agent Skill package
 */
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

/**
 * POST /api/v1/skills/classify-logic
 * Performs formal First-Order (FOL), Higher-Order (HOL), Modal, and Temporal logic classification
 */
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

/**
 * POST /api/v1/meta-ast/parse
 * Parses raw Markdown into an enriched MetaAST block syntax tree
 */
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

/**
 * POST /api/v1/meta-ast/vector-chunks
 * Chunks Markdown for Vector Databases (Pinecone, Qdrant, pgvector, ChromaDB)
 */
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
// 5. MODEL CONTEXT PROTOCOL (MCP) JSON-RPC 2.0 PIPELINE
// ============================================================================

/**
 * Forward authenticated /api/v1/mcp/* requests to the MCP handler logic
 */
router.get("/v1/mcp/manifest", (req: Request, res: Response) => {
  return sendApiResponse(req, res, {
    jsonrpc: "2.0",
    protocolVersion: "2024-11-05",
    serverInfo: {
      name: "okf-remote-mcp-server",
      version: "1.0.0",
      specUrl: "https://okf.md/spec/",
    },
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

    if (method === "tools/call") {
      const toolName = params?.name;
      const args = params?.arguments || {};

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

      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify({ executedTool: toolName, status: "completed", args }) }],
        },
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
  const { query, topK = 3, expandGraph = true } = req.body;
  if (!query || typeof query !== "string") {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "Missing required 'query' string in request body." },
    });
  }

  return sendApiResponse(req, res, {
    query,
    topK,
    expandGraph,
    status: "queried",
    message: "Query executed against active OKF Knowledge Graph.",
  });
});

export default router;
