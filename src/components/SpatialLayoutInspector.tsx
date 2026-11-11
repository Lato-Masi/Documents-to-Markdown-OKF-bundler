import React, { useState, useMemo, useEffect } from "react";
import {
  Layers,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Zap,
  Sliders,
  Copy,
  Check,
  Activity,
  Search,
  RefreshCw,
  Edit3,
  ArrowRight,
  Flame,
  Eye,
} from "lucide-react";
import { SpatialDocumentResult, SpatialPage } from "../types";
import {
  scoreSpatialPageSegments,
  summarizeDocumentConfidence,
  type ScoredSpatialSegment,
} from "../utils/pdfConfidenceScorer";

export interface SpatialLayoutInspectorProps {
  spatialData: SpatialDocumentResult | null;
  isLoading?: boolean;
  onRefreshInspection?: (threshold: number) => void;
  convertedMarkdown?: string;
  onMarkdownChange?: (updatedMarkdown: string) => void;
  onOpenEditor?: () => void;
  onReconvertWithVision?: () => void;
  base64Data?: string;
}

type OverlayMode = "heatmap" | "boxes" | "clean";
type ConfidenceFilter = "all" | "low" | "review";

export default function SpatialLayoutInspector({
  spatialData,
  isLoading = false,
  onRefreshInspection,
  convertedMarkdown = "",
  onMarkdownChange,
  onOpenEditor,
  onReconvertWithVision,
  base64Data,
}: SpatialLayoutInspectorProps) {
  const [selectedPageIndex, setSelectedPageIndex] = useState<number>(0);
  const [hoveredSegmentIndex, setHoveredSegmentIndex] = useState<number | null>(null);
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<number | null>(null);

  // Visual Heatmap & Layer States
  const [overlayMode, setOverlayMode] = useState<OverlayMode>("heatmap");
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>("all");
  const [lowConfidenceCutoff, setLowConfidenceCutoff] = useState<number>(65);
  const [showPdfBackdrop, setShowPdfBackdrop] = useState<boolean>(true);
  const [showContentBounds, setShowContentBounds] = useState<boolean>(false);
  const [showColumnGuides, setShowColumnGuides] = useState<boolean>(true);

  const [copiedJson, setCopiedJson] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [threshold, setThreshold] = useState<number>(
    spatialData?.quality?.threshold || 75
  );

  // Manual correction draft state for selected segment
  const [manualCorrectionText, setManualCorrectionText] = useState<string>("");
  const [correctionApplied, setCorrectionApplied] = useState<boolean>(false);

  // Cached rendered PDF page PNG data URLs keyed by `${documentHash}:p${pageNum}`
  const [pagePreviewMap, setPagePreviewMap] = useState<Record<string, string>>({});
  const [isLoadingPagePreview, setIsLoadingPagePreview] = useState<boolean>(false);

  // Clamp selected page index when spatialData changes
  useEffect(() => {
    if (spatialData?.pages && selectedPageIndex >= spatialData.pages.length) {
      setSelectedPageIndex(0);
      setSelectedSegmentIndex(null);
    }
  }, [spatialData, selectedPageIndex]);

  const currentPage: SpatialPage | undefined = spatialData?.pages?.[selectedPageIndex];

  // Fetch rendered PDF page raster from server on demand so the heatmap overlays the real PDF page
  useEffect(() => {
    if (!currentPage || !spatialData?.success) return;
    const docHash = spatialData.documentHash || "";
    if (!docHash && !base64Data) return;

    const cacheKey = `${docHash || "inline"}:p${currentPage.pageNum}`;
    if (pagePreviewMap[cacheKey]) return;

    let cancelled = false;
    setIsLoadingPagePreview(true);

    (async () => {
      try {
        const res = await fetch("/api/pdf-page-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentHash: docHash || undefined,
            pageNum: currentPage.pageNum,
            base64Data: docHash ? undefined : base64Data,
          }),
        });
        if (!cancelled && res.ok) {
          const payload = await res.json();
          if (payload?.success && typeof payload.dataUrl === "string") {
            setPagePreviewMap((prev) => ({ ...prev, [cacheKey]: payload.dataUrl }));
          }
        }
      } catch {
        // Silently fall back to SVG vector typography canvas when offline or in unit tests
      } finally {
        if (!cancelled) {
          setIsLoadingPagePreview(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentPage, spatialData?.documentHash, spatialData?.success, base64Data, pagePreviewMap]);

  // Document-wide & page-level confidence scoring
  const docConfidence = useMemo(() => {
    if (!spatialData?.pages) {
      return summarizeDocumentConfidence([], {
        convertedMarkdown,
        lowConfidenceThreshold: lowConfidenceCutoff,
      });
    }
    return summarizeDocumentConfidence(spatialData.pages, {
      convertedMarkdown,
      lowConfidenceThreshold: lowConfidenceCutoff,
    });
  }, [spatialData?.pages, convertedMarkdown, lowConfidenceCutoff]);

  const currentPageSegments: ScoredSpatialSegment[] = useMemo(() => {
    if (!currentPage) return [];
    return scoreSpatialPageSegments(currentPage, {
      convertedMarkdown,
      lowConfidenceThreshold: lowConfidenceCutoff,
    });
  }, [currentPage, convertedMarkdown, lowConfidenceCutoff]);

  const selectedSegment: ScoredSpatialSegment | null =
    selectedSegmentIndex !== null
      ? currentPageSegments.find((s) => s.index === selectedSegmentIndex) || null
      : null;

  useEffect(() => {
    if (selectedSegment) {
      setManualCorrectionText(selectedSegment.item.text);
      setCorrectionApplied(false);
    }
  }, [selectedSegment?.id]);

  const filteredSegments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = currentPageSegments.filter((seg) => {
      if (confidenceFilter === "low" && seg.band !== "low") return false;
      if (confidenceFilter === "review" && seg.band === "high") return false;
      if (!q) return true;
      return (
        seg.item.text.toLowerCase().includes(q) ||
        seg.reasons.some((r) => r.toLowerCase().includes(q))
      );
    });
    // Sort low-confidence segments first when viewing heatmap triage
    return [...list].sort((a, b) => a.confidence - b.confidence || a.index - b.index);
  }, [currentPageSegments, confidenceFilter, searchQuery]);

  const handleStepNextLowConfidence = () => {
    if (!spatialData?.pages || docConfidence.lowConfidenceSegments.length === 0) return;

    const lowList = docConfidence.lowConfidenceSegments;
    const currentId = selectedSegment?.id;
    const currentPos = currentId ? lowList.findIndex((s) => s.id === currentId) : -1;
    const nextSeg = lowList[(currentPos + 1) % lowList.length];

    const targetPageIdx = spatialData.pages.findIndex(
      (p) => p.pageNum === nextSeg.pageNum
    );
    if (targetPageIdx >= 0) {
      setSelectedPageIndex(targetPageIdx);
      setSelectedSegmentIndex(nextSeg.index);
      setOverlayMode("heatmap");
    }
  };

  const handleApplyManualCorrection = () => {
    if (!selectedSegment || !onMarkdownChange) return;
    const originalText = selectedSegment.item.text.trim();
    const updatedText = manualCorrectionText.trim();
    if (!updatedText) return;

    if (convertedMarkdown && originalText && convertedMarkdown.includes(originalText)) {
      onMarkdownChange(convertedMarkdown.replace(originalText, updatedText));
    } else if (convertedMarkdown) {
      onMarkdownChange(`${convertedMarkdown.trimEnd()}\n\n${updatedText}\n`);
    } else {
      onMarkdownChange(updatedText);
    }
    setCorrectionApplied(true);
  };

  const handleCopyJson = () => {
    if (!spatialData) return;
    navigator.clipboard.writeText(JSON.stringify(spatialData, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-emerald-400">
          <RefreshCw className="w-5 h-5 animate-spin" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-zinc-100">
            Computing 2D Spatial Layout & Segment Confidence Heatmap
          </h3>
          <p className="text-xs text-zinc-400 font-mono">
            Evaluating glyph fidelity, column collisions, chart labels, and Markdown coverage...
          </p>
        </div>
      </div>
    );
  }

  if (
    !spatialData ||
    !spatialData.success ||
    !spatialData.pages ||
    spatialData.pages.length === 0
  ) {
    return (
      <div className="p-8 text-center bg-zinc-950/60 border border-zinc-800 rounded-xl space-y-3">
        <div className="mx-auto w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500">
          <Layers className="w-5 h-5" />
        </div>
        <h4 className="text-sm font-semibold text-zinc-200">
          No PDF Spatial Heatmap Available
        </h4>
        <p className="text-xs text-zinc-400 max-w-md mx-auto">
          Upload or load a PDF document to inspect per-segment confidence scores, highlight low-confidence regions in red, and trigger targeted manual edits or re-conversion.
        </p>
      </div>
    );
  }

  const { quality } = spatialData;
  const isSatisfactory =
    !quality.requiresMultimodalVision &&
    quality.detectedColumns < 2 &&
    !quality.hasEmbeddedCharts &&
    !quality.hasComplexSemantics &&
    quality.qualityScore >= threshold;

  const pageWidth = currentPage?.width || 612;
  const pageHeight = currentPage?.height || 792;
  const activePreviewKey = `${spatialData.documentHash || "inline"}:p${currentPage?.pageNum || 1}`;
  const activePageDataUrl = pagePreviewMap[activePreviewKey];

  return (
    <div className="space-y-6">
      {/* Top Diagnostic Summary & Triage Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Card 1: Visual Quality Heatmap Summary */}
        <div className="p-5 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col justify-between space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>Segment Confidence Heatmap</span>
              </div>
              <div className="flex items-baseline gap-2 mt-1 font-mono tabular-nums">
                <span
                  className={`text-3xl font-bold ${
                    docConfidence.lowConfidenceCount > 0
                      ? "text-rose-400"
                      : "text-emerald-400"
                  }`}
                >
                  {docConfidence.lowConfidenceCount}
                </span>
                <span className="text-xs text-zinc-400">
                  low-confidence {docConfidence.lowConfidenceCount === 1 ? "segment" : "segments"} (&lt;{lowConfidenceCutoff}%)
                </span>
              </div>
            </div>

            {docConfidence.lowConfidenceCount > 0 ? (
              <button
                type="button"
                onClick={handleStepNextLowConfidence}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Inspect Next Red</span>
              </button>
            ) : (
              <span className="text-xs font-mono tabular-nums text-emerald-400 inline-flex items-center gap-1 whitespace-nowrap shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>All Segments Verified</span>
              </span>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono tabular-nums text-zinc-400">
              <span className="text-rose-400">
                Low (Red): {docConfidence.lowConfidenceCount}
              </span>
              <span>·</span>
              <span className="text-amber-300">
                Review: {docConfidence.mediumConfidenceCount}
              </span>
              <span>·</span>
              <span className="text-emerald-400">
                High: {docConfidence.highConfidenceCount}
              </span>
            </div>

            {/* Proportional stacked confidence bar using pure SVG (zero inline styles) */}
            <svg
              viewBox="0 0 100 4"
              preserveAspectRatio="none"
              className="w-full h-2 rounded-full overflow-hidden bg-zinc-900"
              aria-label="Segment confidence distribution bar"
            >
              {docConfidence.totalSegments > 0 && (
                <>
                  <rect
                    x={0}
                    y={0}
                    width={
                      (docConfidence.lowConfidenceCount / docConfidence.totalSegments) *
                      100
                    }
                    height={4}
                    fill="#dc2626"
                  />
                  <rect
                    x={
                      (docConfidence.lowConfidenceCount / docConfidence.totalSegments) *
                      100
                    }
                    y={0}
                    width={
                      (docConfidence.mediumConfidenceCount /
                        docConfidence.totalSegments) *
                      100
                    }
                    height={4}
                    fill="#d97706"
                  />
                  <rect
                    x={
                      ((docConfidence.lowConfidenceCount +
                        docConfidence.mediumConfidenceCount) /
                        docConfidence.totalSegments) *
                      100
                    }
                    y={0}
                    width={
                      (docConfidence.highConfidenceCount / docConfidence.totalSegments) *
                      100
                    }
                    height={4}
                    fill="#16a34a"
                  />
                </>
              )}
            </svg>
          </div>
        </div>

        {/* Card 2: LiteParse Quality Score & Inspection Signals */}
        <div className="p-5 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col justify-between space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span>LiteParse Quality Score</span>
              </div>
              <div className="flex items-baseline gap-2 mt-1 font-mono tabular-nums">
                <span
                  className={`text-3xl font-bold ${
                    isSatisfactory ? "text-emerald-400" : "text-amber-400"
                  }`}
                >
                  {quality.qualityScore}
                </span>
                <span className="text-xs text-zinc-500">/ 100</span>
                <span className="text-zinc-600">·</span>
                <span className="text-xs text-zinc-300">
                  Avg Confidence {docConfidence.averageConfidence}%
                </span>
              </div>
            </div>

            <span className="text-xs font-mono text-zinc-400 inline-flex items-center gap-1 whitespace-nowrap shrink-0">
              {isSatisfactory ? (
                <>
                  <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-emerald-400">Fast Deterministic</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-amber-300">Vision Escalated</span>
                </>
              )}
            </span>
          </div>

          <div className="space-y-1 max-h-20 overflow-y-auto pr-1 text-[11px] text-zinc-300">
            {quality.reasons.slice(0, 3).map((r, idx) => (
              <div key={idx} className="truncate" title={r}>
                {r}
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-zinc-400 flex-wrap">
            <span>{quality.detectedColumns}-col layout</span>
            <span>·</span>
            <span>Lexical {((quality.lexicalWordRatio || 1) * 100).toFixed(1)}%</span>
            {typeof quality.filteredNoiseCount === "number" && (
              <>
                <span>·</span>
                <span className="text-emerald-400">
                  {quality.filteredNoiseCount} noise stripped
                </span>
              </>
            )}
          </div>
        </div>

        {/* Card 3: Heatmap Cutoff & Re-Conversion Action */}
        <div className="p-5 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col justify-between space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label
                htmlFor="low-confidence-cutoff-slider"
                className="font-medium text-zinc-200 flex items-center gap-1.5"
              >
                <Sliders className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>Red Alert Cutoff</span>
              </label>
              <span className="font-mono tabular-nums text-rose-400 font-semibold">
                &lt; {lowConfidenceCutoff}%
              </span>
            </div>
            <input
              id="low-confidence-cutoff-slider"
              type="range"
              min="45"
              max="85"
              step="5"
              value={lowConfidenceCutoff}
              onChange={(e) => setLowConfidenceCutoff(Number(e.target.value))}
              className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
            />
            <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono tabular-nums">
              <span>45% (Strict Red)</span>
              <span>65% (Default)</span>
              <span>85% (Sensitive)</span>
            </div>
          </div>

          <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-2">
            <div className="text-[11px] text-zinc-400 font-mono tabular-nums">
              AI Gate: {threshold}%
              <input
                aria-label="Quality Routing Threshold"
                type="range"
                min="50"
                max="95"
                step="5"
                value={threshold}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setThreshold(val);
                  if (onRefreshInspection) onRefreshInspection(val);
                }}
                className="w-20 ml-2 align-middle h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-indigo-500"
              />
            </div>

            {onReconvertWithVision && (
              <button
                type="button"
                onClick={onReconvertWithVision}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer"
                title="Re-convert this PDF using Rich Multimodal Vision to resolve low-confidence segments"
              >
                <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                <span>Re-convert with Vision</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main PDF Viewer & Heatmap Inspector Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: PDF Page Viewer + SVG Quality Heatmap Overlay (7 Cols) */}
        <div className="lg:col-span-7 space-y-3">
          {/* Viewer Toolbar */}
          <div className="p-2.5 bg-zinc-950 rounded-xl border border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            {/* Page Selector with Per-Page Red Low-Confidence Indicators */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-zinc-400 font-medium mr-0.5">Page</span>
              {spatialData.pages.map((p, idx) => {
                const pSummary = docConfidence.pageSummaries[idx];
                const lowOnPage = pSummary?.lowCount || 0;
                const isActive = selectedPageIndex === idx;
                return (
                  <button
                    key={p.pageNum}
                    type="button"
                    onClick={() => {
                      setSelectedPageIndex(idx);
                      setSelectedSegmentIndex(null);
                      setHoveredSegmentIndex(null);
                    }}
                    className={`px-2.5 py-1 rounded-lg font-mono tabular-nums text-xs transition inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                      isActive
                        ? "bg-zinc-800 text-white border border-zinc-600 font-semibold"
                        : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                    }`}
                  >
                    <span>{p.pageNum}</span>
                    {lowOnPage > 0 && (
                      <span className="text-[10px] text-rose-400 font-semibold">
                        · {lowOnPage} red
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Overlay Mode & Backdrop Toggles */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="flex items-center gap-0.5 p-0.5 bg-zinc-900 rounded-lg border border-zinc-800">
                {(
                  [
                    { id: "heatmap", label: "Quality Heatmap" },
                    { id: "boxes", label: "Layout Boxes" },
                    { id: "clean", label: "Clean PDF" },
                  ] as Array<{ id: OverlayMode; label: string }>
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setOverlayMode(m.id)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition whitespace-nowrap shrink-0 cursor-pointer ${
                      overlayMode === m.id
                        ? m.id === "heatmap"
                          ? "bg-rose-950/90 text-rose-300 border border-rose-800/80 font-semibold"
                          : "bg-zinc-800 text-zinc-100 font-semibold"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {activePageDataUrl && (
                <button
                  type="button"
                  onClick={() => setShowPdfBackdrop(!showPdfBackdrop)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
                    showPdfBackdrop
                      ? "bg-zinc-800 border-zinc-700 text-zinc-200"
                      : "bg-zinc-900 border-zinc-800 text-zinc-500"
                  }`}
                >
                  <Eye className="w-3 h-3 shrink-0" />
                  <span>PDF Layer</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowColumnGuides(!showColumnGuides)}
                className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition whitespace-nowrap shrink-0 cursor-pointer ${
                  showColumnGuides
                    ? "bg-zinc-800 border-zinc-700 text-indigo-300"
                    : "bg-zinc-900 border-zinc-800 text-zinc-500"
                }`}
              >
                Columns
              </button>

              <button
                type="button"
                onClick={() => setShowContentBounds(!showContentBounds)}
                className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition whitespace-nowrap shrink-0 cursor-pointer ${
                  showContentBounds
                    ? "bg-zinc-800 border-zinc-700 text-emerald-300"
                    : "bg-zinc-900 border-zinc-800 text-zinc-500"
                }`}
              >
                Bounds
              </button>
            </div>
          </div>

          {/* Heatmap Legend Strip */}
          {overlayMode === "heatmap" && (
            <div className="px-3.5 py-2 rounded-lg bg-zinc-950 border border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-3 flex-wrap text-zinc-300 font-mono tabular-nums">
                <span className="inline-flex items-center gap-1.5 text-rose-300 font-semibold">
                  <span className="w-3 h-2.5 rounded-xs bg-rose-600/60 border border-rose-500 inline-block" />
                  <span>Low Confidence (&lt;{lowConfidenceCutoff}%) — Needs Review</span>
                </span>
                <span className="text-zinc-600">·</span>
                <span className="inline-flex items-center gap-1.5 text-amber-300">
                  <span className="w-3 h-2.5 rounded-xs bg-amber-500/40 border border-amber-500 inline-block" />
                  <span>Review ({lowConfidenceCutoff}–84%)</span>
                </span>
                <span className="text-zinc-600">·</span>
                <span className="inline-flex items-center gap-1.5 text-emerald-300">
                  <span className="w-3 h-2.5 rounded-xs bg-emerald-500/20 border border-emerald-500/60 inline-block" />
                  <span>High (≥85%)</span>
                </span>
              </div>

              {isLoadingPagePreview && (
                <span className="text-zinc-500 font-mono">Rendering PDF raster...</span>
              )}
            </div>
          )}

          {/* Responsive Vector + Raster PDF Page Viewport with SVG Heatmap Overlay */}
          <div className="bg-zinc-950 rounded-xl border border-zinc-800 p-3 sm:p-4 flex items-center justify-center overflow-auto">
            {currentPage && (
              <svg
                viewBox={`0 0 ${pageWidth} ${pageHeight}`}
                className={`w-full max-w-[600px] h-auto rounded-lg border shadow-xl select-none ${
                  showPdfBackdrop && activePageDataUrl
                    ? "bg-white border-zinc-700"
                    : "bg-zinc-900 border-zinc-700/80"
                }`}
                role="img"
                aria-label={`PDF Page ${currentPage.pageNum} Visual Quality Heatmap`}
              >
                <defs>
                  {/* Subtle coordinate blueprint grid when PDF raster backdrop is off */}
                  <pattern
                    id="pdf-spatial-grid"
                    width="24"
                    height="24"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 24 0 L 0 0 0 24"
                      fill="none"
                      stroke="rgba(99, 102, 241, 0.12)"
                      strokeWidth="0.75"
                    />
                  </pattern>

                  {/* Diagonal warning hatch pattern for red low-confidence segments (accessible non-hue cue) */}
                  <pattern
                    id="low-confidence-red-hatch"
                    width="8"
                    height="8"
                    patternTransform="rotate(45 0 0)"
                    patternUnits="userSpaceOnUse"
                  >
                    <rect width="8" height="8" fill="rgba(220, 38, 38, 0.28)" />
                    <line
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="8"
                      stroke="rgba(239, 68, 68, 0.45)"
                      strokeWidth="2"
                    />
                  </pattern>
                </defs>

                {/* Page Backdrop: Real PDFium PNG Raster or Dark Blueprint Grid */}
                {showPdfBackdrop && activePageDataUrl ? (
                  <image
                    href={activePageDataUrl}
                    x={0}
                    y={0}
                    width={pageWidth}
                    height={pageHeight}
                    preserveAspectRatio="none"
                  />
                ) : (
                  <rect
                    x={0}
                    y={0}
                    width={pageWidth}
                    height={pageHeight}
                    fill="url(#pdf-spatial-grid)"
                  />
                )}

                {/* Content Bounds Overlay */}
                {showContentBounds && currentPage.contentBounds && (
                  <rect
                    x={currentPage.contentBounds.x}
                    y={currentPage.contentBounds.y}
                    width={currentPage.contentBounds.width}
                    height={currentPage.contentBounds.height}
                    fill="rgba(16, 185, 129, 0.04)"
                    stroke="rgba(16, 185, 129, 0.65)"
                    strokeWidth={1.2}
                    strokeDasharray="5 4"
                  />
                )}

                {/* Multi-Column Split Guide */}
                {showColumnGuides && currentPage.detectedColumns > 1 && (
                  <g>
                    <line
                      x1={pageWidth / 2}
                      y1={0}
                      x2={pageWidth / 2}
                      y2={pageHeight}
                      stroke="rgba(99, 102, 241, 0.55)"
                      strokeWidth={1.2}
                      strokeDasharray="6 4"
                    />
                    <rect
                      x={pageWidth / 2 + 4}
                      y={8}
                      width={58}
                      height={16}
                      rx={3}
                      fill="#1e1b4b"
                      stroke="#4338ca"
                      strokeWidth={0.8}
                    />
                    <text
                      x={pageWidth / 2 + 9}
                      y={19}
                      fill="#c7d2fe"
                      fontSize={9}
                      fontFamily="monospace"
                    >
                      Col Split
                    </text>
                  </g>
                )}

                {/* Render Segment Overlays (Quality Heatmap or Layout Bounding Boxes) */}
                {overlayMode !== "clean" &&
                  currentPageSegments.map((seg) => {
                    const { item, index, confidence, band, reasons } = seg;
                    const isHovered = hoveredSegmentIndex === index;
                    const isSelected = selectedSegmentIndex === index;
                    const isMatchSearch =
                      searchQuery.trim().length > 0 &&
                      item.text.toLowerCase().includes(searchQuery.toLowerCase());

                    // Hide non-matching bands when user filters to Low Confidence Only
                    const hiddenByFilter =
                      (confidenceFilter === "low" && band !== "low") ||
                      (confidenceFilter === "review" && band === "high");

                    if (hiddenByFilter && !isSelected && !isMatchSearch) {
                      return null;
                    }

                    const rxVal = Math.max(2, Math.min(4, item.height * 0.15));
                    const w = Math.max(8, item.width);
                    const h = Math.max(8, item.height);

                    let rectFill = "rgba(39, 39, 42, 0.36)";
                    let rectStroke = "rgba(113, 113, 122, 0.65)";
                    let strokeW = 1;

                    if (overlayMode === "heatmap") {
                      if (band === "low") {
                        rectFill = isSelected || isHovered
                          ? "rgba(220, 38, 38, 0.44)"
                          : "url(#low-confidence-red-hatch)";
                        rectStroke = isSelected ? "#fca5a5" : "#ef4444";
                        strokeW = isSelected ? 2.4 : 1.7;
                      } else if (band === "medium") {
                        rectFill = isSelected || isHovered
                          ? "rgba(217, 119, 6, 0.36)"
                          : "rgba(217, 119, 6, 0.20)";
                        rectStroke = isSelected ? "#fde68a" : "#f59e0b";
                        strokeW = isSelected ? 2.2 : 1.3;
                      } else {
                        rectFill = isSelected || isHovered
                          ? "rgba(16, 185, 129, 0.24)"
                          : "rgba(16, 185, 129, 0.08)";
                        rectStroke = isSelected
                          ? "#6ee7b7"
                          : "rgba(16, 185, 129, 0.42)";
                        strokeW = isSelected ? 2 : 0.9;
                      }
                    } else if (isSelected || isHovered) {
                      rectFill = "rgba(99, 102, 241, 0.32)";
                      rectStroke = "#818cf8";
                      strokeW = isSelected ? 2.2 : 1.4;
                    } else if (isMatchSearch) {
                      rectFill = "rgba(245, 158, 11, 0.30)";
                      rectStroke = "#fbbf24";
                      strokeW = 1.5;
                    }

                    const showBlueprintText = !(showPdfBackdrop && activePageDataUrl);
                    const fontSizePx = Math.max(7, Math.min(11, h * 0.68));

                    return (
                      <g
                        key={seg.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`Segment ${index + 1}: ${confidence}% confidence (${band}) — ${item.text.slice(0, 60)}`}
                        data-testid={`heatmap-segment-${index}`}
                        data-confidence={confidence}
                        data-band={band}
                        onMouseEnter={() => setHoveredSegmentIndex(index)}
                        onMouseLeave={() => setHoveredSegmentIndex(null)}
                        onClick={() => setSelectedSegmentIndex(index)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedSegmentIndex(index);
                          }
                        }}
                        className="cursor-pointer focus:outline-none"
                      >
                        <title>
                          {`[${confidence}% · ${band.toUpperCase()}] ${item.text}\nReason: ${reasons[0] || ""}`}
                        </title>

                        <rect
                          x={item.x}
                          y={item.y}
                          width={w}
                          height={h}
                          rx={rxVal}
                          fill={rectFill}
                          stroke={rectStroke}
                          strokeWidth={strokeW}
                        />

                        {/* Render crisp vector text preview when PDF raster backdrop is not displayed */}
                        {showBlueprintText && w > 24 && h > 8 && (
                          <text
                            x={item.x + 3}
                            y={item.y + Math.min(h - 2, fontSizePx + 1)}
                            fill={band === "low" && overlayMode === "heatmap" ? "#fecaca" : "#e4e4e7"}
                            fontSize={fontSizePx}
                            fontFamily="sans-serif"
                            className="pointer-events-none"
                          >
                            {item.text.slice(0, Math.max(6, Math.floor(w / (fontSizePx * 0.55))))}
                          </text>
                        )}

                        {/* Explicit non-hue score callout tag on red low-confidence segments */}
                        {overlayMode === "heatmap" && band === "low" && w >= 28 && (
                          <g className="pointer-events-none">
                            <rect
                              x={Math.max(0, item.x + w - 30)}
                              y={Math.max(0, item.y - 11)}
                              width={30}
                              height={11}
                              rx={2}
                              fill="#991b1b"
                              stroke="#ef4444"
                              strokeWidth={0.7}
                            />
                            <text
                              x={Math.max(0, item.x + w - 27)}
                              y={Math.max(8, item.y - 3)}
                              fill="#ffffff"
                              fontSize={7.5}
                              fontWeight="bold"
                              fontFamily="monospace"
                            >
                              {confidence}%!
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}
              </svg>
            )}
          </div>
        </div>

        {/* Right Column: Low-Confidence Triage, Manual Correction & Segment Stream (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Filter Tabs & Search */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1 p-1 bg-zinc-950 rounded-lg border border-zinc-800">
                {(
                  [
                    {
                      id: "all",
                      label: `All (${currentPageSegments.length})`,
                    },
                    {
                      id: "low",
                      label: `Low Red (${
                        currentPageSegments.filter((s) => s.band === "low").length
                      })`,
                    },
                    {
                      id: "review",
                      label: `Review (${
                        currentPageSegments.filter((s) => s.band !== "high").length
                      })`,
                    },
                  ] as Array<{ id: ConfidenceFilter; label: string }>
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setConfidenceFilter(f.id)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium font-mono tabular-nums transition whitespace-nowrap shrink-0 cursor-pointer ${
                      confidenceFilter === f.id
                        ? f.id === "low"
                          ? "bg-rose-950 text-rose-300 border border-rose-800 font-semibold"
                          : "bg-zinc-800 text-emerald-400 font-semibold"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleCopyJson}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-medium transition text-xs whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copiedJson ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <Copy className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>{copiedJson ? "Copied JSON" : "Copy JSON"}</span>
              </button>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filter segments or low-confidence reasons..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-rose-500 transition"
              />
            </div>
          </div>

          {/* Selected Segment Inspection, Manual Correction & Re-Conversion Card */}
          {selectedSegment && (
            <div
              className={`p-4 rounded-xl border space-y-3 ${
                selectedSegment.band === "low"
                  ? "bg-rose-950/25 border-rose-800/80"
                  : selectedSegment.band === "medium"
                  ? "bg-amber-950/20 border-amber-800/70"
                  : "bg-zinc-950 border-zinc-800"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-mono tabular-nums text-xs">
                  <span
                    className={`font-bold ${
                      selectedSegment.band === "low"
                        ? "text-rose-400"
                        : selectedSegment.band === "medium"
                        ? "text-amber-300"
                        : "text-emerald-400"
                    }`}
                  >
                    {selectedSegment.confidence}% Confidence
                  </span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-zinc-300 capitalize">
                    {selectedSegment.band === "low"
                      ? "Low Confidence (Red)"
                      : selectedSegment.band === "medium"
                      ? "Needs Review"
                      : "Verified"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedSegmentIndex(null)}
                  className="text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  Close
                </button>
              </div>

              {/* Diagnostic Reasons */}
              <div className="space-y-1 text-xs text-zinc-200">
                {selectedSegment.reasons.map((reason, idx) => (
                  <div key={idx} className="flex items-start gap-1.5">
                    {selectedSegment.band === "low" ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    )}
                    <span>{reason}</span>
                  </div>
                ))}
              </div>

              {/* Coordinates & Markdown Coverage */}
              <div className="text-[11px] font-mono tabular-nums text-zinc-400 flex items-center gap-2 flex-wrap">
                <span>
                  Box ({selectedSegment.item.x.toFixed(0)}, {selectedSegment.item.y.toFixed(0)}) · {selectedSegment.item.width.toFixed(0)}×{selectedSegment.item.height.toFixed(0)}pt
                </span>
                <span>·</span>
                <span>
                  MD Match {Math.round(selectedSegment.markdownMatchRatio * 100)}%
                </span>
              </div>

              {/* Inline Manual Correction & Action Buttons */}
              <div className="space-y-2 pt-2 border-t border-zinc-800/80">
                <label
                  htmlFor="segment-manual-correction-input"
                  className="block text-[11px] font-medium text-zinc-300"
                >
                  Manual Segment Correction
                </label>
                <textarea
                  id="segment-manual-correction-input"
                  rows={2}
                  value={manualCorrectionText}
                  onChange={(e) => {
                    setManualCorrectionText(e.target.value);
                    setCorrectionApplied(false);
                  }}
                  className="w-full p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500"
                />

                <div className="flex items-center gap-2 flex-wrap">
                  {onMarkdownChange && (
                    <button
                      type="button"
                      onClick={handleApplyManualCorrection}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {correctionApplied ? (
                        <>
                          <Check className="w-3.5 h-3.5 shrink-0" />
                          <span>Applied to Markdown</span>
                        </>
                      ) : (
                        <>
                          <Edit3 className="w-3.5 h-3.5 shrink-0" />
                          <span>Patch Markdown</span>
                        </>
                      )}
                    </button>
                  )}

                  {onOpenEditor && (
                    <button
                      type="button"
                      onClick={onOpenEditor}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-medium inline-flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <span>Open Editor</span>
                      <ArrowRight className="w-3 h-3 shrink-0" />
                    </button>
                  )}

                  {onReconvertWithVision && selectedSegment.band !== "high" && (
                    <button
                      type="button"
                      onClick={onReconvertWithVision}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium inline-flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3 shrink-0" />
                      <span>Re-convert</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Prioritized Segment Confidence List */}
          <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
            {filteredSegments.length === 0 ? (
              <div className="py-8 px-4 text-center text-xs text-zinc-400 border border-dashed border-zinc-800 rounded-xl">
                {confidenceFilter === "low"
                  ? `No low-confidence (<${lowConfidenceCutoff}%) red segments on Page ${
                      selectedPageIndex + 1
                    }.`
                  : "No matching spatial segments found on this page."}
              </div>
            ) : (
              filteredSegments.map((seg) => {
                const isSelected = selectedSegmentIndex === seg.index;
                const isHovered = hoveredSegmentIndex === seg.index;

                return (
                  <div
                    key={seg.id}
                    onMouseEnter={() => setHoveredSegmentIndex(seg.index)}
                    onMouseLeave={() => setHoveredSegmentIndex(null)}
                    onClick={() => setSelectedSegmentIndex(seg.index)}
                    className={`p-2.5 rounded-lg border text-xs cursor-pointer transition flex items-start justify-between gap-3 ${
                      isSelected
                        ? seg.band === "low"
                          ? "bg-rose-950/50 border-rose-600 text-rose-100"
                          : "bg-zinc-800 border-indigo-500 text-zinc-100"
                        : isHovered
                        ? "bg-zinc-900 border-zinc-700 text-zinc-100"
                        : seg.band === "low"
                        ? "bg-rose-950/20 border-rose-900/70 text-zinc-200 hover:border-rose-700"
                        : seg.band === "medium"
                        ? "bg-amber-950/10 border-amber-900/40 text-zinc-300 hover:border-amber-700/60"
                        : "bg-zinc-950/60 border-zinc-800/80 text-zinc-300 hover:border-zinc-700"
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="font-sans leading-snug line-clamp-2 text-zinc-100">
                        {seg.item.text}
                      </div>
                      {seg.band !== "high" && seg.reasons[0] && (
                        <div
                          className={`text-[11px] truncate ${
                            seg.band === "low" ? "text-rose-300" : "text-amber-300/90"
                          }`}
                        >
                          {seg.reasons[0]}
                        </div>
                      )}
                    </div>

                    <div className="text-right font-mono tabular-nums shrink-0 space-y-0.5">
                      <div
                        className={`text-xs font-bold ${
                          seg.band === "low"
                            ? "text-rose-400"
                            : seg.band === "medium"
                            ? "text-amber-300"
                            : "text-emerald-400"
                        }`}
                      >
                        {seg.confidence}%
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        {seg.band === "low"
                          ? "LOW"
                          : seg.band === "medium"
                          ? "REVIEW"
                          : "OK"}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
