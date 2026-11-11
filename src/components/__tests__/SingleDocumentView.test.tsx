// @vitest-environment jsdom
import React, { createRef } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import SingleDocumentView from "../SingleDocumentView";
import type {
  ConversionMode,
  TargetStyle,
  VisionModelType,
  TabType,
  SpatialDocumentResult,
  RefinementStage,
} from "../../types";

afterEach(() => {
  cleanup();
});

function createDefaultProps(overrides: Partial<React.ComponentProps<typeof SingleDocumentView>> = {}) {
  const fileInputRef = createRef<HTMLInputElement>() as React.RefObject<HTMLInputElement>;
  return {
    file: null,
    isLoading: false,
    convertedMarkdown: "",
    error: "",
    loadingStep: "",
    conversionMode: "standard" as ConversionMode,
    setConversionMode: vi.fn(),
    targetStyle: "gfm" as TargetStyle,
    setTargetStyle: vi.fn(),
    visionModel: "gemini-3.8-flash" as VisionModelType,
    setVisionModel: vi.fn(),
    onLoadSamplePolicyBrief: vi.fn(),
    isLoadingSamplePdf: false,
    activeTab: "preview" as TabType,
    setActiveTab: vi.fn(),
    currentThemeId: "github-dark",
    setCurrentThemeId: vi.fn(),
    dragActive: false,
    copied: false,
    handleDrag: vi.fn(),
    handleDrop: vi.fn(),
    handleFileInputChange: vi.fn(),
    onUploadClick: vi.fn(),
    handleClear: vi.fn(),
    handleConvert: vi.fn(),
    handleCopy: vi.fn(),
    handleDownload: vi.fn(),
    fileInputRef,
    onMarkdownChange: vi.fn(),
    spatialData: null as SpatialDocumentResult | null,
    isLoadingSpatial: false,
    onRefreshSpatialInspection: vi.fn(),
    qualityThreshold: 75,
    setQualityThreshold: vi.fn(),
    refinementStage: "idle" as RefinementStage,
    conversionElapsedMs: null as number | null,
    onKeepInstantDraft: vi.fn(),
    ...overrides,
  };
}

const SAMPLE_SPATIAL_DATA: SpatialDocumentResult = {
  success: true,
  totalPages: 2,
  pages: [],
  markdown: "# Preparedness of Urban Primary Healthcare Centres\n\n## Background\n\nSample spatial draft.",
  rawText: "Preparedness of Urban Primary Healthcare Centres",
  executionTimeMs: 42,
  documentHash: "a".repeat(64),
  cacheHit: true,
  quality: {
    qualityScore: 35,
    isSatisfactory: false,
    threshold: 75,
    decision: "ESCALATED_TO_GEMINI_MULTIMODAL",
    wordCount: 1480,
    avgWordsPerPage: 740,
    garbledGlyphRatio: 0,
    lexicalWordRatio: 0.96,
    detectedColumns: 2,
    mathSymbolCount: 0,
    tableMarkerCount: 8,
    hasEmbeddedCharts: true,
    hasComplexSemantics: true,
    requiresMultimodalVision: true,
    reasons: ["Multi-column layout detected"],
  },
};

