import React, { useState } from "react";
import {
  Sparkles,
  Layers,
  Search,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  FileText,
  Compass,
  ArrowRight,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Brain,
  Download,
  BookOpen,
  StopCircle,
  Link,
} from "lucide-react";
import SiteDiscoveryModal from "./SiteDiscoveryModal";
import { extractWebLinksFromMarkdownClient } from "../utils/urlExtractorClient";

interface SemanticCrawlModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSeedUrl?: string;
  activeMarkdownContent?: string;
  onKnowledgeBaseGenerated: (markdown: string, docName: string) => void;
}

export default function SemanticCrawlModal({
  isOpen,
  onClose,
  initialSeedUrl = "",
  activeMarkdownContent = "",
  onKnowledgeBaseGenerated,
}: SemanticCrawlModalProps) {
  const [seedUrl, setSeedUrl] = useState(initialSeedUrl || "https://playwright.dev/docs/intro");
  const [maxDepth, setMaxDepth] = useState<number>(2);
  const [maxPages, setMaxPages] = useState<number>(10);
  const [pathPrefixLock, setPathPrefixLock] = useState<boolean>(true);
  const [semanticFocus, setSemanticFocus] = useState<string>(
    "Core API guides, architecture, concepts, and tutorials"
  );
  const [isCrawling, setIsCrawling] = useState(false);
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [crawledPagesList, setCrawledPagesList] = useState<
    { url: string; title: string; depth: number; wordCount: number; status: string }[]
  >([]);
  const [crawlStats, setCrawlStats] = useState<{
    pagesCrawled: number;
    pagesQueued: number;
    totalWords: number;
    durationMs: number;
  }>({
    pagesCrawled: 0,
    pagesQueued: 0,
    totalWords: 0,
    durationMs: 0,
  });
  const [generatedResult, setGeneratedResult] = useState<{
    masterMarkdown: string;
    totalPages: number;
    totalWords: number;
    domain: string;
  } | null>(null);

  const startSemanticCrawl = async () => {
    if (!seedUrl.trim()) return;

    let formattedUrl = seedUrl.trim();
    if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
      formattedUrl = `https://${formattedUrl}`;
    }

    setIsCrawling(true);
    setLogMessages([]);
    setCrawledPagesList([]);
    setGeneratedResult(null);
    setCrawlStats({ pagesCrawled: 0, pagesQueued: 1, totalWords: 0, durationMs: 0 });

    try {
      const response = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seedUrl: formattedUrl,
          maxDepth,
          maxPages,
          pathPrefixLock,
          semanticFocusPrompt: semanticFocus,
        }),
      });

      if (!response.ok) {
        throw new Error(`Crawler request failed: HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No readable stream response from server");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const block of lines) {
          if (!block.trim()) continue;

          let eventType = "message";
          let dataStr = "";

          const eventMatch = block.match(/^event:\s*(.+)$/m);
          if (eventMatch) eventType = eventMatch[1].trim();

          const dataMatch = block.match(/^data:\s*([\s\S]+)$/m);
          if (dataMatch) dataStr = dataMatch[1].trim();

          if (!dataStr) continue;

          try {
            const parsed = JSON.parse(dataStr);

            if (eventType === "status" || eventType === "progress") {
              if (parsed.message) {
                setLogMessages((prev) => [...prev.slice(-40), parsed.message]);
              }

              if (parsed.stats) {
                setCrawlStats(parsed.stats);
              }

              if (parsed.pageResult) {
                setCrawledPagesList((prev) => {
                  if (prev.some((p) => p.url === parsed.pageResult.url)) {
                    return prev.map((p) => (p.url === parsed.pageResult.url ? parsed.pageResult : p));
                  }
                  return [...prev, parsed.pageResult];
                });
              }
            } else if (eventType === "result" && parsed.kbResult) {
              setGeneratedResult({
                masterMarkdown: parsed.kbResult.masterMarkdown,
                totalPages: parsed.kbResult.totalPages,
                totalWords: parsed.kbResult.totalWords,
                domain: parsed.kbResult.domain,
              });
              setLogMessages((prev) => [
                ...prev,
                `🎉 Master OKF Knowledge Base compiled with ${parsed.kbResult.totalPages} sections and ${parsed.kbResult.totalWords} words!`,
              ]);
            } else if (eventType === "crawl_error") {
              setLogMessages((prev) => [...prev, `❌ Error: ${parsed.error}`]);
            }
          } catch (e) {
            // Ignore parse errors on partial chunks
          }
        }
      }
    } catch (err: any) {
      setLogMessages((prev) => [...prev, `❌ Connection error: ${err?.message || "Failed crawl execution"}`]);
    } finally {
      setIsCrawling(false);
    }
  };

  const handleApplyToWorkspace = () => {
    if (!generatedResult) return;
    const docName = `${generatedResult.domain.replace(/[^a-zA-Z0-9]/g, "_")}_KnowledgeBase.md`;
    onKnowledgeBaseGenerated(generatedResult.masterMarkdown, docName);
    onClose();
  };

  const handleDownloadMarkdown = () => {
    if (!generatedResult) return;
    const blob = new Blob([generatedResult.masterMarkdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${generatedResult.domain.replace(/[^a-zA-Z0-9]/g, "_")}_KnowledgeBase.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-zinc-900 border border-zinc-700/80 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-zinc-100">
                  AI Semantic Knowledge Base Crawler
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-medium border border-purple-500/30">
                  Phase 2 OKF Engine
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Recursively ingests domain documentation, uses Gemini to select coherent sub-pages, respects robots.txt & llms.txt, and compiles a unified OKF knowledge base.
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
          {activeMarkdownContent && extractWebLinksFromMarkdownClient(activeMarkdownContent).length > 0 && (
            <div className="p-2.5 rounded-lg bg-purple-950/30 border border-purple-800/40 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-purple-300">
                <Link className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span>Found {extractWebLinksFromMarkdownClient(activeMarkdownContent).length} website links in active document markdown</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {extractWebLinksFromMarkdownClient(activeMarkdownContent).slice(0, 3).map((url, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSeedUrl(url)}
                    className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 transition truncate max-w-[140px]"
                    title={`Set seed: ${url}`}
                  >
                    {new URL(url).pathname || url}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={seedUrl}
                onChange={(e) => setSeedUrl(e.target.value)}
                disabled={isCrawling}
                placeholder="e.g. https://playwright.dev/docs/intro, https://nextjs.org/docs"
                className="w-full bg-zinc-950 border border-zinc-700/80 rounded-lg px-3.5 py-2 text-xs sm:text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition"
              />
            </div>
            <button
              onClick={() => setIsDiscoveryOpen(true)}
              disabled={isCrawling}
              className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium border border-zinc-700 transition flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Compass className="w-3.5 h-3.5 text-emerald-400" />
              <span>Inspect Site</span>
            </button>
            <button
              onClick={startSemanticCrawl}
              disabled={isCrawling || !seedUrl.trim()}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg font-medium text-xs sm:text-sm transition flex items-center justify-center gap-2 cursor-pointer shrink-0 shadow-md shadow-purple-950/40"
            >
              {isCrawling ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-purple-300" />
                  <span>Crawling ({crawledPagesList.length}/{maxPages})...</span>
                </>
              ) : (
                <>
                  <Brain className="w-4 h-4" />
                  <span>Generate Knowledge Base</span>
                </>
              )}
            </button>
          </div>

          {/* Crawler Constraints & AI Guidance Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1">
            <div className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-2 flex items-center justify-between text-xs">
              <span className="text-zinc-400">Max Depth:</span>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3].map((d) => (
                  <button
                    key={d}
                    onClick={() => setMaxDepth(d)}
                    disabled={isCrawling}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                      maxDepth === d
                        ? "bg-purple-600 text-white"
                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-2 flex items-center justify-between text-xs">
              <span className="text-zinc-400">Page Limit:</span>
              <div className="flex items-center gap-1.5">
                {[5, 10, 20].map((p) => (
                  <button
                    key={p}
                    onClick={() => setMaxPages(p)}
                    disabled={isCrawling}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                      maxPages === p
                        ? "bg-purple-600 text-white"
                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-2 flex items-center justify-between text-xs">
              <span className="text-zinc-400">Lock Path Prefix:</span>
              <input
                type="checkbox"
                checked={pathPrefixLock}
                onChange={(e) => setPathPrefixLock(e.target.checked)}
                disabled={isCrawling}
                className="rounded border-zinc-700 bg-zinc-800 text-purple-600 focus:ring-purple-500 cursor-pointer"
              />
            </div>

            <div className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-2 flex items-center gap-2 text-xs">
              <span className="text-zinc-400 whitespace-nowrap">Focus:</span>
              <input
                type="text"
                value={semanticFocus}
                onChange={(e) => setSemanticFocus(e.target.value)}
                disabled={isCrawling}
                placeholder="e.g. Core concepts, API, tutorials"
                className="w-full bg-transparent text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Content Body: Split Telemetry & Results View */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-0">
          {/* Left Column: Real-time Telemetry & Crawled Pages (5 Cols) */}
          <div className="lg:col-span-5 border-r border-zinc-800/80 bg-zinc-950/60 flex flex-col overflow-hidden">
            {/* Live Stats Bar */}
            <div className="p-3 border-b border-zinc-800/60 bg-zinc-950 flex items-center justify-between text-[11px] text-zinc-400 font-mono">
              <div className="flex items-center gap-3">
                <span>Crawled: <strong className="text-purple-300">{crawlStats.pagesCrawled}</strong></span>
                <span>Queued: <strong className="text-zinc-300">{crawlStats.pagesQueued}</strong></span>
                <span>Words: <strong className="text-emerald-400">{crawlStats.totalWords.toLocaleString()}</strong></span>
              </div>
              <div>{(crawlStats.durationMs / 1000).toFixed(1)}s</div>
            </div>

            {/* Pages Accordion List */}
            <div className="p-3 flex-1 overflow-y-auto space-y-1.5 border-b border-zinc-800/60">
              <h4 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                Knowledge Base Sections ({crawledPagesList.length})
              </h4>
              {crawledPagesList.length === 0 ? (
                <div className="text-xs text-zinc-600 italic py-6 text-center">
                  Pages crawled during recursion will populate here with depth indices and word counts.
                </div>
              ) : (
                crawledPagesList.map((page, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded-lg bg-zinc-900/80 border border-zinc-800/80 flex items-center justify-between text-xs transition hover:border-purple-500/40"
                  >
                    <div className="truncate pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-mono">
                          D{page.depth}
                        </span>
                        <span className="text-zinc-200 font-medium truncate">{page.title}</span>
                      </div>
                      <span className="text-[10px] font-mono text-zinc-500 truncate block mt-0.5">
                        {page.url}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[11px] font-mono text-emerald-400 block">
                        {page.wordCount} w
                      </span>
                      <span className="text-[9px] text-zinc-500">
                        {page.status === "success" ? "✓ Cleaned" : "Skipped"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Live Log Stream Terminal */}
            <div className="p-3 h-36 bg-black/70 overflow-y-auto font-mono text-[10px] text-zinc-400 space-y-1 border-t border-zinc-900">
              <div className="text-zinc-500 mb-1 sticky top-0 bg-black/90 py-0.5">
                ● Live Crawler Telemetry Log
              </div>
              {logMessages.length === 0 ? (
                <div className="text-zinc-600 italic">Awaiting crawl dispatch...</div>
              ) : (
                logMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`${
                      msg.includes("🎉")
                        ? "text-emerald-300 font-bold"
                        : msg.includes("🧠")
                        ? "text-purple-300"
                        : msg.includes("❌")
                        ? "text-red-400"
                        : "text-zinc-400"
                    }`}
                  >
                    {msg}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Column: Output Knowledge Base Preview & Action Dock (7 Cols) */}
          <div className="lg:col-span-7 bg-zinc-900/40 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-zinc-800/60 bg-zinc-950 flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-purple-400" />
                <span>Generated Master OKF Knowledge Base Document</span>
              </span>
              {generatedResult && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadMarkdown}
                    className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition flex items-center gap-1 cursor-pointer border border-zinc-700"
                  >
                    <Download className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Download .md</span>
                  </button>
                  <button
                    onClick={handleApplyToWorkspace}
                    className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition flex items-center gap-1 cursor-pointer shadow-md shadow-emerald-950/30"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Load in Studio</span>
                  </button>
                </div>
              )}
            </div>

            <div className="p-4 flex-1 overflow-y-auto font-mono text-xs text-zinc-300 space-y-4">
              {generatedResult ? (
                <div className="space-y-4">
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center justify-between text-xs">
                    <span>
                      Knowledge Base compiled with <strong>{generatedResult.totalPages} sections</strong> ({generatedResult.totalWords.toLocaleString()} words). Ready for OKF embedding and retrieval.
                    </span>
                  </div>
                  <pre className="whitespace-pre-wrap leading-relaxed text-[11px] text-zinc-300 bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                    {generatedResult.masterMarkdown.slice(0, 5000)}
                    {generatedResult.masterMarkdown.length > 5000 && "\n\n... [Remaining content compiled into master document] ..."}
                  </pre>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 text-zinc-500 space-y-3">
                  <Layers className="w-12 h-12 text-zinc-700 stroke-[1.5]" />
                  <div className="max-w-sm">
                    <p className="text-sm font-medium text-zinc-300">No Knowledge Base Generated Yet</p>
                    <p className="text-xs text-zinc-500 mt-1">
                      Configure your seed URL and crawl parameters above, then click <strong>"Generate Knowledge Base"</strong> to recursively crawl, prune clutter, and assemble your OKF document.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Site Discovery Modal integration */}
      <SiteDiscoveryModal
        isOpen={isDiscoveryOpen}
        onClose={() => setIsDiscoveryOpen(false)}
        initialUrl={seedUrl}
        onSelectUrl={(selected) => {
          setSeedUrl(selected);
        }}
      />
    </div>
  );
}
