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
  if (model === "gemini-3.1-flash-lite") {
    return "Gemini 3.1 Flash Lite";
  }
  if (model === "gemini-flash-latest") {
    return "Gemini Flash Latest";
  }
  return "Gemini 3.8 Flash";
}

/**
 * Selects optimal ThinkingLevel for multimodal PDF extraction:
 * - Standard / Text-Only on Gemini 3.8 Flash -> ThinkingLevel.LOW (~2-4s TTFT)
 * - Rich depth mode OR Gemini 4 Pro (gemini-4-argon) -> ThinkingLevel.MEDIUM (deeper synthesis)
 */
export function resolvePdfThinkingLevel(
  visionModel: string,
  conversionMode?: string
): ThinkingLevel {
  if (conversionMode === "rich" || visionModel === "gemini-4-argon") {
    return ThinkingLevel.MEDIUM;
  }
  return ThinkingLevel.LOW;
}

function modelSupportsThinkingLevel(model: string): boolean {
  return (
    model.startsWith("gemini-3.") ||
    model.startsWith("gemini-3-") ||
    model.startsWith("gemini-4-")
  );
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

// Strip legacy sampling parameters (temperature, topP, topK) and guard thinkingConfig per model family
function sanitizeModelConfig(config?: any, activeModel: string = DEFAULT_VISION_MODEL): any {
  const cleaned: Record<string, any> = {};
  if (config && typeof config === "object") {
    for (const [key, val] of Object.entries(config)) {
      if (key === "temperature" || key === "topP" || key === "topK") {
        continue;
      }
      if (key === "thinkingConfig" && !modelSupportsThinkingLevel(activeModel)) {
        continue;
      }
      cleaned[key] = val;
    }
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
    return "High demand detected on primary conversion model (503 Service Unavailable). Automatically retried via fast fallback model pipeline.";
  }
  if (msg.includes("429") || msg.includes("quota") || msg.includes("Rate limit")) {
    return "Rate limit exceeded or temporary API quota reached. Please try again in a few seconds.";
  }
  return msg;
}

// Fast modern fallback chain avoiding slow legacy reasoning models
function getNextFallbackModel(currentModel: string): string {
  if (currentModel === "gemini-4-argon") return "gemini-3.8-flash";
  if (currentModel === "gemini-3.8-flash") return "gemini-flash-latest";
  if (currentModel === "gemini-flash-latest") return "gemini-3.1-flash-lite";
  return "gemini-3.8-flash";
}

// Robust wrapper with fast retry and modern model compatibility fallback
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

  while (attempt < maxRetries) {
    try {
      const sanitizedConfig = sanitizeModelConfig(params.config, activeModel);
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
        rawMsg.includes("PERMISSION_DENIED") ||
        rawMsg.includes("403") ||
        rawMsg.includes("not supported");

      if (isModelOrTransientError && attempt < maxRetries) {
        const prevModel = activeModel;
        activeModel = getNextFallbackModel(activeModel);
        const delayMs = Math.min(attempt * 400, 1000);
        console.warn(
          `[Gemini Stream Retry ${attempt}/${maxRetries}] Switching from ${prevModel} to ${activeModel}. Waiting ${delayMs}ms...`
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

  while (attempt < maxRetries) {
    try {
      const sanitizedConfig = sanitizeModelConfig(params.config, activeModel);
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
        rawMsg.includes("PERMISSION_DENIED") ||
        rawMsg.includes("403") ||
        rawMsg.includes("not supported");

      if (isModelOrTransientError && attempt < maxRetries) {
        const prevModel = activeModel;
        activeModel = getNextFallbackModel(activeModel);
        const delayMs = Math.min(attempt * 400, 1000);
        console.warn(
          `[Gemini Retry ${attempt}/${maxRetries}] Switching from ${prevModel} to ${activeModel}. Waiting ${delayMs}ms...`
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
 * Builds a concise, deduplicated Multimodal Visual Verification & Semantic Refinement Prompt.
 * Sends ONLY ONE spatial draft anchor (eliminating the previous 2x duplicate text manifest)
 * so Gemini focuses strictly on verifying column order, GFM chart data, and speaker attributions.
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
    detectedColumns,
    modeInstructions,
    styleInstructions,
    structuredMarkdown,
    pdfTextReference,
  } = options;

  const singleAnchor = (structuredMarkdown && structuredMarkdown.trim())
    ? structuredMarkdown.trim()
    : (pdfTextReference || "").trim();

  return `Visually verify and refine the 2D Spatial Draft below against the attached ${totalPages || "multi"}-page PDF (${fileName}, ${detectedColumns}-column layout) and output the complete, publication-grade GitHub-Flavored Markdown (GFM).

VISUAL REFINEMENT RULES:
1. READING ORDER & COLUMN STITCHING: Follow true visual reading order—top banner (Title, Document Type, Date, Subtitle), primary narrative columns, cohesive callout sidebars (never interleaved mid-sentence), and cross-column continuations (stitch sections that start at the bottom of Column 1 and continue at the top of Column 2).
2. HIERARCHICAL SECTIONS: Nest icon/domain blocks (e.g., WHO Health System Building Blocks) as \`### <Domain>\` sub-headings BEFORE their prose and quotes under \`## Key Findings\`. Prefix \`## Policy Recommendations\` bullets with bold domain labels when visually indicated.
3. CHARTS -> GFM TABLES: Represent every bar/line chart or figure under \`### Figure: <Exact Title>\` as an aligned GFM table containing all visual series, categories, and percentages, plus its source note.
4. ATTRIBUTED QUOTES & REFERENCES: Format participant quotes as \`> *"..."* — **[Speaker Role]**\` inside their thematic section, and preserve \`## References\` and funding footnotes at the end. Never emit broken image tags or decorative icon characters.
5. OUTPUT FORMAT: Output ONLY raw Markdown without outer \`\`\`markdown fences or conversational preamble.
${modeInstructions} ${styleInstructions}

${
  singleAnchor
    ? `--- 2D SPATIAL DRAFT ANCHOR (Verify visually against PDF pages and output refined Markdown) ---\n${singleAnchor}\n--- END ANCHOR ---`
    : ""
}`;
}
