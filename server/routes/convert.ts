import { Router } from "express";
import fs from "fs";
import path from "path";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import {
  createGeminiClient,
  getGeminiApiKey,
  getFriendlyErrorMessage,
  generateContentStreamWithRetry,
  resolveVisionModel,
  getVisionModelDisplayName,
  resolvePdfThinkingLevel,
  buildComplexPdfSemanticPrompt,
} from "../utils/geminiService";
import { extractPdfPageByPageText, inspectPdfPreflight } from "../utils/pdfUtils";
import { convertDocumentLocally, preProcessHtml, convertHtmlToMarkdownBasic, convertCsvToMarkdownTable } from "../utils/localConverter";
import { isPandocAvailable, convertWithPandocCLI, convertHtmlToMarkdownPandoc } from "../utils/pandocEngine";
import { convertWithAnydoc } from "../utils/anydocEngine";
import { parsePageChunks, createSlidingWindows } from "../utils/slidingWindow";
import {
  parsePdfWithLiteParse,
  getCachedSpatialEntry,
  renderPdfPageScreenshot,
} from "../utils/liteparseEngine";
import { extractCleanArticleHtml } from "../utils/readabilityExtractor";
import { fetchRenderedPage } from "../utils/playwrightFetcher";
import { discoverDomainArchitecture, parseRobotsTxt, parseLlmsTxt, parseSitemaps } from "../utils/siteDiscoveryEngine";
import { executeSemanticCrawl } from "../utils/semanticCrawler";
import { executeStrictJsonExtraction, EXTRACTION_PRESETS } from "../utils/schemaExtractor";
import { executeSiteMapExtraction } from "../utils/siteMapper";
import { executeBatchUrlScrape } from "../utils/batchScraper";
import { executeSearchAndScrape } from "../utils/searchScraper";
import { validateSafeRemoteUrl } from "../utils/urlValidator";

const router = Router();

const SAMPLE_POLICY_BRIEF_REL_PATH = "public/assets/aistudio/ARK-Urban-Primary-Care-NCD-Policy-Brief_f91069ba.pdf";

// Endpoint: POST /api/spatial-inspect
// Provides spatial 2D layout coordinates, bounding boxes, quality assessment diagnostics, and SHA-256 caching
router.post("/spatial-inspect", async (req, res) => {
  try {
    const { fileName, base64Data, qualityThreshold, documentHash, sampleId } = req.body;
    const threshold = typeof qualityThreshold === "number" ? qualityThreshold : 75;

    // 1. Instant lookup by SHA-256 documentHash (e.g. when user adjusts threshold slider)
    if (documentHash && typeof documentHash === "string") {
      const cached = getCachedSpatialEntry(documentHash, threshold);
      if (cached) {
        return res.json({ success: true, result: cached.result });
      }
    }

    // 2. Direct local disk read for built-in sample PDF (eliminates client-to-server base64 upload roundtrip)
    let buffer: Buffer | null = null;
    if (sampleId === "ark-policy-brief") {
      const fullSamplePath = path.join(process.cwd(), SAMPLE_POLICY_BRIEF_REL_PATH);
      if (fs.existsSync(fullSamplePath)) {
        buffer = fs.readFileSync(fullSamplePath);
      }
    }

    if (!buffer) {
      if (!base64Data) {
        return res.status(400).json({ error: "No base64 document data or valid cached documentHash provided" });
      }
      buffer = Buffer.from(base64Data, "base64");
    }

    const result = await parsePdfWithLiteParse(buffer, fileName || "document.pdf", threshold);
    return res.json({ success: true, result });
  } catch (err: any) {
    console.error("[Spatial Inspect Error]:", err);
    return res.status(500).json({
      success: false,
      error: err?.message || "Failed to inspect spatial layout",
    });
  }
});

// Endpoint: POST /api/pdf-page-preview
// Renders a high-contrast PNG raster of a single PDF page via PDFium for the PDF Quality Heatmap viewer
router.post("/pdf-page-preview", async (req, res) => {
  try {
    const { documentHash, pageNum = 1, base64Data, sampleId } = req.body || {};
    let buffer: Buffer | null = null;

    if (typeof documentHash === "string" && documentHash) {
      const cached = getCachedSpatialEntry(documentHash);
      if (cached) {
        buffer = cached.buffer;
      }
    }

    if (!buffer && sampleId === "ark-policy-brief") {
      const fullSamplePath = path.join(process.cwd(), SAMPLE_POLICY_BRIEF_REL_PATH);
      if (fs.existsSync(fullSamplePath)) {
        buffer = fs.readFileSync(fullSamplePath);
      }
    }

    if (!buffer && typeof base64Data === "string" && base64Data.length > 0) {
      buffer = Buffer.from(base64Data, "base64");
    }

    if (!buffer) {
      return res.status(400).json({
        success: false,
        error: "Provide a cached documentHash, sampleId, or base64Data to render PDF page preview",
      });
    }

    const rendered = await renderPdfPageScreenshot(
      buffer,
      Number(pageNum) || 1,
      typeof documentHash === "string" ? documentHash : undefined
    );
    if (!rendered) {
      return res.status(500).json({
        success: false,
        error: "Could not render PDF page raster",
      });
    }

    return res.json({
      success: true,
      pageNum: rendered.pageNum,
      width: rendered.width,
      height: rendered.height,
      dataUrl: rendered.dataUrl,
    });
  } catch (err: any) {
    console.error("[PDF Page Preview Error]:", err);
    return res.status(500).json({
      success: false,
      error: err?.message || "Failed to render PDF page preview",
    });
  }
});