describe("SingleDocumentView — Upload Dropzone & File Selection", () => {
  it("renders the dropzone in initial state and triggers upload, sample loader, drag/drop, and native file input handlers", () => {
    const props = createDefaultProps();
    const { container } = render(<SingleDocumentView {...props} />);

    expect(screen.getByText("Drag & drop your document here")).toBeTruthy();
    expect(screen.getByText("Browse Computer Files")).toBeTruthy();

    // Clicking the dropzone triggers onUploadClick
    fireEvent.click(screen.getByText("Drag & drop your document here"));
    expect(props.onUploadClick).toHaveBeenCalledTimes(1);

    // Clicking Load Sample Complex Policy Brief PDF triggers sample loader without bubbling to onUploadClick
    const sampleBtn = screen.getByRole("button", {
      name: /Load Sample Complex Policy Brief PDF/i,
    });
    fireEvent.click(sampleBtn);
    expect(props.onLoadSamplePolicyBrief).toHaveBeenCalledTimes(1);
    expect(props.onUploadClick).toHaveBeenCalledTimes(1);

    // Drag and drop events invoke handlers
    const dropzone = screen.getByText("Drag & drop your document here").closest("div")!;
    fireEvent.dragEnter(dropzone);
    fireEvent.drop(dropzone);
    expect(props.handleDrag).toHaveBeenCalled();
    expect(props.handleDrop).toHaveBeenCalledTimes(1);

    // Native hidden file input change invokes handleFileInputChange
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    const mockPdf = new File(["%PDF-1.7"], "clinical-study.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput, { target: { files: [mockPdf] } });
    expect(props.handleFileInputChange).toHaveBeenCalledTimes(1);
  });

  it("displays selected file details, PDF Pre-Flight telemetry, and updates conversion settings", () => {
    const selectedFile = new File(["x".repeat(2048)], "urban-health-report.pdf", {
      type: "application/pdf",
    });
    const props = createDefaultProps({
      file: selectedFile,
      spatialData: SAMPLE_SPATIAL_DATA,
    });

    render(<SingleDocumentView {...props} />);

    expect(screen.queryByText("Drag & drop your document here")).toBeNull();
    expect(screen.getByText("urban-health-report.pdf")).toBeTruthy();
    expect(screen.getByText(/2 KB/)).toBeTruthy();

    // PDF Pre-Flight telemetry banner
    expect(screen.getByText("PDF Pre-Flight")).toBeTruthy();
    expect(screen.getByText(/2 pages · 2-col grid · 42ms \(SHA-256 cache\)/)).toBeTruthy();
    expect(screen.getByText("Charts → GFM Tables")).toBeTruthy();
    expect(screen.getByText("Callouts & Quotes")).toBeTruthy();
    expect(screen.getByText("Gemini 3.8 Flash (Low Thinking)")).toBeTruthy();

    // Action buttons trigger clear and convert
    fireEvent.click(screen.getByRole("button", { name: /Change File/i }));
    expect(props.handleClear).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Convert Document/i }));
    expect(props.handleConvert).toHaveBeenCalledTimes(1);

    // Option switches update state callbacks
    fireEvent.click(screen.getByRole("button", { name: /^rich$/i }));
    expect(props.setConversionMode).toHaveBeenCalledWith("rich");

    fireEvent.click(screen.getByRole("button", { name: /Gemini 4 Pro/i }));
    expect(props.setVisionModel).toHaveBeenCalledWith("gemini-4-argon");

    fireEvent.click(screen.getByRole("button", { name: /90% \(Strict\)/i }));
    expect(props.setQualityThreshold).toHaveBeenCalledWith(90);
    expect(props.onRefreshSpatialInspection).toHaveBeenCalledWith(90);
  });
});

