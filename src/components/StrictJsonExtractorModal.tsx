import React, { useState, useEffect } from "react";
import {
  Code2,
  FileJson,
  Sparkles,
  Play,
  RefreshCw,
  Copy,
  Check,
  Download,
  Layers,
  FileText,
  Globe,
  Sliders,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Braces,
  ArrowRight,
  BookOpen,
} from "lucide-react";

export interface SchemaExtractionPreset {
  id: string;
  name: string;
  description: string;
  category: string;
  schema: object;
  defaultPrompt: string;
}

interface StrictJsonExtractorModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeMarkdownContent?: string;
  activeUrl?: string;
  onApplyJsonToWorkspace?: (jsonString: string) => void;
}

export default function StrictJsonExtractorModal({
  isOpen,
  onClose,
  activeMarkdownContent = "",
  activeUrl = "",
  onApplyJsonToWorkspace,
}: StrictJsonExtractorModalProps) {
  const [sourceMode, setSourceMode] = useState<"current_doc" | "url" | "custom_text">(
    activeMarkdownContent ? "current_doc" : "url"
  );
  const [targetUrl, setTargetUrl] = useState<string>(activeUrl || "https://playwright.dev/docs/intro");
  const [customText, setCustomText] = useState<string>("");
  const [selectedPresetId, setSelectedPresetId] = useState<string>("api_reference");
  const [presets, setPresets] = useState<SchemaExtractionPreset[]>([]);
  const [customSchemaText, setCustomSchemaText] = useState<string>("");
  const [customPromptText, setCustomPromptText] = useState<string>("");
  const [useCustomSchema, setUseCustomSchema] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [extractedResult, setExtractedResult] = useState<any>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"tree" | "raw_json" | "schema">("tree");

  // Load presets on mount
  useEffect(() => {
    fetch("/api/extract/presets")
      .then((res) => res.json())
      .then((data) => {
        if (data.presets) {
          setPresets(data.presets);
          const defaultPreset = data.presets.find((p: any) => p.id === "api_reference") || data.presets[0];
          if (defaultPreset) {
            setCustomSchemaText(JSON.stringify(defaultPreset.schema, null, 2));
            setCustomPromptText(defaultPreset.defaultPrompt);
          }
        }
      })
      .catch(() => {});
  }, []);

  const handleSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = presets.find((p) => p.id === presetId);
    if (preset) {
      setCustomSchemaText(JSON.stringify(preset.schema, null, 2));
      setCustomPromptText(preset.defaultPrompt);
    }
  };

  const handleExecuteExtraction = async () => {
    setIsLoading(true);
    setError("");
    setExtractedResult(null);

    let contentToSend: string | undefined = undefined;
    let urlToSend: string | undefined = undefined;

    if (sourceMode === "current_doc") {
      if (!activeMarkdownContent.trim()) {
        setError("No document content is currently open in the workspace.");
        setIsLoading(false);
        return;
      }
      contentToSend = activeMarkdownContent;
    } else if (sourceMode === "url") {
      if (!targetUrl.trim()) {
        setError("Please enter a valid webpage URL.");
        setIsLoading(false);
        return;
      }
      urlToSend = targetUrl.trim();
    } else {
      if (!customText.trim()) {
        setError("Please provide custom text or markdown content.");
        setIsLoading(false);
        return;
      }
      contentToSend = customText;
    }

    try {
      let schemaObj: any = undefined;
      if (useCustomSchema && customSchemaText.trim()) {
        try {
          schemaObj = JSON.parse(customSchemaText);
        } catch (e) {
          throw new Error("Custom JSON Schema is not valid JSON.");
        }
      }

      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: contentToSend,
          url: urlToSend,
          presetId: useCustomSchema ? undefined : selectedPresetId,
          jsonSchema: schemaObj,
          extractionPrompt: customPromptText.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to extract structured schema data");
      }

      setExtractedResult(data.result);
      setActiveTab("tree");
    } catch (err: any) {
      setError(err?.message || "Failed to execute structured JSON schema extraction");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyJson = () => {
    if (!extractedResult) return;
    navigator.clipboard.writeText(extractedResult.rawJsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadJson = () => {
    if (!extractedResult) return;
    const blob = new Blob([extractedResult.rawJsonString], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `extracted_schema_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-zinc-900 border border-zinc-700/80 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Braces className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-zinc-100">
                  Strict JSON Schema Extraction Engine
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-medium border border-amber-500/30">
                  Phase 3 Firecrawl Structured Extract
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Transforms unstructured web pages and Markdown documents into strictly validated JSON datasets conforming to custom schemas or preset industry templates.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 p-2 rounded-lg hover:bg-zinc-800 text-sm font-medium transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Configuration Bar */}
        <div className="p-4 bg-zinc-900/90 border-b border-zinc-800/80 space-y-3">
          {/* Source Selector */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-xs">
              <button
                onClick={() => setSourceMode("current_doc")}
                className={`px-3 py-1 rounded-md transition font-medium cursor-pointer ${
                  sourceMode === "current_doc"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Active Workspace Document
              </button>
              <button
                onClick={() => setSourceMode("url")}
                className={`px-3 py-1 rounded-md transition font-medium cursor-pointer ${
                  sourceMode === "url"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Fetch Live Webpage URL
              </button>
              <button
                onClick={() => setSourceMode("custom_text")}
                className={`px-3 py-1 rounded-md transition font-medium cursor-pointer ${
                  sourceMode === "custom_text"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Paste Custom Text
              </button>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-400 flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useCustomSchema}
                  onChange={(e) => setUseCustomSchema(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-amber-500"
                />
                <span>Custom Schema / Edit JSON Schema</span>
              </label>
            </div>
          </div>

          {/* Conditional Input Box */}
          {sourceMode === "url" && (
            <div className="flex gap-2">
              <input
                type="text"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://example.com/api-docs, pricing, or product page"
                className="w-full bg-zinc-950 border border-zinc-700/80 rounded-lg px-3.5 py-2 text-xs sm:text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition"
              />
            </div>
          )}

          {sourceMode === "custom_text" && (
            <div>
              <textarea
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Paste unformatted document text, HTML, or raw data here..."
                rows={3}
                className="w-full bg-zinc-950 border border-zinc-700/80 rounded-lg p-2.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
          )}

          {/* Preset Selector or Schema Editor */}
          {!useCustomSchema ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Template Presets:</span>
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleSelectPreset(preset.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition cursor-pointer flex items-center gap-1.5 ${
                    selectedPresetId === preset.id
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm"
                      : "bg-zinc-800/80 text-zinc-400 border-zinc-700/60 hover:text-zinc-200"
                  }`}
                  title={preset.description}
                >
                  <FileJson className="w-3.5 h-3.5 text-amber-400" />
                  <span>{preset.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <div>
                <label className="text-[11px] text-zinc-400 block mb-1 font-mono">Target JSON Schema (Draft 7/OpenAPI):</label>
                <textarea
                  value={customSchemaText}
                  onChange={(e) => setCustomSchemaText(e.target.value)}
                  rows={4}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="text-[11px] text-zinc-400 block mb-1 font-mono">Extraction Directive / Prompt:</label>
                <textarea
                  value={customPromptText}
                  onChange={(e) => setCustomPromptText(e.target.value)}
                  rows={4}
                  placeholder="Specific guidelines for extracting and formatting values..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-[11px] text-zinc-200 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          )}

          {/* Action Trigger */}
          <div className="flex items-center justify-between pt-1">
            <div className="text-xs text-zinc-400">
              {sourceMode === "current_doc" && (
                <span>
                  Source: <strong>Active Workspace Document</strong> ({activeMarkdownContent.length.toLocaleString()} chars)
                </span>
              )}
              {sourceMode === "url" && <span>Source: <strong>Live Webpage URL</strong></span>}
              {sourceMode === "custom_text" && <span>Source: <strong>Custom Text Buffer</strong></span>}
            </div>

            <button
              onClick={handleExecuteExtraction}
              disabled={isLoading}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg font-medium text-xs sm:text-sm transition flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-amber-950/40"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-200" />
                  <span>Extracting Structured Schema...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Run Strict JSON Extraction</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="p-3 mx-4 mt-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Result Area */}
        <div className="flex-1 overflow-hidden flex flex-col bg-zinc-950">
          {extractedResult ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Output Sub-Header */}
              <div className="p-3 border-b border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-xs">
                    <button
                      onClick={() => setActiveTab("tree")}
                      className={`px-3 py-1 rounded-md transition font-medium cursor-pointer ${
                        activeTab === "tree" ? "bg-amber-500/20 text-amber-300" : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      Visual Object Tree
                    </button>
                    <button
                      onClick={() => setActiveTab("raw_json")}
                      className={`px-3 py-1 rounded-md transition font-medium cursor-pointer ${
                        activeTab === "raw_json" ? "bg-amber-500/20 text-amber-300" : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      Raw JSON Code
                    </button>
                  </div>
                  <div className="text-[11px] font-mono text-zinc-400 hidden sm:flex items-center gap-2">
                    <span>Speed: <strong className="text-amber-300">{(extractedResult.stats.durationMs / 1000).toFixed(2)}s</strong></span>
                    <span>•</span>
                    <span>Size: <strong className="text-zinc-200">{extractedResult.stats.outputLengthChars.toLocaleString()} bytes</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyJson}
                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg transition border border-zinc-700 flex items-center gap-1 cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? "Copied" : "Copy JSON"}</span>
                  </button>
                  <button
                    onClick={handleDownloadJson}
                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg transition border border-zinc-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Download .json</span>
                  </button>
                </div>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto p-4">
                {activeTab === "tree" ? (
                  <div className="space-y-3">
                    <pre className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-mono text-amber-200/90 whitespace-pre-wrap leading-relaxed overflow-x-auto selection:bg-amber-500/30">
                      {JSON.stringify(extractedResult.data, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <textarea
                    readOnly
                    value={extractedResult.rawJsonString}
                    className="w-full h-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 font-mono text-xs text-zinc-200 focus:outline-none resize-none leading-relaxed"
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-zinc-500 space-y-3">
              <Braces className="w-12 h-12 text-zinc-700 stroke-[1.5]" />
              <div className="max-w-sm">
                <p className="text-sm font-medium text-zinc-300">Ready for Strict JSON Extraction</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Select a template preset or custom schema above, choose your target document or webpage URL, and run structured extraction with Gemini.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
