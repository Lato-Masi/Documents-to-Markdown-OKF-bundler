import React, { useState } from "react";
import {
  Compass,
  FileCode,
  ShieldCheck,
  ShieldAlert,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  ListTree,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  ArrowRight,
  AlertCircle,
  FileText
} from "lucide-react";

export interface DomainDiscoveryReport {
  domain: string;
  rootUrl: string;
  checkedAt: string;
  robotsTxt: {
    found: boolean;
    url: string;
    sitemapsDeclared: string[];
    crawlDelay?: number;
    disallowedSample: string[];
    allowedSample: string[];
  };
  llmsTxt: {
    found: boolean;
    url?: string;
    sectionsCount: number;
    curatedUrlsCount: number;
    curatedUrls: string[];
  };
  sitemaps: {
    found: boolean;
    sitemapSources: string[];
    totalIndexedUrls: number;
    sampleUrls: { url: string; lastmod?: string; changefreq?: string; priority?: number }[];
  };
  suggestedSeedUrls: string[];
}

interface SiteDiscoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialUrl?: string;
  onSelectUrl: (url: string) => void;
}

export default function SiteDiscoveryModal({
  isOpen,
  onClose,
  initialUrl = "",
  onSelectUrl,
}: SiteDiscoveryModalProps) {
  const [targetUrl, setTargetUrl] = useState(initialUrl || "https://playwright.dev");
  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState<DomainDiscoveryReport | null>(null);
  const [error, setError] = useState<string>("");
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [expandedSection, setExpandedSection] = useState<"llms" | "sitemaps" | "robots" | "seeds">("llms");

  const runDiscovery = async () => {
    if (!targetUrl.trim()) return;
    setIsLoading(true);
    setError("");
    setReport(null);

    try {
      let formattedUrl = targetUrl.trim();
      if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
        formattedUrl = `https://${formattedUrl}`;
      }

      const res = await fetch("/api/site-discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: formattedUrl }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to inspect domain standards");
      }

      setReport(data.report);
      if (data.report.llmsTxt.found) {
        setExpandedSection("llms");
      } else if (data.report.sitemaps.found) {
        setExpandedSection("sitemaps");
      } else {
        setExpandedSection("seeds");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to connect to domain for discovery inspection");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-zinc-900 border border-zinc-700/80 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-zinc-100">Domain Discovery & Standards Inspector</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-medium border border-emerald-500/30">
                  Phase 1 Site Explorer
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Audits <code className="text-emerald-400">robots.txt</code> crawl policies, searches for <code className="text-emerald-400">llms.txt</code> AI documentation, and parses <code className="text-emerald-400">sitemap.xml</code> URL indices.
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

        {/* Input Bar */}
        <div className="p-4 bg-zinc-900/90 border-b border-zinc-800/80 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="e.g. https://playwright.dev, https://nextjs.org, https://docs.github.com"
              className="w-full bg-zinc-950 border border-zinc-700/80 rounded-lg px-3.5 py-2 text-xs sm:text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isLoading) {
                  runDiscovery();
                }
              }}
            />
          </div>
          <button
            onClick={runDiscovery}
            disabled={isLoading || !targetUrl.trim()}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg font-medium text-xs sm:text-sm transition flex items-center justify-center gap-2 cursor-pointer shrink-0 shadow-md shadow-emerald-950/40"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-300" />
                <span>Auditing Standards...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Inspect Domain</span>
              </>
            )}
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold block mb-0.5">Inspection Notice:</strong>
                {error}
              </div>
            </div>
          )}

          {!report && !isLoading && !error && (
            <div className="py-12 text-center text-zinc-500 space-y-3">
              <Compass className="w-12 h-12 mx-auto text-zinc-700 stroke-[1.5]" />
              <div className="max-w-md mx-auto">
                <p className="text-sm font-medium text-zinc-300">Enter a website domain to discover its content architecture</p>
                <p className="text-xs text-zinc-500 mt-1">
                  We will automatically verify robots.txt permissions, discover AI documentation (llms.txt), and extract all sitemap indices for high-quality knowledge base construction.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-3">
                <span className="text-[11px] text-zinc-600">Quick Audits:</span>
                {[
                  "https://playwright.dev",
                  "https://docs.anthropic.com",
                  "https://en.wikipedia.org",
                  "https://nodejs.org",
                ].map((demoUrl) => (
                  <button
                    key={demoUrl}
                    onClick={() => {
                      setTargetUrl(demoUrl);
                    }}
                    className="px-2.5 py-1 text-xs bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 rounded-md border border-zinc-700/60 transition"
                  >
                    {new URL(demoUrl).hostname}
                  </button>
                ))}
              </div>
            </div>
          )}

          {report && (
            <div className="space-y-4 animate-fade-in">
              {/* Domain Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* robots.txt Card */}
                <div
                  onClick={() => setExpandedSection("robots")}
                  className={`p-3.5 rounded-xl border cursor-pointer transition ${
                    expandedSection === "robots"
                      ? "bg-zinc-800/80 border-emerald-500/50"
                      : "bg-zinc-950/60 border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>robots.txt</span>
                    </span>
                    {report.robotsTxt.found ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium border border-emerald-500/20">
                        Discovered
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                        No Rules (Open)
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    {report.robotsTxt.crawlDelay ? (
                      <span>Crawl delay: {report.robotsTxt.crawlDelay}s • </span>
                    ) : null}
                    <span>{report.robotsTxt.sitemapsDeclared.length} sitemaps declared</span>
                  </div>
                </div>

                {/* llms.txt Card */}
                <div
                  onClick={() => setExpandedSection("llms")}
                  className={`p-3.5 rounded-xl border cursor-pointer transition ${
                    expandedSection === "llms"
                      ? "bg-zinc-800/80 border-purple-500/50"
                      : "bg-zinc-950/60 border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      <span>llms.txt</span>
                    </span>
                    {report.llmsTxt.found ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-semibold border border-purple-500/30 animate-pulse">
                        AI Docs Available!
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
                        Not Published
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    {report.llmsTxt.found ? (
                      <span className="text-purple-300">
                        {report.llmsTxt.curatedUrlsCount} curated AI docs ready
                      </span>
                    ) : (
                      <span>No explicit AI documentation manifest</span>
                    )}
                  </div>
                </div>

                {/* sitemap.xml Card */}
                <div
                  onClick={() => setExpandedSection("sitemaps")}
                  className={`p-3.5 rounded-xl border cursor-pointer transition ${
                    expandedSection === "sitemaps"
                      ? "bg-zinc-800/80 border-cyan-500/50"
                      : "bg-zinc-950/60 border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                      <ListTree className="w-4 h-4 text-cyan-400" />
                      <span>sitemap.xml</span>
                    </span>
                    {report.sitemaps.found ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 font-medium border border-cyan-500/20">
                        {report.sitemaps.totalIndexedUrls} URLs
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
                        Not Found
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    <span>{report.sitemaps.sitemapSources.length} sitemap files indexed</span>
                  </div>
                </div>
              </div>

              {/* Detailed View Accordion */}
              <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-4 space-y-3">
                {/* 1. llms.txt View */}
                {expandedSection === "llms" && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-purple-400" />
                        <span>Curated AI Documentation (llms.txt)</span>
                      </h4>
                      {report.llmsTxt.url && (
                        <a
                          href={report.llmsTxt.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
                        >
                          <span>{report.llmsTxt.url}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    {report.llmsTxt.found && report.llmsTxt.curatedUrls.length > 0 ? (
                      <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                        {report.llmsTxt.curatedUrls.map((docUrl, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/80 border border-zinc-800/60 hover:border-purple-500/40 text-xs text-zinc-300 transition"
                          >
                            <span className="truncate pr-2 font-mono text-[11px] text-purple-200">{docUrl}</span>
                            <button
                              onClick={() => {
                                onSelectUrl(docUrl);
                                onClose();
                              }}
                              className="px-2 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-medium transition flex items-center gap-1 shrink-0 cursor-pointer"
                            >
                              <span>Convert</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-500 italic py-2">
                        No llms.txt or .well-known/llms.txt file published on this domain. We will rely on sitemap indices and semantic page discovery.
                      </p>
                    )}
                  </div>
                )}

                {/* 2. sitemap.xml View */}
                {expandedSection === "sitemaps" && (
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                      <h4 className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
                        <ListTree className="w-4 h-4 text-cyan-400" />
                        <span>Indexed Sitemap URLs ({report.sitemaps.sampleUrls.length} loaded)</span>
                      </h4>
                      <input
                        type="text"
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        placeholder="Filter sitemap paths (e.g. /docs, /api)..."
                        className="bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-cyan-500 w-full sm:w-60"
                      />
                    </div>

                    {report.sitemaps.sampleUrls.length > 0 ? (
                      <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                        {report.sitemaps.sampleUrls
                          .filter((u) => !searchFilter || u.url.toLowerCase().includes(searchFilter.toLowerCase()))
                          .map((u, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/80 border border-zinc-800/60 hover:border-cyan-500/40 text-xs text-zinc-300 transition"
                            >
                              <div className="truncate pr-2">
                                <span className="font-mono text-[11px] text-zinc-200 block truncate">{u.url}</span>
                                {u.lastmod && (
                                  <span className="text-[10px] text-zinc-500">
                                    Last modified: {new Date(u.lastmod).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                              <button
                                onClick={() => {
                                  onSelectUrl(u.url);
                                  onClose();
                                }}
                                className="px-2 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-medium transition flex items-center gap-1 shrink-0 cursor-pointer"
                              >
                                <span>Convert</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-500 italic py-2">
                        No sitemap.xml discovered or accessible on this domain.
                      </p>
                    )}
                  </div>
                )}

                {/* 3. robots.txt View */}
                {expandedSection === "robots" && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <span>robots.txt Compliance Rules</span>
                      </h4>
                      {report.robotsTxt.url && (
                        <a
                          href={report.robotsTxt.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
                        >
                          <span>{report.robotsTxt.url}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    <div className="space-y-2 text-xs">
                      {report.robotsTxt.disallowedSample.length > 0 && (
                        <div>
                          <span className="text-[11px] font-medium text-red-400 block mb-1">
                            Disallowed Paths for Crawlers ({report.robotsTxt.disallowedSample.length}):
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {report.robotsTxt.disallowedSample.map((path, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-300 font-mono text-[10px]"
                              >
                                {path}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {report.robotsTxt.sitemapsDeclared.length > 0 && (
                        <div className="pt-2">
                          <span className="text-[11px] font-medium text-cyan-400 block mb-1">Declared Sitemaps:</span>
                          <div className="space-y-1 font-mono text-[10px] text-zinc-400">
                            {report.robotsTxt.sitemapsDeclared.map((s, i) => (
                              <div key={i} className="truncate">{s}</div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Suggested Seed URLs */}
              <div>
                <h4 className="text-xs font-semibold text-zinc-200 mb-2 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <span>Recommended Knowledge Base Seed URLs:</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {report.suggestedSeedUrls.slice(0, 6).map((seed, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        onSelectUrl(seed);
                        onClose();
                      }}
                      className="p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800 hover:border-emerald-500/50 cursor-pointer transition flex items-center justify-between group"
                    >
                      <span className="font-mono text-[11px] text-zinc-300 truncate pr-2 group-hover:text-emerald-300">
                        {seed}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-emerald-400 shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
