import React, { useRef, useState, useEffect, useMemo } from "react";
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Code,
  Terminal,
  Quote,
  Table as TableIcon,
  Link2,
  Minus,
  Columns,
  Eye,
  Edit3,
  Copy,
  Check,
  FileText,
  WrapText,
} from "lucide-react";
import { parseMarkdownToAST, astToHTML } from "../lib/markdownParser";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
}

type EditorLayoutMode = "edit" | "split" | "preview";

export default function MarkdownEditor({ value, onChange }: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const [layoutMode, setLayoutMode] = useState<EditorLayoutMode>("split");
  const [wordWrap, setWordWrap] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1, selectedChars: 0 });

  // Compute live line numbers
  const lines = useMemo(() => {
    const lineCount = (value || "").split("\n").length;
    return Array.from({ length: Math.max(lineCount, 1) }, (_, i) => i + 1);
  }, [value]);

  // Compute stats
  const stats = useMemo(() => {
    const text = value || "";
    const words = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
    const chars = text.length;
    const lineCount = text.split("\n").length;
    return { words, chars, lineCount };
  }, [value]);

  // Real-time HTML render for Split / Preview views
  const previewHtml = useMemo(() => {
    try {
      const ast = parseMarkdownToAST(value || "");
      return astToHTML(ast, { pretty: true });
    } catch (err) {
      return `<div class="p-4 text-rose-400 bg-rose-950/40 rounded-lg border border-rose-800/60 text-xs">Preview parsing notice: ${String(err)}</div>`;
    }
  }, [value]);

  // Sync line number gutter scroll with textarea
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  // Update cursor line & column status
  const updateCursorPosition = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const textBeforeCursor = textarea.value.substring(0, start);
    const linesArr = textBeforeCursor.split("\n");
    const currentLine = linesArr.length;
    const currentCol = linesArr[linesArr.length - 1].length + 1;
    const selectedChars = Math.abs(end - start);

    setCursorPos({
      line: currentLine,
      col: currentCol,
      selectedChars,
    });
  };

  // Insert or wrap text at selection
  const insertFormatting = (before: string, after: string = "", defaultPlaceholder: string = "") => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = textarea.value;
    const selectedText = currentVal.substring(start, end) || defaultPlaceholder;

    const replacement = `${before}${selectedText}${after}`;
    const nextVal = currentVal.substring(0, start) + replacement + currentVal.substring(end);

    onChange(nextVal);

    // Re-focus and set selection
    setTimeout(() => {
      textarea.focus();
      const newCursorStart = start + before.length;
      const newCursorEnd = newCursorStart + selectedText.length;
      textarea.setSelectionRange(newCursorStart, newCursorEnd);
      updateCursorPosition();
    }, 10);
  };

  // Insert line-prefix formatting (e.g. heading, bullet, list)
  const insertLinePrefix = (prefix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = textarea.value;

    const lineStart = currentVal.lastIndexOf("\n", start - 1) + 1;
    const lineEnd = currentVal.indexOf("\n", end);
    const effectiveLineEnd = lineEnd === -1 ? currentVal.length : lineEnd;

    const targetSection = currentVal.substring(lineStart, effectiveLineEnd);
    const linesArr = targetSection.split("\n");

    const prefixedSection = linesArr
      .map((ln) => (ln.startsWith(prefix) ? ln.substring(prefix.length) : `${prefix}${ln}`))
      .join("\n");

    const nextVal =
      currentVal.substring(0, lineStart) + prefixedSection + currentVal.substring(effectiveLineEnd);

    onChange(nextVal);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(lineStart + prefix.length, lineStart + prefixedSection.length);
      updateCursorPosition();
    }, 10);
  };

  // Insert Table Template
  const insertTable = () => {
    const template = `\n| Column 1 | Column 2 | Column 3 |\n| :--- | :--- | :--- |\n| Data A | Data B | Data C |\n| Data D | Data E | Data F |\n\n`;
    insertFormatting(template, "", "");
  };

  // Keyboard Shortcuts & Smart List Continuation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const { selectionStart, selectionEnd } = textarea;
    const currentVal = textarea.value;

    // 1. Hotkeys (Cmd/Ctrl + B, I, K)
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
      e.preventDefault();
      insertFormatting("**", "**", "bold text");
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
      e.preventDefault();
      insertFormatting("*", "*", "italic text");
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      insertFormatting("[", "](https://example.com)", "link title");
      return;
    }

    // 2. Tab Key (2 Spaces Indentation / Shift+Tab Unindent)
    if (e.key === "Tab") {
      e.preventDefault();
      if (!e.shiftKey) {
        // Insert 2 spaces
        const nextVal = currentVal.substring(0, selectionStart) + "  " + currentVal.substring(selectionEnd);
        onChange(nextVal);
        setTimeout(() => {
          textarea.setSelectionRange(selectionStart + 2, selectionStart + 2);
          updateCursorPosition();
        }, 0);
      } else {
        // Shift+Tab unindent
        const lineStart = currentVal.lastIndexOf("\n", selectionStart - 1) + 1;
        if (currentVal.substring(lineStart, lineStart + 2) === "  ") {
          const nextVal = currentVal.substring(0, lineStart) + currentVal.substring(lineStart + 2);
          onChange(nextVal);
          setTimeout(() => {
            const newPos = Math.max(selectionStart - 2, lineStart);
            textarea.setSelectionRange(newPos, newPos);
            updateCursorPosition();
          }, 0);
        }
      }
      return;
    }

    // 3. Smart Enter (Auto-continue lists: '- ', '* ', '1. ', '- [ ] ')
    if (e.key === "Enter" && !e.shiftKey) {
      const lineStart = currentVal.lastIndexOf("\n", selectionStart - 1) + 1;
      const currentLineText = currentVal.substring(lineStart, selectionStart);

      // Match list markers
      const bulletMatch = currentLineText.match(/^(\s*)([-*+])\s+(.*)$/);
      const numberMatch = currentLineText.match(/^(\s*)(\d+)\.\s+(.*)$/);
      const taskMatch = currentLineText.match(/^(\s*)-\s+\[([ xX])\]\s+(.*)$/);

      if (taskMatch) {
        e.preventDefault();
        const [, indent, , rest] = taskMatch;
        if (!rest.trim()) {
          // Empty task -> terminate list
          const nextVal = currentVal.substring(0, lineStart) + currentVal.substring(selectionStart);
          onChange(nextVal);
        } else {
          const insertStr = `\n${indent}- [ ] `;
          const nextVal = currentVal.substring(0, selectionStart) + insertStr + currentVal.substring(selectionEnd);
          onChange(nextVal);
          setTimeout(() => {
            textarea.setSelectionRange(selectionStart + insertStr.length, selectionStart + insertStr.length);
            updateCursorPosition();
          }, 0);
        }
        return;
      }

      if (bulletMatch) {
        e.preventDefault();
        const [, indent, bullet, rest] = bulletMatch;
        if (!rest.trim()) {
          // Empty bullet -> terminate list
          const nextVal = currentVal.substring(0, lineStart) + currentVal.substring(selectionStart);
          onChange(nextVal);
        } else {
          const insertStr = `\n${indent}${bullet} `;
          const nextVal = currentVal.substring(0, selectionStart) + insertStr + currentVal.substring(selectionEnd);
          onChange(nextVal);
          setTimeout(() => {
            textarea.setSelectionRange(selectionStart + insertStr.length, selectionStart + insertStr.length);
            updateCursorPosition();
          }, 0);
        }
        return;
      }

      if (numberMatch) {
        e.preventDefault();
        const [, indent, numStr, rest] = numberMatch;
        if (!rest.trim()) {
          // Empty item -> terminate list
          const nextVal = currentVal.substring(0, lineStart) + currentVal.substring(selectionStart);
          onChange(nextVal);
        } else {
          const nextNum = parseInt(numStr, 10) + 1;
          const insertStr = `\n${indent}${nextNum}. `;
          const nextVal = currentVal.substring(0, selectionStart) + insertStr + currentVal.substring(selectionEnd);
          onChange(nextVal);
          setTimeout(() => {
            textarea.setSelectionRange(selectionStart + insertStr.length, selectionStart + insertStr.length);
            updateCursorPosition();
          }, 0);
        }
        return;
      }
    }

    // 4. Auto-closing pairs
    const pairs: Record<string, string> = {
      "(": ")",
      "[": "]",
      "{": "}",
      '"': '"',
      "'": "'",
      "`": "`",
    };

    if (pairs[e.key] !== undefined && selectionStart !== selectionEnd) {
      e.preventDefault();
      const closing = pairs[e.key];
      const selected = currentVal.substring(selectionStart, selectionEnd);
      const replacement = `${e.key}${selected}${closing}`;
      const nextVal = currentVal.substring(0, selectionStart) + replacement + currentVal.substring(selectionEnd);
      onChange(nextVal);
      setTimeout(() => {
        textarea.setSelectionRange(selectionStart + 1, selectionStart + 1 + selected.length);
        updateCursorPosition();
      }, 0);
    }
  };

  const handleCopyRaw = () => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col border border-zinc-800 rounded-2xl overflow-hidden bg-zinc-950 shadow-xl w-full min-h-[550px]">
      {/* Top Format Toolbar */}
      <div className="bg-zinc-900/90 border-b border-zinc-800/80 p-2 sm:p-2.5 flex flex-wrap items-center justify-between gap-2 select-none">
        {/* Formatting Actions */}
        <div className="flex flex-wrap items-center gap-1">
          <div className="flex items-center bg-zinc-950 p-1 rounded-lg border border-zinc-800/80">
            <button
              type="button"
              onClick={() => insertFormatting("**", "**", "bold text")}
              className="p-1.5 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 rounded-md transition"
              title="Bold (Ctrl+B)"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting("*", "*", "italic text")}
              className="p-1.5 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 rounded-md transition"
              title="Italic (Ctrl+I)"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting("~~", "~~", "strikethrough")}
              className="p-1.5 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 rounded-md transition"
              title="Strikethrough"
            >
              <Strikethrough className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center bg-zinc-950 p-1 rounded-lg border border-zinc-800/80">
            <button
              type="button"
              onClick={() => insertLinePrefix("# ")}
              className="p-1.5 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 rounded-md transition"
              title="Heading 1"
            >
              <Heading1 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => insertLinePrefix("## ")}
              className="p-1.5 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 rounded-md transition"
              title="Heading 2"
            >
              <Heading2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => insertLinePrefix("### ")}
              className="p-1.5 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 rounded-md transition"
              title="Heading 3"
            >
              <Heading3 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center bg-zinc-950 p-1 rounded-lg border border-zinc-800/80">
            <button
              type="button"
              onClick={() => insertLinePrefix("- ")}
              className="p-1.5 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 rounded-md transition"
              title="Bullet List"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => insertLinePrefix("1. ")}
              className="p-1.5 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 rounded-md transition"
              title="Numbered List"
            >
              <ListOrdered className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => insertLinePrefix("- [ ] ")}
              className="p-1.5 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 rounded-md transition"
              title="Task Checklist"
            >
              <CheckSquare className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center bg-zinc-950 p-1 rounded-lg border border-zinc-800/80">
            <button
              type="button"
              onClick={() => insertFormatting("`", "`", "code")}
              className="p-1.5 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 rounded-md transition"
              title="Inline Code"
            >
              <Code className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting("```typescript\n", "\n```", "code block")}
              className="p-1.5 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 rounded-md transition"
              title="Code Block"
            >
              <Terminal className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => insertLinePrefix("> ")}
              className="p-1.5 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 rounded-md transition"
              title="Blockquote"
            >
              <Quote className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={insertTable}
              className="p-1.5 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 rounded-md transition"
              title="Insert GFM Table"
            >
              <TableIcon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting("[", "](https://example.com)", "link title")}
              className="p-1.5 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 rounded-md transition"
              title="Hyperlink (Ctrl+K)"
            >
              <Link2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting("\n---\n\n", "", "")}
              className="p-1.5 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 rounded-md transition"
              title="Horizontal Divider"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Layout & Utility Switchers */}
        <div className="flex items-center gap-2">
          {/* Word Wrap Toggle */}
          <button
            type="button"
            onClick={() => setWordWrap(!wordWrap)}
            className={`p-1.5 rounded-lg border text-xs font-medium transition flex items-center gap-1 ${
              wordWrap
                ? "bg-zinc-800 text-emerald-400 border-zinc-700"
                : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200"
            }`}
            title="Toggle Word Wrap"
          >
            <WrapText className="w-3.5 h-3.5" />
            <span className="text-[10px] hidden md:inline">Wrap</span>
          </button>

          {/* Copy Raw Button */}
          <button
            type="button"
            onClick={handleCopyRaw}
            className="p-1.5 bg-zinc-950 hover:bg-zinc-800 text-zinc-300 rounded-lg border border-zinc-800 text-xs font-medium transition flex items-center gap-1.5"
            title="Copy Raw Markdown"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
            <span className="text-[10px]">{copied ? "Copied" : "Copy"}</span>
          </button>

          {/* Layout Mode Toggles */}
          <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800/80">
            <button
              type="button"
              onClick={() => setLayoutMode("edit")}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition flex items-center gap-1 ${
                layoutMode === "edit"
                  ? "bg-zinc-800 text-emerald-400 border border-zinc-700 shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
              title="Editor Canvas Only"
            >
              <Edit3 className="w-3 h-3" />
              <span className="hidden sm:inline">Editor</span>
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode("split")}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition flex items-center gap-1 ${
                layoutMode === "split"
                  ? "bg-zinc-800 text-emerald-400 border border-zinc-700 shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
              title="Side-by-Side Split View"
            >
              <Columns className="w-3 h-3" />
              <span className="hidden sm:inline">Split</span>
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode("preview")}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition flex items-center gap-1 ${
                layoutMode === "preview"
                  ? "bg-zinc-800 text-emerald-400 border border-zinc-700 shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
              title="Live Rendered Preview"
            >
              <Eye className="w-3 h-3" />
              <span className="hidden sm:inline">Preview</span>
            </button>
          </div>
        </div>
      </div>

      {/* Editor Body Area */}
      <div className="flex-1 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-zinc-800/80 min-h-[460px] relative">
        {/* Left Column: Interactive Code Editor */}
        {(layoutMode === "edit" || layoutMode === "split") && (
          <div className={`flex-1 flex relative overflow-hidden bg-zinc-950 ${layoutMode === "split" ? "md:w-1/2" : "w-full"}`}>
            {/* Line Number Gutter */}
            <div
              ref={gutterRef}
              className="w-12 bg-zinc-950 border-r border-zinc-800/80 text-zinc-600 font-mono text-xs select-none overflow-hidden py-4 text-right pr-3 flex flex-col gap-0 leading-[1.625]"
            >
              {lines.map((ln) => (
                <div key={ln} className="h-[1.625rem]">
                  {ln}
                </div>
              ))}
            </div>

            {/* Direct High-Contrast Editable Textarea */}
            <textarea
              ref={textareaRef}
              value={value || ""}
              onChange={(e) => onChange(e.target.value)}
              onScroll={handleScroll}
              onSelect={updateCursorPosition}
              onKeyUp={updateCursorPosition}
              onClick={updateCursorPosition}
              onKeyDown={handleKeyDown}
              className={`flex-1 p-4 font-mono text-xs leading-[1.625] bg-zinc-950 text-zinc-100 placeholder-zinc-600 caret-emerald-400 border-0 outline-none focus:outline-none focus:ring-0 resize-none min-h-[460px] h-full ${
                wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre overflow-x-auto"
              }`}
              placeholder="Paste or type Markdown content here..."
              spellCheck={false}
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
            />
          </div>
        )}

        {/* Right Column: Live Render Preview */}
        {(layoutMode === "preview" || layoutMode === "split") && (
          <div className={`flex-1 bg-zinc-900/40 p-4 sm:p-6 overflow-y-auto min-h-[460px] ${layoutMode === "split" ? "md:w-1/2" : "w-full"}`}>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-zinc-800/80">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 font-mono">
                <Eye className="w-3 h-3 text-emerald-400" />
                <span>Live Render Preview</span>
              </span>
              <span className="text-[11px] text-zinc-500 font-mono">
                {stats.words.toLocaleString()} words
              </span>
            </div>

            {previewHtml ? (
              <div
                className="prose prose-invert prose-emerald max-w-none text-xs sm:text-sm leading-relaxed break-words space-y-4 select-text"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : (
              <div className="text-center py-16 text-zinc-500 text-xs font-mono">
                No Markdown content to render. Start typing in the editor.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Status Bar */}
      <div className="bg-zinc-900/90 border-t border-zinc-800/80 px-4 py-2 flex flex-wrap items-center justify-between text-[11px] text-zinc-400 font-mono select-none gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            <span className="text-zinc-300 font-medium">Interactive Markdown Engine</span>
          </div>
          <span className="text-zinc-600">•</span>
          <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
          {cursorPos.selectedChars > 0 && (
            <span className="text-emerald-400">({cursorPos.selectedChars} selected)</span>
          )}
        </div>

        <div className="flex items-center gap-4">
          <span>{stats.lineCount} lines</span>
          <span className="text-zinc-600">•</span>
          <span>{stats.words.toLocaleString()} words</span>
          <span className="text-zinc-600">•</span>
          <span>{stats.chars.toLocaleString()} chars</span>
        </div>
      </div>
    </div>
  );
}
