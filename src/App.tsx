import { useState, useEffect, useRef } from "react";
import "katex/dist/katex.min.css";
import BatchZipProcessor from "./components/BatchZipProcessor";
import SingleDocumentView from "./components/SingleDocumentView";
import ConversionHistory from "./components/ConversionHistory";
import ErrorBoundary from "./components/ErrorBoundary";
import DiagnosticConsole, { DiagnosticLog, StreamMetrics } from "./components/DiagnosticConsole";
import { HistoryItem, ConversionMode, TargetStyle, ViewMode, SourceType, TabType, SpatialDocumentResult } from "./types";
import { getMimeTypeByExtension } from "./utils/fileHelpers";
import { cleanMarkdownOutput } from "./utils/markdownCleaner";
import { Sparkles, Layers, FileText, Globe, Boxes, HelpCircle, Key, Brain, Braces, Map, Search, Database, GitBranch, BookOpen } from "lucide-react";
import MultiDocProcessingHub from "./components/MultiDocProcessingHub";
import AboutModal from "./components/AboutModal";
import ApiKeyModal from "./components/ApiKeyModal";
import PayPalButton from "./components/PayPalButton";
import SemanticCrawlModal from "./components/SemanticCrawlModal";
import StrictJsonExtractorModal from "./components/StrictJsonExtractorModal";
import SiteMapperModal from "./components/SiteMapperModal";
import BatchUrlScraperModal from "./components/BatchUrlScraperModal";
import SearchAndScrapeModal from "./components/SearchAndScrapeModal";
import VectorPrepModal from "./components/VectorPrepModal";
import AstExplorerModal from "./components/AstExplorerModal";
import ConvertUrlModal from "./components/ConvertUrlModal";
import LexiconConfigModal from "./components/LexiconConfigModal";
import { getCustomApiKey } from "./utils/apiKeyStorage";

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [base64Data, setBase64Data] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [convertedMarkdown, setConvertedMarkdown] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isAboutOpen, setIsAboutOpen] = useState<boolean>(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState<boolean>(false);
  const [isConvertUrlModalOpen, setIsConvertUrlModalOpen] = useState<boolean>(false);
  const [isCrawlModalOpen, setIsCrawlModalOpen] = useState<boolean>(false);
  const [isJsonExtractorOpen, setIsJsonExtractorOpen] = useState<boolean>(false);
  const [isSiteMapperOpen, setIsSiteMapperOpen] = useState<boolean>(false);
  const [isBatchScraperOpen, setIsBatchScraperOpen] = useState<boolean>(false);
  const [batchScrapeInitialUrls, setBatchScrapeInitialUrls] = useState<string[]>([]);
  const [isSearchScraperOpen, setIsSearchScraperOpen] = useState<boolean>(false);
  const [isVectorPrepOpen, setIsVectorPrepOpen] = useState<boolean>(false);
  const [isAstExplorerOpen, setIsAstExplorerOpen] = useState<boolean>(false);
  const [isLexiconConfigOpen, setIsLexiconConfigOpen] = useState<boolean>(false);
  const [customApiKey, setCustomApiKey] = useState<string>(() => getCustomApiKey());

  // Spatial Layout & Quality Threshold State
  const [spatialData, setSpatialData] = useState<SpatialDocumentResult | null>(null);
  const [isLoadingSpatial, setIsLoadingSpatial] = useState<boolean>(false);
  const [qualityThreshold, setQualityThreshold] = useState<number>(75);

  // Diagnostic Console State
  const [logs, setLogs] = useState<DiagnosticLog[]>([]);
  const [metrics, setMetrics] = useState<StreamMetrics>({
    status: "idle",
    chunksReceived: 0,
    totalBytes: 0,
    charsReceived: 0,
    startTime: null,
    endTime: null,
    chunkRate: 0,
  });

  const addLog = (type: DiagnosticLog["type"], message: string, details?: string) => {
    const timestamp = new Date().toLocaleTimeString("en-US", { hour12: false }) + "." + String(Date.now() % 1000).padStart(3, "0");
    setLogs((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 9),
        timestamp,
        type,
        message,
        details,
      },
    ]);
  };

  const clearLogs = () => {
    setLogs([]);
    setMetrics({
      status: "idle",
      chunksReceived: 0,
      totalBytes: 0,
      charsReceived: 0,
      startTime: null,
      endTime: null,
      chunkRate: 0,
    });
  };

  // Source selection state (file upload or URL fetch or batch zip)
  const [viewMode, setViewMode] = useState<ViewMode>("single");
  const [sourceType, setSourceType] = useState<SourceType>("file");
  const [inputUrl, setInputUrl] = useState<string>("");

  // Configuration settings
  const [conversionMode, setConversionMode] = useState<ConversionMode>("standard");
  const [targetStyle, setTargetStyle] = useState<TargetStyle>("standard");

  // Visual interface controls
  const [activeTab, setActiveTab] = useState<TabType>("preview");
  const [currentThemeId, setCurrentThemeId] = useState<string>("github-light");
  const [dragActive, setDragActive] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loadingStep, setLoadingStep] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load history on startup
  useEffect(() => {
    const saved = localStorage.getItem("doc_conv_history");
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }
  }, []);

  // Loading indicator helper texts with real-time streaming progress & elapsed time tracker
  useEffect(() => {
    if (!isLoading) {
      setLoadingStep("");
      return;
    }

    const startTime = Date.now();
    const fileExt = file?.name ? file.name.split(".").pop()?.toLowerCase() : "";
    const isPdf = fileExt === "pdf" || file?.type === "application/pdf";

    const steps = isPdf
      ? [
          "[Phase 1/2] Reading & parsing PDF spatial layout...",
          "[Phase 1/2] Analyzing PDF grid zones, sidebars & tables...",
          "[Phase 1/2] Connecting to Gemini 3.6 Flash multimodal engine...",
          "[Phase 1/2] Processing multi-page document structure...",
          "[Phase 1/2] Generating clean Markdown output stream...",
        ]
      : [
          "[Phase 1/2] Reading document structure...",
          "[Phase 1/2] Analyzing content grids and tables...",
          "[Phase 1/2] Processing components with Gemini engine...",
          "[Phase 1/2] Formatting syntax and lists...",
          "[Phase 1/2] Streaming clean Markdown output...",
        ];

    let stepIdx = 0;

    const updateProgressText = () => {
      const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
      const elapsedStr = `${elapsedSec}s elapsed`;

      // Check if we have received real body markdown beyond the initial banner header
      const isOnlyBannerHeader =
        convertedMarkdown.length < 250 &&
        (convertedMarkdown.startsWith("> 🧬") ||
          convertedMarkdown.startsWith("> ⚡") ||
          convertedMarkdown.startsWith("> ⚠️"));

      if (convertedMarkdown && convertedMarkdown.length > 0 && !isOnlyBannerHeader) {
        const charCount = convertedMarkdown.length.toLocaleString();
        const wordCount = convertedMarkdown.trim().split(/\s+/).filter(Boolean).length.toLocaleString();
        const lineCount = convertedMarkdown.split("\n").length.toLocaleString();
        setLoadingStep(
          `Streaming raw Markdown... Received ${charCount} chars (~${wordCount} words, ${lineCount} lines) • ${elapsedStr}`
        );
      } else if (isOnlyBannerHeader) {
        setLoadingStep(
          `Gemini 3.6 Flash AI processing multi-page document... (Pipeline initialized) • ${elapsedStr}`
        );
      } else {
        const currentStep = steps[stepIdx % steps.length];
        setLoadingStep(`${currentStep} • ${elapsedStr}`);
      }
    };

    updateProgressText();

    const interval = setInterval(() => {
      stepIdx++;
      updateProgressText();
    }, 1000);

    return () => clearInterval(interval);
  }, [isLoading, convertedMarkdown, file]);

  // Handle Drag & Drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  // Fetch 2D Spatial Layout & Quality Inspection from LiteParse engine
  const fetchSpatialInspection = async (base64: string, name: string, thresh: number) => {
    const isPdf = name.toLowerCase().endsWith(".pdf");
    if (!isPdf || !base64) {
      setSpatialData(null);
      return;
    }
    setIsLoadingSpatial(true);
    try {
      const res = await fetch("/api/spatial-inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: name,
          fileType: "application/pdf",
          base64Data: base64,
          qualityThreshold: thresh,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.result) {
          setSpatialData(data.result);
          addLog("info", `[LiteParse] Spatial 2D Inspection Complete: ${data.result.totalPages} pages, Quality Score: ${data.result.quality.qualityScore}/100 (${data.result.quality.decision})`);
        }
      }
    } catch (e) {
      console.warn("Spatial inspection fetch notice:", e);
    } finally {
      setIsLoadingSpatial(false);
    }
  };

  // Convert File to Base64 and register in state
  const handleFileSelection = async (selectedFile: File) => {
    setError("");
    setConvertedMarkdown("");
    setFile(selectedFile);
    setSpatialData(null);

    try {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64Str = result.split(",")[1];
        setBase64Data(base64Str);
        // Automatically inspect PDF spatial layout in background
        if (selectedFile.name.toLowerCase().endsWith(".pdf")) {
          fetchSpatialInspection(base64Str, selectedFile.name, qualityThreshold);
        }
      };
      reader.onerror = () => {
        setError("Could not read file details.");
      };
      reader.readAsDataURL(selectedFile);
    } catch (e) {
      setError("An error occurred during file import.");
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelection(e.target.files[0]);
    }
  };

  const onUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleClear = () => {
    setFile(null);
    setBase64Data("");
    setConvertedMarkdown("");
    setSpatialData(null);
    setError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Convert loaded file to markdown via backend endpoint
  const handleConvert = async () => {
    if (!file || !base64Data) {
      setError("Please import or drop a document first.");
      return;
    }

    setIsLoading(true);
    setError("");
    setConvertedMarkdown("");
    setActiveTab("preview");

    const mimeType = getMimeTypeByExtension(file.name, file.type);
    const startMs = Date.now();

    clearLogs();
    addLog("info", `Initiated POST /api/convert for file: ${file.name} (${(file.size / 1024).toFixed(1)} KB, Quality Threshold: ${qualityThreshold}%)`);
    setMetrics({
      status: "connecting",
      chunksReceived: 0,
      totalBytes: 0,
      charsReceived: 0,
      startTime: startMs,
      endTime: null,
      chunkRate: 0,
    });

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (customApiKey) {
        headers["x-gemini-api-key"] = customApiKey;
      }

      const response = await fetch("/api/convert", {
        method: "POST",
        headers,
        body: JSON.stringify({
          fileName: file.name,
          fileType: mimeType,
          base64Data,
          conversionMode,
          targetStyle,
          qualityThreshold,
          customApiKey: customApiKey || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errMsg = errorData.error || `Server returned error status ${response.status}`;
        addLog("error", `Server HTTP Error: ${response.status}`, errMsg);
        throw new Error(errMsg);
      }

      addLog("success", `Connected to Express stream (HTTP ${response.status} OK). Pipe opened.`);
      setMetrics((m) => ({ ...m, status: "streaming" }));

      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      let done = false;
      let accumulated = "";
      let chunkCount = 0;
      let totalBytes = 0;
      let lastRenderTime = 0;

      if (!reader) {
        throw new Error("Streaming reader is not supported by the browser.");
      }

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          chunkCount++;
          totalBytes += value.byteLength;
          const chunkStr = decoder.decode(value, { stream: !done });
          accumulated += chunkStr;

          const now = Date.now();
          const elapsedSec = Math.max((now - startMs) / 1000, 0.1);
          const chunkRate = chunkCount / elapsedSec;

          setMetrics({
            status: done ? "completed" : "streaming",
            chunksReceived: chunkCount,
            totalBytes,
            charsReceived: accumulated.length,
            startTime: startMs,
            endTime: done ? now : null,
            chunkRate,
          });

          if (chunkCount === 1) {
            addLog("info", `First stream chunk received (${value.byteLength} bytes). Pipeline active.`);
          } else if (chunkCount % 10 === 0) {
            addLog("chunk", `Received ${chunkCount} chunks (${(totalBytes / 1024).toFixed(1)} KB total)`);
          }

          // Inspect server telemetry stream lines in real time for Diagnostic Console
          const lines = chunkStr.split("\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("> 🛰️")) {
              addLog("info", trimmed.replace(/^>\s*🛰️\s*/, ""));
            } else if (trimmed.startsWith("> ⏱️")) {
              addLog("info", trimmed.replace(/^>\s*⏱️\s*/, ""));
            } else if (trimmed.startsWith("> 🧬")) {
              addLog("success", trimmed.replace(/^>\s*🧬\s*/, ""));
            } else if (trimmed.startsWith("> 🪟")) {
              addLog("info", trimmed.replace(/^>\s*🪟\s*/, ""));
            } else if (trimmed.startsWith("> ⚡")) {
              addLog("success", trimmed.replace(/^>\s*⚡\s*/, ""));
            } else if (trimmed.startsWith("> ⚠️")) {
              addLog("warn", trimmed.replace(/^>\s*⚠️\s*/, ""));
            } else if (trimmed.startsWith("> ❌")) {
              addLog("error", trimmed.replace(/^>\s*❌\s*/, ""));
            }
          }

          // Frame-buffered / Throttled React state update (5 FPS) to keep browser main thread ultra-responsive
          if (done || now - lastRenderTime > 200) {
            setConvertedMarkdown(cleanMarkdownOutput(accumulated));
            lastRenderTime = now;
          }
        }
      }

      // Guarantee 100% final flush
      const cleanedFinal = cleanMarkdownOutput(accumulated);
      setConvertedMarkdown(cleanedFinal);

      const endMs = Date.now();
      addLog(
        "success",
        `Stream completed in ${((endMs - startMs) / 1000).toFixed(2)}s`,
        `Received ${chunkCount} chunks, ${cleanedFinal.length} characters, ${(totalBytes / 1024).toFixed(1)} KB.`
      );

      setMetrics((m) => ({ ...m, status: "completed", endTime: endMs }));

      if (cleanedFinal.trim()) {
        const newItem: HistoryItem = {
          id: Date.now().toString(),
          fileName: file.name,
          fileSize: file.size,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          markdownContent: cleanedFinal,
          sourceType: "file",
        };

        const updatedHistory = [newItem, ...history.filter((h) => h.id !== newItem.id).slice(0, 49)];
        setHistory(updatedHistory);
        localStorage.setItem("doc_conv_history", JSON.stringify(updatedHistory));
      }
    } catch (err: any) {
      console.error(err);
      const msg = err.message || "An unexpected error occurred during processing.";
      addLog("error", "Stream Failure / Abort", msg);
      setMetrics((m) => ({ ...m, status: "error", endTime: Date.now() }));
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch document / HTML / PDF from URL and convert to markdown
  const handleFetchUrl = async () => {
    if (!inputUrl || !inputUrl.trim()) {
      setError("Please enter a valid URL (starting with http:// or https://).");
      return;
    }

    setIsLoading(true);
    setError("");
    setConvertedMarkdown("");
    setActiveTab("preview");

    const startMs = Date.now();
    clearLogs();
    addLog("info", `Initiated POST /api/fetch-url for URL: ${inputUrl}`);
    setMetrics({
      status: "connecting",
      chunksReceived: 0,
      totalBytes: 0,
      charsReceived: 0,
      startTime: startMs,
      endTime: null,
      chunkRate: 0,
    });

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (customApiKey) {
        headers["x-gemini-api-key"] = customApiKey;
      }

      const response = await fetch("/api/fetch-url", {
        method: "POST",
        headers,
        body: JSON.stringify({
          url: inputUrl,
          conversionMode,
          targetStyle,
          customApiKey: customApiKey || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errMsg = errorData.error || `Server returned error status ${response.status}`;
        addLog("error", `Server HTTP Error: ${response.status}`, errMsg);
        throw new Error(errMsg);
      }

      addLog("success", `Connected to Express URL stream (HTTP ${response.status} OK). Pipe opened.`);
      setMetrics((m) => ({ ...m, status: "streaming" }));

      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      let done = false;
      let accumulated = "";
      let chunkCount = 0;
      let totalBytes = 0;
      let lastRenderTime = 0;

      if (!reader) {
        throw new Error("Streaming reader is not supported.");
      }

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          chunkCount++;
          totalBytes += value.byteLength;
          const chunkStr = decoder.decode(value, { stream: !done });
          accumulated += chunkStr;

          const now = Date.now();
          const elapsedSec = Math.max((now - startMs) / 1000, 0.1);
          const chunkRate = chunkCount / elapsedSec;

          setMetrics({
            status: done ? "completed" : "streaming",
            chunksReceived: chunkCount,
            totalBytes,
            charsReceived: accumulated.length,
            startTime: startMs,
            endTime: done ? now : null,
            chunkRate,
          });

          if (chunkCount === 1) {
            addLog("info", `First URL stream chunk received (${value.byteLength} bytes).`);
          } else if (chunkCount % 10 === 0) {
            addLog("chunk", `Received ${chunkCount} chunks (${(totalBytes / 1024).toFixed(1)} KB total)`);
          }

          // Inspect server telemetry stream lines in real time for Diagnostic Console
          const lines = chunkStr.split("\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("> 🛰️")) {
              addLog("info", trimmed.replace(/^>\s*🛰️\s*/, ""));
            } else if (trimmed.startsWith("> ⏱️")) {
              addLog("info", trimmed.replace(/^>\s*⏱️\s*/, ""));
            } else if (trimmed.startsWith("> 🧬")) {
              addLog("success", trimmed.replace(/^>\s*🧬\s*/, ""));
            } else if (trimmed.startsWith("> 🪟")) {
              addLog("info", trimmed.replace(/^>\s*🪟\s*/, ""));
            } else if (trimmed.startsWith("> ⚡")) {
              addLog("success", trimmed.replace(/^>\s*⚡\s*/, ""));
            } else if (trimmed.startsWith("> ⚠️")) {
              addLog("warn", trimmed.replace(/^>\s*⚠️\s*/, ""));
            } else if (trimmed.startsWith("> ❌")) {
              addLog("error", trimmed.replace(/^>\s*❌\s*/, ""));
            }
          }

          if (done || now - lastRenderTime > 200) {
            setConvertedMarkdown(cleanMarkdownOutput(accumulated));
            lastRenderTime = now;
          }
        }
      }

      const cleanedFinal = cleanMarkdownOutput(accumulated);
      setConvertedMarkdown(cleanedFinal);
      const endMs = Date.now();
      addLog(
        "success",
        `URL Stream completed in ${((endMs - startMs) / 1000).toFixed(2)}s`,
        `Received ${chunkCount} chunks, ${cleanedFinal.length} characters.`
      );
      setMetrics((m) => ({ ...m, status: "completed", endTime: endMs }));

      if (cleanedFinal.trim()) {
        const urlFilename = inputUrl.split("/").pop()?.split("?")[0] || "URL Document";
        const newItem: HistoryItem = {
          id: Date.now().toString(),
          fileName: urlFilename.endsWith(".md") ? urlFilename : `${urlFilename}.md`,
          fileSize: cleanedFinal.length,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          markdownContent: cleanedFinal,
          sourceType: "url",
          sourceUrl: inputUrl,
        };

        const updatedHistory = [newItem, ...history.filter((h) => h.id !== newItem.id).slice(0, 49)];
        setHistory(updatedHistory);
        localStorage.setItem("doc_conv_history", JSON.stringify(updatedHistory));
      }
    } catch (err: any) {
      console.error(err);
      const msg = err.message || "Failed to fetch and convert URL.";
      addLog("error", "URL Stream Failure", msg);
      setMetrics((m) => ({ ...m, status: "error", endTime: Date.now() }));
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (!convertedMarkdown) return;
    navigator.clipboard.writeText(convertedMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!convertedMarkdown) return;
    const blob = new Blob([convertedMarkdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file ? `${file.name.split(".")[0]}.md` : "converted_document.md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSelectHistoryItem = (item: HistoryItem) => {
    setConvertedMarkdown(item.markdownContent);
    setActiveTab("preview");
  };

  const handleClearHistory = () => {
    setHistory([]);
    localStorage.removeItem("doc_conv_history");
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Top Application Navigation Header */}
      <header className="border-b border-zinc-800/80 bg-zinc-900/60 sticky top-0 z-50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-bold text-zinc-100 tracking-tight flex items-center gap-2 flex-wrap">
                <span>Document to Markdown Engine</span>
                <span className="text-[9px] sm:text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 shrink-0">
                  AI + OCR
                </span>
              </h1>
              <p className="text-[11px] sm:text-xs text-zinc-400">High-fidelity layout preservation & OKF structuring</p>
            </div>
          </div>

          {/* View Mode Switcher */}
          <div className="w-full sm:w-auto flex items-center gap-1 bg-zinc-900 p-1 rounded-xl border border-zinc-800 overflow-x-auto no-scrollbar">
            <button
              id="about-app-btn"
              type="button"
              onClick={() => setIsAboutOpen(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 text-zinc-400 hover:text-emerald-300 hover:bg-zinc-800/80 cursor-pointer"
              title="View Architecture & OKF Guide (README.md)"
            >
              <HelpCircle className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
              <span>About</span>
            </button>

            <div className="w-px h-4 bg-zinc-800 my-auto shrink-0" />

            <button
              id="single-doc-tab-btn"
              type="button"
              onClick={() => setViewMode("single")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === "single"
                  ? "bg-zinc-800 text-emerald-400 border border-zinc-700/80 shadow"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span>Single Document</span>
            </button>

            <button
              onClick={() => setViewMode("multi_doc")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 ${
                viewMode === "multi_doc"
                  ? "bg-indigo-950 text-indigo-300 border border-indigo-700/80 shadow"
                  : history.length >= 2
                  ? "text-indigo-300 hover:bg-zinc-800"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Boxes className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
              <span>Multi-Doc Studio</span>
              {history.length > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    history.length >= 2
                      ? "bg-indigo-600 text-white font-bold"
                      : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {history.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setViewMode("batch_zip")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 ${
                viewMode === "batch_zip"
                  ? "bg-zinc-800 text-emerald-400 border border-zinc-700/80 shadow"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span>Batch ZIP Conversion</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-6 sm:space-y-8">
        {viewMode === "single" ? (
          <div className="space-y-6">
            {/* Input Source Selector (File Upload vs Web URL) & Bring Your Own Key (Far Right) */}
            <div className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-2 flex-wrap">
              <div className="flex items-center gap-2">
                <button
                  id="source-type-file-btn"
                  type="button"
                  onClick={() => setSourceType("file")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                    sourceType === "file"
                      ? "bg-zinc-800 text-emerald-400 border border-zinc-700 shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Upload File</span>
                </button>
                <button
                  id="source-type-url-btn"
                  type="button"
                  onClick={() => setIsConvertUrlModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm"
                  title="Convert any public webpage, online documentation, or PDF/DOCX URL to Markdown"
                >
                  <Globe className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Convert from URL</span>
                </button>
                <button
                  id="source-type-crawler-btn"
                  type="button"
                  onClick={() => setIsCrawlModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 shadow-sm"
                  title="Recursively crawl domain documentation & generate master OKF Knowledge Base"
                >
                  <Brain className="w-3.5 h-3.5 text-purple-400" />
                  <span>Semantic Crawler</span>
                </button>
                <button
                  id="source-type-extract-btn"
                  type="button"
                  onClick={() => setIsJsonExtractorOpen(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm"
                  title="Extract strict structured JSON adhering to custom schema or preset templates (/extract)"
                >
                  <Braces className="w-3.5 h-3.5 text-amber-400" />
                  <span>JSON Extract</span>
                </button>
                <button
                  id="source-type-mapper-btn"
                  type="button"
                  onClick={() => setIsSiteMapperOpen(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm"
                  title="Map domain sitemaps & URL hierarchies for bulk selection (/map)"
                >
                  <Map className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Site Map</span>
                </button>
                <button
                  id="source-type-batch-scraper-btn"
                  type="button"
                  onClick={() => setIsBatchScraperOpen(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shadow-sm"
                  title="Scrape multiple URLs in parallel with concurrency pool and ZIP export (/batch-scrape)"
                >
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Batch Scrape</span>
                </button>
                <button
                  id="source-type-search-scraper-btn"
                  type="button"
                  onClick={() => setIsSearchScraperOpen(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 border border-violet-500/30 shadow-sm"
                  title="AI Search Grounding & Deep Article Scrape Synthesis (/search-scrape)"
                >
                  <Search className="w-3.5 h-3.5 text-violet-400" />
                  <span>Search & Scrape</span>
                </button>
                <button
                  id="source-type-vector-prep-btn"
                  type="button"
                  onClick={() => setIsVectorPrepOpen(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm"
                  title="Prepare & chunk current Markdown for Vector Databases using MetaAST (Pinecone, Qdrant, pgvector)"
                >
                  <Database className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Vector DB Prep</span>
                </button>
                <button
                  id="source-type-ast-explorer-btn"
                  type="button"
                  onClick={() => setIsAstExplorerOpen(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 shadow-sm"
                  title="Inspect hierarchical MetaAST, node types, and contextual metadata"
                >
                  <GitBranch className="w-3.5 h-3.5 text-purple-400" />
                  <span>AST Explorer</span>
                </button>
                <button
                  id="source-type-lexicon-btn"
                  type="button"
                  onClick={() => setIsLexiconConfigOpen(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shadow-sm"
                  title="Configure domain entities, synonyms, and acronyms for NLP tagging and Graph-RAG"
                >
                  <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                  <span>NLP Lexicon</span>
                </button>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                {/* Bring Your Own Key (BYOK) Button to the far right */}
                <button
                  id="byok-open-modal-btn"
                  type="button"
                  onClick={() => setIsApiKeyModalOpen(true)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border cursor-pointer ${
                    customApiKey
                      ? "bg-amber-950/60 border-amber-800/80 text-amber-300 hover:bg-amber-900/60 hover:text-amber-200 shadow-sm"
                      : "bg-zinc-900 hover:bg-zinc-800 border-zinc-700/80 text-zinc-300 hover:text-white"
                  }`}
                  title={
                    customApiKey
                      ? "Custom Gemini API Key active (Click to view, change, or remove)"
                      : "Bring Your Own Google Gemini API Key"
                  }
                >
                  <Key className={`w-3.5 h-3.5 ${customApiKey ? "text-amber-400" : "text-zinc-400"}`} />
                  <span>Bring Your Own Key</span>
                  {customApiKey ? (
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse ml-0.5" title="Key Active" />
                  ) : (
                    <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline">(Optional)</span>
                  )}
                </button>

                {/* PayPal Pay for usage button */}
                <PayPalButton />
              </div>
            </div>

            <ErrorBoundary title="Document Viewer & Converter Error">
              <SingleDocumentView
                file={file}
                isLoading={isLoading}
                convertedMarkdown={convertedMarkdown}
                error={error}
                loadingStep={loadingStep}
                conversionMode={conversionMode}
                setConversionMode={setConversionMode}
                targetStyle={targetStyle}
                setTargetStyle={setTargetStyle}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                currentThemeId={currentThemeId}
                setCurrentThemeId={setCurrentThemeId}
                dragActive={dragActive}
                copied={copied}
                handleDrag={handleDrag}
                handleDrop={handleDrop}
                handleFileInputChange={handleFileInputChange}
                onUploadClick={onUploadClick}
                handleClear={handleClear}
                handleConvert={handleConvert}
                handleCopy={handleCopy}
                handleDownload={handleDownload}
                fileInputRef={fileInputRef}
                onMarkdownChange={setConvertedMarkdown}
                spatialData={spatialData}
                isLoadingSpatial={isLoadingSpatial}
                onRefreshSpatialInspection={(thresh) => {
                  if (base64Data && file) {
                    fetchSpatialInspection(base64Data, file.name, thresh);
                  }
                }}
                qualityThreshold={qualityThreshold}
                setQualityThreshold={setQualityThreshold}
              />
            </ErrorBoundary>

            {/* Live Diagnostic Stream Console & Network Logs */}
            <ErrorBoundary title="Diagnostic Stream Console Error">
              <DiagnosticConsole logs={logs} metrics={metrics} onClearLogs={clearLogs} />
            </ErrorBoundary>

            {/* Conversion History Panel */}
            <ErrorBoundary title="Conversion History Panel Error">
              <ConversionHistory
                history={history}
                onSelectHistoryItem={handleSelectHistoryItem}
                onClearHistory={handleClearHistory}
                onOpenMultiDocHub={() => setViewMode("multi_doc")}
                onDeleteHistoryItem={(id) => {
                  const updated = history.filter((h) => h.id !== id);
                  setHistory(updated);
                  localStorage.setItem("doc_conv_history", JSON.stringify(updated));
                }}
              />
            </ErrorBoundary>
          </div>
        ) : viewMode === "multi_doc" ? (
          /* Multi-Document Knowledge & Skill Studio Module */
          <ErrorBoundary title="Multi-Doc Studio Error">
            <MultiDocProcessingHub
              documents={history}
              onUpdateDocuments={(updated) => {
                setHistory(updated);
                localStorage.setItem("doc_conv_history", JSON.stringify(updated));
              }}
              onOpenInSingleView={(item) => {
                setConvertedMarkdown(item.markdownContent);
                setActiveTab("preview");
                setViewMode("single");
              }}
              onAddNewDocument={(name, content) => {
                const newItem: HistoryItem = {
                  id: Date.now().toString(),
                  fileName: name,
                  fileSize: content.length,
                  timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                  markdownContent: content,
                  sourceType: "manual",
                };
                const updated = [newItem, ...history.filter((h) => h.id !== newItem.id).slice(0, 49)];
                setHistory(updated);
                localStorage.setItem("doc_conv_history", JSON.stringify(updated));
              }}
            />
          </ErrorBoundary>
        ) : (
          /* Batch ZIP Processor Module */
          <ErrorBoundary title="Batch ZIP Processor Error">
            <BatchZipProcessor />
          </ErrorBoundary>
        )}
      </main>

      {/* About & OKF Architecture Modal */}
      <AboutModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />

      {/* Bring Your Own Key (BYOK) Modal */}
      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        onKeyChange={(newKey) => setCustomApiKey(newKey)}
      />

      {/* Convert from Web Page / Online Document URL Modal */}
      <ConvertUrlModal
        isOpen={isConvertUrlModalOpen}
        onClose={() => setIsConvertUrlModalOpen(false)}
        inputUrl={inputUrl}
        setInputUrl={setInputUrl}
        isLoading={isLoading}
        onFetchUrl={handleFetchUrl}
        presetUrls={[
          { name: "Sample Article (Wikipedia)", url: "https://en.wikipedia.org/wiki/Markdown", description: "Standard Wikipedia encyclopedic article" },
          { name: "GitHub Markdown Spec", url: "https://github.github.com/gfm/", description: "Official GFM specification" },
          { name: "Playwright Automation Docs", url: "https://playwright.dev/docs/intro", description: "Technical documentation page" },
          { name: "PostgreSQL pgvector Guide", url: "https://github.com/pgvector/pgvector", description: "Open source repository README" },
        ]}
      />

      {/* Semantic Knowledge Base Crawler Modal (Phase 2 OKF) */}
      <SemanticCrawlModal
        isOpen={isCrawlModalOpen}
        onClose={() => setIsCrawlModalOpen(false)}
        initialSeedUrl={inputUrl || "https://playwright.dev/docs/intro"}
        activeMarkdownContent={convertedMarkdown}
        onKnowledgeBaseGenerated={(markdown, docName) => {
          setConvertedMarkdown(markdown);
          setActiveTab("preview");
          const newItem: HistoryItem = {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            fileName: docName,
            fileSize: new Blob([markdown]).size,
            wordCount: markdown.trim().split(/\s+/).filter(Boolean).length,
            markdownContent: markdown,
            sourceType: "manual",
          };
          const updated = [newItem, ...history.filter((h) => h.id !== newItem.id).slice(0, 49)];
          setHistory(updated);
          localStorage.setItem("doc_conv_history", JSON.stringify(updated));
          addLog("success", "Semantic Crawl Knowledge Base Loaded", `Compiled OKF Knowledge Base loaded into workspace: ${docName}`);
        }}
      />

      {/* Strict JSON Schema Extractor Modal (Phase 3) */}
      <StrictJsonExtractorModal
        isOpen={isJsonExtractorOpen}
        onClose={() => setIsJsonExtractorOpen(false)}
        activeMarkdownContent={convertedMarkdown}
        activeUrl={inputUrl}
        onApplyJsonToWorkspace={(jsonString) => {
          setConvertedMarkdown(`\`\`\`json\n${jsonString}\n\`\`\``);
          setActiveTab("preview");
        }}
      />

      {/* Domain Sitemap & Hierarchy Mapper Modal (Phase 3) */}
      <SiteMapperModal
        isOpen={isSiteMapperOpen}
        onClose={() => setIsSiteMapperOpen(false)}
        initialDomainUrl={inputUrl || "https://playwright.dev"}
        onSelectSingleUrl={(url) => {
          setInputUrl(url);
          setSourceType("url");
        }}
        onSelectUrlsForBatch={(urls) => {
          setBatchScrapeInitialUrls(urls);
          setIsBatchScraperOpen(true);
        }}
      />

      {/* Batch Multi-URL Scraper Modal (Phase 4) */}
      <BatchUrlScraperModal
        isOpen={isBatchScraperOpen}
        onClose={() => {
          setIsBatchScraperOpen(false);
          setBatchScrapeInitialUrls([]);
        }}
        initialUrls={batchScrapeInitialUrls.length > 0 ? batchScrapeInitialUrls : (inputUrl ? [inputUrl] : [])}
        activeMarkdownContent={convertedMarkdown}
        onLoadMergedCorpus={(markdown, docName) => {
          setConvertedMarkdown(markdown);
          setActiveTab("preview");
          const newItem: HistoryItem = {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            fileName: docName,
            fileSize: new Blob([markdown]).size,
            wordCount: markdown.trim().split(/\s+/).filter(Boolean).length,
            markdownContent: markdown,
            sourceType: "manual",
          };
          const updated = [newItem, ...history.filter((h) => h.id !== newItem.id).slice(0, 49)];
          setHistory(updated);
          localStorage.setItem("doc_conv_history", JSON.stringify(updated));
          addLog("success", "Batch Scraped Corpus Loaded", `Batch scrape knowledge corpus loaded: ${docName}`);
        }}
      />

      {/* AI Search Grounding & Deep Scrape Synthesis Modal (Phase 4) */}
      <SearchAndScrapeModal
        isOpen={isSearchScraperOpen}
        onClose={() => setIsSearchScraperOpen(false)}
        onLoadReportIntoStudio={(markdown, title) => {
          setConvertedMarkdown(markdown);
          setActiveTab("preview");
          const newItem: HistoryItem = {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            fileName: title,
            fileSize: new Blob([markdown]).size,
            wordCount: markdown.trim().split(/\s+/).filter(Boolean).length,
            markdownContent: markdown,
            sourceType: "manual",
          };
          const updated = [newItem, ...history.filter((h) => h.id !== newItem.id).slice(0, 49)];
          setHistory(updated);
          localStorage.setItem("doc_conv_history", JSON.stringify(updated));
          addLog("success", "AI Search & Scrape Synthesis Loaded", `Grounded research report loaded: ${title}`);
        }}
      />

      {/* MetaAST Vector DB Chunk Preparer Modal */}
      <VectorPrepModal
        isOpen={isVectorPrepOpen}
        onClose={() => setIsVectorPrepOpen(false)}
        markdownContent={
          convertedMarkdown ||
          `# Playwright Automation Guide\n\n## Page Object Model\n\nThe Page class provides high-level APIs to interact with browser tabs.\n\n### Locators\n\nLocators represent a way to find elements on the page at any moment.\n\n\`\`\`typescript\nconst submitBtn = page.getByRole('button', { name: 'Submit' });\nawait submitBtn.click();\n\`\`\`\n\n### Comparison Table\n\n| Selector Type | Example | Resilient to Refactoring |\n| :--- | :--- | :---: |\n| Role (Recommended) | page.getByRole('button') | Yes |\n| Text | page.getByText('Log In') | Partial |\n| CSS / XPath | page.locator('.btn-primary') | No |\n`
        }
        documentTitle={file ? file.name.replace(/\.[^/.]+$/, "") : "Documentation Knowledge Base"}
      />

      {/* MetaAST Hierarchy & Node Explorer Modal */}
      <AstExplorerModal
        isOpen={isAstExplorerOpen}
        onClose={() => setIsAstExplorerOpen(false)}
        markdownContent={
          convertedMarkdown ||
          `# Playwright Automation Guide\n\n## Page Object Model\n\nThe Page class provides high-level APIs to interact with browser tabs.\n\n### Locators\n\nLocators represent a way to find elements on the page at any moment.\n\n\`\`\`typescript\nconst submitBtn = page.getByRole('button', { name: 'Submit' });\nawait submitBtn.click();\n\`\`\`\n\n### Comparison Table\n\n| Selector Type | Example | Resilient to Refactoring |\n| :--- | :--- | :---: |\n| Role (Recommended) | page.getByRole('button') | Yes |\n| Text | page.getByText('Log In') | Partial |\n| CSS / XPath | page.locator('.btn-primary') | No |\n`
        }
        documentTitle={file ? file.name.replace(/\.[^/.]+$/, "") : "Documentation Knowledge Base"}
      />

      {/* NLP Custom Lexicon Configuration Modal */}
      <LexiconConfigModal
        isOpen={isLexiconConfigOpen}
        onClose={() => setIsLexiconConfigOpen(false)}
      />
    </div>
  );
}
