import React, { useState, useMemo } from 'react';
import {
  GitBranch,
  Search,
  Code,
  Table as TableIcon,
  Heading,
  FileText,
  Sigma,
  Workflow,
  Quote,
  List,
  SlidersHorizontal,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  Download,
  Info,
  Sparkles,
  Layers,
  BookOpen
} from 'lucide-react';
import {
  parseMarkdownToAST,
  enrichMetaAST,
  MetaASTNode,
  MarkdownBlockNodeType
} from '../lib/metaAst';
import { defaultNlpEntityExtractor, ExtractedEntity } from '../lib/nlpEntityExtractor';
import LexiconConfigModal from './LexiconConfigModal';

interface AstExplorerModalProps {
  isOpen: boolean;
  onClose: () => void;
  markdownContent: string;
  documentTitle?: string;
}

export default function AstExplorerModal({
  isOpen,
  onClose,
  markdownContent,
  documentTitle = 'Current Document',
}: AstExplorerModalProps) {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'interactive' | 'raw_ast_json'>('interactive');
  const [isLexiconModalOpen, setIsLexiconModalOpen] = useState<boolean>(false);
  const [lexiconVersion, setLexiconVersion] = useState<number>(0);

  // Parse, enrich, and run NLP Entity Tagging over AST nodes
  const { nodes, totalTokens, stats, documentEntities, globalTags } = useMemo(() => {
    const rawContent =
      markdownContent ||
      `# Sample MetaAST Document\n\n---\ntitle: "MetaAST Specification"\nversion: "1.0"\n---\n\n## Section 1: Code & Diagram Elements\n\nHere is a code block showcasing type safety:\n\n\`\`\`typescript\ninterface MetaASTNode {\n  id: string;\n  type: string;\n  context: MetaASTContext;\n}\n\`\`\`\n\n### Mathematical Formulation\n\nDisplay math equation:\n\n$$\nE = mc^2\n$$\n\n### Data Matrix\n\n| Attribute | Type | Description |\n| :--- | :---: | ---: |\n| id | string | Deterministic key |\n| context | object | Enriched hierarchy |\n`;

    const nlpResult = defaultNlpEntityExtractor.processMarkdown(rawContent, documentTitle);
    const enriched = nlpResult.taggedNodes;

    let tokenSum = 0;
    const typeCounts: Record<string, number> = {};

    enriched.forEach((n) => {
      tokenSum += n.context.estimatedTokens || 0;
      typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;
    });

    return {
      nodes: enriched,
      totalTokens: tokenSum,
      stats: typeCounts,
      documentEntities: nlpResult.entities,
      globalTags: nlpResult.globalTags,
    };
  }, [markdownContent, documentTitle, lexiconVersion]);

  if (!isOpen) return null;

  // Filter nodes based on search and type
  const filteredNodes = nodes.filter((node) => {
    const matchesType =
      selectedTypeFilter === 'all' || node.type === selectedTypeFilter;
    const matchesSearch =
      !searchQuery.trim() ||
      node.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.rawText.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.context.breadcrumbPath.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  const selectedNode =
    nodes.find((n) => n.id === selectedNodeId) || filteredNodes[0] || nodes[0];

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadAstJson = () => {
    const jsonStr = JSON.stringify(nodes, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${documentTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_meta_ast.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Node type icon helper
  const getNodeIcon = (type: string, depth?: number) => {
    switch (type) {
      case 'heading':
        return <Heading className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      case 'code_block':
        return <Code className="w-3.5 h-3.5 text-indigo-400 shrink-0" />;
      case 'table':
        return <TableIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
      case 'math_block':
        return <Sigma className="w-3.5 h-3.5 text-cyan-400 shrink-0" />;
      case 'mermaid_diagram':
        return <Workflow className="w-3.5 h-3.5 text-pink-400 shrink-0" />;
      case 'blockquote':
        return <Quote className="w-3.5 h-3.5 text-violet-400 shrink-0" />;
      case 'list':
        return <List className="w-3.5 h-3.5 text-yellow-400 shrink-0" />;
      case 'yaml_frontmatter':
        return <SlidersHorizontal className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
      default:
        return <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />;
    }
  };

  // Node type badge styling
  const getNodeTypeBadge = (type: string) => {
    switch (type) {
      case 'heading':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-800';
      case 'code_block':
        return 'bg-indigo-950/80 text-indigo-300 border-indigo-800';
      case 'table':
        return 'bg-amber-950/80 text-amber-300 border-amber-800';
      case 'math_block':
        return 'bg-cyan-950/80 text-cyan-300 border-cyan-800';
      case 'mermaid_diagram':
        return 'bg-pink-950/80 text-pink-300 border-pink-800';
      case 'blockquote':
        return 'bg-violet-950/80 text-violet-300 border-violet-800';
      case 'list':
        return 'bg-yellow-950/80 text-yellow-300 border-yellow-800';
      case 'yaml_frontmatter':
        return 'bg-purple-950/80 text-purple-300 border-purple-800';
      default:
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700/80 rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-zinc-100">MetaAST Hierarchy & Node Explorer</h2>
                <span className="px-2 py-0.5 text-[10px] uppercase font-mono bg-purple-950 text-purple-300 border border-purple-800 rounded-full">
                  Lexer AST
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Inspect syntactic block nodes, breadcrumb trees, and contextual annotations
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-zinc-950 p-1 rounded-lg border border-zinc-800 flex items-center gap-1">
              <button
                onClick={() => setViewMode('interactive')}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                  viewMode === 'interactive'
                    ? 'bg-zinc-800 text-purple-300 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Interactive Tree
              </button>
              <button
                onClick={() => setViewMode('raw_ast_json')}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                  viewMode === 'raw_ast_json'
                    ? 'bg-zinc-800 text-purple-300 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Raw MetaAST JSON
              </button>
            </div>

            <button
              onClick={() => setIsLexiconModalOpen(true)}
              className="px-2.5 py-1.5 rounded-lg bg-indigo-950/80 hover:bg-indigo-900/80 text-indigo-300 hover:text-indigo-200 text-xs font-semibold flex items-center gap-1.5 border border-indigo-800/80 transition cursor-pointer"
              title="Configure NLP entity lexicon"
            >
              <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
              <span>Lexicon</span>
            </button>

            <button
              onClick={handleDownloadAstJson}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 border border-zinc-700 transition"
              title="Download entire MetaAST as JSON"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export AST</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-sm transition"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Top Control Bar: Search & Node Type Badges */}
        <div className="px-6 py-3 bg-zinc-950/60 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search nodes by type, content, or breadcrumb..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {/* Node Type Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
            <button
              onClick={() => setSelectedTypeFilter('all')}
              className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition cursor-pointer ${
                selectedTypeFilter === 'all'
                  ? 'bg-purple-600 text-white font-bold'
                  : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              All ({nodes.length})
            </button>
            {Object.entries(stats).map(([type, count]) => (
              <button
                key={type}
                onClick={() => setSelectedTypeFilter(type)}
                className={`px-2 py-0.5 rounded-full text-[11px] font-mono transition cursor-pointer border ${
                  selectedTypeFilter === type
                    ? 'bg-purple-900 border-purple-500 text-purple-200 font-bold'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {type}: {count}
              </button>
            ))}
          </div>
        </div>

        {/* Modal Main Body */}
        {viewMode === 'interactive' ? (
          <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden min-h-0">
            {/* Left Column: AST Node Tree / List */}
            <div className="md:col-span-5 border-r border-zinc-800 flex flex-col bg-zinc-950/40 overflow-hidden">
              <div className="p-3 border-b border-zinc-800/80 bg-zinc-900/50 flex items-center justify-between text-xs font-semibold text-zinc-400">
                <span>PARSED NODES ({filteredNodes.length})</span>
                <span className="text-[10px] font-mono text-zinc-500">
                  Total Tokens: ~{totalTokens}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1.5 no-scrollbar">
                {filteredNodes.length > 0 ? (
                  filteredNodes.map((node, idx) => {
                    const isSelected = selectedNode?.id === node.id;
                    const previewText =
                      node.type === 'heading'
                        ? node.content || node.rawText
                        : node.type === 'code_block'
                        ? `\`\`\`${node.language || ''} (${node.rawText.split('\n').length} lines)`
                        : node.type === 'table'
                        ? `Table (${node.tableData?.headers.length || 0} cols, ${node.tableData?.rows.length || 0} rows)`
                        : node.type === 'math_block'
                        ? `Math: ${node.content || node.rawText}`
                        : node.rawText.slice(0, 75).replace(/\n/g, ' ');

                    return (
                      <button
                        key={node.id}
                        onClick={() => setSelectedNodeId(node.id)}
                        className={`w-full text-left p-2.5 rounded-xl border transition flex flex-col gap-1.5 cursor-pointer ${
                          isSelected
                            ? 'bg-purple-950/40 border-purple-500/60 text-zinc-100 shadow-sm'
                            : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-1.5">
                            {getNodeIcon(node.type, node.depth)}
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] uppercase font-mono border ${getNodeTypeBadge(
                                node.type
                              )}`}
                            >
                              {node.type}
                              {node.depth ? ` H${node.depth}` : ''}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-zinc-400 bg-zinc-800/80 px-1.5 py-0.5 rounded">
                            ~{node.context.estimatedTokens} tok
                          </span>
                        </div>

                        <div className="text-xs font-mono text-zinc-300 line-clamp-1">
                          {previewText}
                        </div>

                        {node.context.breadcrumbPath && (
                          <div className="text-[10px] text-zinc-500 line-clamp-1 flex items-center gap-1">
                            <ChevronRight className="w-2.5 h-2.5 text-purple-400 shrink-0" />
                            <span>{node.context.breadcrumbPath}</span>
                          </div>
                        )}
                      </button>
                    );
                  })
                ) : (
                  <div className="p-8 text-center text-zinc-500 text-xs">
                    No AST nodes matched your query.
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Node Inspector & Context Metadata Viewer */}
            <div className="md:col-span-7 flex flex-col bg-zinc-900/30 overflow-hidden">
              {selectedNode ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Top Bar of Inspector */}
                  <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-900/80 flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-purple-300">
                        {selectedNode.id}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono border ${getNodeTypeBadge(
                          selectedNode.type
                        )}`}
                      >
                        {selectedNode.type}
                      </span>
                    </div>

                    <button
                      onClick={() => handleCopy(JSON.stringify(selectedNode, null, 2))}
                      className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium flex items-center gap-1.5 border border-zinc-700 transition"
                    >
                      {copied ? (
                        <Check className="w-3.5 h-3.5 text-purple-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copied ? 'Copied Node JSON!' : 'Copy Node JSON'}</span>
                    </button>
                  </div>

                  {/* Inspector Body Tabs */}
                  <div className="flex-1 p-4 overflow-y-auto space-y-4">
                    {/* Section 1: MetaAST Context Annotations */}
                    <div className="p-4 bg-purple-950/20 border border-purple-800/40 rounded-xl space-y-3">
                      <div className="flex items-center gap-2 font-bold text-xs text-purple-300">
                        <Sparkles className="w-4 h-4 text-purple-400" />
                        <span>MetaAST Contextual Enrichment</span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="p-2.5 bg-zinc-950/80 border border-zinc-800 rounded-lg">
                          <div className="text-[10px] text-zinc-400 mb-1">Document Title</div>
                          <div className="font-medium text-zinc-200">
                            {selectedNode.context.documentTitle || 'Untitled'}
                          </div>
                        </div>

                        <div className="p-2.5 bg-zinc-950/80 border border-zinc-800 rounded-lg">
                          <div className="text-[10px] text-zinc-400 mb-1">Active Section</div>
                          <div className="font-medium text-zinc-200">
                            {selectedNode.context.activeHeading || 'Root'}
                            {selectedNode.context.activeHeadingLevel
                              ? ` (H${selectedNode.context.activeHeadingLevel})`
                              : ''}
                          </div>
                        </div>

                        <div className="col-span-2 p-2.5 bg-zinc-950/80 border border-zinc-800 rounded-lg">
                          <div className="text-[10px] text-zinc-400 mb-1">Hierarchical Breadcrumb Path</div>
                          <div className="font-mono text-xs text-emerald-400 flex items-center gap-1">
                            {selectedNode.context.breadcrumbPath || 'Root Document'}
                          </div>
                        </div>

                        {/* NLP-Extracted Entity Tags */}
                        {((selectedNode.context.customAttributes?.tags as string[]) || []).length > 0 && (
                          <div className="col-span-2 p-2.5 bg-zinc-950/80 border border-purple-900/50 rounded-lg">
                            <div className="text-[10px] text-purple-300 font-semibold mb-1.5 flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-purple-400" />
                              <span>NLP Entity Tags (Graph Connectivity)</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {((selectedNode.context.customAttributes?.tags as string[]) || []).map((tag, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 rounded-md bg-purple-950/60 border border-purple-800/80 text-purple-300 font-mono text-[10px]"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Outgoing links and images if any */}
                      {(selectedNode.context.outgoingLinks.length > 0 ||
                        selectedNode.context.images.length > 0) && (
                        <div className="pt-2 border-t border-purple-900/40 grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <span className="text-zinc-400 font-medium">Outgoing Links:</span>{' '}
                            <span className="text-purple-300 font-mono">
                              {selectedNode.context.outgoingLinks.length}
                            </span>
                          </div>
                          <div>
                            <span className="text-zinc-400 font-medium">Images:</span>{' '}
                            <span className="text-purple-300 font-mono">
                              {selectedNode.context.images.length}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Section 2: Structured Node Properties */}
                    {selectedNode.type === 'table' && selectedNode.tableData && (
                      <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2">
                        <div className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                          <TableIcon className="w-3.5 h-3.5" />
                          <span>Parsed Table Schema Matrix</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-[11px] text-left text-zinc-300 border-collapse">
                            <thead>
                              <tr className="border-b border-zinc-800 text-zinc-400">
                                {selectedNode.tableData.headers.map((h, i) => (
                                  <th key={i} className="p-1.5 font-semibold">
                                    {h.name} {h.align ? `(${h.align})` : ''}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {selectedNode.tableData.rows.slice(0, 5).map((row, rIdx) => (
                                <tr key={rIdx} className="border-b border-zinc-900">
                                  {row.cells.map((cell, cIdx) => (
                                    <td key={cIdx} className="p-1.5 font-mono">
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {selectedNode.tableData.rows.length > 5 && (
                            <div className="text-[10px] text-zinc-500 mt-1">
                              + {selectedNode.tableData.rows.length - 5} more rows...
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Section 3: Raw Markdown Source Span */}
                    <div className="space-y-1.5">
                      <div className="text-xs font-semibold text-zinc-400 flex items-center justify-between">
                        <span>RAW MARKDOWN SOURCE</span>
                        {selectedNode.position && (
                          <span className="font-mono text-[10px] text-zinc-500">
                            Lines {selectedNode.position.start.line} - {selectedNode.position.end.line}
                          </span>
                        )}
                      </div>
                      <pre className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-200 font-mono text-xs whitespace-pre-wrap leading-relaxed">
                        {selectedNode.rawText}
                      </pre>
                    </div>

                    {/* Section 4: Full Node AST JSON */}
                    <div className="space-y-1.5">
                      <div className="text-xs font-semibold text-zinc-400">
                        COMPLETE NODE OBJECT (JSON)
                      </div>
                      <pre className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-purple-300 font-mono text-[11px] whitespace-pre-wrap leading-relaxed overflow-x-auto">
                        {JSON.stringify(selectedNode, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-zinc-500 text-xs">
                  Select an AST node to inspect its attributes.
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Full Raw AST JSON View */
          <div className="flex-1 p-4 overflow-y-auto bg-zinc-950/60">
            <pre className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl text-purple-300 font-mono text-xs whitespace-pre-wrap leading-relaxed">
              {JSON.stringify(nodes, null, 2)}
            </pre>
          </div>
        )}
      </div>

      <LexiconConfigModal
        isOpen={isLexiconModalOpen}
        onClose={() => setIsLexiconModalOpen(false)}
        onLexiconChanged={() => setLexiconVersion((v) => v + 1)}
      />
    </div>
  );
}
