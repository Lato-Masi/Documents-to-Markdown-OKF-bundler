import { useEffect, useState, useId, useRef } from "react";
import mermaid from "mermaid";

// Initialize mermaid once
try {
  mermaid.initialize({
    startOnLoad: false,
    theme: "default",
    securityLevel: "loose",
    fontFamily: "ui-sans-serif, system-ui, sans-serif, var(--font-sans)",
  });
} catch (e) {
  console.error("Failed to initialize Mermaid:", e);
}

interface MermaidProps {
  value: string;
}

export default function Mermaid({ value }: MermaidProps) {
  const uniqueId = useId().replace(/:/g, "mermaid-");
  const [svgHtml, setSvgHtml] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    setError(null);
    setSvgHtml("");

    const renderDiagram = async () => {
      if (!value.trim()) return;

      try {
        // Render the diagram asynchronously
        const { svg } = await mermaid.render(uniqueId, value);
        if (isMounted) {
          setSvgHtml(svg);
        }
      } catch (err: any) {
        console.error("Mermaid parsing error:", err);
        // Clear any half-rendered artifacts or errors in mermaid's cache
        try {
          const badElement = document.getElementById(uniqueId);
          if (badElement) {
            badElement.remove();
          }
        } catch (_) {}

        if (isMounted) {
          setError(err?.message || String(err));
        }
      }
    };

    renderDiagram();

    return () => {
      isMounted = false;
    };
  }, [value, uniqueId]);

  if (error) {
    return (
      <div className="my-4 p-4 rounded border border-rose-100 bg-rose-50/50 text-rose-800 text-xs">
        <div className="font-semibold mb-2">Mermaid Diagram Error:</div>
        <pre className="font-mono bg-white p-2 border border-rose-200 rounded text-[11px] overflow-auto max-h-[150px] leading-relaxed text-slate-800">
          {error}
        </pre>
        <div className="mt-3 font-semibold text-slate-500">Source Definition:</div>
        <pre className="font-mono bg-white/50 p-2 border border-slate-200 rounded text-[11px] overflow-auto max-h-[150px] mt-1 text-slate-600">
          {value}
        </pre>
      </div>
    );
  }

  if (!svgHtml) {
    return (
      <div className="my-4 py-8 border border-slate-100 rounded bg-slate-50/50 flex flex-col items-center justify-center gap-2">
        <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin"></div>
        <span className="text-[10px] text-slate-400 font-mono">Rendering diagram...</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="my-6 p-4 border border-slate-100 rounded-lg bg-white overflow-x-auto flex justify-center shadow-xs select-none"
      dangerouslySetInnerHTML={{ __html: svgHtml }}
    />
  );
}