describe("SingleDocumentView — Conversion Progress & Two-Stage Refinement Transitions", () => {
  it("shows the standalone loading progress card when converting a document without an instant spatial draft", () => {
    const selectedFile = new File(["docx-bytes"], "protocol.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const props = createDefaultProps({
      file: selectedFile,
      isLoading: true,
      convertedMarkdown: "",
      loadingStep: "[Phase 1/2] Analyzing content grids and tables... • 2s elapsed",
    });

    render(<SingleDocumentView {...props} />);

    expect(screen.getByText("Converting Document to Clean Markdown")).toBeTruthy();
    expect(
      screen.getByText("[Phase 1/2] Analyzing content grids and tables... • 2s elapsed")
    ).toBeTruthy();

    const convertBtn = screen.getByRole("button", { name: /Converting\.\.\./i });
    expect((convertBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps the live Markdown preview visible during Stage 1 draft verification and supports Keep Instant Draft", () => {
    const selectedFile = new File(["%PDF"], "ARK-Urban-Primary-Care.pdf", {
      type: "application/pdf",
    });
    const draftMd = "# Preparedness Study\n\n## Background\n\nInstant local spatial draft content.";
    const props = createDefaultProps({
      file: selectedFile,
      isLoading: true,
      convertedMarkdown: draftMd,
      refinementStage: "draft_ready",
      loadingStep: "Gemini 3.8 Flash (Low Thinking) verifying multi-column layout... • 1s elapsed",
    });

    render(<SingleDocumentView {...props} />);

    // Standalone blocking spinner card must NOT be rendered when instant draft is available
    expect(screen.queryByText("Converting Document to Clean Markdown")).toBeNull();

    // Progressive Stage 1 banner + rendered preview remain interactive
    expect(screen.getByText("Instant 2D Spatial Draft Ready")).toBeTruthy();
    expect(
      screen.getByText(
        "Gemini 3.8 Flash (Low Thinking) verifying multi-column layout... • 1s elapsed"
      )
    ).toBeTruthy();
    expect(screen.getByText("Preparedness Study")).toBeTruthy();

    // Clicking Keep Instant Draft triggers abort callback
    const keepDraftBtn = screen.getByRole("button", { name: /Keep Instant Draft/i });
    fireEvent.click(keepDraftBtn);
    expect(props.onKeepInstantDraft).toHaveBeenCalledTimes(1);
  });

  it("transitions from Stage 2 live token streaming to Phase 1 Complete with elapsed duration and Phase 2 trigger", () => {
    const selectedFile = new File(["%PDF"], "ARK-Urban-Primary-Care.pdf", {
      type: "application/pdf",
    });
    const streamedMd = "# Refined Policy Brief\n\n## Key Findings\n\nVerified multimodal output.";

    const streamingProps = createDefaultProps({
      file: selectedFile,
      isLoading: true,
      convertedMarkdown: streamedMd,
      refinementStage: "refining_stream",
      loadingStep: "Streaming refined Markdown... 72 chars • 3s elapsed",
    });

    const { rerender } = render(<SingleDocumentView {...streamingProps} />);
    expect(screen.getByText("Streaming Gemini Visual Refinement")).toBeTruthy();

    // Transition to completed state
    const completedProps = createDefaultProps({
      ...streamingProps,
      isLoading: false,
      refinementStage: "completed",
      conversionElapsedMs: 3400,
    });

    rerender(<SingleDocumentView {...completedProps} />);

    expect(screen.getByText("Phase 1 Complete")).toBeTruthy();
    expect(screen.getByText(/10 words · 3\.4s/)).toBeTruthy();

    // Export / Copy actions and Phase 2 Analysis trigger work cleanly
    fireEvent.click(screen.getByRole("button", { name: /^Copy$/i }));
    expect(completedProps.handleCopy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Export \.md/i }));
    expect(completedProps.handleDownload).toHaveBeenCalledTimes(1);

    // Export OKF (.json) triggers OKF v0.2 JSON bundle download
    const createObjUrlSpy = vi.fn(() => "blob:okf-json");
    const revokeObjUrlSpy = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      writable: true,
      configurable: true,
      value: createObjUrlSpy,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      writable: true,
      configurable: true,
      value: revokeObjUrlSpy,
    });
    fireEvent.click(screen.getByRole("button", { name: /Export OKF \(\.json\)/i }));
    expect(createObjUrlSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjUrlSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Run Phase 2 Analysis/i }));
    expect(completedProps.setActiveTab).toHaveBeenCalledWith("stats");
  });
});

describe("SingleDocumentView — Error Display", () => {
  it("renders the error alert banner when error is populated and hides it when cleared", () => {
    const propsWithError = createDefaultProps({
      error:
        'Unsupported file format (.exe). Supported formats include PDF, DOCX, DOC, XLSX, XLS, PPTX, CSV, TXT, MD, HTML, JSON, XML, YAML, and Images.',
    });

    const { rerender } = render(<SingleDocumentView {...propsWithError} />);

    expect(screen.getByText("Conversion Note:")).toBeTruthy();
    expect(screen.getByText(/Unsupported file format \(\.exe\)/)).toBeTruthy();

    rerender(<SingleDocumentView {...createDefaultProps({ error: "" })} />);
    expect(screen.queryByText("Conversion Note:")).toBeNull();
  });
});
