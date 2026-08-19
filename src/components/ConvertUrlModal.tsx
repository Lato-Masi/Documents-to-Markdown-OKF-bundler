import React, { useState } from "react";
import {
  Globe,
  Link,
  Play,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  FileText,
  Compass,
  X,
  AlertCircle,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import SiteDiscoveryModal from "./SiteDiscoveryModal";

interface ConvertUrlModalProps {
  isOpen: boolean;
  onClose: () => void;
  inputUrl: string;
  setInputUrl: (url: string) => void;
  isLoading: boolean;
  onFetchUrl: () => void;
  presetUrls: { name: string; url: string; description?: string }[];
}

export default function ConvertUrlModal({
  isOpen,
  onClose,
  inputUrl,
  setInputUrl,
  isLoading,
  onFetchUrl,
  presetUrls,
}: ConvertUrlModalProps) {
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);
  const [urlError, setUrlError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setUrlError("");

    const trimmed = inputUrl.trim();
    if (!trimmed) {
      setUrlError("Please enter a valid URL to convert.");
      return;
    }

    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      setUrlError("URL must start with http:// or https://");
      return;
    }

    onFetchUrl();
    onClose();
  };

  const handleSelectPreset = (url: string) => {
    setInputUrl(url);
    setUrlError("");
  };

  return (
    <div
      id="convert-url-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) onClose();
      }}
    >
      <div
        id="convert-url-modal-dialog"
        className="bg-zinc-900 border border-zinc-700/80 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-scale-up"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-zinc-100">
                  Convert Web Page or Online Document URL
                </h2>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-medium border border-emerald-500/20">
                  <ShieldCheck className="w-3 h-3" />
                  Reader Mode
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Directly scrape web articles, documentation, online PDFs, or technical guides into clean Markdown.
              </p>
            </div>
          </div>
          <button
            id="convert-url-modal-close-btn"
            onClick={onClose}
            disabled={isLoading}
            className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition disabled:opacity-50 cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 text-zinc-200">
          {/* Target URL Input Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">
              Target Document URL
            </label>
            <div className="relative">
              <Link className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3.5 shrink-0" />
              <input
                id="convert-url-modal-input"
                type="text"
                value={inputUrl}
                onChange={(e) => {
                  setInputUrl(e.target.value);
                  if (urlError) setUrlError("");
                }}
                placeholder="https://example.com/article, https://docs.rs/crate, or https://site.com/doc.pdf"
                className="w-full bg-zinc-950 border border-zinc-700/80 rounded-xl pl-10 pr-4 py-3 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                autoFocus
              />
            </div>

            {urlError && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{urlError}</span>
              </div>
            )}
          </form>

          {/* Feature highlights & discovery trigger */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 flex items-start gap-3">
              <div className="p-2 rounded-lg bg-zinc-800 text-emerald-400 shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="text-xs">
                <div className="font-semibold text-zinc-200 mb-0.5">Clutter & Ad Stripping</div>
                <div className="text-zinc-400 leading-relaxed">
                  Removes navbars, cookie banners, tracking pixels, sidebars, and promotional banners.
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 flex items-start gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0">
                <Compass className="w-4 h-4" />
              </div>
              <div className="text-xs flex-1">
                <div className="font-semibold text-zinc-200 mb-0.5 flex items-center justify-between">
                  <span>Site Discovery</span>
                  <button
                    type="button"
                    onClick={() => setIsDiscoveryOpen(true)}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold underline underline-offset-2 flex items-center gap-1 cursor-pointer"
                  >
                    <span>Inspect</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
                <div className="text-zinc-400 leading-relaxed">
                  Inspect domain <code className="text-emerald-300">robots.txt</code>, <code className="text-emerald-300">llms.txt</code>, and sitemap hierarchy.
                </div>
              </div>
            </div>
          </div>

          {/* Presets Gallery */}
          {presetUrls.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Popular Documentation Presets
                </span>
                <span className="text-[11px] text-zinc-500">Click to load</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {presetUrls.map((preset) => {
                  const isSelected = inputUrl === preset.url;
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => handleSelectPreset(preset.url)}
                      className={`p-2.5 rounded-xl text-left border transition flex items-center justify-between gap-2 cursor-pointer ${
                        isSelected
                          ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300 shadow-sm"
                          : "bg-zinc-950/50 hover:bg-zinc-800/60 border-zinc-800 text-zinc-300 hover:border-zinc-700"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold truncate text-zinc-200">{preset.name}</div>
                        <div className="text-[11px] text-zinc-500 truncate font-mono">{preset.url}</div>
                      </div>
                      {isSelected ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <Link className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800 bg-zinc-950/70">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>

          <button
            id="convert-url-modal-submit-btn"
            type="button"
            onClick={() => handleSubmit()}
            disabled={isLoading || !inputUrl.trim()}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-xl font-semibold text-xs sm:text-sm transition flex items-center gap-2 shadow-lg shadow-emerald-950/40 cursor-pointer"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-300 shrink-0" />
                <span>Fetching & Converting...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current shrink-0" />
                <span>Convert Webpage to Markdown</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Sub-modal: Site Discovery */}
      <SiteDiscoveryModal
        isOpen={isDiscoveryOpen}
        onClose={() => setIsDiscoveryOpen(false)}
        initialUrl={inputUrl || "https://playwright.dev"}
        onSelectUrl={(selected) => {
          setInputUrl(selected);
          setIsDiscoveryOpen(false);
        }}
      />
    </div>
  );
}
