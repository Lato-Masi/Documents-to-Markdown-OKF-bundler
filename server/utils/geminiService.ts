import { GoogleGenAI } from "@google/genai";

// Get cleaned GEMINI_API_KEY from custom user override, request header, or server environment
export function getGeminiApiKey(customKey?: string): string {
  const rawKey = customKey || process.env.GEMINI_API_KEY || "";
  return rawKey.trim().replace(/^["']|["']$/g, "");
}

// Extract a simplified, action-oriented error message from a raw Gemini API error
export function getFriendlyErrorMessage(error: any): string {
  let msg = error?.message || String(error);
  // Recursively unwrap nested JSON error strings up to 3 levels
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
    return "Gemini API Key rejected by Google servers. Please check Settings > Secrets to ensure your GEMINI_API_KEY is active, has no quotes/whitespace, and has Generative Language API enabled.";
  }
  if (msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("high demand") || msg.includes("temporary") || msg.includes("Service Unavailable")) {
    return "High demand detected on primary conversion model (503 Service Unavailable). Automatically retried via fallback model pipeline.";
  }
  if (msg.includes("429") || msg.includes("quota") || msg.includes("Rate limit")) {
    return "Rate limit exceeded or temporary API quota reached. Please try again in a few seconds.";
  }
  return msg;
}

// Robust wrapper with automatic exponential backoff retry and model fallback for transient 503/429/overloaded model responses
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
  let activeModel = params.model;

  while (attempt < maxRetries) {
    try {
      return await ai.models.generateContentStream({
        ...params,
        model: activeModel,
      });
    } catch (err: any) {
      attempt++;
      const rawMsg = err?.message || String(err);
      const friendlyMsg = getFriendlyErrorMessage(err);
      const isTransient =
        rawMsg.includes("503") ||
        rawMsg.includes("UNAVAILABLE") ||
        rawMsg.includes("429") ||
        rawMsg.includes("high demand") ||
        rawMsg.includes("overloaded") ||
        rawMsg.includes("Service Unavailable");

      if (isTransient && attempt < maxRetries) {
        // Fallback from gemini-3.6-flash to gemini-2.5-flash on transient high demand after attempt 1
        if (attempt >= 2 && activeModel === "gemini-3.6-flash") {
          activeModel = "gemini-2.5-flash";
        }
        const delayMs = attempt * 1500;
        console.warn(`[Gemini Stream Retry ${attempt}/${maxRetries}] Transient error on ${params.model} (now using ${activeModel}). Waiting ${delayMs}ms...`);
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
  let activeModel = params.model;

  while (attempt < maxRetries) {
    try {
      return await ai.models.generateContent({
        ...params,
        model: activeModel,
      });
    } catch (err: any) {
      attempt++;
      const rawMsg = err?.message || String(err);
      const friendlyMsg = getFriendlyErrorMessage(err);
      const isTransient =
        rawMsg.includes("503") ||
        rawMsg.includes("UNAVAILABLE") ||
        rawMsg.includes("429") ||
        rawMsg.includes("high demand") ||
        rawMsg.includes("overloaded") ||
        rawMsg.includes("Service Unavailable");

      if (isTransient && attempt < maxRetries) {
        if (attempt >= 2 && activeModel === "gemini-3.6-flash") {
          activeModel = "gemini-2.5-flash";
        }
        const delayMs = attempt * 1500;
        console.warn(`[Gemini Retry ${attempt}/${maxRetries}] Transient error on ${params.model} (now using ${activeModel}). Waiting ${delayMs}ms...`);
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
