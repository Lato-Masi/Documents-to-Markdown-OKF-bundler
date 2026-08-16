import React, { useState, useMemo } from "react";
import {
  Layers,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Zap,
  Sliders,
  Maximize2,
  FileText,
  Copy,
  Check,
  Columns,
  Hash,
  Activity,
  Search,
  Eye,
  Info,
} from "lucide-react";
import { SpatialDocumentResult, SpatialPage, SpatialTextItem } from "../types";

interface SpatialLayoutInspectorProps {
  spatialData: SpatialDocumentResult | null;
  isLoading?: boolean;
  onRefreshInspection?: (threshold: number) => void;
}

export default function SpatialLayoutInspector({
  spatialData,
  isLoading = false,
  onRefreshInspection,
}: SpatialLayoutInspectorProps) {
  const [selectedPageIndex, setSelectedPageIndex] = useState<number>(0);
  const [hoveredItemIndex, setHoveredItemIndex] = useState<number | null>(null);
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState<boolean>(true);
  const [showContentBounds, setShowContentBounds] = useState<boolean>(true);
  const [showWordBoxes, setShowWordBoxes] = useState<boolean>(false);
  const [showColumnGuides, setShowColumnGuides] = useState<boolean>(true);
  const [copiedJson, setCopiedJson] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [threshold, setThreshold] = useState<number>(spatialData?.quality?.threshold || 75);

  const currentPage: SpatialPage | undefined = spatialData?.pages[selectedPageIndex];

  const filteredTextItems = useMemo(() => {
    if (!currentPage?.textItems) return [];
    if (!searchQuery.trim()) return currentPage.textItems;
    const q = searchQuery.toLowerCase();
    return currentPage.textItems.filter((it) => it.text.toLowerCase().includes(q));
  }, [currentPage, searchQuery]);

  const handleCopyJson = () => {
    if (!spatialData) return;
    navigator.clipboard.writeText(JSON.stringify(spatialData, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-indigo-950/60 border border-indigo-700/60 flex items-center justify-center text-indigo-400 animate-spin">
          <Layers className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-zinc-100">
            Analyzing 2D Spatial Layout & Quality Thresholds
          </h3>
          <p className="text-xs text-zinc-400 font-mono">
            Running @llamaindex/liteparse vector extraction & glyph density scoring...
          </p>
        </div>
      </div>
    );
  }

  if (!spatialData || !spatialData.success || !spatialData.pages || spatialData.pages.length === 0) {
    return (
      <div className="p-8 text-center bg-zinc-950/40 border border-zinc-800 rounded-2xl space-y-3">
        <div className="mx-auto w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500">
          <Layers className="w-5 h-5" />
        </div>
        <h4 className="text-sm font-semibold text-zinc-200">No 2D Spatial Layout Available</h4>
        <p className="text-xs text-zinc-400 max-w-md mx-auto">
          Spatial layout bounding boxes and column segmentation are extracted automatically for PDF documents via @llamaindex/liteparse.
        </p>
      </div>
    );
  }

  const { quality } = spatialData;
  const isSatisfactory = quality.qualityScore >= threshold;
  const pageWidth = currentPage?.width || 612;
  const pageHeight = currentPage?.height || 792;
  const scale = 520 / pageWidth;
  const canvasHeight = pageHeight * scale;

  return (
    <div className="space-y-6">
      {/* Top Header & Quality Assessment Banner */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Quality Score Hero Card */}
        <div
          className={`p-5 rounded-2xl border flex flex-col justify-between ${
            isSatisfactory
              ? "bg-emerald-950/20 border-emerald-800/60 shadow-lg shadow-emerald-950/20"
              : "bg-amber-950/20 border-amber-800/60 shadow-lg shadow-amber-950/20"
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                LiteParse Quality Score
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span
                  className={`text-4xl font-extrabold font-mono ${
                    isSatisfactory ? "text-emerald-400" : "text-amber-400"
                  }`}
                >
                  {quality.qualityScore}
                </span>
                <span className="text-xs text-zinc-500 font-mono">/ 100</span>
              </div>
            </div>

            <div
              className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 border ${
                isSatisfactory
                  ? "bg-emerald-950 border-emerald-700 text-emerald-300"
                  : "bg-amber-950 border-amber-700 text-amber-300"
              }`}
            >
              {isSatisfactory ? (
                <>
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Fast Deterministic</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>AI Escalated</span>
                </>
              )}
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Threshold: {threshold}/100</span>
              <span>
                Status:{" "}
                <strong className={isSatisfactory ? "text-emerald-400" : "text-amber-400"}>
                  {isSatisfactory ? "Passed" : "Escalation Required"}
                </strong>
              </span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isSatisfactory ? "bg-emerald-500" : "bg-amber-500"
                }`}
                style={{ width: `${quality.qualityScore}%` }}
              />
            </div>
          </div>
        </div>

        {/* Diagnostic Signals & Reasons */}
        <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-indigo-400" />
              <span>Inspection Signals & Heuristics</span>
            </h4>
            <span className="text-[10px] font-mono text-zinc-500">
              {spatialData.executionTimeMs}ms
            </span>
          </div>

          <div className="space-y-1.5 overflow-y-auto max-h-24 pr-1 text-xs">
            {quality.reasons.map((r, idx) => (
              <div key={idx} className="flex items-start gap-1.5 text-zinc-300 text-[11px]">
                <span className="text-indigo-400 shrink-0">•</span>
                <span>{r}</span>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-400">
            <span>Detected Columns: <strong>{quality.detectedColumns}-Column</strong></span>
            <span>Lexical Accuracy: <strong>{((quality.lexicalWordRatio || 1) * 100).toFixed(1)}%</strong></span>
          </div>
        </div>

        {/* Quality Threshold Adjuster */}
        <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                <span>Quality Routing Threshold</span>
              </h4>
              <span className="px-2 py-0.5 rounded bg-zinc-800 text-indigo-300 font-mono text-xs font-bold border border-zinc-700">
                {threshold}%
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">
              Documents scoring below this threshold escalate to Gemini 3.6 Flash multimodal vision.
            </p>
          </div>

          <div className="space-y-2">
            <input
              type="range"
              min="50"
              max="95"
              step="5"
              value={threshold}
              onChange={(e) => {
                const val = Number(e.target.value);
                setThreshold(val);
                if (onRefreshInspection) {
                  onRefreshInspection(val);
                }
              }}
              className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
            <div className="flex justify-between text-[10px] font-mono text-zinc-500">
              <span>50 (Aggressive Fast)</span>
              <span>75 (Recommended)</span>
              <span>95 (Strict AI)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Spatial Layout Explorer Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: 2D Spatial Page Canvas (7 Cols) */}
        <div className="lg:col-span-7 space-y-3">
          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-zinc-950/80 rounded-xl border border-zinc-800 text-xs">
            {/* Page Selector */}
            <div className="flex items-center gap-1">
              <span className="text-zinc-400 font-medium mr-1">Page:</span>
              <div className="flex items-center gap-1">
                {spatialData.pages.map((p, idx) => (
                  <button
                    key={p.pageNum}
                    onClick={() => {
                      setSelectedPageIndex(idx);
                      setSelectedItemIndex(null);
                      setHoveredItemIndex(null);
                    }}
                    className={`px-2.5 py-1 rounded-lg font-mono text-xs transition ${
                      selectedPageIndex === idx
                        ? "bg-indigo-600 text-white font-bold shadow"
                        : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                    }`}
                  >
                    {p.pageNum}
                  </button>
                ))}
              </div>
            </div>

            {/* Visual Overlays Toggles */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setShowBoundingBoxes(!showBoundingBoxes)}
                className={`px-2 py-1 rounded text-[11px] font-medium border transition ${
                  showBoundingBoxes
                    ? "bg-indigo-950 border-indigo-700 text-indigo-300"
                    : "bg-zinc-900 border-zinc-800 text-zinc-500"
                }`}
              >
                Boxes
              </button>
              <button
                onClick={() => setShowContentBounds(!showContentBounds)}
                className={`px-2 py-1 rounded text-[11px] font-medium border transition ${
                  showContentBounds
                    ? "bg-emerald-950 border-emerald-700 text-emerald-300"
                    : "bg-zinc-900 border-zinc-800 text-zinc-500"
                }`}
              >
                Bounds
              </button>
              <button
                onClick={() => setShowColumnGuides(!showColumnGuides)}
                className={`px-2 py-1 rounded text-[11px] font-medium border transition ${
                  showColumnGuides
                    ? "bg-purple-950 border-purple-700 text-purple-300"
                    : "bg-zinc-900 border-zinc-800 text-zinc-500"
                }`}
              >
                Columns
              </button>
            </div>
          </div>

          {/* Interactive 2D Page Canvas */}
          <div className="relative bg-zinc-950 rounded-2xl border border-zinc-800 p-4 flex items-center justify-center overflow-hidden min-h-[460px]">
            {currentPage ? (
              <div
                className="relative bg-zinc-900 border border-zinc-700/80 rounded-lg shadow-2xl overflow-hidden select-none transition-all"
                style={{
                  width: `${pageWidth * scale}px`,
                  height: `${canvasHeight}px`,
                }}
              >
                {/* Background Grid Pattern */}
                <div
                  className="absolute inset-0 opacity-10 pointer-events-none"
                  style={{
                    backgroundImage:
                      "linear-gradient(to right, #4f46e5 1px, transparent 1px), linear-gradient(to bottom, #4f46e5 1px, transparent 1px)",
                    backgroundSize: "20px 20px",
                  }}
                />

                {/* Content Bounds Overlay */}
                {showContentBounds && currentPage.contentBounds && (
                  <div
                    className="absolute border border-dashed border-emerald-500/60 bg-emerald-500/5 pointer-events-none"
                    style={{
                      left: `${currentPage.contentBounds.x * scale}px`,
                      top: `${currentPage.contentBounds.y * scale}px`,
                      width: `${currentPage.contentBounds.width * scale}px`,
                      height: `${currentPage.contentBounds.height * scale}px`,
                    }}
                  />
                )}

                {/* Multi-Column Center Divider Guides */}
                {showColumnGuides && currentPage.detectedColumns > 1 && (
                  <div
                    className="absolute top-0 bottom-0 border-l border-dashed border-purple-500/40 pointer-events-none"
                    style={{ left: `${(pageWidth / 2) * scale}px` }}
                  >
                    <span className="absolute top-2 left-1 px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 text-[9px] font-mono border border-purple-800">
                      Col Split
                    </span>
                  </div>
                )}

                {/* Render Text Items 2D Bounding Boxes */}
                {currentPage.textItems.map((item, idx) => {
                  const isHovered = hoveredItemIndex === idx;
                  const isSelected = selectedItemIndex === idx;
                  const isMatchSearch =
                    searchQuery.trim().length > 0 &&
                    item.text.toLowerCase().includes(searchQuery.toLowerCase());

                  const itemLeft = item.x * scale;
                  const itemTop = item.y * scale;
                  const itemWidth = Math.max(8, item.width * scale);
                  const itemHeight = Math.max(6, item.height * scale);

                  return (
                    <div
                      key={idx}
                      onMouseEnter={() => setHoveredItemIndex(idx)}
                      onMouseLeave={() => setHoveredItemIndex(null)}
                      onClick={() => setSelectedItemIndex(idx)}
                      title={`[${idx + 1}] ${item.text} (${item.width.toFixed(0)}x${item.height.toFixed(0)} at ${item.x.toFixed(0)},${item.y.toFixed(0)})`}
                      className={`absolute cursor-pointer transition-all ${
                        isSelected
                          ? "bg-indigo-500/40 border-2 border-indigo-400 z-30 shadow-lg ring-2 ring-indigo-400/50"
                          : isHovered
                          ? "bg-indigo-400/30 border border-indigo-300 z-20"
                          : isMatchSearch
                          ? "bg-amber-400/30 border border-amber-400 z-10"
                          : showBoundingBoxes
                          ? "bg-zinc-800/40 hover:bg-zinc-700/60 border border-zinc-600/50"
                          : "opacity-0 hover:opacity-100 hover:bg-indigo-400/20"
                      }`}
                      style={{
                        left: `${itemLeft}px`,
                        top: `${itemTop}px`,
                        width: `${itemWidth}px`,
                        height: `${itemHeight}px`,
                      }}
                    >
                      {/* Optional micro text preview on bounding box */}
                      {itemWidth > 24 && itemHeight > 8 && (
                        <span
                          className="absolute inset-0 px-0.5 text-[8px] leading-tight text-zinc-300 overflow-hidden text-ellipsis whitespace-nowrap opacity-80 pointer-events-none"
                          style={{ fontSize: `${Math.max(6, Math.min(10, itemHeight * 0.7))}px` }}
                        >
                          {item.text}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        {/* Right Column: Spatial Text Item Inspector & Bounding Box Details (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search extracted spatial text..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          {/* Active Item Detail Inspector Card */}
          {selectedItemIndex !== null && currentPage?.textItems[selectedItemIndex] ? (
            <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-700/60 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-indigo-300 font-bold">
                  Selected Item #{selectedItemIndex + 1}
                </span>
                <button
                  onClick={() => setSelectedItemIndex(null)}
                  className="text-[10px] text-zinc-400 hover:text-zinc-200"
                >
                  Clear
                </button>
              </div>

              <div className="p-2.5 bg-zinc-950/80 rounded-lg border border-zinc-800 text-xs text-zinc-100 font-mono break-words">
                {currentPage.textItems[selectedItemIndex].text}
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-zinc-400">
                <div className="p-1.5 bg-zinc-900 rounded border border-zinc-800">
                  <span>X: {currentPage.textItems[selectedItemIndex].x.toFixed(1)}px</span>
                </div>
                <div className="p-1.5 bg-zinc-900 rounded border border-zinc-800">
                  <span>Y: {currentPage.textItems[selectedItemIndex].y.toFixed(1)}px</span>
                </div>
                <div className="p-1.5 bg-zinc-900 rounded border border-zinc-800">
                  <span>W: {currentPage.textItems[selectedItemIndex].width.toFixed(1)}px</span>
                </div>
                <div className="p-1.5 bg-zinc-900 rounded border border-zinc-800">
                  <span>H: {currentPage.textItems[selectedItemIndex].height.toFixed(1)}px</span>
                </div>
              </div>
            </div>
          ) : null}

          {/* Spatial Text Stream List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>
                Page {selectedPageIndex + 1} Text Elements ({filteredTextItems.length})
              </span>
              <button
                onClick={handleCopyJson}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition text-[11px]"
              >
                {copiedJson ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedJson ? "Copied JSON" : "Copy JSON"}</span>
              </button>
            </div>

            <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
              {filteredTextItems.map((item, idx) => {
                const isSelected = selectedItemIndex === idx;
                const isHovered = hoveredItemIndex === idx;

                return (
                  <div
                    key={idx}
                    onMouseEnter={() => setHoveredItemIndex(idx)}
                    onMouseLeave={() => setHoveredItemIndex(null)}
                    onClick={() => setSelectedItemIndex(idx)}
                    className={`p-2 rounded-lg border text-xs cursor-pointer transition flex items-start justify-between gap-2 ${
                      isSelected
                        ? "bg-indigo-950/60 border-indigo-600 text-indigo-200"
                        : isHovered
                        ? "bg-zinc-800/80 border-zinc-700 text-zinc-100"
                        : "bg-zinc-950/40 border-zinc-800/80 text-zinc-300 hover:border-zinc-700"
                    }`}
                  >
                    <span className="font-sans leading-relaxed line-clamp-2">{item.text}</span>
                    <span className="font-mono text-[10px] text-zinc-500 shrink-0">
                      ({item.x.toFixed(0)}, {item.y.toFixed(0)})
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
