import { describe, it, expect } from "vitest";
import {
  scoreSpatialPageSegments,
  summarizeDocumentConfidence,
} from "../pdfConfidenceScorer";
import type { SpatialPage } from "../../types";

const MOCK_PAGE: SpatialPage = {
  pageNum: 1,
  width: 612,
  height: 792,
  detectedColumns: 2,
  densityScore: 70,
  text: "",
  textItems: [
    {
      text: "Preparedness of Urban Primary Healthcare Centres for NCD Prevention",
      x: 48,
      y: 60,
      width: 500,
      height: 22,
      fontSize: 16,
      fontName: "Helvetica-Bold",
    },
    {
      text: "ocr scan blur\uFFFD artifact",
      x: 48,
      y: 140,
      width: 180,
      height: 14,
      fontSize: 10,
      ocrConfidence: 0.38,
      fontIsBuggy: true,
    },
    {
      text: "Critical clinical recommendation omitted from draft output entirely",
      x: 320,
      y: 220,
      width: 240,
      height: 16,
      fontSize: 11,
    },
    {
      text: "Overlapping sidebar callout block",
      x: 322,
      y: 222,
      width: 230,
      height: 16,
      fontSize: 11,
    },
  ],
};

describe("pdfConfidenceScorer — Segment Confidence & Heatmap Classification", () => {
  it("classifies clean digital segments as high confidence and flags OCR/garbled/missing segments as low confidence", () => {
    const convertedMarkdown = `# Preparedness of Urban Primary Healthcare Centres for NCD Prevention\n\nOverlapping sidebar callout block`;

    const scored = scoreSpatialPageSegments(MOCK_PAGE, {
      convertedMarkdown,
      lowConfidenceThreshold: 65,
    });

    expect(scored).toHaveLength(4);

    // Segment 0: Clean heading present in convertedMarkdown -> high confidence
    expect(scored[0].band).toBe("high");
    expect(scored[0].confidence).toBeGreaterThanOrEqual(85);
    expect(scored[0].markdownMatchRatio).toBe(1);

    // Segment 1: Low OCR confidence + buggy font + replacement char -> low confidence (red)
    expect(scored[1].band).toBe("low");
    expect(scored[1].confidence).toBeLessThan(50);
    expect(scored[1].reasons.some((r) => r.includes("OCR"))).toBe(true);
    expect(scored[1].recommendedAction).toBe("reconvert_vision");

    // Segment 2: Missing from convertedMarkdown + overlapping bbox with Segment 3 -> low confidence (red)
    expect(scored[2].band).toBe("low");
    expect(scored[2].markdownMatchRatio).toBeLessThan(0.35);
    expect(
      scored[2].reasons.some((r) => r.includes("missing or heavily altered"))
    ).toBe(true);
    expect(
      scored[2].reasons.some((r) => r.includes("Overlapping spatial bounding boxes"))
    ).toBe(true);
  });

  it("aggregates multi-page confidence summaries sorted lowest-confidence-first", () => {
    const summary = summarizeDocumentConfidence([MOCK_PAGE], {
      convertedMarkdown:
        "# Preparedness of Urban Primary Healthcare Centres for NCD Prevention",
      lowConfidenceThreshold: 65,
    });

    expect(summary.totalSegments).toBe(4);
    expect(summary.lowConfidenceCount).toBeGreaterThanOrEqual(2);
    expect(summary.highConfidenceCount).toBeGreaterThanOrEqual(1);
    expect(summary.pageSummaries[0].pageNum).toBe(1);
    expect(summary.lowConfidenceSegments[0].confidence).toBeLessThanOrEqual(
      summary.lowConfidenceSegments[1].confidence
    );
  });
});
