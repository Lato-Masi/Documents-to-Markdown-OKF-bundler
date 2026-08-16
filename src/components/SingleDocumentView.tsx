import React, { useMemo, useState } from "react";
import {
  FileText,
  UploadCloud,
  Settings,
  Sparkles,
  Copy,
  Check,
  Download,
  Trash2,
  RefreshCw,
  Play,
  HelpCircle,
  Archive,
} from "lucide-react";
import MarkdownEditor from "./MarkdownEditor";
import RenderedMarkdownPreview from "./RenderedMarkdownPreview";
import HighlightedCodeBlock from "./HighlightedCodeBlock";
import ASTExplorer from "./ASTExplorer";
import OKFExplorer from "./OKFExplorer";
import AgentSkillExplorer from "./AgentSkillExplorer";
import DocumentInsights from "./DocumentInsights";
import SpatialLayoutInspector from "./SpatialLayoutInspector";
import ErrorBoundary from "./ErrorBoundary";
import { ConversionMode, TargetStyle, TabType, SpatialDocumentResult } from "../types";
import { formatBytes } from "../utils/fileHelpers";
import { convertMultipleMarkdownsToOKFBundle, exportOKFBundleAsZip, downloadZipBlob } from "../utils/okfZipExporter";

interface SingleDocumentViewProps {
  file: File | null;
  isLoading: boolean;
  convertedMarkdown: string;
  error: string;
  loadingStep: string;
  conversionMode: ConversionMode;
  setConversionMode: (mode: ConversionMode) => void;
  targetStyle: TargetStyle;
  setTargetStyle: (style: TargetStyle) => void;
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  currentThemeId: string;
  setCurrentThemeId: (id: string) => void;
  dragActive: boolean;
  copied: boolean;
  handleDrag: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUploadClick: () => void;
  handleClear: () => void;
  handleConvert: () => void;
  handleCopy: () => void;
  handleDownload: () => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onMarkdownChange?: (newVal: string) => void;
  spatialData?: SpatialDocumentResult | null;
  isLoadingSpatial?: boolean;
  onRefreshSpatialInspection?: (threshold: number) => void;
  qualityThreshold?: number;
  setQualityThreshold?: (val: number) => void;
}

