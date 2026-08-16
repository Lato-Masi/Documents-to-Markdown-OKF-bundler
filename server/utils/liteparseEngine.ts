import { LiteParse } from "@llamaindex/liteparse";

export interface SpatialWord {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SpatialTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName?: string;
  fontSize?: number;
  rotation?: number;
  words?: SpatialWord[];
}

export interface SpatialPage {
  pageNum: number;
  width: number;
  height: number;
  contentBounds?: { x: number; y: number; width: number; height: number };
  text: string;
  markdown?: string;
  textItems: SpatialTextItem[];
  detectedColumns: number;
  densityScore: number;
}

export interface SpatialQualityMetrics {
  qualityScore: number; // 0 - 100
  isSatisfactory: boolean;
  threshold: number;
  decision: "FAST_LOCAL_DETERMINISTIC" | "ESCALATED_TO_GEMINI_MULTIMODAL";
  wordCount: number;
  avgWordsPerPage: number;
  garbledGlyphRatio: number;
  lexicalWordRatio: number;
  detectedColumns: number;
  mathSymbolCount: number;
  tableMarkerCount: number;
  reasons: string[];
}

export interface LiteParseExtractionResult {
  success: boolean;
  totalPages: number;
  pages: SpatialPage[];
  markdown: string;
  rawText: string;
  quality: SpatialQualityMetrics;
  executionTimeMs: number;
  error?: string;
}

// Simple English / Latin syllable / lexical heuristic checker for OCR noise
function isLikelyLexicalWord(w: string): boolean {
  const clean = w.toLowerCase().replace(/[^a-z]/g, "");
  if (clean.length === 0) return true; // punctuation or number
  if (clean.length === 1) return clean === "a" || clean === "i";
  // Must contain at least one vowel (a, e, i, o, u, y)
  if (!/[aeiouy]/.test(clean)) return false;
  // Cannot have 4 identical consecutive consonants
  if (/([bcdfghjklmnpqrstvwxyz])\1\1\1/.test(clean)) return false;
  return true;
}

// Detect columns based on text items X coordinate clustering
function detectColumnsOnPage(items: SpatialTextItem[], pageWidth: number): number {
  if (!items || items.length < 6 || pageWidth <= 0) return 1;

  const midX = pageWidth / 2;
  let leftCount = 0;
  let rightCount = 0;
  let centerSpanCount = 0;

  for (const it of items) {
    const itemLeft = it.x;
    const itemRight = it.x + it.width;

    if (itemRight < midX - 10) {
      leftCount++;
    } else if (itemLeft > midX + 10) {
      rightCount++;
    } else {
      centerSpanCount++;
    }
  }

  const total = leftCount + rightCount + centerSpanCount;
  if (total === 0) return 1;

  if (leftCount > 3 && rightCount > 3 && (leftCount + rightCount) / total > 0.6) {
    return 2;
  }
  return 1;
}

