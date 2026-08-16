import React, { useState, useMemo } from "react";
import { parseMarkdownToAST, astToHTML } from "../lib/markdownParser";
import { getThemeById } from "../lib/markdownThemes";
import ThemeSelector from "./ThemeSelector";
import MarkdownEditor from "./MarkdownEditor";
import { Eye, Edit3, Sparkles, FileText, Check, Copy } from "lucide-react";

interface RenderedMarkdownPreviewProps {
  markdown: string;
  currentThemeId: string;
  onSelectTheme: (themeId: string) => void;
  onMarkdownChange?: (newVal: string) => void;
}

export default function RenderedMarkdownPreview({
  markdown,
  currentThemeId,
  onSelectTheme,
  onMarkdownChange,
}: RenderedMarkdownPreviewProps) {
  const [viewMode, setViewMode] = useState<"rendered" | "editor">("rendered");
  const [copied, setCopied] = useState(false);

  const activeTheme = getThemeById(currentThemeId);

  // Parse markdown into AST & HTML
  const { ast, html } = useMemo(() => {
    try {
      const parsedAst = parseMarkdownToAST(markdown || "");
      const generatedHtml = astToHTML(parsedAst, { pretty: true });
      return { ast: parsedAst, html: generatedHtml };
    } catch (err) {
      console.error("Error parsing markdown to AST/HTML:", err);
      return {
        ast: null,
        html: `<div style="padding: 1rem; color: #e11d48; background: #fff1f2; border-radius: 0.5rem; border: 1px solid #fecdd3;">Failed to parse markdown AST.</div>`,
      };
    }
  }, [markdown]);

  const handleCopyHtml = () => {
    if (!html) return;
    navigator.clipboard.writeText(html);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Top Preview Controls Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-zinc-950 p-2.5 sm:p-3 rounded-xl border border-zinc-800">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Mode Switcher */}
          <div className="flex bg-zinc-900 p-1 rounded-lg border border-zinc-800 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setViewMode("rendered")}
              className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-md text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                viewMode === "rendered"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Eye className="w-3.5 h-3.5 shrink-0" />
              <span>Formatted Preview</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("editor")}
              className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-md text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                viewMode === "editor"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Edit3 className="w-3.5 h-3.5 shrink-0" />
              <span>Interactive Editor</span>
            </button>
          </div>

          {/* Quick Stats Pill */}
          {ast?.meta && (
            <div className="hidden md:flex items-center gap-2 px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded-lg text-[11px] text-zinc-400 font-mono">
              <FileText className="w-3 h-3 text-emerald-400 shrink-0" />
              <span>{ast.meta.wordCount} words</span>
              <span className="text-zinc-600">•</span>
              <span>{ast.meta.headingCount} headings</span>
            </div>
          )}
        </div>

        {/* Theme Selector Dropdown & Copy HTML Button */}
        <div className="flex items-center justify-end gap-2 w-full sm:w-auto">
          {viewMode === "rendered" && (
            <>
              <button
                type="button"
                onClick={handleCopyHtml}
                className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 rounded-md text-xs font-medium transition flex items-center justify-center gap-1.5 shrink-0"
                title="Copy rendered HTML string"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
                <span className="inline">{copied ? "Copied" : "Copy HTML"}</span>
              </button>

              <div className="shrink-0">
                <ThemeSelector
                  currentThemeId={currentThemeId}
                  onSelectTheme={onSelectTheme}
                  compact={true}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main Preview / Editor Display Canvas */}
      {viewMode === "rendered" ? (
        <div className="w-full relative min-h-[450px]">
          {/* Dynamically inject active theme CSS rules */}
          <style dangerouslySetInnerHTML={{ __html: activeTheme.css }} />

          {/* Rendered Container without restrictive heights or clipped overflows */}
          <div
            className={`markdown-theme-${activeTheme.id} w-full rounded-xl p-6 sm:p-8 border border-zinc-800/80 shadow-md transition-all text-sm leading-relaxed overflow-x-auto`}
            style={{
              backgroundColor: activeTheme.bg,
              color: activeTheme.fg,
              fontFamily: activeTheme.fontFamily,
            }}
          >
            {html ? (
              <div
                className="w-full break-words overflow-wrap-anywhere select-text space-y-4"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : (
              <div className="text-center py-12 text-zinc-400 text-xs">
                No converted markdown content available to render.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="w-full min-h-[450px]">
          <MarkdownEditor
            value={markdown}
            onChange={onMarkdownChange || (() => {})}
          />
        </div>
      )}
    </div>
  );
}
