import type { SpatialPage, SpatialTextItem } from "../types";

export type ConfidenceBand = "low" | "medium" | "high";

export type RecommendedSegmentAction =
  | "manual_edit"
  | "reconvert_vision"
  | "verified";

export interface ScoredSpatialSegment {
  id: string;
  index: number;
  pageNum: number;
  item: SpatialTextItem;
  confidence: number; // 0 - 100
  band: ConfidenceBand;
  reasons: string[];
  recommendedAction: RecommendedSegmentAction;
  markdownMatchRatio: number; // 0.0 - 1.0
}

export interface PageConfidenceSummary {
  pageNum: number;
  totalSegments: number;
  lowCount: number;
  mediumCount: number;
  highCount: number;
  averageConfidence: number;
  lowestConfidence: number;
}

export interface DocumentConfidenceSummary {
  totalSegments: number;
  lowConfidenceCount: number;
  mediumConfidenceCount: number;
  highConfidenceCount: number;
  averageConfidence: number;
  lowestConfidenceScore: number;
  pageSummaries: PageConfidenceSummary[];
  lowConfidenceSegments: ScoredSpatialSegment[];
}

export interface ConfidenceScoringOptions {
  convertedMarkdown?: string;
  lowConfidenceThreshold?: number;
  reviewThreshold?: number;
}

function isLikelyLexicalToken(word: string): boolean {
  const clean = word.toLowerCase().replace(/[^a-z]/g, "");
  if (clean.length === 0) return true;
  if (clean.length === 1) return clean === "a" || clean === "i";
  if (!/[aeiouy]/.test(clean)) return false;
  if (/([bcdfghjklmnpqrstvwxyz])\1\1\1/.test(clean)) return false;
  return true;
}

