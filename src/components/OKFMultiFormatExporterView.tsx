import React, { useState, useMemo } from 'react';
import type { OkfBundle } from 'okf-ts';
import type { SemanticGraphResult } from '../lib/okfSemanticGraphEngine';
import type { NLPConceptAnalysis } from '../lib/okfNlpEngine';
import {
  generateAllMultiFormatExports,
  type MultiFormatExportResult,
  generateStandaloneOKFVisualizerHTML,
} from '../lib/okfMultiFormatExporter';
import HighlightedCodeBlock from './HighlightedCodeBlock';
import OKFSparqlQueryWorkbench from './OKFSparqlQueryWorkbench';
import OKFMcpToolConfigGenerator from './OKFMcpToolConfigGenerator';
import OKFJsonLdEnterpriseExporter from './OKFJsonLdEnterpriseExporter';
import {
  FileJson,
  Database,
  Server,
  BookOpen,
  Copy,
  Check,
  Download,
  Share2,
  Sparkles,
  Layers,
  Code2,
  Network,
  Cpu,
  Terminal,
  Globe,
} from 'lucide-react';

interface OKFMultiFormatExporterViewProps {
  bundle: OkfBundle;
  semanticGraph?: SemanticGraphResult;
  nlpAnalyses?: Record<string, NLPConceptAnalysis>;
}

