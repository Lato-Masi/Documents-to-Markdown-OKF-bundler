import crypto from "crypto";
import {
  reconstructPdfMarkdownFromSpatialPages,
  sanitizePdfTextArtifacts,
  hasBrokenImageTag,
  stripBrokenImageTags,
  isDecorativeIconOrSymbolItem,
  isHeaderFooterNoiseItem,
  normalizeMarginSignature,
} from "./pdfSpatialReconstructor";

let cachedLiteParse: any = null;

async function getLiteParseClass(): Promise<any> {
  if (cachedLiteParse) return cachedLiteParse;
  try {
    const mod: any = await import("@llamaindex/liteparse");
    cachedLiteParse = mod.LiteParse || (mod.default && mod.default.LiteParse) || mod.default;
    return cachedLiteParse;
  } catch (err) {
    console.warn("[LiteParse] Dynamic import error:", err);
    return null;
  }
}

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
  confidence?: number;
  ocrConfidence?: number;
  fontIsBuggy?: boolean;
  confidenceReasons?: string[];
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
  hasEmbeddedCharts?: boolean;
  hasComplexSemantics?: boolean;
  requiresMultimodalVision?: boolean;
  filteredNoiseCount?: number;
  filteredDecorativeIcons?: number;
  filteredHeaderFooterNoise?: number;
  filteredBrokenImageTags?: number;
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
  documentHash?: string;
  cacheHit?: boolean;
  error?: string;
}

interface SpatialCacheEntry {
  documentHash: string;
  buffer: Buffer;
  baseResult: LiteParseExtractionResult;
  cachedAt: number;
}

const MAX_SPATIAL_CACHE_ENTRIES = 25;
const SPATIAL_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const spatialLruCache = new Map<string, SpatialCacheEntry>();

function adaptCachedResultForThreshold(
  baseResult: LiteParseExtractionResult,
  qualityThreshold: number,
  documentHash: string,
  executionTimeMs: number,
  cacheHit: boolean
): LiteParseExtractionResult {
  const q = baseResult.quality;
  const requiresMultimodalVision =
    q.detectedColumns >= 2 ||
    Boolean(q.hasEmbeddedCharts) ||
    Boolean(q.hasComplexSemantics) ||
    q.qualityScore < qualityThreshold;
  const isSatisfactory = !requiresMultimodalVision && q.qualityScore >= qualityThreshold;

  return {
    ...baseResult,
    documentHash,
    cacheHit,
    executionTimeMs,
    quality: {
      ...q,
      threshold: qualityThreshold,
      requiresMultimodalVision,
      isSatisfactory,
      decision: isSatisfactory ? "FAST_LOCAL_DETERMINISTIC" : "ESCALATED_TO_GEMINI_MULTIMODAL",
    },
  };
}

/**
 * Retrieves a previously parsed PDF buffer and 2D spatial extraction result by SHA-256 digest in <1ms.
 */
export function getCachedSpatialEntry(
  documentHash?: string,
  qualityThreshold: number = 75
): { buffer: Buffer; result: LiteParseExtractionResult } | null {
  if (!documentHash) return null;
  const entry = spatialLruCache.get(documentHash);
  if (!entry) return null;

  if (Date.now() - entry.cachedAt > SPATIAL_CACHE_TTL_MS) {
    spatialLruCache.delete(documentHash);
    return null;
  }

  // Refresh LRU order
  spatialLruCache.delete(documentHash);
  entry.cachedAt = Date.now();
  spatialLruCache.set(documentHash, entry);

  return {
    buffer: entry.buffer,
    result: adaptCachedResultForThreshold(entry.baseResult, qualityThreshold, documentHash, 0, true),
  };
}

function storeSpatialCacheEntry(
  documentHash: string,
  buffer: Buffer,
  result: LiteParseExtractionResult
): void {
  if (spatialLruCache.has(documentHash)) {
    spatialLruCache.delete(documentHash);
  } else if (spatialLruCache.size >= MAX_SPATIAL_CACHE_ENTRIES) {
    const oldestKey = spatialLruCache.keys().next().value;
    if (oldestKey) {
      spatialLruCache.delete(oldestKey);
    }
  }
  spatialLruCache.set(documentHash, {
    documentHash,
    buffer,
    baseResult: result,
    cachedAt: Date.now(),
  });
}

interface PageScreenshotCacheEntry {
  pageNum: number;
  width: number;
  height: number;
  dataUrl: string;
  cachedAt: number;
}

