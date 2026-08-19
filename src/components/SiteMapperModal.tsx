import React, { useState, useEffect } from "react";
import {
  Map,
  Compass,
  Search,
  Filter,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  FileText,
  Layers,
  Sparkles,
  Download,
  Copy,
  Check,
  CheckCircle2,
  RefreshCw,
  FolderTree,
  List,
  AlertCircle,
  Play,
  ArrowRight,
} from "lucide-react";

export interface SitemapUrlEntry {
  url: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
}

export interface SitePathNode {
  name: string;
  path: string;
  fullUrl?: string;
  children: { [key: string]: SitePathNode };
  urlCount: number;
  isLeaf?: boolean;
}

export interface SiteMapExtractResult {
  domain: string;
  rootUrl: string;
  totalFound: number;
  filteredCount: number;
  sitemapSources: string[];
  urls: SitemapUrlEntry[];
  hierarchyTree: SitePathNode;
  llmsTxtCuratedCount: number;
  robotsTxtSitemapsCount: number;
}

interface SiteMapperModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDomainUrl?: string;
  onSelectUrlsForBatch?: (urls: string[]) => void;
  onSelectSingleUrl?: (url: string) => void;
}

export default function SiteMapperModal({
  isOpen,
  onClose,
  initialDomainUrl = "",
  onSelectUrlsForBatch,
  onSelectSingleUrl,
}: SiteMapperModalProps) {
  const [targetUrl, setTargetUrl] = useState<string>(initialDomainUrl || "https://playwright.dev");
  const [filterPrefix, setFilterPrefix] = useState<string>("");
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [filterExtension, setFilterExtension] = useState<string>("");
  const [maxUrls, setMaxUrls] = useState<number>(500);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [mapResult, setMapResult] = useState<SiteMapExtractResult | null>(null);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"list" | "tree">("list");
  const [copied, setCopied] = useState<boolean>(false);

  const handleRunSiteMap = async () => {
    if (!targetUrl.trim()) return;
    setIsLoading(true);
    setError("");
    setMapResult(null);
    setSelectedUrls(new Set());

    try {
      let formatted = targetUrl.trim();
      if (!formatted.startsWith("http://") && !formatted.startsWith("https://")) {
        formatted = `https://${formatted}`;
      }

      const res = await fetch("/api/map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domainOrSitemapUrl: formatted,
          maxUrls,
          filterPrefix: filterPrefix.trim() || undefined,
          filterExtension: filterExtension.trim() || undefined,
          searchKeyword: searchKeyword.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to extract site map");
      }

      setMapResult(data.mapResult);
    } catch (err: any) {
      setError(err?.message || "Failed to map domain URLs");
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleSelectAll = () => {
    if (!mapResult) return;
    if (selectedUrls.size === mapResult.urls.length) {
      setSelectedUrls(new Set());
    } else {
      setSelectedUrls(new Set(mapResult.urls.map((u) => u.url)));
    }
  };

  const handleToggleUrl = (url: string) => {
    const next = new Set(selectedUrls);
    if (next.has(url)) {
      next.delete(url);
    } else {
      next.add(url);
    }
    setSelectedUrls(next);
  };

  const handleCopyUrlList = () => {
    if (!mapResult) return;
    const urlsToCopy = selectedUrls.size > 0 ? Array.from(selectedUrls) : mapResult.urls.map((u) => u.url);
    navigator.clipboard.writeText(urlsToCopy.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadTxt = () => {
    if (!mapResult) return;
    const urlsToExport = selectedUrls.size > 0 ? Array.from(selectedUrls) : mapResult.urls.map((u) => u.url);
    const blob = new Blob([urlsToExport.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${mapResult.domain}_sitemap_urls.txt`;
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
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Map className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-zinc-100">
                  Domain Sitemap & Hierarchy Mapper
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-medium border border-cyan-500/30">
                  Phase 3 Firecrawl /map Engine
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Discovers and indexes all public URLs via sitemap.xml indexes, robots.txt declarations, and llms.txt curated indices for bulk conversion.
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

        {/* Query Controls */}
        <div className="p-4 bg-zinc-900/90 border-b border-zinc-800/80 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://example.com or https://example.com/sitemap.xml"
                className="w-full bg-zinc-950 border border-zinc-700/80 rounded-lg px-3.5 py-2 text-xs sm:text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition"
              />
            </div>
            <button
              onClick={handleRunSiteMap}
              disabled={isLoading || !targetUrl.trim()}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg font-medium text-xs sm:text-sm transition flex items-center justify-center gap-2 cursor-pointer shrink-0 shadow-md shadow-cyan-950/40"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-cyan-200" />
                  <span>Mapping Sitemaps...</span>
                </>
              ) : (
                <>
                  <Compass className="w-4 h-4" />
                  <span>Extract Site Map</span>
                </>
              )}
            </button>
          </div>

          {/* Filters Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1">
            <div className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-2 flex items-center gap-2 text-xs">
              <span className="text-zinc-400 whitespace-nowrap">Path Prefix:</span>
              <input
                type="text"
                value={filterPrefix}
                onChange={(e) => setFilterPrefix(e.target.value)}
                placeholder="/docs, /blog"
                className="w-full bg-transparent text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none"
              />
            </div>

            <div className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-2 flex items-center gap-2 text-xs">
              <span className="text-zinc-400 whitespace-nowrap">Keyword:</span>
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="api, install"
                className="w-full bg-transparent text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none"
              />
            </div>

            <div className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-2 flex items-center gap-2 text-xs">
              <span className="text-zinc-400 whitespace-nowrap">Extension:</span>
              <input
                type="text"
                value={filterExtension}
                onChange={(e) => setFilterExtension(e.target.value)}
                placeholder="html, pdf, mdx"
                className="w-full bg-transparent text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none"
              />
            </div>

            <div className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-2 flex items-center justify-between text-xs">
              <span className="text-zinc-400">Limit:</span>
              <div className="flex items-center gap-1.5">
                {[100, 500, 1000].map((lim) => (
                  <button
                    key={lim}
                    onClick={() => setMaxUrls(lim)}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                      maxUrls === lim ? "bg-cyan-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                    }`}
                  >
                    {lim}
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

        {/* Results Container */}
        <div className="flex-1 overflow-hidden flex flex-col bg-zinc-950">
          {mapResult ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Output Sub-Header */}
              <div className="p-3 border-b border-zinc-800/80 bg-zinc-900/60 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-zinc-300">
                    Found <strong>{mapResult.filteredCount}</strong> indexed URLs on <strong>{mapResult.domain}</strong>
                  </span>
                  <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-xs">
                    <button
                      onClick={() => setViewMode("list")}
                      className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                        viewMode === "list" ? "bg-cyan-500/20 text-cyan-300" : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      <List className="w-3 h-3 inline mr-1" />
                      List View
                    </button>
                    <button
                      onClick={() => setViewMode("tree")}
                      className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                        viewMode === "tree" ? "bg-cyan-500/20 text-cyan-300" : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      <FolderTree className="w-3 h-3 inline mr-1" />
                      Hierarchy Tree
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleToggleSelectAll}
                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition border border-zinc-700 cursor-pointer"
                  >
                    {selectedUrls.size === mapResult.urls.length ? "Deselect All" : "Select All"}
                  </button>
                  <button
                    onClick={handleCopyUrlList}
                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg transition border border-zinc-700 flex items-center gap-1 cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? "Copied" : "Copy URLs"}</span>
                  </button>
                  <button
                    onClick={handleDownloadTxt}
                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg transition border border-zinc-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Export .txt</span>
                  </button>
                  {onSelectUrlsForBatch && selectedUrls.size > 0 && (
                    <button
                      onClick={() => {
                        onSelectUrlsForBatch(Array.from(selectedUrls));
                        onClose();
                      }}
                      className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition flex items-center gap-1 cursor-pointer shadow-sm"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Send to Batch Scraper ({selectedUrls.size})</span>
                    </button>
                  )}
                </div>
              </div>

              {/* URL Explorer Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-1.5 font-mono text-xs">
                {viewMode === "list" ? (
                  mapResult.urls.map((entry, idx) => (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-lg border flex items-center justify-between gap-3 transition ${
                        selectedUrls.has(entry.url)
                          ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-200"
                          : "bg-zinc-900/80 border-zinc-800/80 text-zinc-300 hover:border-zinc-700"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <input
                          type="checkbox"
                          checked={selectedUrls.has(entry.url)}
                          onChange={() => handleToggleUrl(entry.url)}
                          className="rounded border-zinc-700 bg-zinc-800 text-cyan-600 focus:ring-cyan-500 cursor-pointer"
                        />
                        <span className="truncate">{entry.url}</span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {entry.changefreq && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-medium">
                            {entry.changefreq}
                          </span>
                        )}
                        {onSelectSingleUrl && (
                          <button
                            onClick={() => {
                              onSelectSingleUrl(entry.url);
                              onClose();
                            }}
                            className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-cyan-600 text-zinc-300 hover:text-white text-[11px] font-sans transition flex items-center gap-1 cursor-pointer"
                          >
                            <span>Convert</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
                    <pre className="text-xs text-cyan-300 leading-relaxed overflow-x-auto">
                      {JSON.stringify(mapResult.hierarchyTree, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-zinc-500 space-y-3">
              <Map className="w-12 h-12 text-zinc-700 stroke-[1.5]" />
              <div className="max-w-sm">
                <p className="text-sm font-medium text-zinc-300">Ready to Map Domain URLs</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Enter a target domain or sitemap index URL to parse its sitemap architecture, filter specific doc paths, and queue URLs for bulk ingestion.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
