import React from "react";
import Prism from "prismjs";

// Import languages needed for syntax highlighting
import "prismjs/components/prism-python";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-css";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";

interface HighlightedCodeBlockProps {
  value: string;
  language?: string;
}

export default function HighlightedCodeBlock({ value, language = "" }: HighlightedCodeBlockProps) {
  const cleanLang = language.toLowerCase().trim();

  // Map common aliases to Prism language names
  const langMap: Record<string, string> = {
    py: "python",
    python: "python",
    js: "javascript",
    javascript: "javascript",
    ts: "typescript",
    typescript: "typescript",
    jsx: "jsx",
    tsx: "tsx",
    html: "markup",
    markup: "markup",
    xml: "markup",
    css: "css",
    bash: "bash",
    sh: "bash",
    shell: "bash",
    json: "json",
  };

  const prismLangName = langMap[cleanLang] || null;
  const hasHighlightDef = prismLangName && Prism.languages[prismLangName];

  if (hasHighlightDef && prismLangName) {
    const html = Prism.highlight(value, Prism.languages[prismLangName], prismLangName);
    return (
      <pre className={`language-${prismLangName} p-4 sm:p-5 rounded-xl border border-zinc-800 bg-zinc-950/90 text-zinc-200 overflow-x-auto my-3 font-mono text-xs leading-[1.625] whitespace-pre-wrap break-words overflow-wrap-anywhere w-full max-w-full select-text`}>
        <code
          className={`language-${prismLangName} select-text whitespace-pre-wrap break-words overflow-wrap-anywhere`}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </pre>
    );
  }

  // Fallback to standard unhighlighted pre/code block
  return (
    <pre className="p-4 sm:p-5 rounded-xl border border-zinc-800 bg-zinc-950/90 text-zinc-200 overflow-x-auto my-3 font-mono text-xs leading-[1.625] whitespace-pre-wrap break-words overflow-wrap-anywhere w-full max-w-full select-text">
      <code className="select-text whitespace-pre-wrap break-words overflow-wrap-anywhere">{value}</code>
    </pre>
  );
}