export default function OKFMultiFormatExporterView({
  bundle,
  semanticGraph,
  nlpAnalyses,
}: OKFMultiFormatExporterViewProps) {
  const [activeFormat, setActiveFormat] = useState<
    'jsonld' | 'turtle' | 'sparql' | 'mcp' | 'obsidian' | 'viz'
  >('jsonld');
  const [copied, setCopied] = useState<string | null>(null);

  const exportResult: MultiFormatExportResult = useMemo(() => {
    return generateAllMultiFormatExports(bundle, semanticGraph, nlpAnalyses);
  }, [bundle, semanticGraph, nlpAnalyses]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const currentContent = useMemo(() => {
    switch (activeFormat) {
      case 'jsonld':
        return {
          code: exportResult.jsonLd,
          lang: 'json',
          filename: `${(bundle.root || 'bundle').toLowerCase().replace(/\s+/g, '-')}.jsonld`,
          mime: 'application/ld+json',
          title: 'W3C JSON-LD (Schema.org Linked Data)',
          desc: 'Conforms to W3C Linked Data and Schema.org vocabulary. Ideal for search engine knowledge graphs, semantic web indexing, and graph databases.',
          icon: <FileJson className="w-4 h-4 text-emerald-600" />,
        };
      case 'turtle':
        return {
          code: exportResult.turtleRdf,
          lang: 'turtle',
          filename: `${(bundle.root || 'bundle').toLowerCase().replace(/\s+/g, '-')}.ttl`,
          mime: 'text/turtle',
          title: 'RDF Turtle Ontology (.ttl)',
          desc: 'W3C standard semantic triples mapping concepts, directed dependencies, trust tiers, and DC Dublin Core metadata. Ready for Neo4j, Apache Jena, and GraphDB.',
          icon: <Database className="w-4 h-4 text-indigo-600" />,
        };
      case 'mcp':
        return {
          code: exportResult.mcpServerSchema,
          lang: 'json',
          filename: 'mcp-server.json',
          mime: 'application/json',
          title: 'Model Context Protocol (MCP) Knowledge Server Schema',
          desc: 'Standard Model Context Protocol resource & tool specification. Enables Claude Desktop, Cursor, Windsurf, and Gemini agents to query this knowledge base natively.',
          icon: <Server className="w-4 h-4 text-amber-600" />,
        };
      case 'obsidian':
        return {
          code: exportResult.obsidianIndexMarkdown,
          lang: 'markdown',
          filename: 'OBSIDIAN_INDEX.md',
          mime: 'text/markdown',
          title: 'Obsidian Vault Index & [[Wikilinks]] Manifest',
          desc: 'Optimized with Obsidian bidirectional [[wikilinks]], YAML frontmatter tags, and custom Graph View coloring for personal knowledge management.',
          icon: <BookOpen className="w-4 h-4 text-purple-600" />,
        };
      case 'viz':
        return {
          code: generateStandaloneOKFVisualizerHTML(
            {
              bundle,
              concepts: bundle.concepts || [],
              semanticGraph,
              nlpAnalyses,
            },
            {
              bundleTitle: bundle.root || 'OKF Knowledge Base',
            }
          ),
          lang: 'html',
          filename: 'viz.html',
          mime: 'text/html;charset=utf-8',
          title: 'Standalone Interactive Graph Visualizer (viz.html)',
          desc: 'Official OKF standalone HTML visualizer. Zero dependencies, offline-ready interactive 2D graph physics, instant search, frontmatter inspector, and [[wikilink]] traversal.',
          icon: <Globe className="w-4 h-4 text-emerald-500" />,
        };
      case 'sparql':
      default:
        return {
          code: '',
          lang: 'sparql',
          filename: 'sparql-query.rq',
          mime: 'application/sparql-query',
          title: 'SPARQL 1.1 In-Memory Triplestore',
          desc: 'Interactive W3C SPARQL query engine evaluating triples in real-time.',
          icon: <Terminal className="w-4 h-4 text-sky-500" />,
        };
    }
  }, [activeFormat, exportResult, bundle]);

  return (
    <div className="flex flex-col gap-5">
      {/* Top Banner & Metrics */}
      <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 rounded-xl text-white shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Share2 className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-white tracking-wide uppercase">
              Multi-Format Semantic Exporter & Round-Trip Transformer
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              OKF v0.2 + W3C + MCP
            </span>
          </div>
          <p className="text-xs text-slate-300">
            Export your structured OKF knowledge base into W3C Linked Data, RDF Triples, MCP Agent Resources, or Obsidian Vaults.
          </p>
        </div>

        <div className="flex items-center gap-3 self-stretch md:self-auto bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
          <div className="flex flex-col items-center px-3 border-r border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-mono">Entities</span>
            <span className="text-sm font-bold text-white">{exportResult.summary.totalEntities}</span>
          </div>
          <div className="flex flex-col items-center px-3 border-r border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-mono">RDF Triples</span>
            <span className="text-sm font-bold text-indigo-400">{exportResult.summary.totalTriples}</span>
          </div>
          <div className="flex flex-col items-center px-2">
            <span className="text-[10px] text-slate-400 uppercase font-mono">MCP Resources</span>
            <span className="text-sm font-bold text-emerald-400">{exportResult.summary.mcpResourcesCount}</span>
          </div>
        </div>
      </div>

      {/* Format Selector Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <button
          type="button"
          onClick={() => setActiveFormat('viz')}
          className={`p-3 rounded-xl border text-left transition flex items-center gap-3 cursor-pointer ${
            activeFormat === 'viz'
              ? 'bg-emerald-50/80 border-emerald-500 text-emerald-950 shadow-2xs'
              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <div className={`p-2 rounded-lg ${activeFormat === 'viz' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
            <Globe className="w-4 h-4" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold truncate">viz.html</span>
            <span className="text-[10px] text-slate-500 font-mono">Interactive Graph</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveFormat('jsonld')}
          className={`p-3 rounded-xl border text-left transition flex items-center gap-3 cursor-pointer ${
            activeFormat === 'jsonld'
              ? 'bg-indigo-50/80 border-indigo-500 text-indigo-950 shadow-2xs'
              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <div className={`p-2 rounded-lg ${activeFormat === 'jsonld' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
            <FileJson className="w-4 h-4" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold truncate">Enterprise JSON-LD</span>
            <span className="text-[10px] text-slate-500 font-mono">Neo4j / GraphDB / SKOS</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveFormat('turtle')}
          className={`p-3 rounded-xl border text-left transition flex items-center gap-3 cursor-pointer ${
            activeFormat === 'turtle'
              ? 'bg-indigo-50/80 border-indigo-500 text-indigo-950 shadow-2xs'
              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <div className={`p-2 rounded-lg ${activeFormat === 'turtle' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
            <Database className="w-4 h-4" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold truncate">RDF Turtle (.ttl)</span>
            <span className="text-[10px] text-slate-500 font-mono">Semantic Triples</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveFormat('sparql')}
          className={`p-3 rounded-xl border text-left transition flex items-center gap-3 cursor-pointer ${
            activeFormat === 'sparql'
              ? 'bg-sky-50/80 border-sky-500 text-sky-950 shadow-2xs'
              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <div className={`p-2 rounded-lg ${activeFormat === 'sparql' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
            <Terminal className="w-4 h-4" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold truncate">SPARQL Engine</span>
            <span className="text-[10px] text-slate-500 font-mono">Query Triplestore</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveFormat('mcp')}
          className={`p-3 rounded-xl border text-left transition flex items-center gap-3 cursor-pointer ${
            activeFormat === 'mcp'
              ? 'bg-amber-50/80 border-amber-500 text-amber-950 shadow-2xs'
              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <div className={`p-2 rounded-lg ${activeFormat === 'mcp' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
            <Server className="w-4 h-4" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold truncate">MCP Server Schema</span>
            <span className="text-[10px] text-slate-500 font-mono">AI Agent Tools & URI</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveFormat('obsidian')}
          className={`p-3 rounded-xl border text-left transition flex items-center gap-3 cursor-pointer ${
            activeFormat === 'obsidian'
              ? 'bg-purple-50/80 border-purple-500 text-purple-950 shadow-2xs'
              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <div className={`p-2 rounded-lg ${activeFormat === 'obsidian' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
            <BookOpen className="w-4 h-4" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold truncate">Obsidian Vault</span>
            <span className="text-[10px] text-slate-500 font-mono">[[Wikilinks]] & Graph</span>
          </div>
        </button>
      </div>

      {activeFormat === 'sparql' ? (
        <OKFSparqlQueryWorkbench bundle={bundle} semanticGraph={semanticGraph} />
      ) : activeFormat === 'mcp' ? (
        <OKFMcpToolConfigGenerator bundle={bundle} semanticGraph={semanticGraph} />
      ) : activeFormat === 'jsonld' ? (
        <OKFJsonLdEnterpriseExporter
          bundle={bundle}
          semanticGraph={semanticGraph}
          nlpAnalyses={nlpAnalyses}
        />
      ) : (
      /* Main Code Viewer Box */
      <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        {/* Header Toolbar */}
        <div className="p-3.5 sm:p-4 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {currentContent.icon}
            <div>
              <h4 className="text-xs font-bold text-white flex items-center gap-2">
                {currentContent.title}
                <span className="font-mono text-[10px] text-slate-400 font-normal">
                  ({currentContent.filename})
                </span>
              </h4>
              <p className="text-[11px] text-slate-400 max-w-xl">
                {currentContent.desc}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => copyToClipboard(currentContent.code, activeFormat)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer border border-slate-700 shadow-2xs"
            >
              {copied === activeFormat ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copy Code</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() =>
                downloadFile(
                  currentContent.code,
                  currentContent.filename,
                  currentContent.mime
                )
              }
              className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download {currentContent.filename.split('.').pop()?.toUpperCase()}</span>
            </button>
          </div>
        </div>

        {/* Code Block Container */}
        <div className="max-h-[520px] overflow-y-auto p-4 bg-slate-950 font-mono text-xs text-slate-300 leading-relaxed">
          <pre className="whitespace-pre-wrap word-break">
            <code>{currentContent.code}</code>
          </pre>
        </div>
      </div>
      )}
    </div>
  );
}
