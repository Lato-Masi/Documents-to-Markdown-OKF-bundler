import { GoogleGenAI, ThinkingLevel } from "@google/genai";

export type VisionModelType = "gemini-3.8-flash" | "gemini-4-argon";
export const DEFAULT_VISION_MODEL: VisionModelType = "gemini-3.8-flash";

export function resolveVisionModel(requested?: string): VisionModelType {
  if (requested === "gemini-4-argon" || requested === "gemini-pro" || requested === "pro") {
    return "gemini-4-argon";
  }
  return "gemini-3.8-flash";
}

export function getVisionModelDisplayName(model: string): string {
  if (model === "gemini-4-argon") {
    return "Gemini 4 Pro (gemini-4-argon)";
  }
  if (model === "gemini-3.8-flash-lite") {
    return "Gemini 3.8 Flash Lite";
  }
  return "Gemini 3.8 Flash";
}

// Create standardized GoogleGenAI client with required User-Agent header
export function createGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Get cleaned GEMINI_API_KEY from custom user override, request header, or server environment
export function getGeminiApiKey(customKey?: string): string {
  const rawKey = customKey || process.env.GEMINI_API_KEY || "";
  return rawKey.trim().replace(/^["']|["']$/g, "");
}

// Strip legacy sampling parameters (temperature, topP, topK) that are unsupported on Gemini 3+ / 4 models
function sanitizeModelConfig(config?: any, enableHighThinking = false): any {
  const cleaned: Record<string, any> = {};
  if (config && typeof config === "object") {
    for (const [key, val] of Object.entries(config)) {
      if (key !== "temperature" && key !== "topP" && key !== "topK") {
        cleaned[key] = val;
      }
    }
  }
  if (enableHighThinking && !cleaned.thinkingConfig) {
    cleaned.thinkingConfig = {
      thinkingLevel: ThinkingLevel.HIGH,
    };
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

// Extract a simplified, action-oriented error message from a raw Gemini API error
export function getFriendlyErrorMessage(error: any): string {
  let msg = error?.message || String(error);
  for (let i = 0; i < 3; i++) {
    try {
      if (typeof msg === "string" && (msg.trim().startsWith("{") || msg.trim().startsWith("["))) {
        const parsed = JSON.parse(msg.trim());
        if (parsed?.error?.message) {
          msg = parsed.error.message;
        } else if (parsed?.message) {
          msg = parsed.message;
        }
      }
    } catch (_) {
      break;
    }
  }

  const fullErrStr = typeof error === "object" ? JSON.stringify(error || {}) : String(error);

  if (
    msg.includes("API_KEY_INVALID") ||
    msg.includes("API key not valid") ||
    (msg.includes("INVALID_ARGUMENT") && msg.includes("API key")) ||
    fullErrStr.includes("API_KEY_INVALID") ||
    fullErrStr.includes("API key not valid")
  ) {
    return "Gemini API Key rejected by Google servers. Please check Settings > Secrets or Bring Your Own Key to ensure your GEMINI_API_KEY is valid.";
  }
  if (
    msg.includes("503") ||
    msg.includes("UNAVAILABLE") ||
    msg.includes("high demand") ||
    msg.includes("temporary") ||
    msg.includes("Service Unavailable")
  ) {
    return "High demand detected on primary conversion model (503 Service Unavailable). Automatically retried via fallback model pipeline.";
  }
  if (msg.includes("429") || msg.includes("quota") || msg.includes("Rate limit")) {
    return "Rate limit exceeded or temporary API quota reached. Please try again in a few seconds.";
  }
  return msg;
}

function getNextFallbackModel(currentModel: string): string {
  if (currentModel === "gemini-4-argon") return "gemini-3.8-flash";
  if (currentModel === "gemini-3.8-flash") return "gemini-2.5-pro";
  if (currentModel === "gemini-2.5-pro") return "gemini-2.5-flash";
  return "gemini-2.5-flash";
}

// Robust wrapper with automatic exponential backoff retry and multi-model compatibility fallback
export async function generateContentStreamWithRetry(
  ai: GoogleGenAI,
  params: {
    model: string;
    contents: any;
    config?: any;
  },
  maxRetries = 4,
  onRetry?: (attempt: number, delayMs: number, errStr: string, activeModel: string) => void
) {
  let attempt = 0;
  let activeModel = params.model || DEFAULT_VISION_MODEL;
  const sanitizedConfig = sanitizeModelConfig(params.config);

  while (attempt < maxRetries) {
    try {
      return await ai.models.generateContentStream({
        model: activeModel,
        contents: params.contents,
        ...(sanitizedConfig ? { config: sanitizedConfig } : {}),
      });
    } catch (err: any) {
      attempt++;
      const rawMsg = err?.message || String(err);
      const friendlyMsg = getFriendlyErrorMessage(err);
      const isModelOrTransientError =
        rawMsg.includes("503") ||
        rawMsg.includes("UNAVAILABLE") ||
        rawMsg.includes("429") ||
        rawMsg.includes("high demand") ||
        rawMsg.includes("overloaded") ||
        rawMsg.includes("Service Unavailable") ||
        rawMsg.includes("NOT_FOUND") ||
        rawMsg.includes("not found") ||
        rawMsg.includes("404") ||
        rawMsg.includes("permission") ||
        rawMsg.includes("not supported");

      if (isModelOrTransientError && attempt < maxRetries) {
        activeModel = getNextFallbackModel(activeModel);
        const delayMs = Math.min(attempt * 800, 2000);
        console.warn(
          `[Gemini Stream Retry ${attempt}/${maxRetries}] Switching from ${params.model} to ${activeModel}. Waiting ${delayMs}ms...`
        );
        if (onRetry) {
          onRetry(attempt, delayMs, friendlyMsg, activeModel);
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        throw err;
      }
    }
  }
  throw new Error("Maximum retry attempts reached for model generation stream.");
}

export async function generateContentWithRetry(
  ai: GoogleGenAI,
  params: {
    model: string;
    contents: any;
    config?: any;
  },
  maxRetries = 4,
  onRetry?: (attempt: number, delayMs: number, errStr: string, activeModel: string) => void
) {
  let attempt = 0;
  let activeModel = params.model || DEFAULT_VISION_MODEL;
  const sanitizedConfig = sanitizeModelConfig(params.config);

  while (attempt < maxRetries) {
    try {
      return await ai.models.generateContent({
        model: activeModel,
        contents: params.contents,
        ...(sanitizedConfig ? { config: sanitizedConfig } : {}),
      });
    } catch (err: any) {
      attempt++;
      const rawMsg = err?.message || String(err);
      const friendlyMsg = getFriendlyErrorMessage(err);
      const isModelOrTransientError =
        rawMsg.includes("503") ||
        rawMsg.includes("UNAVAILABLE") ||
        rawMsg.includes("429") ||
        rawMsg.includes("high demand") ||
        rawMsg.includes("overloaded") ||
        rawMsg.includes("Service Unavailable") ||
        rawMsg.includes("NOT_FOUND") ||
        rawMsg.includes("not found") ||
        rawMsg.includes("404") ||
        rawMsg.includes("permission") ||
        rawMsg.includes("not supported");

      if (isModelOrTransientError && attempt < maxRetries) {
        activeModel = getNextFallbackModel(activeModel);
        const delayMs = Math.min(attempt * 800, 2000);
        console.warn(
          `[Gemini Retry ${attempt}/${maxRetries}] Switching from ${params.model} to ${activeModel}. Waiting ${delayMs}ms...`
        );
        if (onRetry) {
          onRetry(attempt, delayMs, friendlyMsg, activeModel);
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        throw err;
      }
    }
  }
  throw new Error("Maximum retry attempts reached for model generation.");
}

/**
 * Builds the specialized Semantic Relationship & Visual Layout Reconstruction Prompt
 * for complex PDFs (multi-column grids, callout sidebars, embedded bar/line charts,
 * cross-column continuation paragraphs, thematic building-block sub-sections, and attributed quotes).
 */
export function buildComplexPdfSemanticPrompt(options: {
  fileName: string;
  totalPages: number;
  qualityScore: number;
  threshold: number;
  detectedColumns: number;
  reasons: string[];
  modeInstructions: string;
  styleInstructions: string;
  structuredMarkdown?: string;
  pdfTextReference?: string;
}): string {
  const {
    fileName,
    totalPages,
    qualityScore,
    threshold,
    detectedColumns,
    reasons,
    modeInstructions,
    styleInstructions,
    structuredMarkdown,
    pdfTextReference,
  } = options;

  return `You are an elite Multimodal Document Layout & Semantic Relationship Reconstruction Engine.
Inspect the attached PDF visually page-by-page alongside the spatial text anchor below, and convert the entire document into clean, hierarchical, semantically faithful GitHub-Flavored Markdown (GFM).

DOCUMENT METADATA:
- File Name: ${fileName}
- Total Pages: ${totalPages || "Multi-page"}
- LiteParse Spatial Score: ${qualityScore}/100 (Threshold: ${threshold}/100)
- Detected Column Grid: ${detectedColumns}-Column Visual Layout
- Detected Structural Signals: ${reasons.join("; ")}

CRITICAL SEMANTIC RELATIONSHIP & VISUAL LAYOUT RULES:

1. TRUE VISUAL READING ORDER & CROSS-COLUMN CONTINUITY:
   - Rely on your VISUAL inspection of the PDF pages first. Note that raw OCR/PDF text streams often scramble multi-column layouts by placing subheadings after paragraphs or interleaving left/right columns.
   - Reconstruct the exact human reading order on every page:
     * Top header banner (Document Type / Category, Date, Main Title, Subtitle / Study Attribution).
     * Primary narrative column sections in top-to-bottom sequence (e.g., \`## Background\`, embedded Figures/Tables, \`## Methodology\`).
     * Shaded callout sidebars (e.g., \`## Key Findings (Executive Summary)\` or \`## Policy Recommendations\`) placed as cohesive, self-contained semantic sections—never interleaved mid-sentence into unrelated columns.
   - CROSS-COLUMN STITCHING: When a section or paragraph starts at the bottom of Column 1 and continues at the top of Column 2 (for example, a section like \`### Health Information System\` starting at the bottom of a left column and continuing at the top of the right column with *"However, there is a lack of records..."*), stitch the continuation seamlessly into the same logical section before moving to the next sub-section.

2. THEMATIC SUB-SECTIONS & HIERARCHICAL NESTING:
   - When a section contains icon-grouped or color-coded thematic blocks (such as WHO Health System Building Blocks: \`Service Delivery\`, \`Health Workforce\`, \`Drugs and Equipment\`, \`Health Financing\`, \`Health Information System\`, \`Leadership and Governance\`), nest each domain as a \`### <Domain Name>\` sub-heading under its parent \`## Key Findings\` section.
   - Ensure the \`###\` sub-heading ALWAYS appears BEFORE its analytical prose and supporting quotes (correcting any inverted PDF stream ordering).
   - For \`## Policy Recommendations\` (or similar recommendation matrices mapped to thematic icons/domains), explicitly label each recommendation bullet with its corresponding thematic domain in bold when visually indicated.

3. EMBEDDED VISUAL CHARTS & FIGURES -> GFM DATA TABLES:
   - Whenever a page contains a bar chart, line chart, combo chart, or data figure (e.g., \`Figure: Non Communicable Disease (NCD) Risk Factor Prevalence (Urban vs Rural)\` or \`Figure: Domain Indices across Facilities\`):
     * Create a clear \`### Figure: <Exact Figure Title>\` sub-heading.
     * Visually read all data labels, bars, points, percentages, and legend series directly from the rendered PDF graphic and convert them into a complete, aligned GitHub-Flavored Markdown (GFM) table.
     * Include a concise 1-sentence analytical caption summarizing the visual trend or scale beneath the table.

4. VERBATIM PARTICIPANT QUOTES & SPEAKER ATTRIBUTIONS:
   - Format all italicized verbatim participant quotes or interview excerpts as Markdown blockquotes (\`> *"..."* — **[Speaker Role / Attribution]**\`) nested directly inside the thematic sub-section they illustrate.
   - Preserve exact bracketed speaker identifiers (such as \`[Policy Maker, MoLGRDC]\`, \`[Project Manager_Urban PHC Centre]\`, \`[Physician_Urban PHC Centre]\`, \`[ Medical Coordinator_NGO]\`).

5. FOOTNOTES, REFERENCES & INSTITUTIONAL PARTNERS:
   - Preserve numbered academic references/citations (\`## References\`), footnote definitions (e.g., \`*WHO Health System Building Blocks\`), and institutional partner/funding attributions at the conclusion of the document.

6. STRICT RAW MARKDOWN OUTPUT:
   - Output ONLY the final Markdown content. Do NOT wrap the response in outer \`\`\`markdown code fences or include conversational preamble.

${modeInstructions}
${styleInstructions}

${
  structuredMarkdown
    ? `--- PHASE 1 LITEPARSE SPATIAL TEXT ANCHOR (Note: Use for exact spelling/numbers, but rely on VISUAL PDF pages for true column & heading order) ---\n${structuredMarkdown}\n--- END SPATIAL ANCHOR ---\n\n`
    : ""
}${
    pdfTextReference
      ? `--- RAW PAGE-BY-PAGE TEXT MANIFEST (${totalPages} PAGES) ---\n${pdfTextReference}\n--- END MANIFEST ---`
      : ""
  }`;
}
