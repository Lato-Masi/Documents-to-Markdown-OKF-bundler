import React, { useState, useEffect } from "react";
import {
  Layers,
  Globe,
  Play,
  RefreshCw,
  Copy,
  Check,
  Download,
  FileText,
  Trash2,
  Plus,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Archive,
  BookOpen,
  Link,
} from "lucide-react";
import JSZip from "jszip";
import { extractWebLinksFromMarkdownClient } from "../utils/urlExtractorClient";

export interface BatchScrapeUrlItem {
  url: string;
  status: "pending" | "processing" | "completed" | "error";
  title?: string;
  markdownContent?: string;
  wordCount?: number;
  charCount?: number;
  durationMs?: number;
  error?: string;
}

export interface BatchScrapeResult {
  totalRequested: number;
  successCount: number;
  errorCount: number;
  durationMs: number;
  items: BatchScrapeUrlItem[];
  mergedMarkdownCorpus: string;
}

interface BatchUrlScraperModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialUrls?: string[];
  activeMarkdownContent?: string;
  onLoadMergedCorpus?: (markdown: string, docName: string) => void;
  onAddMultiDocs?: (docs: { title: string; content: string; url: string }[]) => void;
}

export default function BatchUrlScraperModal({
  isOpen,
  onClose,
  initialUrls = [],
  activeMarkdownContent = "",
  onLoadMergedCorpus,
  onAddMultiDocs,
}: BatchUrlScraperModalProps) {
  const [urlsInput, setUrlsInput] = useState<string>(() => initialUrls.join("\n"));
  const [concurrency, setConcurrency] = useState<number>(3);
  const [docStyle, setDocStyle] = useState<"standard" | "gfm" | "academic">("standard");

  useEffect(() => {
    if (initialUrls && initialUrls.length > 0) {
      setUrlsInput(initialUrls.join("\n"));
    }
  }, [initialUrls]);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [batchResult, setBatchResult] = useState<BatchScrapeResult | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const handleStartBatchScrape = async () => {
    const rawLines = urlsInput
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.startsWith("http://") || l.startsWith("https://"));

    if (rawLines.length === 0) {
      setError("Please provide at least one valid web URL starting with http:// or https://");
      return;
    }

    setIsLoading(true);
    setError("");
    setBatchResult(null);

    try {
      const res = await fetch("/api/batch-scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls: rawLines,
          concurrency,
          docStyle,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to execute batch URL scrape");
      }

      setBatchResult(data.result);
    } catch (err: any) {
      setError(err?.message || "Failed to execute batch URL scrape");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadZip = async () => {
    if (!batchResult) return;
    const zip = new JSZip();

    // Add individual markdown files
    batchResult.items.forEach((item, idx) => {
      if (item.status === "completed" && item.markdownContent) {
        const safeName = (item.title || `doc_${idx + 1}`)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .slice(0, 50);
        zip.file(`${idx + 1}_${safeName}.md`, item.markdownContent);
      }
    });

    // Add consolidated master corpus
    zip.file("00_MASTER_CORPUS.md", batchResult.mergedMarkdownCorpus);

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scraped_batch_${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyCorpus = () => {
    if (!batchResult) return;
    navigator.clipboard.writeText(batchResult.mergedMarkdownCorpus);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-zinc-900 border border-zinc-700/80 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-zinc-100">
                  Batch Multi-URL Scraping & Parallel Extraction
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-medium border border-indigo-500/30">
                  Phase 4 Firecrawl Batch Engine
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Scrapes and converts dozens of documentation pages in parallel via headless Playwright, compiles individual Markdown documents, and builds a consolidated master knowledge corpus.
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
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-400 font-medium">
                Target Website URLs (One per line — HTML only):
              </label>
              <div className="flex items-center gap-3">
                {activeMarkdownContent && (
                  <button
                    type="button"
                    onClick={() => {
                      const extracted = extractWebLinksFromMarkdownClient(activeMarkdownContent);
                      if (extracted.length > 0) {
                        const existing = urlsInput
                          .split(/\r?\n/)
                          .map((u) => u.trim())
                          .filter(Boolean);
                        const merged = Array.from(new Set([...existing, ...extracted]));
                        setUrlsInput(merged.join("\n"));
                      }
                    }}
                    className="text-[11px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-indigo-400 hover:text-indigo-300 font-medium transition flex items-center gap-1 border border-zinc-700"
                    title="Extracts all HTML web links found in the active Markdown document"
                  >
                    <Link className="w-3 h-3" />
                    Extract links from active document ({extractWebLinksFromMarkdownClient(activeMarkdownContent).length} found)
                  </button>
                )}
                <span className="text-[11px] text-zinc-500 font-mono">
                  {urlsInput.split(/\r?\n/).filter((l) => l.trim().startsWith("http")).length} valid URLs entered
                </span>
              </div>
            </div>
            <textarea
              value={urlsInput}
              onChange={(e) => setUrlsInput(e.target.value)}
              rows={4}
              placeholder={`https://playwright.dev/docs/intro\nhttps://playwright.dev/docs/locators\nhttps://playwright.dev/docs/actionability\nhttps://playwright.dev/docs/api/class-page`}
              className="w-full bg-zinc-950 border border-zinc-700/80 rounded-lg p-3 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
            />
            <p className="text-[11px] text-zinc-500">
              ℹ️ High-performance scraping strictly targets HTML web pages. PDF, Word documents, and media URLs are automatically skipped.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-zinc-400">Concurrency:</span>
                <div className="flex items-center gap-1">
                  {[1, 3, 5, 8].map((c) => (
                    <button
                      key={c}
                      onClick={() => setConcurrency(c)}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
                        concurrency === c
                          ? "bg-indigo-600 text-white"
                          : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                      }`}
                    >
                      {c}x
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-zinc-400">Output Style:</span>
                <select
                  value={docStyle}
                  onChange={(e) => setDocStyle(e.target.value as any)}
                  className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none"
                >
                  <option value="standard">Standard Markdown</option>
                  <option value="gfm">GitHub-Flavored (GFM)</option>
                  <option value="academic">Academic / KaTeX</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleStartBatchScrape}
              disabled={isLoading || !urlsInput.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg font-medium text-xs sm:text-sm transition flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-indigo-950/40"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-200" />
                  <span>Scraping URLs in Parallel...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Start Batch Scraping</span>
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
          {batchResult ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Output Sub-Header */}
              <div className="p-3 border-b border-zinc-800/80 bg-zinc-900/60 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-zinc-300">
                    Completed <strong>{batchResult.successCount} / {batchResult.totalRequested}</strong> pages in{" "}
                    <strong>{(batchResult.durationMs / 1000).toFixed(2)}s</strong>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyCorpus}
                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg transition border border-zinc-700 flex items-center gap-1 cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? "Copied" : "Copy Corpus"}</span>
                  </button>
                  <button
                    onClick={handleDownloadZip}
                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition flex items-center gap-1 cursor-pointer shadow-sm"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span>Download ZIP Bundle</span>
                  </button>
                  {onLoadMergedCorpus && (
                    <button
                      onClick={() => {
                        onLoadMergedCorpus(
                          batchResult.mergedMarkdownCorpus,
                          `Batch_Scrape_${batchResult.successCount}_Pages.md`
                        );
                        onClose();
                      }}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition flex items-center gap-1 cursor-pointer shadow-sm"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Load in Studio</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Items List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-xs">
                {batchResult.items.map((item, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border flex items-center justify-between gap-3 transition ${
                      item.status === "completed"
                        ? "bg-zinc-900/90 border-zinc-800 text-zinc-300"
                        : "bg-red-500/10 border-red-500/30 text-red-300"
                    }`}
                  >
                    <div className="flex items-center gap-3 truncate">
                      {item.status === "completed" ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                      )}
                      <div className="truncate">
                        <p className="font-sans font-semibold text-zinc-100 text-xs truncate">
                          {item.title || item.url}
                        </p>
                        <p className="text-[11px] text-zinc-500 truncate">{item.url}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 text-[11px]">
                      {item.status === "completed" ? (
                        <>
                          <span className="text-zinc-400">{item.wordCount?.toLocaleString()} words</span>
                          <span className="text-zinc-500">{(item.durationMs! / 1000).toFixed(1)}s</span>
                        </>
                      ) : (
                        <span className="text-red-400 text-xs">{item.error}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-zinc-500 space-y-3">
              <Layers className="w-12 h-12 text-zinc-700 stroke-[1.5]" />
              <div className="max-w-sm">
                <p className="text-sm font-medium text-zinc-300">Ready for Parallel Batch Scraping</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Enter multiple documentation URLs above to scrape in parallel, clean with Readability, and download as an organized ZIP bundle.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