const MAX_PAGE_SCREENSHOT_ENTRIES = 40;
const pageScreenshotCache = new Map<string, PageScreenshotCacheEntry>();

/**
 * Renders a single 1-indexed PDF page to a base64 PNG data URL using PDFium (`LiteParse.screenshot`)
 * with SHA-256 + pageNum LRU caching for instant heatmap backdrop rendering.
 */
export async function renderPdfPageScreenshot(
  buffer: Buffer,
  pageNum: number = 1,
  documentHash?: string
): Promise<{ pageNum: number; width: number; height: number; dataUrl: string } | null> {
  const safePageNum = Math.max(1, Math.floor(pageNum || 1));
  const hash = documentHash || crypto.createHash("sha256").update(buffer).digest("hex");
  const cacheKey = `${hash}:p${safePageNum}`;

  const existing = pageScreenshotCache.get(cacheKey);
  if (existing && Date.now() - existing.cachedAt <= SPATIAL_CACHE_TTL_MS) {
    pageScreenshotCache.delete(cacheKey);
    existing.cachedAt = Date.now();
    pageScreenshotCache.set(cacheKey, existing);
    return {
      pageNum: existing.pageNum,
      width: existing.width,
      height: existing.height,
      dataUrl: existing.dataUrl,
    };
  }

  try {
    const LiteParse = await getLiteParseClass();
    if (!LiteParse) return null;

    const lp = new LiteParse({
      dpi: 110,
      quiet: true,
    });
    const shots = await lp.screenshot(buffer, [safePageNum]);
    const shot = Array.isArray(shots) ? shots[0] : null;
    if (!shot || !shot.imageBuffer) return null;

    const imgBuf = Buffer.isBuffer(shot.imageBuffer)
      ? shot.imageBuffer
      : Buffer.from(shot.imageBuffer);
    const dataUrl = `data:image/png;base64,${imgBuf.toString("base64")}`;

    if (pageScreenshotCache.size >= MAX_PAGE_SCREENSHOT_ENTRIES) {
      const oldest = pageScreenshotCache.keys().next().value;
      if (oldest) pageScreenshotCache.delete(oldest);
    }

    const entry: PageScreenshotCacheEntry = {
      pageNum: shot.pageNum || safePageNum,
      width: Number(shot.width) || 612,
      height: Number(shot.height) || 792,
      dataUrl,
      cachedAt: Date.now(),
    };
    pageScreenshotCache.set(cacheKey, entry);

    return {
      pageNum: entry.pageNum,
      width: entry.width,
      height: entry.height,
      dataUrl: entry.dataUrl,
    };
  } catch (err) {
    console.warn("[LiteParse Screenshot Notice]:", err);
    return null;
  }
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

/**
 * Detect multi-column and asymmetrical sidebar layouts on a page using both:
 * 1. Left/Right X-coordinate clustering across symmetrical or asymmetrical (60/40) splits
 * 2. Horizontal side-by-side text item pairs sharing similar vertical Y coordinates
 */
function detectColumnsOnPage(items: SpatialTextItem[], pageWidth: number): number {
  if (!items || items.length < 6 || pageWidth <= 0) return 1;

  const midX = pageWidth / 2;
  let leftCount = 0;
  let rightCount = 0;
  let centerSpanCount = 0;

  const meaningfulItems = items.filter((it) => (it.text || "").trim().length >= 3);
  if (meaningfulItems.length < 6) return 1;

  for (const it of meaningfulItems) {
    const itemLeft = it.x;
    const itemRight = it.x + it.width;

    // Support both symmetrical 50/50 columns and asymmetrical 65/35 policy brief sidebars
    if (itemRight < pageWidth * 0.68 && itemLeft < midX - 15 && it.width < pageWidth * 0.68) {
      leftCount++;
    } else if (itemLeft > pageWidth * 0.42 && it.width < pageWidth * 0.58) {
      rightCount++;
    } else {
      centerSpanCount++;
    }
  }

  const total = leftCount + rightCount + centerSpanCount;
  if (total === 0) return 1;

  if (leftCount >= 3 && rightCount >= 3 && (leftCount + rightCount) / total >= 0.42) {
    return 2;
  }

  // Secondary geometric check: count distinct side-by-side text blocks on the same horizontal band
  let sideBySideRowCount = 0;
  const sortedByY = [...meaningfulItems].sort((a, b) => a.y - b.y);
  for (let i = 0; i < sortedByY.length; i++) {
    const a = sortedByY[i];
    if (a.width > pageWidth * 0.68) continue;
    for (let j = i + 1; j < sortedByY.length; j++) {
      const b = sortedByY[j];
      if (Math.abs(b.y - a.y) > 14) break;
      const horizontalGap = Math.abs(b.x - a.x);
      if (horizontalGap > pageWidth * 0.28 && b.width < pageWidth * 0.68) {
        sideBySideRowCount++;
        break;
      }
    }
  }

  if (sideBySideRowCount >= 4) {
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
  const documentHash = crypto.createHash("sha256").update(buffer).digest("hex");

  // 0. Instant SHA-256 LRU Cache Check (<1ms)
  const cached = getCachedSpatialEntry(documentHash, qualityThreshold);
  if (cached) {
    return {
      ...cached.result,
      executionTimeMs: Date.now() - startTime,
    };
  }

  try {
    const LiteParse = await getLiteParseClass();
    if (!LiteParse) {
      throw new Error("LiteParse engine could not be initialized");
    }

    // 1. Run Digital-First JSON extraction with ocrEnabled: false (fast ~50ms, zero icon OCR noise)
    const lpDigitalJson = new LiteParse({
      outputFormat: "json",
      emitWordBoxes: true,
      extractContentBounds: true,
      extractTextMetadata: true,
      ocrEnabled: false,
      extractLinks: true,
    });

    let jsonRes = (await lpDigitalJson.parse(buffer)) as any;
    let totalPages = jsonRes?.totalPages || jsonRes?.pages?.length || 0;

    // Check if the document is a scanned image PDF (< 25 digital words per page)
    let digitalWordCount = 0;
    if (jsonRes?.pages && Array.isArray(jsonRes.pages)) {
      for (const p of jsonRes.pages) {
        const itemsText = Array.isArray(p.textItems)
          ? p.textItems.map((it: any) => it.text || "").join(" ")
          : p.text || "";
        digitalWordCount += itemsText.trim().split(/\s+/).filter(Boolean).length;
      }
    }

    const avgDigitalWordsPerPage = totalPages > 0 ? digitalWordCount / totalPages : 0;

    // Only invoke Tesseract OCR fallback if the PDF is a scanned image (< 25 digital words/page)
    if (totalPages > 0 && avgDigitalWordsPerPage < 25) {
      const lpOcrJson = new LiteParse({
        outputFormat: "json",
        emitWordBoxes: true,
        extractContentBounds: true,
        extractTextMetadata: true,
        ocrEnabled: true,
        extractLinks: true,
      });
      jsonRes = (await lpOcrJson.parse(buffer)) as any;
      totalPages = jsonRes?.totalPages || jsonRes?.pages?.length || totalPages;
    }

    const pages: SpatialPage[] = [];
    let combinedRawText = "";
    let filteredDecorativeIcons = 0;
    let filteredHeaderFooterNoise = 0;
    let filteredBrokenImageTags = 0;

    // Pre-scan top/bottom page margins across multi-page documents to identify repeated running headers/footers
    const marginSignaturePageMap = new Map<string, Set<number>>();
    if (jsonRes?.pages && Array.isArray(jsonRes.pages) && jsonRes.pages.length > 1) {
      jsonRes.pages.forEach((p: any, idx: number) => {
        const pNum = p.pageNum || idx + 1;
        const pHeight = Number(p.height) || 792;
        if (Array.isArray(p.textItems)) {
          for (const it of p.textItems) {
            const y = Number(it.y) || 0;
            if (y < pHeight * 0.055 || y > pHeight * 0.935) {
              const sig = normalizeMarginSignature(it.text || "");
              if (sig.length >= 8) {
                if (!marginSignaturePageMap.has(sig)) {
                  marginSignaturePageMap.set(sig, new Set());
                }
                marginSignaturePageMap.get(sig)!.add(pNum);
              }
            }
          }
        }
      });
    }

    const repeatedMarginSignatures = new Set<string>();
    for (const [sig, pageSet] of marginSignaturePageMap.entries()) {
      if (pageSet.size >= 2) {
        repeatedMarginSignatures.add(sig);
      }
    }

    if (jsonRes?.pages && Array.isArray(jsonRes.pages)) {
      for (const p of jsonRes.pages) {
        const pageWidth = Number(p.width) || 612;
        const pageHeight = Number(p.height) || 792;
        const textItems: SpatialTextItem[] = [];

        if (p.textItems && Array.isArray(p.textItems)) {
          for (const item of p.textItems) {
            const rawItemText = String(item.text || "");

            // 1. Detect & strip broken image tags (e.g., ![](img_p1_2.png), img_p1_2.png)
            if (hasBrokenImageTag(rawItemText)) {
              filteredBrokenImageTags++;
            }
            const withoutImageTags = stripBrokenImageTags(rawItemText);
            if (!withoutImageTags.trim()) {
              continue;
            }

            // 2. Detect & filter out non-textual decorative icons, dingbat/symbol font glyphs, and OCR icon noise
            if (
              isDecorativeIconOrSymbolItem({
                text: withoutImageTags,
                fontName: item.fontName,
                x: Number(item.x) || 0,
                y: Number(item.y) || 0,
                width: Number(item.width) || 0,
                height: Number(item.height) || 0,
                fontSize: Number(item.fontSize) || 12,
              })
            ) {
              filteredDecorativeIcons++;
              continue;
            }

            // 3. Detect & filter out repeated running headers/footers, margin page numbers, and logo watermarks
            if (
              isHeaderFooterNoiseItem(
                {
                  text: withoutImageTags,
                  x: Number(item.x) || 0,
                  y: Number(item.y) || 0,
                  width: Number(item.width) || 0,
                  height: Number(item.height) || 0,
                  fontSize: Number(item.fontSize) || 12,
                },
                pageWidth,
                pageHeight,
                repeatedMarginSignatures
              )
            ) {
              filteredHeaderFooterNoise++;
              continue;
            }

            const cleanItemText = sanitizePdfTextArtifacts(withoutImageTags);
            if (!cleanItemText) {
              filteredDecorativeIcons++;
              continue;
            }

            // Filter word-level boxes inside the spatial item as well
            const cleanWords: SpatialWord[] = [];
            if (Array.isArray(item.words)) {
              for (const w of item.words) {
                const rawWord = String(w.text || "");
                if (hasBrokenImageTag(rawWord)) {
                  filteredBrokenImageTags++;
                }
                const strippedWord = sanitizePdfTextArtifacts(stripBrokenImageTags(rawWord));
                if (!strippedWord) continue;
                if (
                  isDecorativeIconOrSymbolItem({
                    text: strippedWord,
                    fontName: item.fontName,
                    x: Number(w.x) || 0,
                    y: Number(w.y) || 0,
                    width: Number(w.width) || 0,
                    height: Number(w.height) || 0,
                  })
                ) {
                  filteredDecorativeIcons++;
                  continue;
                }
                cleanWords.push({
                  text: strippedWord,
                  x: Number(w.x) || 0,
                  y: Number(w.y) || 0,
                  width: Number(w.width) || 0,
                  height: Number(w.height) || 0,
                });
              }
            }

            textItems.push({
              text: cleanItemText,
              x: Number(item.x) || 0,
              y: Number(item.y) || 0,
              width: Number(item.width) || 0,
              height: Number(item.height) || 0,
              fontName: item.fontName || "Helvetica",
              fontSize: Number(item.fontSize) || 12,
              rotation: Number(item.rotation) || 0,
              ...(typeof item.confidence === "number"
                ? { ocrConfidence: item.confidence }
                : {}),
              ...(item.fontIsBuggy ? { fontIsBuggy: true } : {}),
              words: cleanWords,
            });
          }
        }

        const pageNum = p.pageNum || pages.length + 1;
        const detectedCols = detectColumnsOnPage(textItems, pageWidth);

        const tempPage: SpatialPage = {
          pageNum,
          width: pageWidth,
          height: pageHeight,
          contentBounds: p.contentBounds || {
            x: 0,
            y: 0,
            width: pageWidth,
            height: pageHeight,
          },
          text: "",
          markdown: "",
          textItems,
          detectedColumns: detectedCols,
          densityScore: 0,
        };

        // Reconstruct clean 2D spatial Markdown for this page from filtered spatial textItems
        const pageSpatialMd = reconstructPdfMarkdownFromSpatialPages([tempPage]);
        tempPage.markdown = pageSpatialMd;
        tempPage.text = pageSpatialMd || textItems.map((t) => t.text).join(" ");
        tempPage.densityScore = Math.min(100, Math.round(tempPage.text.length / 15));

        combinedRawText += `\n--- PAGE ${pageNum} ---\n` + tempPage.text;
        pages.push(tempPage);
      }
    }

    // 2. Reconstruct full-document 2D spatial Markdown (columns, quotes, charts, references)
    let generatedMarkdown = reconstructPdfMarkdownFromSpatialPages(pages);
    if (!generatedMarkdown.trim()) {
      generatedMarkdown = sanitizePdfTextArtifacts(
        pages
          .map((p) => p.markdown || p.text)
          .filter(Boolean)
          .join("\n\n---\n\n")
      );
    }

    // 3. Compute Quality & Structural Complexity Metrics
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
    const tableMatches = (generatedMarkdown.match(/(\|[^\n]+\||^\s*[\+\-]{3,}\s*$)/gm) || []).length;

    const maxCols = pages.reduce((max, p) => Math.max(max, p.detectedColumns), 1);

    // Detect embedded visual charts / figures
    const figureLabelMatches = (
      combinedRawText.match(/\b(Figure\s*\d*\s*:|Chart\s*\d*\s*:|Graph\s*\d*\s*:|Domain Indices|Prevalence)/gi) || []
    ).length;
    const percentageSeriesMatches = (combinedRawText.match(/\b\d{1,2}(\.\d{1,2})?\s*%/g) || []).length;
    const hasEmbeddedCharts = figureLabelMatches >= 1 || percentageSeriesMatches >= 4;

    // Detect complex semantic relationships: attributed participant quotes, callout sidebars, policy briefs
    const speakerQuoteMatches = (combinedRawText.match(/\[[A-Za-z0-9_,\s\-/]{4,45}\]/g) || []).length;
    const calloutBoxMatches = (
      combinedRawText.match(
        /\b(Policy Brief|Key Findings|Policy Recommendations|Executive Summary|Building Blocks)\b/gi
      ) || []
    ).length;
    const hasComplexSemantics = speakerQuoteMatches >= 2 || calloutBoxMatches >= 2;

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
    } else if (lexicalWordRatio < 0.8) {
      score -= 15;
      reasons.push(`Moderate non-lexical word ratio (${((1 - lexicalWordRatio) * 100).toFixed(1)}%)`);
    }

    if (mathMatches >= 8) {
      score -= 15;
      reasons.push(`Dense mathematical formulas (${mathMatches} symbols detected - best rendered via multimodal reasoning)`);
    }

    // Penalize complex visual layouts so they automatically escalate to Gemini Multimodal Vision when an API key is active
    if (maxCols >= 2) {
      score -= 30;
      reasons.push(
        `Multi-column visual layout (${maxCols} columns / sidebars detected) — reconstructed 2D column reading order & escalating to Gemini Multimodal Vision`
      );
    }

    if (hasEmbeddedCharts) {
      score -= 20;
      reasons.push(
        `Embedded visual charts/figures detected (${figureLabelMatches} figure headers) — reconstructed GFM chart tables`
      );
    }

    if (hasComplexSemantics) {
      score -= 15;
      reasons.push(
        `Complex semantic blocks detected (${calloutBoxMatches} callout/policy headers, ${speakerQuoteMatches} attributed quotes) — reconstructed hierarchical sections`
      );
    }

    const filteredNoiseCount =
      filteredDecorativeIcons + filteredHeaderFooterNoise + filteredBrokenImageTags;
    if (filteredNoiseCount > 0) {
      reasons.push(
        `Filtered ${filteredNoiseCount} non-textual elements from spatial payload (${filteredDecorativeIcons} decorative icons, ${filteredHeaderFooterNoise} header/footer items, ${filteredBrokenImageTags} broken image tags)`
      );
    }

    if (reasons.length === 0) {
      reasons.push("Single-column typography, high text density, and linear reading order");
    }

    const finalQualityScore = Math.max(0, Math.min(100, score));
    const requiresMultimodalVision =
      maxCols >= 2 || hasEmbeddedCharts || hasComplexSemantics || finalQualityScore < qualityThreshold;
    const isSatisfactory = !requiresMultimodalVision && finalQualityScore >= qualityThreshold;

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
      hasEmbeddedCharts,
      hasComplexSemantics,
      requiresMultimodalVision,
      filteredNoiseCount,
      filteredDecorativeIcons,
      filteredHeaderFooterNoise,
      filteredBrokenImageTags,
      reasons,
    };

    const finalResult: LiteParseExtractionResult = {
      success: true,
      totalPages,
      pages,
      markdown: generatedMarkdown,
      rawText: combinedRawText,
      quality,
      executionTimeMs: Date.now() - startTime,
      documentHash,
      cacheHit: false,
    };

    storeSpatialCacheEntry(documentHash, buffer, finalResult);

    return finalResult;
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
        hasEmbeddedCharts: false,
        hasComplexSemantics: false,
        requiresMultimodalVision: true,
        reasons: [`LiteParse execution exception: ${err?.message || "Unknown error"}`],
      },
      executionTimeMs: Date.now() - startTime,
      error: err?.message || "LiteParse processing failed",
    };
  }
}
