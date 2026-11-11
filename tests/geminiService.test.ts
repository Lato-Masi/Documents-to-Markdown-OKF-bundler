import { describe, it, expect, vi } from "vitest";
import { ThinkingLevel, type GoogleGenAI } from "@google/genai";
import {
  resolveVisionModel,
  resolvePdfThinkingLevel,
  buildComplexPdfSemanticPrompt,
  getFriendlyErrorMessage,
  generateContentStreamWithRetry,
  generateContentWithRetry,
} from "../server/utils/geminiService";

describe("Gemini Multimodal Configuration, Prompt Budgeting & Fallback Pipeline", () => {
  it("resolves vision model aliases accurately with gemini-3.8-flash as default", () => {
    expect(resolveVisionModel()).toBe("gemini-3.8-flash");
    expect(resolveVisionModel("gemini-3.8-flash")).toBe("gemini-3.8-flash");
    expect(resolveVisionModel("gemini-4-argon")).toBe("gemini-4-argon");
    expect(resolveVisionModel("gemini-pro")).toBe("gemini-4-argon");
    expect(resolveVisionModel("unknown-model")).toBe("gemini-3.8-flash");
  });

  it("tunes ThinkingLevel to LOW for Standard/Text-Only Flash and MEDIUM for Rich or Gemini 4 Pro", () => {
    expect(resolvePdfThinkingLevel("gemini-3.8-flash", "standard")).toBe(ThinkingLevel.LOW);
    expect(resolvePdfThinkingLevel("gemini-3.8-flash", "text-only")).toBe(ThinkingLevel.LOW);
    expect(resolvePdfThinkingLevel("gemini-3.8-flash", "rich")).toBe(ThinkingLevel.MEDIUM);
    expect(resolvePdfThinkingLevel("gemini-4-argon", "standard")).toBe(ThinkingLevel.MEDIUM);
    expect(resolvePdfThinkingLevel("gemini-4-argon", "rich")).toBe(ThinkingLevel.MEDIUM);
  });

  it("deduplicates spatial draft anchors in buildComplexPdfSemanticPrompt so text tokens are never doubled", () => {
    const anchorMarker = "UNIQUE_SPATIAL_ANCHOR_MARKER_XYZ";
    const duplicateLegacyRef = "LEGACY_DUPLICATE_TEXT_STREAM_ABC";

    const prompt = buildComplexPdfSemanticPrompt({
      fileName: "policy-brief.pdf",
      totalPages: 2,
      qualityScore: 35,
      threshold: 75,
      detectedColumns: 2,
      reasons: ["Multi-column layout"],
      modeInstructions: "Standard faithful conversion.",
      styleInstructions: "GFM syntax.",
      structuredMarkdown: `## Background\n\n${anchorMarker}`,
      pdfTextReference: duplicateLegacyRef,
    });

    const occurrences = prompt.split(anchorMarker).length - 1;
    expect(occurrences).toBe(1);
    expect(prompt).not.toContain(duplicateLegacyRef);

    // Falls back to pdfTextReference if structuredMarkdown is empty
    const fallbackPrompt = buildComplexPdfSemanticPrompt({
      fileName: "policy-brief.pdf",
      totalPages: 2,
      qualityScore: 35,
      threshold: 75,
      detectedColumns: 2,
      reasons: [],
      modeInstructions: "Standard.",
      styleInstructions: "GFM.",
      structuredMarkdown: "   ",
      pdfTextReference: duplicateLegacyRef,
    });
    expect(fallbackPrompt).toContain(duplicateLegacyRef);
  });

  it("steps down the fast fallback chain on 503/404 errors and strips thinkingConfig on non-3/4 fallback models", async () => {
    const calls: Array<{ model: string; config?: any }> = [];

    const mockGenerateContentStream = vi.fn(async (req: { model: string; contents: any; config?: any }) => {
      calls.push({ model: req.model, config: req.config });
      if (req.model === "gemini-4-argon") {
        throw new Error("404 Model gemini-4-argon NOT_FOUND for this project");
      }
      if (req.model === "gemini-3.8-flash") {
        throw new Error("503 UNAVAILABLE: Model overloaded due to high demand");
      }
      return (async function* () {
        yield { text: "# Refined Output" };
      })();
    });

    const fakeClient = {
      models: {
        generateContentStream: mockGenerateContentStream,
      },
    } as unknown as GoogleGenAI;

    const retryEvents: string[] = [];
    const stream = await generateContentStreamWithRetry(
      fakeClient,
      {
        model: "gemini-4-argon",
        contents: "Test multimodal input",
        config: {
          temperature: 0.2,
          topP: 0.9,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
        },
      },
      4,
      (_attempt, _delay, _err, nextModel) => {
        retryEvents.push(nextModel);
      }
    );

    const chunks: string[] = [];
    for await (const chunk of stream as AsyncGenerator<{ text: string }>) {
      chunks.push(chunk.text);
    }

    expect(chunks.join("")).toBe("# Refined Output");
    expect(calls.map((c) => c.model)).toEqual([
      "gemini-4-argon",
      "gemini-3.8-flash",
      "gemini-flash-latest",
    ]);
    expect(retryEvents).toEqual(["gemini-3.8-flash", "gemini-flash-latest"]);

    // Legacy temperature/topP stripped on all models
    expect(calls[0].config).toEqual({
      thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
    });
    expect(calls[1].config).toEqual({
      thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
    });

    // thinkingConfig MUST be stripped automatically when falling back to gemini-flash-latest
    expect(calls[2].config).toBeUndefined();
  });

  it("rethrows non-transient authentication errors immediately without wasting retry cycles", async () => {
    const mockGenerateContent = vi.fn(async () => {
      throw new Error('{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}');
    });

    const fakeClient = {
      models: {
        generateContent: mockGenerateContent,
      },
    } as unknown as GoogleGenAI;

    await expect(
      generateContentWithRetry(fakeClient, {
        model: "gemini-3.8-flash",
        contents: "Hello",
      })
    ).rejects.toThrow(/API key not valid/);

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);

    const friendly = getFriendlyErrorMessage(
      new Error('{"error":{"message":"API_KEY_INVALID"}}')
    );
    expect(friendly).toContain("Gemini API Key rejected");
  });
});