function tokenizeNormalizedWords(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .replace(/[`*_~#>|[\]().,;:!?"'“”‘’—–-]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function computeBoundingBoxOverlapRatio(a: SpatialTextItem, b: SpatialTextItem): number {
  const ax2 = a.x + Math.max(1, a.width);
  const ay2 = a.y + Math.max(1, a.height);
  const bx2 = b.x + Math.max(1, b.width);
  const by2 = b.y + Math.max(1, b.height);

  const interWidth = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
  const interHeight = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
  const interArea = interWidth * interHeight;
  if (interArea <= 0) return 0;

  const minArea = Math.min(
    Math.max(1, a.width) * Math.max(1, a.height),
    Math.max(1, b.width) * Math.max(1, b.height)
  );
  return interArea / minArea;
}

/**
 * Computes a deterministic 0-100 confidence score, severity band, and diagnostic
 * explanation for every spatial segment on a PDF page.
 */
export function scoreSpatialPageSegments(
  page: SpatialPage,
  options: ConfidenceScoringOptions = {}
): ScoredSpatialSegment[] {
  const lowThreshold = options.lowConfidenceThreshold ?? 65;
  const reviewThreshold = Math.max(lowThreshold + 5, options.reviewThreshold ?? 85);
  const items = page.textItems || [];
  const pageWidth = page.width || 612;

  const hasMarkdownRef = Boolean(options.convertedMarkdown && options.convertedMarkdown.trim().length > 0);
  const markdownWordSet = hasMarkdownRef
    ? new Set(tokenizeNormalizedWords(options.convertedMarkdown!))
    : null;
  const normalizedMarkdownLower = hasMarkdownRef
    ? options.convertedMarkdown!.toLowerCase().replace(/\s+/g, " ")
    : "";

  return items.map((item, index) => {
    const rawText = (item.text || "").trim();
    let score = typeof item.confidence === "number" ? item.confidence : 96;
    const reasons: string[] = Array.isArray(item.confidenceReasons)
      ? [...item.confidenceReasons]
      : [];

    const addPenalty = (points: number, reason: string) => {
      score -= points;
      if (!reasons.includes(reason)) {
        reasons.push(reason);
      }
    };

    // 1. Native OCR confidence signal (0.0 - 1.0) when OCR ran on scanned regions
    if (typeof item.ocrConfidence === "number") {
      const ocrPct = Math.round(item.ocrConfidence * 100);
      score = Math.min(score, ocrPct);
      if (ocrPct < lowThreshold) {
        if (!reasons.some((r) => r.includes("OCR"))) {
          reasons.push(`Low OCR glyph recognition confidence (${ocrPct}%)`);
        }
      } else if (ocrPct < reviewThreshold) {
        if (!reasons.some((r) => r.includes("OCR"))) {
          reasons.push(`Moderate OCR recognition confidence (${ocrPct}%)`);
        }
      }
    }

    // 2. PDFium buggy/corrupted font table flag
    if (item.fontIsBuggy) {
      addPenalty(28, "Corrupted or unmapped PDF font encoding table");
    }

    // 3. Garbled Unicode replacement / Private Use Area / control characters
    const garbledMatches =
      rawText.match(/[\uFFFD\uE000-\uF8FF\x00-\x08\x0B\x0C\x0E-\x1F]/g) || [];
    if (garbledMatches.length > 0) {
      addPenalty(
        Math.min(45, 25 + garbledMatches.length * 8),
        "Garbled or unmapped glyph characters detected"
      );
    }

    // 4. Lexical / OCR artifact & broken kerning check
    const rawTokens = rawText.split(/\s+/).filter(Boolean);
    if (rawTokens.length > 0) {
      const singleLetterRun =
        rawTokens.length >= 4 &&
        rawTokens.filter((t) => /^[A-Za-z]$/.test(t)).length / rawTokens.length >= 0.6;
      if (singleLetterRun) {
        addPenalty(26, "Fragmented single-letter kerning split — verify word spacing");
      }

      const alphaTokens = rawTokens.filter((t) => /[A-Za-z]{2,}/.test(t));
      if (alphaTokens.length >= 2) {
        const nonLexicalCount = alphaTokens.filter((t) => !isLikelyLexicalToken(t)).length;
        const nonLexicalRatio = nonLexicalCount / alphaTokens.length;
        if (nonLexicalRatio > 0.45) {
          addPenalty(32, `High non-lexical token ratio (${Math.round(nonLexicalRatio * 100)}%)`);
        } else if (nonLexicalRatio > 0.25) {
          addPenalty(16, `Unusual acronym or OCR token density (${Math.round(nonLexicalRatio * 100)}%)`);
        }
      }

      const symbolRatio =
        rawText.replace(/[A-Za-z0-9\s.,;:!?()%'"/-]/g, "").length /
        Math.max(1, rawText.length);
      if (symbolRatio > 0.25 && rawText.length >= 4) {
        addPenalty(28, "High non-alphanumeric symbol noise in text segment");
      }
    }

    // 5. Chart / figure data-point or micro-axis label ambiguity
    const fontSize = item.fontSize ?? 11;
    const isShortNumericOrAxis =
      rawText.length <= 18 &&
      (/\b\d+(\.\d+)?\s*%?$/.test(rawText) || /^(?:n\s*=|fig\.?|chart|source:)/i.test(rawText));
    if (fontSize > 0 && fontSize < 7.5) {
      addPenalty(24, `Micro-typography (${fontSize.toFixed(1)}pt) — verify chart/footnote legibility`);
    } else if (isShortNumericOrAxis && page.detectedColumns >= 2) {
      // Check if surrounded by multiple short numeric siblings (likely a visual bar/line chart)
      const nearbyShortSiblings = items.filter(
        (other, idx) =>
          idx !== index &&
          Math.abs(other.y - item.y) < 48 &&
          Math.abs(other.x - item.x) < 140 &&
          (other.text || "").trim().length <= 16 &&
          /\d/.test(other.text || "")
      ).length;
      if (nearbyShortSiblings >= 2) {
        addPenalty(
          34,
          "Embedded chart/figure axis value — verify GFM table reconstruction"
        );
      }
    }

    // 6. Bounding box collision / overlap with neighboring spatial items
    let maxOverlap = 0;
    for (let j = 0; j < items.length; j++) {
      if (j === index) continue;
      const other = items[j];
      if (Math.abs(other.y - item.y) > Math.max(item.height, other.height) * 1.5) continue;
      const overlap = computeBoundingBoxOverlapRatio(item, other);
      if (overlap > maxOverlap) {
        maxOverlap = overlap;
      }
    }
    if (maxOverlap > 0.35) {
      addPenalty(28, "Overlapping spatial bounding boxes — potential column/layer collision");
    } else if (maxOverlap > 0.12) {
      addPenalty(14, "Tight bounding-box adjacency — verify reading order");
    }

    // 7. Rotated text or cross-gutter multi-column boundary
    if (item.rotation && Math.abs(item.rotation % 360) > 2) {
      addPenalty(24, `Rotated text orientation (${item.rotation}°)`);
    }

    if (page.detectedColumns >= 2 && pageWidth > 0) {
      const midX = pageWidth / 2;
      const crossesCenterGutter =
        item.x < midX - 20 &&
        item.x + item.width > midX + 20 &&
        item.width < pageWidth * 0.72 &&
        fontSize < 14;
      if (crossesCenterGutter) {
        addPenalty(18, "Spans multi-column gutter — verify paragraph stitching");
      }
    }

    // 8. Dense mathematical notation
    const mathCount = (
      rawText.match(/[√∫∑∏∞≤≥≠≈∂∆±]|\\[a-zA-Z]+/g) || []
    ).length;
    if (mathCount >= 2) {
      addPenalty(18, "Mathematical notation — verify LaTeX syntax accuracy");
    }

    // 9. Live verification against converted Markdown output (if present)
    let markdownMatchRatio = 1;
    if (hasMarkdownRef && markdownWordSet) {
      const segWords = tokenizeNormalizedWords(rawText);
      if (segWords.length >= 3) {
        const matchedWords = segWords.filter((w) => markdownWordSet.has(w)).length;
        markdownMatchRatio = matchedWords / segWords.length;
        if (markdownMatchRatio < 0.35) {
          addPenalty(
            38,
            "Segment text missing or heavily altered in converted Markdown"
          );
        } else if (markdownMatchRatio < 0.65) {
          addPenalty(
            20,
            "Partial token match in converted Markdown — review phrasing"
          );
        }
      } else if (segWords.length > 0 && rawText.length >= 3) {
        const cleanProbe = rawText.toLowerCase().replace(/\s+/g, " ");
        if (!normalizedMarkdownLower.includes(cleanProbe)) {
          const matchedWords = segWords.filter((w) => markdownWordSet.has(w)).length;
          markdownMatchRatio = matchedWords / segWords.length;
          if (markdownMatchRatio === 0) {
            addPenalty(26, "Short label/value not found in converted Markdown");
          }
        }
      }
    }

    const clampedConfidence = Math.max(5, Math.min(100, Math.round(score)));
    const band: ConfidenceBand =
      clampedConfidence < lowThreshold
        ? "low"
        : clampedConfidence < reviewThreshold
        ? "medium"
        : "high";

    if (reasons.length === 0) {
      reasons.push("Clean digital glyph vector and verified Markdown alignment");
    }

    const recommendedAction: RecommendedSegmentAction =
      band === "low"
        ? reasons.some((r) => r.includes("chart") || r.includes("OCR") || r.includes("font"))
          ? "reconvert_vision"
          : "manual_edit"
        : band === "medium"
        ? "manual_edit"
        : "verified";

    return {
      id: `p${page.pageNum}_seg_${index}`,
      index,
      pageNum: page.pageNum,
      item,
      confidence: clampedConfidence,
      band,
      reasons,
      recommendedAction,
      markdownMatchRatio: Number(markdownMatchRatio.toFixed(2)),
    };
  });
}

/**
 * Aggregates segment confidence across all pages of a spatial PDF inspection result.
 */
export function summarizeDocumentConfidence(
  pages: SpatialPage[],
  options: ConfidenceScoringOptions = {}
): DocumentConfidenceSummary {
  const pageSummaries: PageConfidenceSummary[] = [];
  const lowConfidenceSegments: ScoredSpatialSegment[] = [];
  let totalSegments = 0;
  let lowConfidenceCount = 0;
  let mediumConfidenceCount = 0;
  let highConfidenceCount = 0;
  let confidenceSum = 0;
  let lowestConfidenceScore = 100;

  for (const page of pages || []) {
    const scored = scoreSpatialPageSegments(page, options);
    let pLow = 0;
    let pMed = 0;
    let pHigh = 0;
    let pSum = 0;
    let pLowest = scored.length > 0 ? 100 : 100;

    for (const seg of scored) {
      totalSegments++;
      confidenceSum += seg.confidence;
      pSum += seg.confidence;
      if (seg.confidence < pLowest) pLowest = seg.confidence;
      if (seg.confidence < lowestConfidenceScore) lowestConfidenceScore = seg.confidence;

      if (seg.band === "low") {
        lowConfidenceCount++;
        pLow++;
        lowConfidenceSegments.push(seg);
      } else if (seg.band === "medium") {
        mediumConfidenceCount++;
        pMed++;
      } else {
        highConfidenceCount++;
        pHigh++;
      }
    }

    pageSummaries.push({
      pageNum: page.pageNum,
      totalSegments: scored.length,
      lowCount: pLow,
      mediumCount: pMed,
      highCount: pHigh,
      averageConfidence: scored.length > 0 ? Math.round(pSum / scored.length) : 100,
      lowestConfidence: scored.length > 0 ? pLowest : 100,
    });
  }

  lowConfidenceSegments.sort((a, b) => a.confidence - b.confidence);

  return {
    totalSegments,
    lowConfidenceCount,
    mediumConfidenceCount,
    highConfidenceCount,
    averageConfidence:
      totalSegments > 0 ? Math.round(confidenceSum / totalSegments) : 100,
    lowestConfidenceScore: totalSegments > 0 ? lowestConfidenceScore : 100,
    pageSummaries,
    lowConfidenceSegments,
  };
}
