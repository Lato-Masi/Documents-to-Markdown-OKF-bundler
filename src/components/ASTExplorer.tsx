import React, { useMemo, useState } from "react";
import {
  parseMarkdownToAST,
  astToHTML,
  astToOutline,
  astToXML,
  filterASTNodes,
  ASTDocumentNode,
  ASTNode,
  ASTMermaidBlockNode,
  ASTMathBlockNode,
  ASTYAMLBlockNode,
  ASTYAMLFrontmatterNode,
} from "../lib/markdownParser";
import { getThemeById, MARKDOWN_THEMES } from "../lib/markdownThemes";
import ThemeSelector from "./ThemeSelector";
import Mermaid from "./Mermaid";
import {
  Code,
  FileCode,
  Copy,
  Check,
  Search,
  Download,
  ListOrdered,
  Eye,
  Terminal,
  Braces,
  Sigma,
  Workflow,
  FileJson,
  Layers,
  Sparkles,
  Palette,
} from "lucide-react";

interface ASTExplorerProps {
  markdown: string;
  currentThemeId?: string;
  onSelectTheme?: (themeId: string) => void;
}

export default function ASTExplorer({
  markdown,
  currentThemeId = "github-light",
  onSelectTheme,
}: ASTExplorerProps) {
  const [activeSubTab, setActiveSubTab] = useState<
    "ast-tree" | "html-render" | "mermaid" | "math-katex" | "yaml-meta" | "outline" | "export"
  >("ast-tree");
  const [filterType, setFilterType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copied, setCopied] = useState<string | null>(null);
  const [localThemeId, setLocalThemeId] = useState<string>(currentThemeId);

  const activeThemeId = currentThemeId || localThemeId;
  const activeTheme = getThemeById(activeThemeId);

  const handleThemeChange = (id: string) => {
    setLocalThemeId(id);
    if (onSelectTheme) onSelectTheme(id);
  };

  // Parse raw Markdown into AST
  const ast: ASTDocumentNode = useMemo(() => {
    return parseMarkdownToAST(markdown || "");
  }, [markdown]);

  // Derived HTML rendering from the AST
  const renderedHTML = useMemo(() => {
    return astToHTML(ast, { pretty: true, wrapDocument: false });
  }, [ast]);

  // Derived Heading Outline (TOC) from AST
  const outline = useMemo(() => {
    return astToOutline(ast);
  }, [ast]);

  // Derived XML representation
  const renderedXML = useMemo(() => {
    return astToXML(ast);
  }, [ast]);

  // Extract special AST blocks
  const mermaidNodes = useMemo(() => {
    return filterASTNodes(ast, (node) => node.type === "MermaidBlock") as ASTMermaidBlockNode[];
  }, [ast]);

  const mathNodes = useMemo(() => {
    return filterASTNodes(ast, (node) => node.type === "MathBlock" || node.type === "InlineMath");
  }, [ast]);

  const yamlNodes = useMemo(() => {
    return filterASTNodes(
      ast,
      (node) => node.type === "YAMLBlock" || node.type === "YAMLFrontmatter"
    );
  }, [ast]);

  // Filtered AST Nodes query
  const filteredNodes = useMemo(() => {
    if (filterType === "all" && !searchQuery.trim()) return null;

    return filterASTNodes(ast, (node) => {
      let typeMatch = true;
      if (filterType !== "all") {
        typeMatch = node.type.toLowerCase().includes(filterType.toLowerCase());
      }

      let textMatch = true;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const jsonStr = JSON.stringify(node).toLowerCase();
        textMatch = jsonStr.includes(q);
      }

      return typeMatch && textMatch;
    });
  }, [ast, filterType, searchQuery]);

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in select-text">
      {/* AST Stats Header Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-white p-3 rounded-lg border border-slate-100 shadow-2xs flex flex-col gap-0.5">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Nodes</span>
          <span className="text-base font-bold text-slate-800 font-mono">{ast.meta.totalNodes}</span>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-100 shadow-2xs flex flex-col gap-0.5">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Headings</span>
          <span className="text-base font-bold text-indigo-600 font-mono">{ast.meta.headingCount}</span>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-100 shadow-2xs flex flex-col gap-0.5">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">KaTeX Math</span>
          <span className="text-base font-bold text-amber-600 font-mono">{ast.meta.mathBlockCount}</span>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-100 shadow-2xs flex flex-col gap-0.5">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Mermaid</span>
          <span className="text-base font-bold text-emerald-600 font-mono">{ast.meta.mermaidCount}</span>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-100 shadow-2xs flex flex-col gap-0.5">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">YAML Data</span>
          <span className="text-base font-bold text-sky-600 font-mono">{ast.meta.yamlBlockCount + (ast.meta.frontmatter ? 1 : 0)}</span>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-100 shadow-2xs flex flex-col gap-0.5">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Code Blocks</span>
          <span className="text-base font-bold text-violet-600 font-mono">{ast.meta.codeBlockCount}</span>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-100 shadow-2xs flex flex-col gap-0.5">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">LaTeX Symbols</span>
          <span className="text-base font-bold text-rose-600 font-mono">{ast.meta.laTeXSymbolsUsed.length}</span>
        </div>
      </div>

      {/* Primary AST Explorer Toolbar */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-xs flex flex-col overflow-hidden">
        <div className="bg-slate-50/50 border-b border-slate-100 p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
          {/* Sub-tab Navigation */}
          <div className="flex bg-slate-100 p-0.5 rounded border border-slate-200/50 overflow-x-auto max-w-full no-scrollbar w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setActiveSubTab("ast-tree")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeSubTab === "ast-tree"
                  ? "bg-black text-white"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Braces className="w-3.5 h-3.5" />
              <span>AST Node Tree</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab("mermaid")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeSubTab === "mermaid"
                  ? "bg-black text-white"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Workflow className="w-3.5 h-3.5 text-emerald-400" />
              <span>Mermaid ({mermaidNodes.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab("math-katex")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeSubTab === "math-katex"
                  ? "bg-black text-white"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Sigma className="w-3.5 h-3.5 text-amber-400" />
              <span>KaTeX Math ({mathNodes.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab("yaml-meta")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeSubTab === "yaml-meta"
                  ? "bg-black text-white"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <FileJson className="w-3.5 h-3.5 text-sky-400" />
              <span>YAML & Frontmatter ({yamlNodes.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab("html-render")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeSubTab === "html-render"
                  ? "bg-black text-white"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              <span>AST HTML Render</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab("outline")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeSubTab === "outline"
                  ? "bg-black text-white"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <ListOrdered className="w-3.5 h-3.5" />
              <span>Outline ({outline.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab("export")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeSubTab === "export"
                  ? "bg-black text-white"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export AST</span>
            </button>
          </div>

          <div className="text-[11px] text-slate-400 font-mono shrink-0">
            Academic & Diagram Semantic Parser
          </div>
        </div>

        {/* Tab 1: AST Node Tree / Query Filter */}
        {activeSubTab === "ast-tree" && (
          <div className="p-5 flex flex-col gap-4">
            {/* Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-100">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Filter AST nodes (e.g. mermaid, math, yaml, heading...)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:border-slate-400 w-full sm:w-64"
                />
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-600 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                <span className="text-[10px] uppercase font-bold text-slate-400">Type:</span>
                {["all", "mermaid", "math", "yaml", "heading", "codeblock", "table"].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFilterType(type)}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono capitalize transition cursor-pointer ${
                      filterType === type
                        ? "bg-black text-white font-medium"
                        : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* AST JSON Visualizer */}
            <div className="relative">
              <div className="absolute top-3 right-3 z-10 flex gap-2">
                <button
                  type="button"
                  onClick={() => copyText(JSON.stringify(ast, null, 2), "ast-json")}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-mono flex items-center gap-1 transition cursor-pointer shadow-xs"
                >
                  {copied === "ast-json" ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>Copied JSON</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy AST JSON</span>
                    </>
                  )}
                </button>
              </div>

              {filteredNodes ? (
                <div className="bg-slate-950 text-slate-100 p-4 rounded-xl font-mono text-xs overflow-x-auto max-h-[500px]">
                  <div className="text-slate-400 text-[11px] mb-2 font-sans border-b border-slate-800 pb-2">
                    Found {filteredNodes.length} matching AST nodes
                  </div>
                  <pre className="text-emerald-400">
                    {JSON.stringify(filteredNodes, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="bg-slate-950 text-slate-100 p-4 rounded-xl font-mono text-xs overflow-x-auto max-h-[500px]">
                  <pre className="text-slate-300 leading-relaxed">
                    {JSON.stringify(ast, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Mermaid Diagrams AST Inspector */}
        {activeSubTab === "mermaid" && (
          <div className="p-5 flex flex-col gap-6">
            <div className="flex flex-col gap-1">
              <h4 className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                <Workflow className="w-4 h-4 text-emerald-600" />
                Mermaid Diagram AST Nodes ({mermaidNodes.length})
              </h4>
              <p className="text-[11px] text-slate-500">
                Mermaid code blocks are automatically parsed into specialized <code className="font-mono text-emerald-700 bg-emerald-50 px-1 rounded">MermaidBlock</code> AST nodes with diagram type detection.
              </p>
            </div>

            {mermaidNodes.length > 0 ? (
              <div className="flex flex-col gap-6">
                {mermaidNodes.map((node, i) => (
                  <div key={i} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 flex flex-col gap-3">
                    <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold uppercase">
                          {node.diagramType}
                        </span>
                        <span className="text-xs text-slate-600 font-mono">
                          ~{node.nodeCount} elements/edges detected
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">AST Type: MermaidBlock</span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Diagram Source Code */}
                      <div className="bg-slate-900 text-slate-200 p-3 rounded-lg font-mono text-xs overflow-x-auto max-h-[250px]">
                        <pre>{node.code}</pre>
                      </div>

                      {/* Rendered Live Diagram */}
                      <div className="bg-white border border-slate-200 rounded-lg p-2 flex items-center justify-center min-h-[200px]">
                        <Mermaid value={node.code} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl bg-slate-50/50 flex flex-col items-center gap-2">
                <Workflow className="w-8 h-8 text-slate-300" />
                <p className="text-xs font-medium text-slate-600">No Mermaid diagrams detected in document.</p>
                <p className="text-[11px] text-slate-400">Add a ```mermaid code block to test diagram AST parsing.</p>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: KaTeX / Academic Math Inspector */}
        {activeSubTab === "math-katex" && (
          <div className="p-5 flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <h4 className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <Sigma className="w-4 h-4 text-amber-600" />
                  KaTeX & Academic LaTeX Math ({mathNodes.length})
                </h4>
                <p className="text-[11px] text-slate-500">
                  Equations ($...$, $$...$$, \[...\], \begin&#123;equation&#125;) are parsed into math AST nodes without letting Markdown symbols break math formulas.
                </p>
              </div>

              {ast.meta.laTeXSymbolsUsed.length > 0 && (
                <div className="flex items-center gap-1 shrink-0 bg-amber-50 border border-amber-200/80 rounded-lg px-2.5 py-1">
                  <span className="text-[10px] uppercase font-bold text-amber-800">Unique Symbols:</span>
                  <span className="text-xs font-mono font-bold text-amber-900">{ast.meta.laTeXSymbolsUsed.length}</span>
                </div>
              )}
            </div>

            {/* LaTeX Symbol Cloud */}
            {ast.meta.laTeXSymbolsUsed.length > 0 && (
              <div className="bg-amber-50/50 border border-amber-200/60 rounded-xl p-3 flex flex-col gap-1.5">
                <span className="text-[10px] uppercase font-bold text-amber-700 tracking-wider">Detected LaTeX Macros & Symbols</span>
                <div className="flex flex-wrap gap-1.5">
                  {ast.meta.laTeXSymbolsUsed.map((sym, idx) => (
                    <span key={idx} className="font-mono text-xs px-2 py-0.5 bg-white border border-amber-200 rounded text-amber-900 font-semibold shadow-2xs">
                      {sym}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Math AST Nodes List */}
            {mathNodes.length > 0 ? (
              <div className="flex flex-col gap-3">
                {mathNodes.map((node: any, idx) => (
                  <div key={idx} className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/50 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-[11px] font-bold px-2 py-0.5 bg-amber-100 text-amber-900 rounded">
                        {node.type} {node.environment ? `(\\begin{${node.environment}})` : ""}
                      </span>
                      {node.symbolsUsed && node.symbolsUsed.length > 0 && (
                        <span className="text-[10px] text-slate-500 font-mono">
                          Symbols: {node.symbolsUsed.join(", ")}
                        </span>
                      )}
                    </div>
                    <div className="bg-slate-900 text-amber-300 font-mono text-xs p-3 rounded-md overflow-x-auto">
                      <pre>{node.code || node.value}</pre>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl bg-slate-50/50 flex flex-col items-center gap-2">
                <Sigma className="w-8 h-8 text-slate-300" />
                <p className="text-xs font-medium text-slate-600">No KaTeX math expressions detected.</p>
                <p className="text-[11px] text-slate-400">Try adding {"$$ \\sum_{i=1}^n i = \\frac{n(n+1)}{2} $$"} to test KaTeX parsing.</p>
              </div>
            )}
          </div>
        )}

        {/* Tab 4: YAML Data & Frontmatter Inspector */}
        {activeSubTab === "yaml-meta" && (
          <div className="p-5 flex flex-col gap-6">
            <div className="flex flex-col gap-1">
              <h4 className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                <FileJson className="w-4 h-4 text-sky-600" />
                YAML & Frontmatter Structured Metadata
              </h4>
              <p className="text-[11px] text-slate-500">
                Frontmatter (top ---) and embedded ```yaml blocks are extracted into structured key-value objects in the AST.
              </p>
            </div>

            {ast.meta.frontmatter && (
              <div className="border border-sky-200 rounded-xl p-4 bg-sky-50/30 flex flex-col gap-3">
                <span className="text-xs font-bold text-sky-900 uppercase tracking-wider">Document Frontmatter Metadata</span>
                <div className="bg-white border border-sky-100 rounded-lg p-3 font-mono text-xs">
                  <pre className="text-slate-800">{JSON.stringify(ast.meta.frontmatter, null, 2)}</pre>
                </div>
              </div>
            )}

            {yamlNodes.length > 0 ? (
              <div className="flex flex-col gap-4">
                {yamlNodes.map((node: any, idx) => (
                  <div key={idx} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 flex flex-col gap-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-[11px] font-bold px-2 py-0.5 bg-sky-100 text-sky-900 rounded">
                        {node.type}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        Keys Extracted: {Object.keys(node.data || {}).length}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="bg-slate-900 text-sky-200 p-3 rounded-lg font-mono text-xs overflow-x-auto max-h-[200px]">
                        <div className="text-[10px] uppercase text-slate-400 mb-1">Raw YAML Source</div>
                        <pre>{node.raw}</pre>
                      </div>

                      <div className="bg-white border border-slate-200 p-3 rounded-lg font-mono text-xs overflow-x-auto max-h-[200px]">
                        <div className="text-[10px] uppercase text-slate-400 mb-1">Parsed AST Object</div>
                        <pre className="text-slate-800">{JSON.stringify(node.data, null, 2)}</pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl bg-slate-50/50 flex flex-col items-center gap-2">
                <FileJson className="w-8 h-8 text-slate-300" />
                <p className="text-xs font-medium text-slate-600">No YAML frontmatter or code blocks detected.</p>
                <p className="text-[11px] text-slate-400">Add YAML metadata to the top of your document or in a ```yaml block.</p>
              </div>
            )}
          </div>
        )}

        {/* Tab 5: AST HTML Render */}
        {activeSubTab === "html-render" && (
          <div className="p-5 flex flex-col gap-6">
            {/* Theme selector bar for HTML rendering */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="text-xs font-bold text-slate-700">Active CSS Rendering Theme:</span>
              </div>
              <ThemeSelector
                currentThemeId={activeThemeId}
                onSelectTheme={handleThemeChange}
                compact={true}
              />
            </div>

            {/* HTML Source Code */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Terminal className="w-4 h-4 text-indigo-600" />
                  Semantic HTML Output
                </span>
                <button
                  type="button"
                  onClick={() => copyText(renderedHTML, "html")}
                  className="px-2.5 py-1 rounded border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center gap-1 transition cursor-pointer"
                >
                  {copied === "html" ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Copied HTML</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy HTML</span>
                    </>
                  )}
                </button>
              </div>

              <div className="bg-slate-900 text-slate-200 p-4 rounded-lg font-mono text-xs overflow-x-auto max-h-[200px]">
                <pre>{renderedHTML || "<!-- Empty HTML -->"}</pre>
              </div>
            </div>

            {/* Live HTML Preview Box with Selected Theme */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-emerald-600" />
                  Live Themed Render Preview ({activeTheme.name})
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  Container Class: .markdown-theme-{activeTheme.id}
                </span>
              </div>

              <div
                className={`markdown-theme-${activeTheme.id} border border-slate-200 rounded-lg p-5 max-h-[350px] overflow-y-auto text-sm shadow-2xs transition-all`}
                style={{ backgroundColor: activeTheme.bg, color: activeTheme.fg, fontFamily: activeTheme.fontFamily }}
                dangerouslySetInnerHTML={{ __html: renderedHTML }}
              ></div>
            </div>
          </div>
        )}

        {/* Tab 6: AST Document Outline */}
        {activeSubTab === "outline" && (
          <div className="p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                <ListOrdered className="w-4 h-4 text-indigo-600" />
                Table of Contents (Derived from AST Heading Nodes)
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                {outline.length} Headings Found
              </span>
            </div>

            {outline.length > 0 ? (
              <div className="flex flex-col gap-2 pt-1">
                {outline.map((item, idx) => (
                  <div
                    key={`${item.slug}-${idx}`}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50/80 transition"
                    style={{ paddingLeft: `${(item.level - 1) * 16 + 12}px` }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded border border-indigo-100 font-bold shrink-0">
                        H{item.level}
                      </span>
                      <span className="text-xs font-medium text-slate-800 truncate">
                        {item.text}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0 ml-2">
                      #{item.slug}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-xs text-slate-400">
                No heading nodes detected in this document. Add # Headings to see the AST outline.
              </div>
            )}
          </div>
        )}

        {/* Tab 7: Export AST */}
        {activeSubTab === "export" && (
          <div className="p-5 flex flex-col gap-6">
            <div className="flex flex-col gap-1">
              <h4 className="text-xs font-semibold text-slate-800">Export Semantic AST for External Pipelines</h4>
              <p className="text-[11px] text-slate-400">
                Convert or download the extracted AST into JSON, XML, or compiled HTML formats.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Export JSON */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Braces className="w-4 h-4 text-indigo-600" />
                    AST JSON Object
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Full structured Abstract Syntax Tree with node counts, types, and inline children.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => downloadFile(JSON.stringify(ast, null, 2), "document-ast.json", "application/json")}
                  className="py-2 px-3 bg-black hover:bg-slate-800 text-white rounded text-xs font-medium transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .json</span>
                </button>
              </div>

              {/* Export XML */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Code className="w-4 h-4 text-violet-600" />
                    AST XML Format
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Structured XML tree representing document node hierarchy for enterprise parsers.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => downloadFile(renderedXML, "document-ast.xml", "application/xml")}
                  className="py-2 px-3 bg-black hover:bg-slate-800 text-white rounded text-xs font-medium transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .xml</span>
                </button>
              </div>

              {/* Export HTML */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <FileCode className="w-4 h-4 text-emerald-600" />
                    Themed HTML Document
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Standalone HTML file with embedded <strong className="text-slate-700">{activeTheme.name}</strong> CSS styles.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const fullHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Rendered Document - ${activeTheme.name}</title>
  <style>
    ${activeTheme.css}
    body { background: ${activeTheme.bg}; padding: 20px; font-family: ${activeTheme.fontFamily}; }
  </style>
</head>
<body className="markdown-theme-${activeTheme.id}">
  <div class="markdown-theme-${activeTheme.id}">
    ${renderedHTML}
  </div>
</body>
</html>`;
                    downloadFile(fullHTML, `document-${activeTheme.id}.html`, "text/html");
                  }}
                  className="py-2 px-3 bg-black hover:bg-slate-800 text-white rounded text-xs font-medium transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Themed .html</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