export default function SingleDocumentView({
  file,
  isLoading,
  convertedMarkdown,
  error,
  loadingStep,
  conversionMode,
  setConversionMode,
  targetStyle,
  setTargetStyle,
  activeTab,
  setActiveTab,
  currentThemeId,
  setCurrentThemeId,
  dragActive,
  copied,
  handleDrag,
  handleDrop,
  handleFileInputChange,
  onUploadClick,
  handleClear,
  handleConvert,
  handleCopy,
  handleDownload,
  fileInputRef,
  onMarkdownChange,
  spatialData,
  isLoadingSpatial = false,
  onRefreshSpatialInspection,
  qualityThreshold = 75,
  setQualityThreshold,
}: SingleDocumentViewProps) {
  const [hasRunAnalysis, setHasRunAnalysis] = React.useState(false);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [isExportingOKF, setIsExportingOKF] = useState(false);

  // Reset analysis status when converting a new document or clearing file
  React.useEffect(() => {
    if (isLoading) {
      setHasRunAnalysis(false);
      setIsAnalyzing(false);
    }
  }, [isLoading]);

  const handleExportOKFBundle = async () => {
    if (!convertedMarkdown) return;
    setIsExportingOKF(true);
    try {
      const baseName = file ? file.name.replace(/\.[^/.]+$/, "") : "document";
      const bundleResult = convertMultipleMarkdownsToOKFBundle(
        [{ fileName: file ? file.name : "document.md", markdown: convertedMarkdown }],
        `${baseName}-okf-knowledge-base`
      );
      const { zipBlob } = await exportOKFBundleAsZip(bundleResult, {
        bundleName: `${baseName}-okf-knowledge-base`,
      });
      downloadZipBlob(zipBlob, `${baseName}-okf-knowledge-base.zip`);
    } catch (err) {
      console.error("Failed to export OKF bundle:", err);
    } finally {
      setIsExportingOKF(false);
    }
  };

  const wordCount = useMemo(() => {
    if (!convertedMarkdown) return 0;
    const matches = convertedMarkdown.match(/\S+/g);
    return matches ? matches.length : 0;
  }, [convertedMarkdown]);
  return (
    <div className="space-y-6">
      {/* Hidden native file input */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileInputChange}
        accept=".pdf,.docx,.doc,.txt,.md,.csv,.json,.html,.xml,.xlsx,.xls,.png,.jpg,.jpeg,.webp"
        className="hidden"
      />

      {/* File Dropzone & Selection Area */}
      {!file ? (
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={onUploadClick}
          className={`relative border-2 border-dashed rounded-2xl p-6 sm:p-12 text-center cursor-pointer transition-all duration-300 ${
            dragActive
              ? "border-emerald-500 bg-emerald-950/20 shadow-xl shadow-emerald-950/30 scale-[1.01]"
              : "border-zinc-800 hover:border-zinc-700 bg-zinc-900/40 hover:bg-zinc-900/80"
          }`}
        >
          <div className="mx-auto w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-zinc-800/80 flex items-center justify-center text-emerald-400 mb-3 sm:mb-4 border border-zinc-700/60 shadow-lg">
            <UploadCloud className="w-6 h-6 sm:w-8 sm:h-8" />
          </div>
          <h3 className="text-base sm:text-lg font-semibold text-zinc-100 mb-1">
            Drag & drop your document here
          </h3>
          <p className="text-xs sm:text-sm text-zinc-400 mb-4 max-w-md mx-auto">
            Supports PDF (OCR/spatial parsing), Word (.docx), Excel (.xlsx/.csv), Web HTML, Images, and Text files.
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition shadow-md shadow-emerald-950/40">
            <span>Browse Computer Files</span>
          </div>
        </div>
      ) : (
        /* Selected File Card & Actions */
        <div className="bg-zinc-900/80 rounded-2xl p-4 sm:p-5 border border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
            <div className="p-2.5 sm:p-3 bg-zinc-800 rounded-xl text-emerald-400 border border-zinc-700/60 shadow shrink-0">
              <FileText className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-xs sm:text-sm font-semibold text-zinc-100 truncate">{file.name}</h4>
              <p className="text-[11px] sm:text-xs text-zinc-400 mt-0.5">
                {formatBytes(file.size)} • {file.type || "Document"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={handleClear}
              disabled={isLoading}
              className="flex-1 sm:flex-initial px-3.5 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700/60 rounded-xl transition flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              <span>Change File</span>
            </button>

            <button
              onClick={handleConvert}
              disabled={isLoading}
              className="flex-1 sm:flex-initial px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-300 shrink-0" />
                  <span>Converting...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                  <span>Convert Document</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Conversion Options */}
      <div className="p-3.5 sm:p-4 bg-zinc-900/50 rounded-2xl border border-zinc-800/80 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-xs">
        <div>
          <label className="block text-zinc-400 font-medium mb-1.5 flex items-center gap-1.5 text-[11px] sm:text-xs">
            <Settings className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Conversion Depth</span>
          </label>
          <div className="grid grid-cols-3 gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
            {(["standard", "rich", "text-only"] as ConversionMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setConversionMode(mode)}
                className={`py-1.5 px-1 sm:px-2 rounded-lg capitalize font-medium transition text-[11px] sm:text-xs truncate ${
                  conversionMode === mode
                    ? "bg-zinc-800 text-emerald-400 shadow-sm border border-zinc-700/80 font-bold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
                title={mode.replace("-", " ")}
              >
                {mode.replace("-", " ")}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-zinc-400 font-medium mb-1.5 flex items-center gap-1.5 text-[11px] sm:text-xs">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Target Markdown Syntax Style</span>
          </label>
          <div className="grid grid-cols-3 gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
            {(["standard", "gfm", "academic"] as TargetStyle[]).map((style) => (
              <button
                key={style}
                onClick={() => setTargetStyle(style)}
                className={`py-1.5 px-1 sm:px-2 rounded-lg capitalize font-medium transition text-[11px] sm:text-xs truncate ${
                  targetStyle === style
                    ? "bg-zinc-800 text-emerald-400 shadow-sm border border-zinc-700/80 font-bold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
                title={style}
              >
                {style}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-zinc-400 font-medium mb-1.5 flex items-center justify-between text-[11px] sm:text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-400 inline-block" />
              <span>AI Escalation Threshold</span>
            </span>
            <span className="font-mono text-indigo-300 font-semibold">{qualityThreshold}%</span>
          </label>
          <div className="grid grid-cols-3 gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
            {[
              { label: "50% (Fast)", val: 50 },
              { label: "75% (Std)", val: 75 },
              { label: "90% (Strict)", val: 90 },
            ].map((opt) => (
              <button
                key={opt.val}
                onClick={() => {
                  if (setQualityThreshold) setQualityThreshold(opt.val);
                  if (onRefreshSpatialInspection) onRefreshSpatialInspection(opt.val);
                }}
                className={`py-1.5 px-1 rounded-lg font-medium transition text-[11px] truncate ${
                  qualityThreshold === opt.val
                    ? "bg-indigo-950 text-indigo-300 border border-indigo-700/80 font-bold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-800/50 rounded-xl text-xs text-rose-300 flex items-start gap-2.5">
          <div className="p-1 bg-rose-900/50 rounded-md text-rose-400">
            <HelpCircle className="w-4 h-4" />
          </div>
          <div>
            <span className="font-semibold text-rose-200">Conversion Note:</span> {error}
          </div>
        </div>
      )}

      {/* Loading Progress Indicator */}
      {isLoading && (
        <div className="p-6 bg-zinc-900/90 border border-emerald-500/30 rounded-2xl text-center space-y-4 shadow-xl relative overflow-hidden">
          <div className="inline-flex p-3 bg-emerald-950/60 rounded-2xl text-emerald-400 border border-emerald-800/50 shadow-inner">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
          </div>

          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-zinc-100 flex items-center justify-center gap-2">
              <span>[Phase 1/2] Converting Document to Clean Markdown</span>
              {convertedMarkdown && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-950 text-emerald-400 text-[10px] font-mono border border-emerald-800/80">
                  LIVE STREAMING
                </span>
              )}
            </h4>
            <p className="text-xs text-emerald-400 font-mono animate-pulse max-w-md mx-auto">
              {loadingStep || "Initializing conversion engine..."}
            </p>
          </div>

          {/* Animated Progress Accent Line */}
          <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden max-w-xs mx-auto">
            <div className="h-full bg-emerald-500 rounded-full animate-pulse w-3/4 transition-all duration-500"></div>
          </div>
        </div>
      )}

      {/* Converted Markdown Output Preview & Tabs */}
      {convertedMarkdown && (
        <div className="space-y-4">
          {/* Phase 1 Completion & Phase 2 Analysis Banner */}
          {!isLoading && (
            <div className="p-3.5 bg-emerald-950/40 border border-emerald-800/60 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-md">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-emerald-900/60 text-emerald-400 rounded-lg shrink-0 border border-emerald-700/50">
                  <Check className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-semibold text-emerald-300">Phase 1 Complete:</span>{" "}
                  <span className="text-zinc-300">
                    Clean Markdown generated ({wordCount.toLocaleString()} words). Ready to view, edit, or export.
                  </span>
                </div>
              </div>
              {!hasRunAnalysis ? (
                <button
                  onClick={() => {
                    setHasRunAnalysis(true);
                    setActiveTab("stats");
                  }}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition flex items-center gap-1.5 shadow shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Run Phase 2 Analysis</span>
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-950 border border-indigo-800/80 text-indigo-300 rounded-lg text-xs font-mono">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span>Phase 2 Analysis Ready</span>
                </span>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-zinc-900/90 p-2 sm:p-2.5 rounded-2xl border border-zinc-800">
            <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800/80 overflow-x-auto max-w-full no-scrollbar">
              {(
                [
                  { id: "preview", label: "Rendered Preview" },
                  { id: "raw", label: "Interactive Editor" },
                  { id: "spatial", label: "Spatial Layout (LiteParse)" },
                  { id: "ast", label: "AST Explorer" },
                  { id: "okf", label: "OKF Knowledge Blocks" },
                  { id: "skills", label: "Agent Skill (SKILL.md)" },
                  { id: "stats", label: "Document Insights" },
                ] as { id: TabType; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (tab.id === "stats") {
                      setHasRunAnalysis(true);
                    }
                    setActiveTab(tab.id);
                  }}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-medium transition whitespace-nowrap shrink-0 ${
                    activeTab === tab.id
                      ? "bg-zinc-800 text-emerald-400 border border-zinc-700/80 shadow font-bold"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 w-full sm:w-auto">
              {isLoading ? (
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-950/80 border border-emerald-800/80 text-emerald-400 rounded-lg text-xs font-mono animate-pulse">
                  <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
                  <span>Streaming Output...</span>
                </span>
              ) : (
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 bg-zinc-950 border border-emerald-900/60 text-emerald-400 rounded-lg text-xs font-mono">
                  <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>Phase 1 Done ({wordCount.toLocaleString()} words)</span>
                </span>
              )}
              <button
                onClick={handleCopy}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5 border border-zinc-700/60 flex-1 sm:flex-initial"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>

              <button
                onClick={handleDownload}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5 border border-zinc-700/60 flex-1 sm:flex-initial"
              >
                <Download className="w-3.5 h-3.5 shrink-0" />
                <span>Export .md</span>
              </button>

              <button
                onClick={handleExportOKFBundle}
                disabled={isExportingOKF}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5 shadow flex-1 sm:flex-initial"
                title="Export structured Open Knowledge Format bundle (OKF v0.2) as a ZIP with typed concepts, index, and logs."
              >
                <Archive className="w-3.5 h-3.5 shrink-0" />
                <span>{isExportingOKF ? "Packaging OKF..." : "Export OKF (.zip)"}</span>
              </button>
            </div>
          </div>

          {/* Active Tab View Render */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-3 sm:p-5 min-h-[350px] sm:min-h-[400px]">
            {activeTab === "preview" && (
              <ErrorBoundary title="Rendered Preview Error">
                <RenderedMarkdownPreview
                  markdown={convertedMarkdown}
                  currentThemeId={currentThemeId}
                  onSelectTheme={setCurrentThemeId}
                  onMarkdownChange={onMarkdownChange}
                />
              </ErrorBoundary>
            )}

            {activeTab === "raw" && (
              <ErrorBoundary title="Interactive Markdown Editor Error">
                <MarkdownEditor
                  value={convertedMarkdown}
                  onChange={onMarkdownChange || (() => {})}
                />
              </ErrorBoundary>
            )}

            {activeTab === "spatial" && (
              <ErrorBoundary title="Spatial Layout Inspector Error">
                <SpatialLayoutInspector
                  spatialData={spatialData || null}
                  isLoading={isLoadingSpatial}
                  onRefreshInspection={onRefreshSpatialInspection}
                />
              </ErrorBoundary>
            )}

            {activeTab === "ast" && (
              <ErrorBoundary title="AST Explorer Render Error">
                <ASTExplorer
                  markdown={convertedMarkdown}
                  currentThemeId={currentThemeId}
                  onSelectTheme={setCurrentThemeId}
                />
              </ErrorBoundary>
            )}

            {activeTab === "okf" && (
              <ErrorBoundary title="OKF Knowledge Explorer Error">
                <OKFExplorer markdown={convertedMarkdown} />
              </ErrorBoundary>
            )}

            {activeTab === "skills" && (
              <ErrorBoundary title="Agent Skill Explorer Error">
                <AgentSkillExplorer
                  markdown={convertedMarkdown}
                  sourceFileName={file?.name || "runbook.md"}
                />
              </ErrorBoundary>
            )}

            {activeTab === "stats" && (
              <ErrorBoundary title="Document Insights Analysis Error">
                <DocumentInsights
                  markdown={convertedMarkdown}
                  hasRunAnalysis={hasRunAnalysis}
                  onRunAnalysis={() => setHasRunAnalysis(true)}
                  isAnalyzing={isAnalyzing}
                />
              </ErrorBoundary>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
