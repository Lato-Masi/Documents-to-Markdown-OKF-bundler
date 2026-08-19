import React, { useState } from "react";
import { Globe, Link, Play, RefreshCw, Sparkles, ShieldCheck, FileText, Compass } from "lucide-react";
import SiteDiscoveryModal from "./SiteDiscoveryModal";

interface UrlFetchFormProps {
  inputUrl: string;
  setInputUrl: (url: string) => void;
  isLoading: boolean;
  onFetchUrl: () => void;
  presetUrls: { name: string; url: string; icon?: string }[];
}

export default function UrlFetchForm({
  inputUrl,
  setInputUrl,
  isLoading,
  onFetchUrl,
  presetUrls,
}: UrlFetchFormProps) {
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);

  return (
    <div className="bg-zinc-900/60 rounded-xl p-4 sm:p-5 border border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 text-zinc-200 font-semibold text-sm sm:text-base">
          <Globe className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>Convert Web Page or Online Document URL</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsDiscoveryOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-[11px] text-emerald-300 font-medium transition cursor-pointer"
            title="Inspect domain standards: robots.txt, llms.txt, and sitemap.xml"
          >
            <Compass className="w-3.5 h-3.5 text-emerald-400" />
            <span>Discover Site (robots / llms.txt / sitemap)</span>
          </button>
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-800 text-[11px] text-zinc-400 font-medium border border-zinc-700/60">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Reader Mode Active</span>
          </div>
        </div>
      </div>
      <p className="text-xs text-zinc-400 mb-4">
        Fetches any public web article, docs page, PDF, or Word document from a URL. Automatically strips advertisements, navigation menus, cookie banners, tracking pixels, and graphic clutter.
      </p>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Link className="w-4 h-4 text-zinc-500 absolute left-3 top-3.5 shrink-0" />
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="https://example.com/article-or-doc.html"
            className="w-full bg-zinc-950 border border-zinc-700/80 rounded-lg pl-9 pr-4 py-2.5 text-xs sm:text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isLoading) {
                onFetchUrl();
              }
            }}
          />
        </div>
        <button
          onClick={onFetchUrl}
          disabled={isLoading || !inputUrl.trim()}
          className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg font-medium text-xs sm:text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 cursor-pointer"
        >
          {isLoading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin text-emerald-300 shrink-0" />
              <span>Fetching & Pruning...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current shrink-0" />
              <span>Convert URL</span>
            </>
          )}
        </button>
      </div>

      {presetUrls.length > 0 && (
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">Presets:</span>
          {presetUrls.map((preset) => (
            <button
              key={preset.name}
              onClick={() => setInputUrl(preset.url)}
              className="px-2.5 py-1 text-xs bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 rounded-md border border-zinc-700/60 hover:border-emerald-500/50 transition flex items-center gap-1.5"
            >
              <span>{preset.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Site Discovery Modal */}
      <SiteDiscoveryModal
        isOpen={isDiscoveryOpen}
        onClose={() => setIsDiscoveryOpen(false)}
        initialUrl={inputUrl || "https://playwright.dev"}
        onSelectUrl={(selected) => {
          setInputUrl(selected);
        }}
      />
    </div>
  );
}
