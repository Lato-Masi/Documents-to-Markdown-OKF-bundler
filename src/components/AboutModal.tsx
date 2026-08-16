import React, { useEffect, useMemo, useState } from "react";
import { parseMarkdownToAST, astToHTML } from "../lib/markdownParser";
import { getThemeById } from "../lib/markdownThemes";
import ThemeSelector from "./ThemeSelector";
import { X, BookOpen, Sparkles, Copy, Check, Download, ExternalLink, ShieldCheck, Layers } from "lucide-react";
import { README_MARKDOWN } from "../data/readmeContent";

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AboutModal({ isOpen, onClose }: AboutModalProps) {
  const [themeId, setThemeId] = useState<string>("github-dark");
  const [copied, setCopied] = useState<boolean>(false);

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const activeTheme = getThemeById(themeId);

  const { ast, html } = useMemo(() => {
    try {
      const parsedAst = parseMarkdownToAST(README_MARKDOWN);
      const generatedHtml = astToHTML(parsedAst, { pretty: true });
      return { ast: parsedAst, html: generatedHtml };
    } catch (err) {
      console.error("Error parsing README.md to HTML:", err);
      return {
        ast: null,
        html: `<div style="padding: 1rem; color: #e11d48; background: #fff1f2; border-radius: 0.5rem;">Failed to render README.md</div>`,
      };
    }
  }, []);

  const handleCopyMarkdown = () => {
    navigator.clipboard.writeText(README_MARKDOWN);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadReadme = () => {
    const blob = new Blob([README_MARKDOWN], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "README.md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div
      id="about-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-modal-title"
    >
      <div
        id="about-modal-container"
        className="relative w-full max-w-4xl max-h-[90vh] bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-zinc-100 animate-in zoom-in-95 duration-150"
      >
        {/* Modal Top Header Bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-950/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 id="about-modal-title" className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <span>About Document to Markdown & OKF</span>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                  README.md
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Architectural overview, two-step knowledge transformation, and OKF trust signals
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="about-modal-copy-btn"
              type="button"
              onClick={handleCopyMarkdown}
              className="px-2.5 py-1.5 bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/70 rounded-lg text-xs font-medium transition flex items-center gap-1.5 cursor-pointer"
              title="Copy raw README.md"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copied ? "Copied" : "Copy Raw"}</span>
            </button>

            <button
              id="about-modal-download-btn"
              type="button"
              onClick={handleDownloadReadme}
              className="p-1.5 sm:px-2.5 sm:py-1.5 bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/70 rounded-lg text-xs font-medium transition flex items-center gap-1.5 cursor-pointer"
              title="Download README.md"
            >
              <Download className="w-3.5 h-3.5 text-zinc-400" />
              <span className="hidden sm:inline">Download</span>
            </button>

            <button
              id="about-modal-close-btn"
              type="button"
              onClick={onClose}
              className="p-2 bg-zinc-800/80 hover:bg-rose-950/50 hover:text-rose-400 hover:border-rose-800/60 text-zinc-400 border border-zinc-700/70 rounded-xl transition cursor-pointer ml-1"
              title="Close modal (Esc)"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Toolbar & Metadata stats */}
        <div className="px-5 py-2.5 bg-zinc-950 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-3 text-zinc-400 font-mono text-[11px]">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>OKF v0.2 Specification</span>
            </span>
            <span className="text-zinc-600">•</span>
            {ast?.meta && (
              <span>~{ast.meta.wordCount.toLocaleString()} words</span>
            )}
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-400">Universal Markdown + OKF</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-zinc-400 text-[11px]">Theme:</span>
            <ThemeSelector
              currentThemeId={themeId}
              onSelectTheme={setThemeId}
              compact={true}
            />
          </div>
        </div>

        {/* Formatted Markdown Body Viewport */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-8 space-y-4 select-text">
          {/* Dynamically inject active theme CSS rules */}
          <style dangerouslySetInnerHTML={{ __html: activeTheme.css }} />

          <div
            className={`markdown-theme-${activeTheme.id} w-full rounded-xl p-6 sm:p-8 border border-zinc-800/80 shadow-md text-sm leading-relaxed overflow-x-auto`}
            style={{
              backgroundColor: activeTheme.bg,
              color: activeTheme.fg,
              fontFamily: activeTheme.fontFamily,
            }}
          >
            {html ? (
              <div
                className="w-full break-words overflow-wrap-anywhere space-y-4"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : (
              <div className="text-center py-12 text-zinc-400 text-xs">
                No README content available.
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-950/90 flex items-center justify-between text-xs text-zinc-400 shrink-0">
          <span className="flex items-center gap-1.5 text-zinc-400">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Document to Markdown Engine • Open Knowledge Format</span>
          </span>

          <button
            id="about-modal-bottom-close-btn"
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition shadow cursor-pointer text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
