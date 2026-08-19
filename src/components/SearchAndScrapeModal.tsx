import React, { useState } from "react";
import {
  Search,
  Sparkles,
  Globe,
  RefreshCw,
  Copy,
  Check,
  Download,
  BookOpen,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  FileText,
  Layers,
  ArrowRight,
  Filter,
} from "lucide-react";

export interface SearchCitation {
  title: string;
  url: string;
  snippet?: string;
  markdownExtract?: string;
}

export interface SearchAndScrapeResult {
  query: string;
  synthesizedReport: string;
  citations: SearchCitation[];
  durationMs: number;
}

interface SearchAndScrapeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadReportIntoStudio?: (markdown: string, title: string) => void;
}

export default function SearchAndScrapeModal({
  isOpen,
  onClose,
  onLoadReportIntoStudio,
}: SearchAndScrapeModalProps) {
  const [searchQuery, setSearchQuery] = useState<string>("Playwright locator best practices and filters");
  const [domainFilter, setDomainFilter] = useState<string>("playwright.dev");
  const [maxSources, setMaxSources] = useState<number>(4);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<SearchAndScrapeResult | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"synthesis" | "sources">("synthesis");

  const handleRunSearchAndScrape = async () => {
    if (!searchQuery.trim()) return;
    setIsLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/search-scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchQuery.trim(),
          domainFilter: domainFilter.trim() || undefined,
          maxSources,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to complete AI search and scrape synthesis");
      }

      setResult(data.result);
      setActiveTab("synthesis");
    } catch (err: any) {
      setError(err?.message || "Failed to execute AI search grounding and deep scraping");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyReport = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.synthesizedReport);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadMarkdown = () => {
    if (!result) return;
    const blob = new Blob([result.synthesizedReport], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `AI_Research_${result.query.replace(/[^a-z0-9]+/gi, "_")}.md`;
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
            <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/30 text-violet-400">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-zinc-100">
                  AI Web Search Grounding & Deep Scrape Synthesis
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 font-medium border border-violet-500/30">
                  Phase 4 Search Grounding Engine
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Grounds your research with Google Search, discovers authoritative documentation links, deep-scrapes DOM content via Playwright, and compiles a comprehensive verified synthesis.
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

        {/* Query Input Section */}
        <div className="p-4 bg-zinc-900/90 border-b border-zinc-800/80 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="What technical concept, API docs, or tutorial do you want to research?"
                className="w-full bg-zinc-950 border border-zinc-700/80 rounded-lg px-3.5 py-2 text-xs sm:text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-violet-500 transition"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isLoading) {
                    handleRunSearchAndScrape();
                  }
                }}
              />
            </div>
            <button
              onClick={handleRunSearchAndScrape}
              disabled={isLoading || !searchQuery.trim()}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg font-medium text-xs sm:text-sm transition flex items-center justify-center gap-2 cursor-pointer shrink-0 shadow-md shadow-violet-950/40"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-violet-200" />
                  <span>Researching & Deep Scraping...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Search & Synthesize</span>
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <div className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-2 flex items-center gap-2 text-xs">
              <Globe className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-zinc-400 whitespace-nowrap">Domain Filter (Optional):</span>
              <input
                type="text"
                value={domainFilter}
                onChange={(e) => setDomainFilter(e.target.value)}
                placeholder="playwright.dev, github.com, etc."
                className="w-full bg-transparent text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none"
              />
            </div>

            <div className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-2 flex items-center justify-between text-xs">
              <span className="text-zinc-400">Max Sources to Deep-Scrape:</span>
              <div className="flex items-center gap-1.5">
                {[2, 4, 6].map((num) => (
                  <button
                    key={num}
                    onClick={() => setMaxSources(num)}
                    className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                      maxSources === num
                        ? "bg-violet-600 text-white"
                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="p-3 mx-4 mt-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Results Area */}
        <div className="flex-1 overflow-hidden flex flex-col bg-zinc-950">
          {result ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Output Sub-Header */}
              <div className="p-3 border-b border-zinc-800/80 bg-zinc-900/60 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-xs">
                    <button
                      onClick={() => setActiveTab("synthesis")}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
                        activeTab === "synthesis" ? "bg-violet-500/20 text-violet-300" : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      <Sparkles className="w-3 h-3 inline mr-1" />
                      Synthesized Knowledge Report
                    </button>
                    <button
                      onClick={() => setActiveTab("sources")}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
                        activeTab === "sources" ? "bg-violet-500/20 text-violet-300" : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      <Globe className="w-3 h-3 inline mr-1" />
                      Scraped Sources ({result.citations.length})
                    </button>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-400 hidden sm:inline">
                    Duration: <strong className="text-violet-300">{(result.durationMs / 1000).toFixed(2)}s</strong>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyReport}
                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg transition border border-zinc-700 flex items-center gap-1 cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? "Copied" : "Copy Markdown"}</span>
                  </button>
                  <button
                    onClick={handleDownloadMarkdown}
                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg transition border border-zinc-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Download .md</span>
                  </button>
                  {onLoadReportIntoStudio && (
                    <button
                      onClick={() => {
                        onLoadReportIntoStudio(
                          result.synthesizedReport,
                          `AI_Research_${result.query.slice(0, 30)}.md`
                        );
                        onClose();
                      }}
                      className="px-2.5 py-1 bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium rounded-lg transition flex items-center gap-1 cursor-pointer shadow-sm"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Load in Studio</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto p-5">
                {activeTab === "synthesis" ? (
                  <div className="prose prose-invert max-w-none text-xs sm:text-sm leading-relaxed">
                    <pre className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl font-mono text-xs text-zinc-200 whitespace-pre-wrap leading-relaxed">
                      {result.synthesizedReport}
                    </pre>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {result.citations.map((c, idx) => (
                      <div key={idx} className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-violet-300 hover:underline flex items-center gap-1.5 text-xs sm:text-sm"
                          >
                            <span>{c.title}</span>
                            <ExternalLink className="w-3.5 h-3.5 text-zinc-500" />
                          </a>
                          <span className="text-[10px] text-zinc-500 font-mono">{c.url}</span>
                        </div>
                        {c.snippet && <p className="text-xs text-zinc-400 leading-relaxed">{c.snippet}</p>}
                        {c.markdownExtract && (
                          <div className="mt-2 pt-2 border-t border-zinc-800/80">
                            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
                              Verifiable Article Extract Sample:
                            </span>
                            <pre className="mt-1 p-2 bg-zinc-950 border border-zinc-800/60 rounded text-[11px] font-mono text-zinc-400 max-h-32 overflow-y-auto">
                              {c.markdownExtract}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-zinc-500 space-y-3">
              <Search className="w-12 h-12 text-zinc-700 stroke-[1.5]" />
              <div className="max-w-sm">
                <p className="text-sm font-medium text-zinc-300">Ready for AI Search Grounding & Deep Scraping</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Ask a research question or search for technical documentation to retrieve live web sources, deep scrape clean article content with Playwright, and produce a grounded markdown synthesis.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