export async function parsePdfWithLiteParse(
  buffer: Buffer,
  fileName: string = "document.pdf",
  qualityThreshold: number = 75
): Promise<LiteParseExtractionResult> {
  const startTime = Date.now();

  try {
    // 1. Run JSON extraction with full spatial bounding boxes
    const lpJson = new LiteParse({
      outputFormat: "json",
      emitWordBoxes: true,
      extractContentBounds: true,
      ocrEnabled: true,
      extractLinks: true,
    });

    const jsonRes = (await lpJson.parse(buffer)) as any;
    const totalPages = jsonRes?.totalPages || jsonRes?.pages?.length || 0;

    // 2. Run Markdown extraction
    let generatedMarkdown = "";
    try {
      const lpMd = new LiteParse({
        outputFormat: "markdown",
        ocrEnabled: true,
      });
      const mdRes = (await lpMd.parse(buffer)) as any;
      if (typeof mdRes === "string") {
        generatedMarkdown = mdRes;
      } else if (mdRes?.markdown) {
        generatedMarkdown = mdRes.markdown;
      } else if (mdRes?.text) {
        generatedMarkdown = mdRes.text;
      }
    } catch (mdErr) {
      console.warn("[LiteParse] Markdown extraction notice:", mdErr);
    }

    const pages: SpatialPage[] = [];
    let combinedRawText = "";

    if (jsonRes?.pages && Array.isArray(jsonRes.pages)) {
      for (const p of jsonRes.pages) {
        const textItems: SpatialTextItem[] = [];
        if (p.textItems && Array.isArray(p.textItems)) {
          for (const item of p.textItems) {
            textItems.push({
              text: item.text || "",
              x: Number(item.x) || 0,
              y: Number(item.y) || 0,
              width: Number(item.width) || 0,
              height: Number(item.height) || 0,
              fontName: item.fontName || "Helvetica",
              fontSize: Number(item.fontSize) || 12,
              rotation: Number(item.rotation) || 0,
              words: (item.words || []).map((w: any) => ({
                text: w.text || "",
                x: Number(w.x) || 0,
                y: Number(w.y) || 0,
                width: Number(w.width) || 0,
                height: Number(w.height) || 0,
              })),
            });
          }
        }

        const pageText = p.text || textItems.map((t) => t.text).join(" ");
        combinedRawText += `\n--- PAGE ${p.pageNum || pages.length + 1} ---\n` + pageText;

        const detectedCols = detectColumnsOnPage(textItems, p.width || 612);
        const charDensity = pageText.length;

        pages.push({
          pageNum: p.pageNum || pages.length + 1,
          width: p.width || 612,
          height: p.height || 792,
          contentBounds: p.contentBounds || {
            x: 0,
            y: 0,
            width: p.width || 612,
            height: p.height || 792,
          },
          text: pageText,
          markdown: p.markdown || "",
          textItems,
          detectedColumns: detectedCols,
          densityScore: Math.min(100, Math.round(charDensity / 15)),
        });
      }
    }

    if (!generatedMarkdown.trim()) {
      generatedMarkdown = pages
        .map((p) => p.markdown || p.text)
        .filter(Boolean)
        .join("\n\n---\n\n");
    }

    // 3. Compute Quality Assessment Metrics
    const allWords = combinedRawText
      .split(/\s+/)
      .map((w) => w.trim())
      .filter(Boolean);
    const wordCount = allWords.length;
    const avgWordsPerPage = totalPages > 0 ? Math.round(wordCount / totalPages) : wordCount;

    // Garbled / replacement characters count
    const garbleMatches = (combinedRawText.match(/[\uFFFD\x00-\x08\x0B\x0C\x0E-\x1F]/g) || []).length;
    const garbledGlyphRatio = combinedRawText.length > 0 ? garbleMatches / combinedRawText.length : 0;

    // Lexical word ratio
    let lexicalCount = 0;
    for (const w of allWords) {
      if (isLikelyLexicalWord(w)) lexicalCount++;
    }
    const lexicalWordRatio = wordCount > 0 ? lexicalCount / wordCount : 1;

    // Math symbols
    const mathMatches = (
      combinedRawText.match(
        /(\\\(|\\\[|\\sum|\\int|\\partial|\\alpha|\\beta|\\gamma|\\theta|\\lambda|\\approx|\\frac|√|∫|∑|∏|∞|≤|≥|≠|≈|∂|∆|±)/g
      ) || []
    ).length;

    // Table markers
    const tableMatches = (combinedRawText.match(/(\|[^\n]+\||^\s*[\+\-]{3,}\s*$)/gm) || []).length;

    const maxCols = pages.reduce((max, p) => Math.max(max, p.detectedColumns), 1);

    // Scoring calculation
    let score = 100;
    const reasons: string[] = [];

    if (totalPages === 0 || wordCount < 10) {
      score -= 60;
      reasons.push("Critically sparse or unextractable text stream (<10 words)");
    } else if (avgWordsPerPage < 25) {
      score -= 30;
      reasons.push(`Low text density (${avgWordsPerPage} words/page) - likely graphical chart or scanned layout`);
    } else if (avgWordsPerPage < 50) {
      score -= 15;
      reasons.push(`Moderate text density (${avgWordsPerPage} words/page)`);
    }

    if (garbledGlyphRatio > 0.02) {
      score -= 35;
      reasons.push(`High font encoding corruption (${(garbledGlyphRatio * 100).toFixed(1)}% garbled glyphs)`);
    } else if (garbledGlyphRatio > 0.005) {
      score -= 15;
      reasons.push(`Minor font encoding artifacts (${(garbledGlyphRatio * 100).toFixed(2)}% garbled glyphs)`);
    }

    if (lexicalWordRatio < 0.65) {
      score -= 30;
      reasons.push(`High OCR artifact/noise ratio (${((1 - lexicalWordRatio) * 100).toFixed(1)}% non-lexical words)`);
    } else if (lexicalWordRatio < 0.80) {
      score -= 15;
      reasons.push(`Moderate non-lexical word ratio (${((1 - lexicalWordRatio) * 100).toFixed(1)}%)`);
    }

    if (mathMatches >= 8) {
      score -= 15;
      reasons.push(`Dense mathematical formulas (${mathMatches} symbols detected - best rendered via multimodal reasoning)`);
    }

    if (reasons.length === 0) {
      reasons.push("Clean spatial typography, high text density, and well-structured reading order");
    }

    const finalQualityScore = Math.max(0, Math.min(100, score));
    const isSatisfactory = finalQualityScore >= qualityThreshold;

    const quality: SpatialQualityMetrics = {
      qualityScore: finalQualityScore,
      isSatisfactory,
      threshold: qualityThreshold,
      decision: isSatisfactory ? "FAST_LOCAL_DETERMINISTIC" : "ESCALATED_TO_GEMINI_MULTIMODAL",
      wordCount,
      avgWordsPerPage,
      garbledGlyphRatio,
      lexicalWordRatio,
      detectedColumns: maxCols,
      mathSymbolCount: mathMatches,
      tableMarkerCount: tableMatches,
      reasons,
    };

    return {
      success: true,
      totalPages,
      pages,
      markdown: generatedMarkdown,
      rawText: combinedRawText,
      quality,
      executionTimeMs: Date.now() - startTime,
    };
  } catch (err: any) {
    console.error("[LiteParse Engine Error]:", err);
    return {
      success: false,
      totalPages: 0,
      pages: [],
      markdown: "",
      rawText: "",
      quality: {
        qualityScore: 0,
        isSatisfactory: false,
        threshold: qualityThreshold,
        decision: "ESCALATED_TO_GEMINI_MULTIMODAL",
        wordCount: 0,
        avgWordsPerPage: 0,
        garbledGlyphRatio: 1,
        lexicalWordRatio: 0,
        detectedColumns: 1,
        mathSymbolCount: 0,
        tableMarkerCount: 0,
        reasons: [`LiteParse execution exception: ${err?.message || "Unknown error"}`],
      },
      executionTimeMs: Date.now() - startTime,
      error: err?.message || "LiteParse processing failed",
    };
  }
}