// Endpoint: POST /api/convert
router.post("/convert", async (req, res) => {
  const {
    fileName = "document.pdf",
    fileType = "application/pdf",
    base64Data,
    documentHash,
    conversionMode,
    targetStyle,
    qualityThreshold,
    visionModel,
    customApiKey,
  } = req.body;

  const threshold = typeof qualityThreshold === "number" ? qualityThreshold : 75;
  const cachedSpatial = typeof documentHash === "string" ? getCachedSpatialEntry(documentHash, threshold) : null;

  if (!base64Data && !cachedSpatial) {
    return res.status(400).json({ error: "No base64 file data or cached documentHash provided" });
  }

  const resolvedBase64Data: string = base64Data || cachedSpatial!.buffer.toString("base64");

  const headerKey = (req.headers["x-gemini-api-key"] as string) || customApiKey;
  const selectedVisionModel = resolveVisionModel(visionModel);
  const modelLabel = getVisionModelDisplayName(selectedVisionModel);
  const pdfThinkingLevel = resolvePdfThinkingLevel(selectedVisionModel, conversionMode);
  const apiKey = getGeminiApiKey(headerKey);

  // If GEMINI_API_KEY is not set, return cached 2D spatial markdown or convert locally directly
  if (!apiKey) {
    if (cachedSpatial?.result?.markdown) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.write(cachedSpatial.result.markdown);
      return res.end();
    }
    const localResult = await convertDocumentLocally(fileName, fileType, resolvedBase64Data);
    if (localResult !== null) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.write(localResult);
      return res.end();
    }
    return res.status(500).json({
      error: "Gemini API key is not configured and local conversion is unavailable for this format.",
    });
  }

  const ai = createGeminiClient(apiKey);

  let modeInstructions = "";
  if (conversionMode === "rich") {
    modeInstructions = "Include high-detail structural extraction, extra callouts, diagrams, key points, tables, and full context summaries.";
  } else if (conversionMode === "text-only") {
    modeInstructions = "Focus strictly on extractable text content, omitting visual layouts or decorative figures.";
  } else {
    modeInstructions = "Standard faithful document conversion preserving full structural and semantic accuracy.";
  }

  let styleInstructions = "";
  if (targetStyle === "gfm") {
    styleInstructions = "Format specifically as GitHub Flavored Markdown (GFM) using task lists, GFM tables, and strict code block languages.";
  } else if (targetStyle === "academic") {
    styleInstructions = "Format with academic precision, blockquotes for citations, clear LaTeX math syntax where relevant, and structured references.";
  } else {
    styleInstructions = "Generate standard, clean, highly compatible Markdown.";
  }

  const prompt = `You are an expert document-to-Markdown converter with advanced layout analysis capabilities. Your job is to convert the provided document into a clean, comprehensive, and perfectly-formatted Markdown document.

File name: ${fileName}
File type: ${fileType}

Conversion Requirements:
1. LAYOUT INFERENCE FIRST: Analyze the document's visual architecture to detect primary content streams, sidebars, header/footer cards, callout boxes, or multi-column grids before extraction.
2. ${modeInstructions}
3. ${styleInstructions}
4. Maintain original logical hierarchies, headings (use appropriate #, ##, ### levels), bullet points, and numbered lists.
5. If the source contains tables or visual charts, format them properly in clean Markdown tables with aligned columns.
6. If the source contains images with text, quotes, or diagrams, extract their full details in blockquotes or tables.
7. Return ONLY the final converted Markdown text. DO NOT wrap your entire output in backticks (e.g., do not start with \`\`\`markdown and end with \`\`\`), do not include any explanatory text, greetings, notes, or chat conversational phrasing. Output just the raw Markdown content directly.`;

  try {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    if (res.flushHeaders) {
      res.flushHeaders();
    }

    // Heartbeat utility to prevent socket timeouts and provide real-time diagnostic telemetry
    let heartbeatTimer: NodeJS.Timeout | null = null;
    let firstTokenReceived = false;

    const startHeartbeat = (stageLabel: string) => {
      let seconds = 0;
      firstTokenReceived = false;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => {
        if (!firstTokenReceived && !res.writableEnded) {
          seconds += 3;
          res.write(`> ⏱️ [Server Heartbeat] ${stageLabel}... (${seconds}s elapsed)\n\n`);
        }
      }, 3000);
    };

    const stopHeartbeat = () => {
      firstTokenReceived = true;
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };

    const onRetry = (attempt: number, delayMs: number, errStr: string, activeModel: string) => {
      stopHeartbeat();
      if (!res.writableEnded) {
        res.write(`> ⚠️ [Gemini Model Retry ${attempt}/4] ${errStr}. Retrying in ${delayMs / 1000}s using ${activeModel}...\n\n`);
      }
    };

    // 1. PDF Files - Phase 1 LiteParse Spatial Extraction (SHA-256 Cached) & Layout-Aware Quality Escalation
    if (fileType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
      res.write(`> 🛰️ [Server Stage 1/3] LiteParse Spatial Engine inspecting ${fileName} (Threshold: ${threshold}/100, Model: ${modelLabel}, Thinking: ${pdfThinkingLevel})...\n\n`);

      // Reuse pre-flight SHA-256 cached spatial extraction in <1ms when available
      const liteParseResult = cachedSpatial
        ? cachedSpatial.result
        : await parsePdfWithLiteParse(Buffer.from(resolvedBase64Data, "base64"), fileName, threshold);
      const { quality, totalPages, pages, markdown: liteParseMd, rawText, cacheHit } = liteParseResult;

      const totalPagesCount = totalPages;
      const pdfTextReference = rawText || pages.map((p) => p.text).join("\n\n");
      const structuredMarkdown = liteParseMd;

      res.write(
        `> 🛰️ [Server Stage 2/3] Spatial Score: ${quality.qualityScore}/100 (${
          cacheHit ? "SHA-256 Cache Hit <1ms" : `${liteParseResult.executionTimeMs}ms`
        } · ${quality.isSatisfactory ? "Linear Single-Column" : "Multimodal Vision Required"}).\n\n`
      );

      // DETERMINISTIC FAST-PATH EVALUATION:
      const shouldTakeFastPath =
        conversionMode === "text-only" ||
        (conversionMode !== "rich" &&
          quality.isSatisfactory &&
          !quality.requiresMultimodalVision &&
          quality.detectedColumns < 2 &&
          !quality.hasEmbeddedCharts &&
          !quality.hasComplexSemantics);

      if (
        shouldTakeFastPath &&
        structuredMarkdown &&
        structuredMarkdown.trim().length > 30
      ) {
        res.write(`> ⚡ **LiteParse Fast-Path Executed**: Clean single-column spatial parsing complete (${quality.wordCount} words, ${liteParseResult.executionTimeMs}ms)\n\n`);
        res.write(structuredMarkdown);
        return res.end();
      }

      // ESCALATION TO GEMINI MULTIMODAL VISION:
      res.write(`> ⚠️ **Multimodal Layout Escalation Activated**: ${quality.reasons.join(" | ")}. Refining with ${modelLabel} (${pdfThinkingLevel} thinking)...\n\n`);

      const pdfDocPart = {
        inlineData: {
          mimeType: "application/pdf",
          data: resolvedBase64Data,
        },
      };

      const pageChunks = parsePageChunks(pdfTextReference);
      // Create sliding windows with 4-page window size and 1-page overlap for multi-page documents (> 4 pages)
      const slidingWindows = createSlidingWindows(pageChunks, 4, 1);

      // Branch A: Multi-Page Documents (> 4 pages) -> Multi-Window Sliding Pipeline
      if (totalPagesCount > 4 && slidingWindows.length > 1) {
        res.write(`> 🧬 **Phase 2B Multimodal Hybrid Pipeline Activated** (${totalPagesCount} Pages -> ${slidingWindows.length} Overlapping 4-Page Windows via ${modelLabel})\n`);
        res.write(`> 🪟 **Sliding Window Engine**: Processing in 4-page windows to preserve cross-page tables and semantic continuity.\n\n`);

        let previousTailContext = "";

        for (const win of slidingWindows) {
          res.write(`> 🪟 [Window ${win.windowIndex + 1}/${win.totalWindows}] Processing Pages ${win.startPage}–${win.endPage} with ${modelLabel}...\n\n`);

          const windowPrompt = `You are converting Pages ${win.startPage} to ${win.endPage} of a ${totalPagesCount}-page PDF document (Window ${win.windowIndex + 1}/${win.totalWindows}).
Your objective is to visually inspect these pages and extract them into clean, accurate, semantically structured Markdown.

FILE NAME: ${fileName}
WINDOW RANGE: Pages ${win.startPage} through ${win.endPage} of ${totalPagesCount}
LITEPARSE QUALITY SCORE: ${quality.qualityScore}/100
DETECTED SIGNALS: ${quality.reasons.join("; ")}

${previousTailContext ? `CONTINUITY CONTEXT FROM PREVIOUS WINDOW (Do NOT duplicate headers or completed tables):
--- PREVIOUS TAIL ANCHOR ---
${previousTailContext}
--- END PREVIOUS TAIL ANCHOR ---
` : ""}

SEMANTIC EXTRACTION PROTOCOL:
1. Reconstruct visual reading order faithfully (unwrap multi-column grids, stitch paragraphs that split across columns, and keep callout sidebars intact).
2. Convert any embedded bar/line charts or figures into aligned GitHub-Flavored Markdown (GFM) tables with all data values and percentages.
3. Format verbatim participant quotes as attributed blockquotes (\`> *"..."* — **[Speaker Role]**\`) under their thematic sub-heading.
4. Output raw Markdown directly without wrapping in \`\`\`markdown code blocks.

${modeInstructions}
${styleInstructions}

--- EXTRACTED PAGE MANIFEST FOR WINDOW ${win.windowIndex + 1} (PAGES ${win.startPage}-${win.endPage}) ---
${win.pagesText}
--- END WINDOW MANIFEST ---`;

          try {
            startHeartbeat(`Awaiting ${modelLabel} inference for Window ${win.windowIndex + 1}/${win.totalWindows} (Pages ${win.startPage}-${win.endPage})`);

            const windowStream = await generateContentStreamWithRetry(
              ai,
              {
                model: selectedVisionModel,
                contents: {
                  parts: [pdfDocPart, { text: windowPrompt }],
                },
                config: {
                  thinkingConfig: {
                    thinkingLevel: pdfThinkingLevel,
                  },
                },
              },
              4,
              onRetry
            );

            let windowText = "";
            for await (const chunk of windowStream) {
              if (chunk.text) {
                stopHeartbeat();
                windowText += chunk.text;
                res.write(chunk.text);
              }
            }
            stopHeartbeat();

            // Capture last 15 lines of output as tail context for next window
            const outputLines = windowText.trim().split("\n");
            previousTailContext = outputLines.slice(-15).join("\n");
          } catch (winErr: any) {
            stopHeartbeat();
            console.warn(`[Sliding Window ${win.windowIndex + 1} Error]:`, winErr);
            res.write(`\n\n> ⚠️ *Window ${win.windowIndex + 1} extracted via fallback manifest anchor (${getFriendlyErrorMessage(winErr)})*\n\n${win.pagesText}\n\n`);
          }
        }

        return res.end();
      }

      // Branch B: Standard Documents (<= 4 pages, including 2-page Policy Briefs) -> Fast Multimodal Visual Refinement
      res.write(`> 🧬 **Phase 2B Multimodal Visual Refinement (${modelLabel})**: Verifying ${quality.detectedColumns}-column hierarchy, chart tables, and speaker attributions...\n\n`);

      const pdfPrompt = buildComplexPdfSemanticPrompt({
        fileName,
        totalPages: totalPagesCount,
        qualityScore: quality.qualityScore,
        threshold,
        detectedColumns: quality.detectedColumns,
        reasons: quality.reasons,
        modeInstructions,
        styleInstructions,
        structuredMarkdown,
      });

      try {
        startHeartbeat(`Awaiting ${modelLabel} multimodal vision refinement for ${fileName}`);

        const responseStream = await generateContentStreamWithRetry(
          ai,
          {
            model: selectedVisionModel,
            contents: {
              parts: [pdfDocPart, { text: pdfPrompt }],
            },
            config: {
              thinkingConfig: {
                thinkingLevel: pdfThinkingLevel,
              },
            },
          },
          4,
          onRetry
        );

        for await (const chunk of responseStream) {
          if (chunk.text) {
            stopHeartbeat();
            res.write(chunk.text);
          }
        }
        stopHeartbeat();

        return res.end();
      } catch (streamErr: any) {
        stopHeartbeat();
        console.warn("[Phase 2B Stream Error] Switching to Fallback Recovery Switch:", streamErr);
        res.write(`\n\n> ⚠️ **Pipeline Fallback Switch**: Multimodal stream encountered an issue (${getFriendlyErrorMessage(streamErr)}). Delivering deterministic AST extraction...\n\n`);
        if (structuredMarkdown || pdfTextReference) {
          res.write(structuredMarkdown || pdfTextReference);
          return res.end();
        } else {
          res.write(`\n\n> ❌ **Conversion Failure**: ${getFriendlyErrorMessage(streamErr)}\n\n`);
          return res.end();
        }
      }
    }
    // 2. Image Files (PNG, JPG, WEBP, etc.)
    else if (fileType.startsWith("image/")) {
      const docPart = {
        inlineData: {
          mimeType: fileType,
          data: base64Data,
        },
      };

      const responseStream = await generateContentStreamWithRetry(
        ai,
        {
          model: selectedVisionModel,
          contents: {
            parts: [docPart, { text: prompt }],
          },
        },
        4,
        onRetry
      );

      for await (const chunk of responseStream) {
        res.write(chunk.text || "");
      }
      res.end();
    }
    // 3. Word Documents (DOCX, DOC) & OpenDocument Text (.odt), RTF, EPUB, PPTX
    else if (
      fileType?.toLowerCase().includes("wordprocessingml") ||
      fileType?.toLowerCase().includes("msword") ||
      fileType?.toLowerCase().includes("presentationml") ||
      fileType?.toLowerCase().includes("opendocument.text") ||
      fileName.toLowerCase().endsWith(".docx") ||
      fileName.toLowerCase().endsWith(".doc") ||
      fileName.toLowerCase().endsWith(".pptx") ||
      fileName.toLowerCase().endsWith(".ppt") ||
      fileName.toLowerCase().endsWith(".odt") ||
      fileName.toLowerCase().endsWith(".rtf") ||
      fileName.toLowerCase().endsWith(".epub")
    ) {
      const buffer = Buffer.from(base64Data, "base64");
      let extractedGfm = "";
      let extractSuccess = false;
      let extractErrorReason = "";
      let engineName = "Mammoth + Turndown GFM";

      // Step A: Attempt Mammoth HTML -> Turndown GFM conversion for Word documents
      if (
        fileName.toLowerCase().endsWith(".docx") ||
        fileName.toLowerCase().endsWith(".doc") ||
        fileType?.toLowerCase().includes("wordprocessingml") ||
        fileType?.toLowerCase().includes("msword")
      ) {
        try {
          const mammothResult = await mammoth.convertToHtml({ buffer });
          if (mammothResult && mammothResult.value && mammothResult.value.trim().length > 0) {
            const htmlResult = await convertHtmlToMarkdownPandoc(mammothResult.value);
            if (htmlResult.markdown && htmlResult.markdown.trim().length > 20) {
              extractedGfm = htmlResult.markdown;
              extractSuccess = true;
              engineName = "Mammoth + Turndown GFM Engine";
            } else {
              extractErrorReason = htmlResult.error || "HTML conversion produced empty Markdown output";
            }
          } else {
            extractErrorReason = "Mammoth HTML extraction produced empty content";
          }
        } catch (mErr: any) {
          extractErrorReason = mErr?.message || "Mammoth HTML extraction error";
        }
      }

      // Step B1: Attempt Firecrawl anydoc high-performance Rust/Wasm conversion engine
      if (!extractSuccess) {
        try {
          const anydocRes = await convertWithAnydoc(buffer, fileName, fileType);
          if (anydocRes.success && anydocRes.markdown && anydocRes.markdown.trim().length > 20) {
            extractedGfm = anydocRes.markdown;
            extractSuccess = true;
            engineName = "Firecrawl Anydoc Engine";
          }
        } catch (anyErr: any) {
          extractErrorReason = anyErr?.message || "Anydoc engine execution notice";
        }
      }

      // Step B2: Attempt direct Pandoc CLI conversion if available
      if (!extractSuccess && (await isPandocAvailable())) {
        try {
          const formatExt = fileName.split(".").pop()?.toLowerCase() || "docx";
          const directMd = await convertWithPandocCLI(buffer, formatExt, "gfm");
          if (directMd && directMd.trim().length > 20) {
            extractedGfm = directMd;
            extractSuccess = true;
            engineName = "Pandoc CLI";
          }
        } catch (cliErr: any) {
          extractErrorReason = cliErr?.message || "Pandoc CLI execution error";
        }
      }

      // DIRECT RETURN: Deterministic local parsing succeeded
      if (extractSuccess && extractedGfm.trim().length > 0) {
        res.write(`> ⚡ **Fast Deterministic Conversion Complete**: Processed via ${engineName}\n\n`);
        res.write(extractedGfm);
        return res.end();
      }

      // FAILOVER TO DEEPER GEMINI ANALYSIS IF DETERMINISTIC STEPS FAIL
      console.warn(`[Pipeline Fallback Switch] Local document extraction step failed (${extractErrorReason}). Triggering deeper Gemini analysis.`);
      res.write(`> ⚠️ **Pipeline Fallback Switch**: Local deterministic engine encountered an encrypted or complex layout (${extractErrorReason || "Non-standard document encoding"}). Automatically switched to ${modelLabel} multimodal analysis...\n\n`);

      const responseStream = await generateContentStreamWithRetry(
        ai,
        {
          model: selectedVisionModel,
          contents: [
            {
              text: `${prompt}\n\nNote: Local deterministic parsing encountered a layout limit (${extractErrorReason}). Perform an exhaustive visual and structural extraction directly from the document provided.`,
            },
            {
              inlineData: {
                mimeType: fileType || "application/octet-stream",
                data: base64Data,
              },
            },
          ],
        },
        4,
        onRetry
      );

      for await (const chunk of responseStream) {
        res.write(chunk.text || "");
      }
      res.end();
    }
    // 4. Spreadsheet Files (Excel .xlsx, .xls, .csv)
    else if (
      fileType?.toLowerCase().includes("spreadsheet") ||
      fileType?.toLowerCase().includes("excel") ||
      fileType?.toLowerCase().includes("csv") ||
      fileName.toLowerCase().endsWith(".xlsx") ||
      fileName.toLowerCase().endsWith(".xls") ||
      fileName.toLowerCase().endsWith(".csv")
    ) {
      const buffer = Buffer.from(base64Data, "base64");
      let sheetsContent = "";
      let excelParseSuccess = false;
      let engineName = "XLSX Engine";

      // Step A: Attempt XLSX / CSV sheet parser directly
      try {
        if (fileName.toLowerCase().endsWith(".csv") || fileType?.toLowerCase().includes("csv")) {
          const csvText = buffer.toString("utf-8");
          const tableMd = convertCsvToMarkdownTable(csvText);
          if (tableMd.trim().length > 0) {
            sheetsContent = tableMd;
            excelParseSuccess = true;
            engineName = "CSV Table Parser";
          }
        } else {
          const workbook = XLSX.read(buffer, { type: "buffer" });
          let mdResult = `# ${fileName}\n\n`;
          for (const sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];
            const csvText = XLSX.utils.sheet_to_csv(worksheet);
            if (csvText.trim()) {
              mdResult += `### Sheet: ${sheetName}\n\n${convertCsvToMarkdownTable(csvText)}\n\n`;
            }
          }
          if (mdResult.trim().length > 20) {
            sheetsContent = mdResult.trim();
            excelParseSuccess = true;
            engineName = "XLSX Sheet Parser";
          }
        }
      } catch (xErr: any) {
        console.warn("XLSX parsing notice:", xErr);
      }

      // Step B: Attempt Firecrawl anydoc conversion if XLSX parser didn't yield result
      if (!excelParseSuccess) {
        try {
          const anydocRes = await convertWithAnydoc(buffer, fileName, fileType);
          if (anydocRes.success && anydocRes.markdown && anydocRes.markdown.trim().length > 10) {
            sheetsContent = anydocRes.markdown;
            excelParseSuccess = true;
            engineName = "Firecrawl Anydoc Engine";
          }
        } catch (anyErr) {
          // Fall back to Gemini
        }
      }

      if (excelParseSuccess && sheetsContent.trim().length > 0) {
        res.write(`> ⚡ **Fast Deterministic Spreadsheet Conversion**: Processed via ${engineName}\n\n`);
        res.write(sheetsContent);
        return res.end();
      }

      res.write(`> ⚠️ **Pipeline Fallback Switch**: Local sheet parser encountered a complex or encoded spreadsheet structure. Automatically switched to ${modelLabel} multimodal analysis...\n\n`);

      const responseStream = await generateContentStreamWithRetry(
        ai,
        {
          model: selectedVisionModel,
          contents: [
            {
              text: `${prompt}\n\nPerform a comprehensive tabular data extraction directly from the raw spreadsheet file provided.`,
            },
            {
              inlineData: {
                mimeType: fileType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                data: base64Data,
              },
            },
          ],
        },
        4,
        onRetry
      );

      for await (const chunk of responseStream) {
        res.write(chunk.text || "");
      }
      res.end();
    }
    // 5. HTML Files
    else if (
      fileType?.toLowerCase().includes("html") ||
      fileName.toLowerCase().endsWith(".html") ||
      fileName.toLowerCase().endsWith(".htm")
    ) {
      const textContent = Buffer.from(base64Data, "base64").toString("utf-8");
      const readability = extractCleanArticleHtml(textContent, {
        stripImages: conversionMode === "text-only",
        docTitle: fileName,
      });

      res.write(`> 📰 **Readability Content-Pruning Engine**: Filtered web markup (${readability.prunedElementCount} noise/ad elements pruned, ${readability.adBlocksRemoved} ads removed). Isolated ${readability.isArticleDetected ? "primary article container" : "content body"} (${readability.textWordCount} words).\n\n`);

      let pandocGfm = "";
      let pandocSuccess = false;

      try {
        const pandocResult = await convertHtmlToMarkdownPandoc(readability.cleanedHtml);
        if (pandocResult.markdown && pandocResult.markdown.trim().length > 0) {
          pandocGfm = pandocResult.markdown;
          pandocSuccess = true;
        }
      } catch (pErr) {
        // Fall back to Gemini
      }

      if (pandocSuccess && pandocGfm.trim().length > 0) {
        res.write(`> ⚡ **Fast Deterministic HTML Conversion**: Processed via Turndown GFM Engine\n\n`);
        if (readability.title && !pandocGfm.startsWith("# ")) {
          res.write(`# ${readability.title}\n\n`);
        }
        res.write(pandocGfm);
        return res.end();
      }

      res.write(`> ⚠️ **Pipeline Fallback Switch**: Deterministic HTML conversion encountered a layout constraint. Switched to ${modelLabel} analysis...\n\n`);

      const responseStream = await generateContentStreamWithRetry(
        ai,
        {
          model: selectedVisionModel,
          contents: [
            {
              text: `${prompt}\n\nPerform a deep structural extraction from the cleaned article HTML below:\n\n--- HTML SOURCE ---\n${readability.cleanedHtml}\n--- END HTML SOURCE ---`,
            },
          ],
        },
        4,
        onRetry
      );

      for await (const chunk of responseStream) {
        res.write(chunk.text || "");
      }
      res.end();
    }
    // 6. Plain Text / Markdown / JSON / XML
    else {
      const textContent = Buffer.from(base64Data, "base64").toString("utf-8");
      res.write(`> ⚡ **Fast Direct Document Parsing**: Raw text document loaded (${textContent.split(/\s+/).length} words)\n\n`);
      res.write(textContent);
      res.end();
    }
  } catch (error: any) {
    console.error("Conversion Error (attempting local fallback):", error);

    try {
      const localMd = await convertDocumentLocally(fileName, fileType, base64Data);
      if (localMd && localMd.trim()) {
        if (!res.headersSent) {
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
        }
        res.write(`> ⚠️ **Pipeline Fallback Switch**: Primary model stream encountered an error. Engaged local deterministic engine recovery converter...\n\n`);
        res.write(localMd);
        return res.end();
      }
    } catch (fallbackErr) {
      console.warn("Local fallback conversion failed:", fallbackErr);
    }

    const friendlyMsg = getFriendlyErrorMessage(error);
    if (!res.headersSent) {
      res.status(500).json({ error: friendlyMsg });
    } else {
      res.write(`\n\n> ❌ **Conversion Error**: ${friendlyMsg}`);
      res.end();
    }
  }
});

