import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import {
  getGeminiApiKey,
  getFriendlyErrorMessage,
  generateContentStreamWithRetry,
  generateContentWithRetry
} from "../utils/geminiService";
import { extractPdfPageByPageText, inspectPdfPreflight } from "../utils/pdfUtils";
import { convertDocumentLocally, preProcessHtml, convertHtmlToMarkdownBasic, convertCsvToMarkdownTable } from "../utils/localConverter";
import { isPandocAvailable, convertWithPandocCLI, convertHtmlToMarkdownPandoc } from "../utils/pandocEngine";
import { convertWithAnydoc } from "../utils/anydocEngine";
import { parsePageChunks, createSlidingWindows } from "../utils/slidingWindow";
import { parsePdfWithLiteParse } from "../utils/liteparseEngine";
import { extractCleanArticleHtml } from "../utils/readabilityExtractor";

const router = Router();

// Endpoint: POST /api/spatial-inspect
// Provides spatial 2D layout coordinates, bounding boxes, and quality assessment diagnostics
router.post("/spatial-inspect", async (req, res) => {
  try {
    const { fileName, fileType, base64Data, qualityThreshold } = req.body;

    if (!base64Data) {
      return res.status(400).json({ error: "No base64 document data provided" });
    }

    const buffer = Buffer.from(base64Data, "base64");
    const threshold = typeof qualityThreshold === "number" ? qualityThreshold : 75;

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

// Endpoint: POST /api/convert
router.post("/convert", async (req, res) => {
  const { fileName, fileType, base64Data, conversionMode, targetStyle, qualityThreshold, customApiKey } = req.body;

  if (!base64Data) {
    return res.status(400).json({ error: "No base64 file data provided" });
  }

  const headerKey = (req.headers["x-gemini-api-key"] as string) || customApiKey;
  const threshold = typeof qualityThreshold === "number" ? qualityThreshold : 75;
  const apiKey = getGeminiApiKey(headerKey);

  // If GEMINI_API_KEY is not set, convert locally directly
  if (!apiKey) {
    const localResult = await convertDocumentLocally(fileName, fileType, base64Data);
    if (localResult !== null) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.write(localResult);
      return res.end();
    }
    return res.status(500).json({
      error: "Gemini API key is not configured and local conversion is unavailable for this format.",
    });
  }

  const ai = new GoogleGenAI({ apiKey });

  let modeInstructions = "";
  if (conversionMode === "rich") {
    modeInstructions = "Include high-detail structural extraction, extra callouts, diagrams, key points, tables, and full context summaries.";
  } else if (conversionMode === "text-only") {
    modeInstructions = "Focus strictly on extractable text content, omitting visual layouts or decorative figures.";
  } else {
    modeInstructions = "Standard faithful document conversion preserve structural accuracy.";
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
5. If the source contains tables, format them properly in clean Markdown tables with aligned columns.
6. If the source contains images with text or diagrams, attempt to describe them or extract their textual details in blockquotes or captions.
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

    // 1. PDF Files - Phase 1 LiteParse Spatial Extraction & Quality Assessment Threshold
    if (fileType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
      res.write(`> 🛰️ [Server Stage 1/3] LiteParse Spatial Engine inspecting ${fileName} (Quality Threshold: ${threshold}/100)...\n\n`);

      const buffer = Buffer.from(base64Data, "base64");

      // Execute LiteParse Spatial Grid Extraction
      const liteParseResult = await parsePdfWithLiteParse(buffer, fileName, threshold);
      const { quality, totalPages, pages, markdown: liteParseMd, rawText } = liteParseResult;

      const totalPagesCount = totalPages;
      const pdfTextReference = rawText || pages.map(p => p.text).join("\n\n");
      const structuredMarkdown = liteParseMd;

      res.write(`> 🛰️ [Server Stage 2/3] LiteParse Spatial Quality Score: ${quality.qualityScore}/100 (${quality.isSatisfactory ? "Satisfactory" : "Below Threshold"} - ${quality.reasons.join("; ")}).\n\n`);

      // DETERMINISTIC FAST-PATH EVALUATION:
      // If quality is satisfactory (score >= threshold) OR user selected text-only conversion
      if (
        (quality.isSatisfactory || conversionMode === "text-only") &&
        structuredMarkdown &&
        structuredMarkdown.trim().length > 30
      ) {
        res.write(`> ⚡ **LiteParse Fast-Path Executed**: High-fidelity local spatial parsing complete (${quality.detectedColumns} detected columns, ${quality.wordCount} words, ${liteParseResult.executionTimeMs}ms)\n\n`);
        res.write(structuredMarkdown);
        return res.end();
      }

      // ESCALATION TO GEMINI 3.6 FLASH:
      // Triggered if quality score < threshold or complex multimodal visual layout detected
      res.write(`> ⚠️ **Quality Escalation Protocol Activated**: Local score ${quality.qualityScore}/100 below threshold ${threshold}/100 (${quality.reasons[0]}). Escalating to Gemini 3.6 Flash multimodal engine with spatial grounding anchor...\n\n`);

      const pdfDocPart = {
        inlineData: {
          mimeType: "application/pdf",
          data: base64Data,
        },
      };

      const pageChunks = parsePageChunks(pdfTextReference);
      // Create sliding windows with 4-page window size and 1-page overlap for multi-page documents (> 4 pages)
      const slidingWindows = createSlidingWindows(pageChunks, 4, 1);

      // Branch A: Multi-Page Documents (> 4 pages) -> Multi-Window Sliding Pipeline
      if (totalPagesCount > 4 && slidingWindows.length > 1) {
        res.write(`> 🧬 **Phase 2B Multimodal Hybrid Pipeline Activated** (${totalPagesCount} Pages -> ${slidingWindows.length} Overlapping 4-Page Windows)\n`);
        res.write(`> 🪟 **Sliding Window Engine**: Processing in 4-page windows to guarantee sub-3-second streaming latency and eliminate truncation.\n\n`);

        let previousTailContext = "";

        for (const win of slidingWindows) {
          res.write(`> 🪟 [Window ${win.windowIndex + 1}/${win.totalWindows}] Processing Pages ${win.startPage}–${win.endPage}...\n\n`);

          const windowPrompt = `You are converting Pages ${win.startPage} to ${win.endPage} of a ${totalPagesCount}-page PDF document (Window ${win.windowIndex + 1}/${win.totalWindows}).
Your objective is to extract these pages into clean, accurate, loss-free Markdown.

FILE NAME: ${fileName}
WINDOW RANGE: Pages ${win.startPage} through ${win.endPage} of ${totalPagesCount}
LITEPARSE QUALITY SCORE: ${quality.qualityScore}/100

${previousTailContext ? `CONTINUITY CONTEXT FROM PREVIOUS WINDOW (Do NOT duplicate headers or completed tables):
--- PREVIOUS TAIL ANCHOR ---
${previousTailContext}
--- END PREVIOUS TAIL ANCHOR ---
` : ""}

UNIVERSAL EXTRACTION PROTOCOL:
1. Reconstruct reading order faithfully (main text, sidebars, multi-column tables).
2. If a table started in the previous window and continues onto these pages, append rows cleanly to the table structure.
3. Output raw Markdown directly without wrapping in \`\`\`markdown code blocks.

${modeInstructions}
${styleInstructions}

--- EXTRACTED PAGE MANIFEST FOR WINDOW ${win.windowIndex + 1} (PAGES ${win.startPage}-${win.endPage}) ---
${win.pagesText}
--- END WINDOW MANIFEST ---`;

          try {
            startHeartbeat(`Awaiting Gemini 3.6 Flash inference for Window ${win.windowIndex + 1}/${win.totalWindows} (Pages ${win.startPage}-${win.endPage})`);

            const windowStream = await generateContentStreamWithRetry(
              ai,
              {
                model: "gemini-3.6-flash",
                contents: {
                  parts: [pdfDocPart, { text: windowPrompt }],
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

      // Branch B: Standard Short Documents (<= 4 pages) -> Full Single-Pass Multimodal Pipeline
      res.write(`> 🧬 **Phase 2B Multimodal Hybrid Pipeline Activated**: Triggered by LiteParse Quality Assessment (Score: ${quality.qualityScore}/100, Threshold: ${threshold}/100 - ${quality.reasons.join("; ")})\n\n`);

      const pageInfoPrompt = totalPagesCount > 0 
        ? `CRITICAL MANDATE: THIS PDF CONTAINS EXACTLY ${totalPagesCount} TOTAL PAGES.` 
        : `CRITICAL MANDATE: THIS IS A MULTI-PAGE PDF DOCUMENT.`;

      const pdfPrompt = `You are an advanced visual document-to-Markdown parser operating as the Phase 2B Multimodal Engine in a hybrid architecture.
Your objective is to perform a COMPLETE, LOSS-FREE, FULL-LENGTH conversion of this entire PDF document into clean, beautifully formatted Markdown.

FILE NAME: ${fileName}
${pageInfoPrompt}
LITEPARSE SPATIAL QUALITY SCORE: ${quality.qualityScore}/100 (Threshold: ${threshold}/100)
LAYOUT COMPLEXITY SIGNALS: ${quality.reasons.join("; ")}

UNIVERSAL HYBRID EXTRACTION PROTOCOL:

1. VISUAL LAYOUT & MULTI-COLUMN UNWRAPPING:
   - Identify multi-column layouts (${quality.detectedColumns} detected), sidebars, margin callout cards, headers, footers, and complex nested table grids.
   - Reconstruct reading order faithfully (main narrative column -> secondary sidebar -> inline callouts).
2. MATHEMATICAL & LATEX NOTATION:
   - Render all inline math expressions as $...$ and display equations as $$...$$.
3. EXHAUSTIVE PAGE COVERAGE:
   - Iterate page by page from Page 1 through Page ${totalPagesCount || 'N'}.
   - Do NOT truncate, summarize, or skip any page or section.
4. STRICT OUTPUT FORMATTING:
   - Output raw Markdown directly without starting or ending code fences (\`\`\`markdown).

${modeInstructions}
${styleInstructions}

${structuredMarkdown ? `Below is the deterministic spatial text & structural anchor extracted via Phase 1 LiteParse across all ${totalPagesCount} pages to ground your multimodal vision:\n\n--- DETERMINISTIC SPATIAL STRUCTURAL ANCHOR ---\n${structuredMarkdown}\n--- END STRUCTURAL ANCHOR ---\n\n` : ''}${pdfTextReference ? `Below is the raw page-by-page text manifest across all ${totalPagesCount} pages:\n\n--- EXTRACTED PAGE MANIFEST (${totalPagesCount} PAGES) ---\n${pdfTextReference}\n--- END MANIFEST ---` : ''}`;

      try {
        startHeartbeat(`Awaiting Gemini 3.6 Flash multimodal vision inference for ${fileName}`);

        const responseStream = await generateContentStreamWithRetry(
          ai,
          {
            model: "gemini-3.6-flash",
            contents: {
              parts: [pdfDocPart, { text: pdfPrompt }],
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
          model: "gemini-3.6-flash",
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
      res.write(`> ⚠️ **Pipeline Fallback Switch**: Local deterministic engine encountered an encrypted or complex layout (${extractErrorReason || "Non-standard document encoding"}). Automatically switched to Gemini 3.6 Flash multimodal analysis...\n\n`);

      const responseStream = await generateContentStreamWithRetry(
        ai,
        {
          model: "gemini-3.6-flash",
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

      res.write(`> ⚠️ **Pipeline Fallback Switch**: Local sheet parser encountered a complex or encoded spreadsheet structure. Automatically switched to Gemini 3.6 Flash multimodal analysis...\n\n`);

      const responseStream = await generateContentStreamWithRetry(
        ai,
        {
          model: "gemini-3.6-flash",
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

      res.write(`> ⚠️ **Pipeline Fallback Switch**: Deterministic HTML conversion encountered a layout constraint. Switched to Gemini 3.6 Flash analysis...\n\n`);

      const responseStream = await generateContentStreamWithRetry(
        ai,
        {
          model: "gemini-3.6-flash",
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

// Helper: SSRF validation to block loopback, link-local, private IP spaces, and non-http/https protocols
function isSafeUrlForFetching(rawUrl: string): { safe: boolean; reason?: string; parsedUrl?: URL } {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { safe: false, reason: "Only HTTP and HTTPS protocols are permitted." };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block localhost, loopback, and standard private hostnames
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "0.0.0.0" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal")
    ) {
      return { safe: false, reason: "Access to loopback or local hostnames is prohibited." };
    }

    // Block Cloud metadata endpoints (AWS, GCP, Azure metadata: 169.254.169.254 / metadata.google.internal)
    if (hostname === "169.254.169.254" || hostname === "metadata.google.internal") {
      return { safe: false, reason: "Access to cloud metadata services is prohibited." };
    }

    // Check for private IPv4 ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8)
    const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const [_, o1, o2] = ipv4Match.map(Number);
      if (
        o1 === 10 || // 10.0.0.0/8
        o1 === 127 || // 127.0.0.0/8
        o1 === 0 || // 0.0.0.0/8
        (o1 === 172 && o2 >= 16 && o2 <= 31) || // 172.16.0.0/12
        (o1 === 192 && o2 === 168) || // 192.168.0.0/16
        (o1 === 169 && o2 === 254) // 169.254.0.0/16 Link-Local
      ) {
        return { safe: false, reason: "Access to private or link-local IP addresses is prohibited." };
      }
    }

    return { safe: true, parsedUrl: parsed };
  } catch {
    return { safe: false, reason: "Malformed URL format." };
  }
}

// Endpoint: POST /api/fetch-url
router.post("/fetch-url", async (req, res) => {
  const { url, conversionMode, targetStyle, qualityThreshold, customApiKey } = req.body;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Please provide a valid URL" });
  }

  const headerKey = (req.headers["x-gemini-api-key"] as string) || customApiKey;

  const urlCheck = isSafeUrlForFetching(url);
  if (!urlCheck.safe || !urlCheck.parsedUrl) {
    return res.status(400).json({ error: `URL security validation failed: ${urlCheck.reason}` });
  }

  try {
    const fetchRes = await fetch(urlCheck.parsedUrl.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8",
      },
    });

    if (!fetchRes.ok) {
      throw new Error(`Failed to fetch URL. HTTP status ${fetchRes.status}`);
    }

    const contentType = fetchRes.headers.get("content-type") || "";
    const arrayBuffer = await fetchRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Data = buffer.toString("base64");

    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    let fileName = pathname.split("/").pop() || "web_document";
    if (!fileName.includes(".")) {
      if (contentType.includes("pdf")) fileName += ".pdf";
      else if (contentType.includes("html")) fileName += ".html";
      else if (contentType.includes("json")) fileName += ".json";
      else fileName += ".txt";
    }

    let fileType = contentType.split(";")[0].trim().toLowerCase();
    if (!fileType || fileType === "*/*") {
      if (fileName.endsWith(".pdf")) fileType = "application/pdf";
      else if (fileName.endsWith(".html") || fileName.endsWith(".htm")) fileType = "text/html";
      else fileType = "text/plain";
    }

    // Set streaming headers for client reader
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.write(`> 🌐 **URL Stream Ingestion**: Successfully fetched ${url} (${(buffer.length / 1024).toFixed(1)} KB, Content-Type: ${fileType})\n\n`);

    // 1. Process HTML with Readability content-pruning filter
    if (fileType.includes("html") || fileName.endsWith(".html") || fileName.endsWith(".htm")) {
      const rawHtml = buffer.toString("utf-8");
      const isTextOnly = conversionMode === "text-only";
      const readability = extractCleanArticleHtml(rawHtml, {
        stripImages: isTextOnly,
        docTitle: fileName.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " "),
      });

      res.write(`> 📰 **Readability Content-Pruning Filter**: Eliminated ${readability.prunedElementCount} clutter elements (${readability.adBlocksRemoved} ads/banners, headers, navbars, cookies, popups). Isolated ${readability.isArticleDetected ? "primary article container" : "clean article text"} (${readability.textWordCount} words).\n\n`);

      let mdBody = "";
      try {
        const pandocRes = await convertHtmlToMarkdownPandoc(readability.cleanedHtml);
        if (pandocRes.markdown && pandocRes.markdown.trim().length > 0) {
          mdBody = pandocRes.markdown.trim();
        }
      } catch (pErr) {
        console.warn("Turndown conversion notice for URL:", pErr);
      }

      // If Turndown yielded markdown, write out clean structured document with metadata header
      if (mdBody) {
        res.write(`> ⚡ **Fast Deterministic Article Extraction**: Processed via Readability GFM Engine\n\n`);
        
        let headerBlock = "";
        if (readability.title && !mdBody.startsWith("# ")) {
          headerBlock += `# ${readability.title}\n\n`;
        }
        if (readability.byline || readability.publishedTime || url) {
          const metaParts: string[] = [];
          if (readability.byline) metaParts.push(`**Author:** ${readability.byline}`);
          if (readability.publishedTime) metaParts.push(`**Date:** ${readability.publishedTime}`);
          if (readability.siteName) metaParts.push(`**Source:** ${readability.siteName}`);
          metaParts.push(`[Original URL](${url})`);
          headerBlock += `*${metaParts.join(" • ")}*\n\n---\n\n`;
        }

        res.write(headerBlock + mdBody);
        return res.end();
      }

      // Fallback to Gemini if Turndown yielded empty content
      const apiKey = getGeminiApiKey(headerKey);
      if (apiKey) {
        res.write(`> ⚠️ **Pipeline Fallback Switch**: Running Gemini 3.6 Flash layout synthesis on pruned HTML...\n\n`);
        const ai = new GoogleGenAI({ apiKey });
        const responseStream = await generateContentStreamWithRetry(
          ai,
          {
            model: "gemini-3.6-flash",
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
    }

    // 2. Process non-HTML or binary document formats from URL
    const localConverted = await convertDocumentLocally(fileName, fileType, base64Data);
    if (localConverted && localConverted.trim().length > 0) {
      res.write(localConverted);
      return res.end();
    }

    res.write(`\n\n# ${fileName}\n\n*Fetched from: [${url}](${url})*\n\n`);
    res.write(buffer.toString("utf-8"));
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

export default router;
