// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import SpatialLayoutInspector from "../SpatialLayoutInspector";
import type { SpatialDocumentResult } from "../../types";

const MOCK_SPATIAL_RESULT: SpatialDocumentResult = {
  success: true,
  totalPages: 2,
  executionTimeMs: 44,
  documentHash: "b".repeat(64),
  cacheHit: true,
  markdown: "# Urban Health Policy Brief\n\nClean verified introduction paragraph.",
  rawText: "Urban Health Policy Brief",
  quality: {
    qualityScore: 55,
    isSatisfactory: false,
    threshold: 75,
    decision: "ESCALATED_TO_GEMINI_MULTIMODAL",
    wordCount: 420,
    avgWordsPerPage: 210,
    garbledGlyphRatio: 0.01,
    lexicalWordRatio: 0.91,
    detectedColumns: 2,
    mathSymbolCount: 0,
    tableMarkerCount: 2,
    hasEmbeddedCharts: true,
    hasComplexSemantics: true,
    requiresMultimodalVision: true,
    reasons: ["Multi-column visual layout detected"],
  },
  pages: [
    {
      pageNum: 1,
      width: 612,
      height: 792,
      detectedColumns: 2,
      densityScore: 65,
      text: "Urban Health Policy Brief",
      textItems: [
        {
          text: "Urban Health Policy Brief",
          x: 40,
          y: 45,
          width: 480,
          height: 24,
          fontSize: 18,
        },
        {
          text: "Garbled chart label\uFFFD 38.4%",
          x: 340,
          y: 310,
          width: 190,
          height: 14,
          fontSize: 7,
          ocrConfidence: 0.41,
          fontIsBuggy: true,
        },
      ],
    },
    {
      pageNum: 2,
      width: 612,
      height: 792,
      detectedColumns: 1,
      densityScore: 50,
      text: "Clean verified introduction paragraph.",
      textItems: [
        {
          text: "Clean verified introduction paragraph.",
          x: 48,
          y: 80,
          width: 460,
          height: 16,
          fontSize: 12,
        },
      ],
    },
  ],
};

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: false,
    json: async () => ({ success: false }),
  } as Response);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SpatialLayoutInspector — PDF Visual Quality Heatmap Overlay", () => {
  it("highlights low-confidence segments in red on the SVG heatmap and supports filtering, manual patching, and re-conversion", () => {
    const onMarkdownChange = vi.fn();
    const onOpenEditor = vi.fn();
    const onReconvertWithVision = vi.fn();

    render(
      <SpatialLayoutInspector
        spatialData={MOCK_SPATIAL_RESULT}
        convertedMarkdown={MOCK_SPATIAL_RESULT.markdown}
        onMarkdownChange={onMarkdownChange}
        onOpenEditor={onOpenEditor}
        onReconvertWithVision={onReconvertWithVision}
      />
    );

    // Heatmap summary banner shows 1 low-confidence red segment
    expect(screen.getByText("Segment Confidence Heatmap")).toBeTruthy();
    expect(screen.getByText(/Low \(Red\): 1/i)).toBeTruthy();

    // Verify SVG heatmap renders both segments on Page 1 with correct data-band attributes
    const highSeg = screen.getByTestId("heatmap-segment-0");
    const lowRedSeg = screen.getByTestId("heatmap-segment-1");
    expect(highSeg.getAttribute("data-band")).toBe("high");
    expect(lowRedSeg.getAttribute("data-band")).toBe("low");

    const lowRect = lowRedSeg.querySelector("rect");
    expect(lowRect?.getAttribute("stroke")).toBe("#ef4444");

    // Filter to Low Red only -> high-confidence SVG segment is hidden, red segment stays visible
    fireEvent.click(screen.getByRole("button", { name: /^Low Red \(1\)/i }));
    expect(screen.queryByTestId("heatmap-segment-0")).toBeNull();
    expect(screen.getByTestId("heatmap-segment-1")).toBeTruthy();

    // Click Inspect Next Red (or click the red segment) to open manual correction & re-conversion panel
    fireEvent.click(screen.getByRole("button", { name: /Inspect Next Red/i }));
    expect(screen.getByText(/Low Confidence \(Red\)/i)).toBeTruthy();

    // Edit manual correction textarea and patch Markdown
    const correctionTextarea = screen.getByLabelText(/Manual Segment Correction/i);
    fireEvent.change(correctionTextarea, {
      target: { value: "| Prevalence | 38.4% |" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Patch Markdown/i }));
    expect(onMarkdownChange).toHaveBeenCalledTimes(1);
    expect(onMarkdownChange.mock.calls[0][0]).toContain("| Prevalence | 38.4% |");

    // Open Interactive Editor & Re-convert actions invoke callbacks
    fireEvent.click(screen.getByRole("button", { name: /Open Editor/i }));
    expect(onOpenEditor).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Re-convert with Vision/i }));
    expect(onReconvertWithVision).toHaveBeenCalledTimes(1);
  });
});