// Helper: SSRF validation delegated to unified urlValidator
function isSafeUrlForFetching(rawUrl: string): { safe: boolean; reason?: string; parsedUrl?: URL } {
  return validateSafeRemoteUrl(rawUrl);
}

// Endpoint: POST /api/fetch-url
router.post("/fetch-url", async (req, res) => {
  const { url, conversionMode, targetStyle, qualityThreshold, visionModel, customApiKey } = req.body;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Please provide a valid URL" });
  }

  const headerKey = (req.headers["x-gemini-api-key"] as string) || customApiKey;
  const selectedVisionModel = resolveVisionModel(visionModel);
  const modelLabel = getVisionModelDisplayName(selectedVisionModel);

  const urlCheck = isSafeUrlForFetching(url);
  if (!urlCheck.safe || !urlCheck.parsedUrl) {
    return res.status(400).json({ error: `URL security validation failed: ${urlCheck.reason}` });
  }

  // Set streaming response headers early so user receives immediate live status updates
  res.setHeader("Content-Type", "text/plain; charset=utf-8");

  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();

    // 1. Check obvious binary/document file extension from URL pathname
    const NON_HTML_EXTENSIONS: Record<string, string> = {
      ".pdf": "application/pdf",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".doc": "application/msword",
      ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ".ppt": "application/vnd.ms-powerpoint",
      ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".xls": "application/vnd.ms-excel",
      ".csv": "text/csv",
      ".json": "application/json",
      ".xml": "application/xml",
      ".txt": "text/plain",
      ".md": "text/markdown",
      ".rtf": "application/rtf",
      ".epub": "application/epub+zip",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
    };

    let matchedExt = Object.keys(NON_HTML_EXTENSIONS).find((ext) => pathname.endsWith(ext));
    let detectedContentType: string | null = matchedExt ? NON_HTML_EXTENSIONS[matchedExt] : null;

    // 2. If no explicit non-HTML extension, do a fast lightweight HEAD pre-flight request to inspect Content-Type
    if (!detectedContentType) {
      try {
        const headRes = await fetch(urlCheck.parsedUrl.toString(), {
          method: "HEAD",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8",
          },
          signal: AbortSignal.timeout(4000),
        });

        if (headRes.ok) {
          const rawCt = (headRes.headers.get("content-type") || "").toLowerCase().split(";")[0].trim();
          if (
            rawCt &&
            !rawCt.includes("text/html") &&
            !rawCt.includes("application/xhtml") &&
            rawCt !== "*/*" &&
            rawCt !== "text/plain"
          ) {
            detectedContentType = rawCt;
          }
        }
      } catch {
        // HEAD preflight failed or timed out; will proceed to route decision
      }
    }

    // 3. CHANNEL A: Direct Binary/Document Processing Channel (Non-HTML content: PDF, DOCX, XLSX, etc.)
    if (detectedContentType && !detectedContentType.includes("html")) {
      const fileName = url.split("/").pop()?.split("?")[0] || `document${matchedExt || ""}`;
      res.write(`> 📦 **Fast Direct Asset Channel**: Detected binary/document stream (${detectedContentType}). Bypassing headless browser...\n\n`);

      const binaryRes = await fetch(urlCheck.parsedUrl.toString(), {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept": "*/*",
        },
        signal: AbortSignal.timeout(20000),
      });

      if (!binaryRes.ok) {
        throw new Error(`Failed to download binary file. HTTP status ${binaryRes.status}`);
      }

      const arrayBuffer = await binaryRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64Data = buffer.toString("base64");

      res.write(`> 📄 **Downloaded**: ${(buffer.length / 1024).toFixed(1)} KB. Processing through document conversion engine...\n\n`);

      // Gemini Vision/Document synthesis first for PDFs when key is available and layout is complex
      const apiKey = getGeminiApiKey(headerKey);
      if (detectedContentType === "application/pdf" && apiKey) {
        const liteRes = await parsePdfWithLiteParse(buffer, fileName, typeof qualityThreshold === "number" ? qualityThreshold : 75);
        if (!liteRes.quality.requiresMultimodalVision && liteRes.markdown && liteRes.markdown.trim().length > 30) {
          res.write(liteRes.markdown);
          return res.end();
        }
        res.write(`> 🧠 **AI Document Vision Engine (${modelLabel})**: Reconstructing complex PDF layout and charts...\n\n`);
        const ai = createGeminiClient(apiKey);
        const pdfPrompt = buildComplexPdfSemanticPrompt({
          fileName,
          totalPages: liteRes.totalPages,
          qualityScore: liteRes.quality.qualityScore,
          threshold: typeof qualityThreshold === "number" ? qualityThreshold : 75,
          detectedColumns: liteRes.quality.detectedColumns,
          reasons: liteRes.quality.reasons,
          modeInstructions: "Include high-detail structural extraction, tables, and chart digitization.",
          styleInstructions: "Format as GitHub Flavored Markdown (GFM).",
          structuredMarkdown: liteRes.markdown,
          pdfTextReference: liteRes.rawText,
        });
        const responseStream = await generateContentStreamWithRetry(
          ai,
          {
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
          },
          3
        );
        for await (const chunk of responseStream) {
          res.write(chunk.text || "");
        }
        return res.end();
      }

      // Try local deterministic converter (liteparse / pdf-parse / mammoth / xlsx)
      const localConverted = await convertDocumentLocally(fileName, detectedContentType, base64Data);
      if (localConverted && localConverted.trim().length > 0) {
        res.write(localConverted);
        return res.end();
      }

      if (apiKey) {
        res.write(`> 🧠 **AI Document Vision Engine**: Processing document through ${modelLabel}...\n\n`);
        const ai = createGeminiClient(apiKey);
        const responseStream = await generateContentStreamWithRetry(
          ai,
          {
            model: selectedVisionModel,
            contents: [
              {
                text: `Convert this document into pristine, well-structured Markdown. Preserve tables, headers, lists, and data formatting. Source: ${url}`,
              },
              {
                inlineData: {
                  mimeType: detectedContentType === "application/pdf" ? "application/pdf" : "text/plain",
                  data: base64Data,
                },
              },
            ],
          },
          3
        );

        for await (const chunk of responseStream) {
          res.write(chunk.text || "");
        }
        return res.end();
      }

      // Plaintext fallback
      res.write(`\n\n# ${fileName}\n\n*Fetched from: [${url}](${url})*\n\n`);
      res.write(buffer.toString("utf-8"));
      return res.end();
    }

    // 4. CHANNEL B: Dynamic Web Headless Browser Channel (HTML web pages & Single Page Apps)
    res.write(`> 🌐 **Dynamic Web Page Channel**: Launching server headless browser for ${url}...\n\n`);

    const pageResult = await fetchRenderedPage(url, { timeoutMs: 15000 });
    const engineLabel =
      pageResult.renderedVia === "playwright"
        ? "Playwright Headless Chromium (Dynamic JS Execution)"
        : "High-Fidelity HTTP Stream";
    res.write(`> 🎭 **Dynamic DOM Rendered**: ${engineLabel} in ${pageResult.loadTimeMs}ms (HTTP ${pageResult.status})\n\n`);

    const rawHtml = pageResult.html;
    const isTextOnly = conversionMode === "text-only";
    const docTitle = pageResult.title || url.split("/").pop() || "Web Document";

    // Run Mozilla Readability Reader Mode Engine
    const readability = extractCleanArticleHtml(rawHtml, {
      sourceUrl: pageResult.finalUrl || url,
      stripImages: isTextOnly,
      docTitle: docTitle.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " "),
    });

    res.write(
      `> 📰 **Browser Reader Mode Pipeline**: Eliminated ${readability.prunedElementCount} clutter elements (${readability.adBlocksRemoved} ads/banners, headers, navbars, cookies, popups). Isolated ${
        readability.isArticleDetected ? "primary article body" : "clean article text"
      } (${readability.textWordCount} words, ~${readability.readingTimeMinutes} min read).\n\n`
    );

    const mdBody = readability.markdown?.trim() || "";

    // If Reader Mode engine yielded structured Markdown, write out clean structured document with metadata header
    if (mdBody) {
      res.write(`> ⚡ **Reader Mode Extraction Complete**: Processed via Mozilla Readability & GFM Engine\n\n`);

      let headerBlock = "";
      if (readability.title && !mdBody.startsWith("# ")) {
        headerBlock += `# ${readability.title}\n\n`;
      }

      const metaParts: string[] = [];
      if (readability.byline) metaParts.push(`**Author:** ${readability.byline}`);
      if (readability.publishedTime) metaParts.push(`**Date:** ${readability.publishedTime}`);
      if (readability.siteName) metaParts.push(`**Source:** ${readability.siteName}`);
      if (readability.readingTimeMinutes) metaParts.push(`**Read time:** ~${readability.readingTimeMinutes} min`);
      metaParts.push(`[Original Article](${url})`);

      if (metaParts.length > 0) {
        headerBlock += `*${metaParts.join(" • ")}*\n\n`;
      }

      if (readability.excerpt && !mdBody.includes(readability.excerpt)) {
        headerBlock += `> *${readability.excerpt}*\n\n`;
      }

      headerBlock += `---\n\n`;

      res.write(headerBlock + mdBody);
      return res.end();
    }

    // Fallback to Gemini if deterministic reader yielded empty content
    const apiKey = getGeminiApiKey(headerKey);
    if (apiKey) {
      res.write(`> ⚠️ **Pipeline Fallback Switch**: Running ${modelLabel} layout synthesis on pruned HTML...\n\n`);
      const ai = createGeminiClient(apiKey);
      const responseStream = await generateContentStreamWithRetry(
        ai,
        {
          model: selectedVisionModel,
          contents: [
            {
              text: `Extract this cleaned article HTML into well-structured Markdown. Omit any remaining navigation or ads.\n\nURL: ${url}\n\n${readability.cleanedHtml}`,
            },
          ],
        },
        3
      );
      for await (const chunk of responseStream) {
        res.write(chunk.text || "");
      }
      return res.end();
    }

    res.write(`\n\n# ${docTitle}\n\n*Fetched from: [${url}](${url})*\n\n`);
    res.write(rawHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
    return res.end();
  } catch (err: any) {
    console.error("URL Fetch error:", err);
    if (!res.headersSent) {
      return res.status(500).json({ error: err?.message || "Failed to download content from the specified URL." });
    } else {
      res.write(`\n\n> ❌ **URL Fetch Error**: ${err?.message || "Failed to download content."}\n`);
      return res.end();
    }
  }
});

// Endpoint: POST /api/site-discover
// Performs Phase 1 Site Discovery: analyzes robots.txt, llms.txt, and sitemaps
router.post("/site-discover", async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Please provide a valid domain URL" });
  }

  const urlCheck = isSafeUrlForFetching(url);
  if (!urlCheck.safe || !urlCheck.parsedUrl) {
    return res.status(400).json({ error: `URL security validation failed: ${urlCheck.reason}` });
  }

  try {
    const report = await discoverDomainArchitecture(url);
    return res.json({ success: true, report });
  } catch (err: any) {
    console.error("Site discovery error:", err);
    return res.status(500).json({
      success: false,
      error: err?.message || "Failed to perform site discovery inspection",
    });
  }
});

// Endpoint: POST /api/crawl
// Phase 2: AI-Guided Semantic Recursive Crawler for OKF Knowledge Bases
router.post("/crawl", async (req, res) => {
  const { seedUrl, maxDepth, maxPages, pathPrefixLock, semanticFocusPrompt, customApiKey } = req.body;

  if (!seedUrl || typeof seedUrl !== "string") {
    return res.status(400).json({ error: "Please provide a valid seed URL" });
  }

  const urlCheck = isSafeUrlForFetching(seedUrl);
  if (!urlCheck.safe || !urlCheck.parsedUrl) {
    return res.status(400).json({ error: `Seed URL security validation failed: ${urlCheck.reason}` });
  }

  const headerKey = (req.headers["x-gemini-api-key"] as string) || customApiKey;
  const apiKey = getGeminiApiKey(headerKey);

  // Set SSE streaming headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const sendSSE = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    sendSSE("status", { message: `Initializing semantic crawler for seed: ${seedUrl}...` });

    const kbResult = await executeSemanticCrawl({
      seedUrl,
      maxDepth: typeof maxDepth === "number" ? Math.min(Math.max(1, maxDepth), 4) : 2,
      maxPages: typeof maxPages === "number" ? Math.min(Math.max(1, maxPages), 30) : 12,
      pathPrefixLock: pathPrefixLock !== false,
      semanticFocusPrompt: semanticFocusPrompt || undefined,
      apiKey: apiKey || process.env.GEMINI_API_KEY || "",
      onProgress: (progressEvent) => {
        sendSSE("progress", progressEvent);
      },
    });

    sendSSE("result", { success: true, kbResult });
    return res.end();
  } catch (err: any) {
    console.error("Semantic Crawl Error:", err);
    sendSSE("crawl_error", { error: err?.message || "Failed to complete recursive semantic crawl." });
    return res.end();
  }
});

// Endpoint: GET /api/extract/presets
// Returns available JSON Schema extraction templates
router.get("/extract/presets", (req, res) => {
  res.json({ success: true, presets: EXTRACTION_PRESETS });
});

// Endpoint: POST /api/extract
// Phase 3: Strict JSON Schema Structured Extraction
router.post("/extract", async (req, res) => {
  const { content, url, jsonSchema, extractionPrompt, presetId, customApiKey } = req.body;

  if (!content && !url) {
    return res.status(400).json({ error: "Please provide either 'content' (markdown/text) or a 'url' to extract from." });
  }

  if (url) {
    const urlCheck = isSafeUrlForFetching(url);
    if (!urlCheck.safe) {
      return res.status(400).json({ error: `URL security validation failed: ${urlCheck.reason}` });
    }
  }

  const headerKey = (req.headers["x-gemini-api-key"] as string) || customApiKey;
  const apiKey = getGeminiApiKey(headerKey);

  try {
    const result = await executeStrictJsonExtraction({
      content,
      url,
      jsonSchema,
      extractionPrompt,
      presetId,
      apiKey: apiKey || process.env.GEMINI_API_KEY || "",
    });

    return res.json({ success: true, result });
  } catch (err: any) {
    console.error("Schema Extraction Error:", err);
    return res.status(500).json({
      success: false,
      error: err?.message || "Failed to perform structured schema extraction.",
    });
  }
});

// Endpoint: POST /api/map
// Phase 3: Sitemap URL Extraction & Hierarchy Mapping
router.post("/map", async (req, res) => {
  const { domainOrSitemapUrl, maxUrls, filterPrefix, filterExtension, searchKeyword } = req.body;

  if (!domainOrSitemapUrl || typeof domainOrSitemapUrl !== "string") {
    return res.status(400).json({ error: "Please provide a valid domain or sitemap.xml URL" });
  }

  const urlCheck = isSafeUrlForFetching(domainOrSitemapUrl);
  if (!urlCheck.safe) {
    return res.status(400).json({ error: `Domain/Sitemap URL security validation failed: ${urlCheck.reason}` });
  }

  try {
    const mapResult = await executeSiteMapExtraction({
      domainOrSitemapUrl,
      maxUrls: typeof maxUrls === "number" ? Math.min(Math.max(10, maxUrls), 2000) : 500,
      filterPrefix,
      filterExtension,
      searchKeyword,
    });

    return res.json({ success: true, mapResult });
  } catch (err: any) {
    console.error("Sitemap Extraction Error:", err);
    return res.status(500).json({
      success: false,
      error: err?.message || "Failed to extract sitemap and URL hierarchy.",
    });
  }
});

// Endpoint: POST /api/batch-scrape
// Phase 4: High-Performance Multi-URL Batch Scraping & Corpus Compilation
router.post("/batch-scrape", async (req, res) => {
  const { urls, concurrency, docStyle, cleanClutter } = req.body;

  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: "Please provide an array of URLs to scrape in batch." });
  }

  // Cap batch limit at 50 URLs per request to ensure server stability
  const targetUrls = urls.slice(0, 50);

  try {
    const result = await executeBatchUrlScrape({
      urls: targetUrls,
      concurrency: typeof concurrency === "number" ? Math.min(Math.max(1, concurrency), 8) : 3,
      docStyle: docStyle || "standard",
      cleanClutter: cleanClutter !== false,
    });

    return res.json({ success: true, result });
  } catch (err: any) {
    console.error("Batch Scrape Error:", err);
    return res.status(500).json({
      success: false,
      error: err?.message || "Failed to execute batch URL scraping.",
    });
  }
});

// Endpoint: POST /api/search-scrape
// Phase 4: AI Search Grounding & Deep Scrape Synthesis
router.post("/search-scrape", async (req, res) => {
  const { query, domainFilter, maxSources, customApiKey } = req.body;

  if (!query || typeof query !== "string" || !query.trim()) {
    return res.status(400).json({ error: "Please provide a valid research search query." });
  }

  const headerKey = (req.headers["x-gemini-api-key"] as string) || customApiKey;
  const apiKey = getGeminiApiKey(headerKey);

  try {
    const result = await executeSearchAndScrape({
      query: query.trim(),
      domainFilter: domainFilter?.trim() || undefined,
      maxSources: typeof maxSources === "number" ? Math.min(Math.max(1, maxSources), 8) : 4,
      apiKey: apiKey || process.env.GEMINI_API_KEY || "",
    });

    return res.json({ success: true, result });
  } catch (err: any) {
    console.error("Search & Scrape Error:", err);
    return res.status(500).json({
      success: false,
      error: err?.message || "Failed to execute search grounding & deep scrape synthesis.",
    });
  }
});

export default router;
