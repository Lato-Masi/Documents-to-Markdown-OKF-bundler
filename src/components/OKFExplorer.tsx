import React, { useState, useMemo } from 'react';
import {
  partitionMarkdownToOKFConcepts,
  compileOKFBundle,
  exportConceptToMarkdown,
  type OKFConversionResult,
  deriveTrustTier,
  validateConcept,
  isStale,
  getStatus,
} from '../lib/okfKnowledgeEngine';
import { exportOKFBundleAsZip, downloadZipBlob, generateStandaloneOKFVisualizerHTML } from '../utils/okfZipExporter';
import OKFGraphVisualizer from './OKFGraphVisualizer';
import HighlightedCodeBlock from './HighlightedCodeBlock';
import OKFMultiFormatExporterView from './OKFMultiFormatExporterView';
import OKFRagPlayground from './OKFRagPlayground';
import OKFCertificateView from './OKFCertificateView';
import OKFRoundTripValidator from './OKFRoundTripValidator';
import OKFAgentQueryHub from './OKFAgentQueryHub';
import OKFNaturalLanguageQuery from './OKFNaturalLanguageQuery';
import OKFDevWorkbench from './OKFDevWorkbench';
import OKFMcpToolConfigGenerator from './OKFMcpToolConfigGenerator';
import {
  FileCheck,
  FileCode,
  Code2,
  Copy,
  Check,
  Download,
  Boxes,
  ShieldCheck,
  Layers,
  Settings2,
  ExternalLink,
  Sparkles,
  BookOpen,
  Info,
  Tag,
  Share2,
  ListFilter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  FileJson,
  Bot,
  Cpu,
  Wand2,
  MessageSquare,
  Send,
  Terminal,
  RefreshCw,
  Play,
  FolderTree,
  Archive,
  ArrowUpRight,
  ChevronRight,
  ShieldAlert,
  Search,
  Activity,
  Award,
  Database,
  Upload,
  Globe,
  Server,
} from 'lucide-react';
import type { OkfConcept, OkfMetadata } from 'okf-ts';

interface OKFExplorerProps {
  markdown?: string;
  documents?: { fileName: string; markdown: string }[];
}

const OFFICIAL_OKF_SKILL_MD = `---
name: okf-open-knowledge-format
description: Use this skill when working with Open Knowledge Format (OKF v0.2) bundles, converting Markdown to OKF concept files, or structuring knowledge graphs for AI agents. Reference: https://github.com/Zenb0t/okf-ts
---

# Open Knowledge Format (OKF v0.2) AI Agent Skill

The **Open Knowledge Format (OKF)** is an open, vendor-neutral specification (supported by Google Cloud and the \`okf-ts\` toolkit) that structures human knowledge into typed, graph-linked Concept Documents for AI agents and RAG pipelines.

## Core Directives for AI Agents

1. **Concept Documents**: Each Markdown file represents a distinct, typed unit of knowledge (\`type: concept | procedure | table | metric | guideline | reference\`).
2. **Standard YAML Frontmatter**: Frontmatter MUST include \`type\`, \`title\`, \`description\`, \`tags\`, \`sources\`, \`generated\`, \`verified\`, and \`status\`.
3. **Immutable Identifiers**: The relative file path (e.g. \`concepts/vector-embeddings.md\`) is the concept's unique identifier.
4. **Graph Cross-References**: Use Markdown relative links (e.g. \`[Title](../concepts/slug.md)\`) to define directional knowledge graph edges.
5. **Reserved Files**: Bundles include a root \`INDEX.md\` manifest and \`logs/CONVERSION.md\` execution audit records.

## Official Specification & Toolkit
- Package: \`okf-ts\` (v0.2.0)
- Repository: https://github.com/Zenb0t/okf-ts
`;

export default function OKFExplorer({ markdown, documents }: OKFExplorerProps) {
  const [activeSubTab, setActiveSubTab] = useState<
    | 'human-nl'
    | 'graph'
    | 'concepts'
    | 'nlp-intelligence'
    | 'rag-agent'
    | 'agent-query-suite'
    | 'mcp-generator'
    | 'multi-format'
    | 'certification'
    | 'round-trip'
    | 'dev-workbench'
    | 'index-manifest'
    | 'validation'
    | 'trust-lifecycle'
    | 'agent-skill'
  >('human-nl');

  const [enableNlpEnrichment, setEnableNlpEnrichment] = useState<boolean>(true);
  const [similarityThreshold, setSimilarityThreshold] = useState<number>(0.22);
  const [nlpSearchFilter, setNlpSearchFilter] = useState<string>('');
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedConceptIndex, setSelectedConceptIndex] = useState<number>(0);
  const [isExportingZip, setIsExportingZip] = useState(false);

  // Gemini Agent Playground State
  const [agentTask, setAgentTask] = useState<'qa' | 'audit' | 'synthesize' | 'custom'>('qa');
  const [agentQuery, setAgentQuery] = useState('');
  const [agentResponse, setAgentResponse] = useState('');
  const [isAgentLoading, setIsAgentLoading] = useState(false);
  const [agentError, setAgentError] = useState('');

  // Partition and compile markdown into an OKF v0.2 Bundle with NLP Intelligence & Directed Semantic Graph
  const okfResult: OKFConversionResult = useMemo(() => {
    if (documents && documents.length > 0) {
      const allConcepts: OkfConcept<OkfMetadata>[] = [];
      for (const doc of documents) {
        if (!doc.markdown?.trim()) continue;
        const concepts = partitionMarkdownToOKFConcepts(doc.markdown, {
          sourceFileName: doc.fileName,
          defaultStatus: 'stable',
          enableCrossLinking: true,
          enableNlpEnrichment,
          similarityThreshold,
        });
        allConcepts.push(...concepts);
      }
      return compileOKFBundle(
        allConcepts.length > 0
          ? allConcepts
          : partitionMarkdownToOKFConcepts('# Overview\n\nEmpty Knowledge Base.', { sourceFileName: 'overview.md' }),
        'multi-doc-knowledge-base',
        { similarityThreshold }
      );
    }

    const md = markdown || '';
    const concepts = partitionMarkdownToOKFConcepts(md, {
      sourceFileName: 'converted-document.md',
      defaultStatus: 'stable',
      enableCrossLinking: true,
      enableNlpEnrichment,
      similarityThreshold,
    });
    return compileOKFBundle(concepts, 'document-knowledge-base', { similarityThreshold });
  }, [markdown, documents, enableNlpEnrichment, similarityThreshold]);

  const activeConcept: OkfConcept<OkfMetadata> | undefined =
    okfResult.concepts[selectedConceptIndex] || okfResult.concepts[0];

  const activeConceptMarkdown = useMemo(() => {
    if (!activeConcept) return '';
    return exportConceptToMarkdown(activeConcept);
  }, [activeConcept]);

  const activeConceptIssues = useMemo(() => {
    if (!activeConcept) return [];
    return validateConcept(activeConcept);
  }, [activeConcept]);

  const activeConceptNlp = useMemo(() => {
    if (!activeConcept || !okfResult.nlpAnalyses) return null;
    const pathKey = activeConcept.path || activeConcept.id || '';
    return okfResult.nlpAnalyses[pathKey] || null;
  }, [activeConcept, okfResult.nlpAnalyses]);

  // Execute Gemini OKF Agent Query
  const handleRunAgent = async (overrideTask?: 'qa' | 'audit' | 'synthesize' | 'custom', overrideQuery?: string) => {
    const taskToRun = overrideTask || agentTask;
    const queryToRun = overrideQuery !== undefined ? overrideQuery : agentQuery;

    setIsAgentLoading(true);
    setAgentError('');
    setAgentResponse('');

    try {
      const response = await fetch('/api/agent/okf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: taskToRun,
          okfContent: activeConceptMarkdown || markdown,
          userQuery: queryToRun,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Server error (${response.status})`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      let accumulated = '';

      if (!reader) {
        throw new Error('Streaming response reader is not available.');
      }

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: !done });
          accumulated += chunk;
          setAgentResponse(accumulated);
        }
      }
    } catch (err: any) {
      console.error(err);
      setAgentError(err.message || 'An error occurred while contacting the Gemini Agent.');
    } finally {
      setIsAgentLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const downloadFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Export full bundle as ZIP
  const handleExportZip = async () => {
    setIsExportingZip(true);
    try {
      const { zipBlob } = await exportOKFBundleAsZip(okfResult, {
        bundleName: 'okf-knowledge-base',
        includeGraphJson: true,
        includeReportMarkdown: true,
      });
      downloadZipBlob(zipBlob, 'okf-knowledge-base.zip');
    } catch (err) {
      console.error('Failed to export ZIP:', err);
    } finally {
      setIsExportingZip(false);
    }
  };

  // Export Standalone viz.html Interactive Visualizer
  const handleExportVizHtml = () => {
    try {
      const html = generateStandaloneOKFVisualizerHTML(okfResult, {
        bundleTitle: okfResult.bundle.root || 'OKF Knowledge Base',
      });
      downloadFile(html, 'viz.html', 'text/html;charset=utf-8');
    } catch (err) {
      console.error('Failed to export viz.html:', err);
    }
  };

  // Filtered concepts for NLP Matrix
  const filteredConceptsForNlp = useMemo(() => {
    if (!nlpSearchFilter.trim()) return okfResult.concepts;
    const q = nlpSearchFilter.toLowerCase();
    return okfResult.concepts.filter((c) => {
      const title = (c.metadata.title || '').toLowerCase();
      const type = (c.metadata.type || '').toLowerCase();
      const tags = (c.metadata.tags || []).map((t) => t.toLowerCase());
      const nlp = okfResult.nlpAnalyses?.[c.path || c.id || ''];
      const entities = (nlp?.entities || []).map((e) => e.text.toLowerCase());
      return (
        title.includes(q) ||
        type.includes(q) ||
        tags.some((t) => t.includes(q)) ||
        entities.some((e) => e.includes(q))
      );
    });
  }, [okfResult.concepts, okfResult.nlpAnalyses, nlpSearchFilter]);

  return (
    <div className="flex flex-col gap-4 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
      {/* Header Bar */}
      <div className="p-4 sm:p-5 bg-slate-900 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-indigo-600/30 border border-indigo-500/40 text-indigo-400">
            <Boxes className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white tracking-tight">
                OKF (Open Knowledge Format) Suite
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                okf-ts v0.2
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" /> NLP Enhanced
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Structures Markdown into verified OKF Concept Documents, Cross-Linked Knowledge Graphs, and AI Agent Bundles.
            </p>
          </div>
        </div>

        {/* Action Buttons & NLP Switch */}
        <div className="flex items-center gap-2 self-end md:self-auto flex-wrap">
          <button
            type="button"
            onClick={() => setEnableNlpEnrichment(!enableNlpEnrichment)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
              enableNlpEnrichment
                ? 'bg-indigo-600/30 border-indigo-400/50 text-indigo-200 hover:bg-indigo-600/40'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
            }`}
            title="Toggle automatic NLP semantic tagging, description generation, and entity extraction"
          >
            <Sparkles className={`w-3.5 h-3.5 ${enableNlpEnrichment ? 'text-amber-300' : 'text-slate-500'}`} />
            <span>NLP Enrich: {enableNlpEnrichment ? 'ON' : 'OFF'}</span>
          </button>

          <button
            type="button"
            onClick={() => copyToClipboard(activeConceptMarkdown, 'concept')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition cursor-pointer"
          >
            {copied === 'concept' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Copied Active Concept</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                <span>Copy Concept</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleExportVizHtml}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-xs font-medium text-white transition cursor-pointer shadow-2xs"
            title="Export standalone offline interactive graph visualizer (viz.html, zero dependencies)"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Export viz.html</span>
          </button>

          <button
            type="button"
            onClick={handleExportZip}
            disabled={isExportingZip}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-medium text-white transition cursor-pointer shadow-2xs"
            title="Export standard OKF v0.2 Knowledge Base ZIP package"
          >
            <Archive className="w-3.5 h-3.5" />
            <span>{isExportingZip ? 'Packaging...' : 'Export OKF Bundle (.zip)'}</span>
          </button>
        </div>
      </div>

      {/* Overview Statistics Banner with NLP Metrics */}
      <div className="px-5 py-3 bg-slate-50 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <FolderTree className="w-4 h-4 text-indigo-600" />
            <span className="text-slate-500 font-medium">Concepts:</span>
            <span className="font-bold text-slate-800 font-mono">{okfResult.summary.totalConcepts}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-emerald-600" />
            <span className="text-slate-500 font-medium">Graph Edges:</span>
            <span className="font-bold text-slate-800 font-mono">{okfResult.graph.edges.length}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-sky-600" />
            <span className="text-slate-500 font-medium">Conformant:</span>
            <span className="font-bold text-emerald-700 font-mono">
              {okfResult.summary.validCount}/{okfResult.summary.totalConcepts}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-amber-600" />
            <span className="text-slate-500 font-medium">Completeness:</span>
            <span className="font-bold text-slate-800 font-mono">{okfResult.summary.avgCompletenessScore || 85}%</span>
          </div>

          <div className="flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-indigo-600" />
            <span className="text-slate-500 font-medium">Readability:</span>
            <span className="font-bold text-slate-800 font-mono">{okfResult.summary.avgReadabilityScore || 68}/100</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500">Trust Breakdown:</span>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
            {okfResult.summary.trustTiers['human-reviewed']} Human
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">
            {okfResult.summary.trustTiers['machine-confirmed']} Machine
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700">
            {okfResult.summary.trustTiers['unverified']} Unverified
          </span>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="px-3 sm:px-5 border-b border-slate-200 flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveSubTab('human-nl')}
          className={`py-2.5 px-3 border-b-2 font-medium text-xs transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeSubTab === 'human-nl'
              ? 'border-indigo-600 text-indigo-600 font-bold bg-indigo-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
          <span className="flex items-center gap-1 text-slate-900 font-bold">
            Human Natural Language Query
            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-indigo-100 text-indigo-800">
              Q&A
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('graph')}
          className={`py-2.5 px-3 border-b-2 font-medium text-xs transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeSubTab === 'graph'
              ? 'border-indigo-600 text-indigo-600 font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Knowledge Graph ({okfResult.graph.nodes.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('concepts')}
          className={`py-2.5 px-3 border-b-2 font-medium text-xs transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeSubTab === 'concepts'
              ? 'border-indigo-600 text-indigo-600 font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Concept Documents ({okfResult.concepts.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('nlp-intelligence')}
          className={`py-2.5 px-3 border-b-2 font-medium text-xs transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeSubTab === 'nlp-intelligence'
              ? 'border-indigo-600 text-indigo-600 font-bold bg-indigo-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
          <span className="flex items-center gap-1">
            NLP Intelligence & Quality
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('rag-agent')}
          className={`py-2.5 px-3 border-b-2 font-medium text-xs transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeSubTab === 'rag-agent'
              ? 'border-indigo-600 text-indigo-600 font-bold bg-indigo-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Bot className="w-3.5 h-3.5 text-indigo-600" />
          <span className="flex items-center gap-1 text-slate-900 font-bold">
            Graph RAG & Agent
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('agent-query-suite')}
          className={`py-2.5 px-3 border-b-2 font-medium text-xs transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeSubTab === 'agent-query-suite'
              ? 'border-indigo-600 text-indigo-600 font-bold bg-indigo-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Terminal className="w-3.5 h-3.5 text-indigo-600" />
          <span className="flex items-center gap-1 text-slate-900 font-bold">
            Agent Query Suite & MCP API
            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800">
              Live Endpoints
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('mcp-generator')}
          className={`py-2.5 px-3 border-b-2 font-medium text-xs transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeSubTab === 'mcp-generator'
              ? 'border-amber-500 text-amber-900 font-bold bg-amber-50/70'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Server className="w-3.5 h-3.5 text-amber-600" />
          <span className="flex items-center gap-1 text-slate-900 font-bold">
            MCP Tool Generator
            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-100 text-amber-800">
              Claude / Cursor
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('multi-format')}
          className={`py-2.5 px-3 border-b-2 font-medium text-xs transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeSubTab === 'multi-format'
              ? 'border-indigo-600 text-indigo-600 font-bold bg-indigo-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Share2 className="w-3.5 h-3.5 text-indigo-600" />
          <span className="flex items-center gap-1">
            Multi-Format & Graph DBs
            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-indigo-100 text-indigo-800">
              JSON-LD / Neo4j / GraphDB
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('certification')}
          className={`py-2.5 px-3 border-b-2 font-medium text-xs transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeSubTab === 'certification'
              ? 'border-indigo-600 text-indigo-600 font-bold bg-indigo-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Award className="w-3.5 h-3.5 text-amber-500" />
          <span className="flex items-center gap-1">
            Conformance Certificate
            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-100 text-amber-800">
              SHA-256
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('round-trip')}
          className={`py-2.5 px-3 border-b-2 font-medium text-xs transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeSubTab === 'round-trip'
              ? 'border-indigo-600 text-indigo-600 font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Upload className="w-3.5 h-3.5 text-indigo-600" />
          <span>Import & Round-Trip</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('dev-workbench')}
          className={`py-2.5 px-3 border-b-2 font-medium text-xs transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeSubTab === 'dev-workbench'
              ? 'border-indigo-600 text-indigo-600 font-bold bg-indigo-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Terminal className="w-3.5 h-3.5 text-indigo-600" />
          <span className="flex items-center gap-1">
            Dev Toolkit & Slicer
            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-indigo-100 text-indigo-800">
              Phase 1
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('index-manifest')}
          className={`py-2.5 px-3 border-b-2 font-medium text-xs transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeSubTab === 'index-manifest'
              ? 'border-indigo-600 text-indigo-600 font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileCheck className="w-3.5 h-3.5" />
          <span>INDEX.md & Manifest</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('validation')}
          className={`py-2.5 px-3 border-b-2 font-medium text-xs transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeSubTab === 'validation'
              ? 'border-indigo-600 text-indigo-600 font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span className="flex items-center gap-1">
            Spec Conformance
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                okfResult.summary.errorCount === 0
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-rose-100 text-rose-800'
              }`}
            >
              {okfResult.summary.errorCount === 0 ? 'Passed' : `${okfResult.summary.errorCount} Errors`}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('trust-lifecycle')}
          className={`py-2.5 px-3 border-b-2 font-medium text-xs transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeSubTab === 'trust-lifecycle'
              ? 'border-indigo-600 text-indigo-600 font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Trust & Lifecycle</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('agent-skill')}
          className={`py-2.5 px-3 border-b-2 font-medium text-xs transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeSubTab === 'agent-skill'
              ? 'border-indigo-600 text-indigo-600 font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Bot className="w-3.5 h-3.5 text-indigo-500" />
          <span className="flex items-center gap-1">
            Agent Skill <span className="font-mono text-[10px] text-indigo-600">(SKILL.md)</span>
          </span>
        </button>
      </div>

      {/* Main Tab Views */}
      <div className="p-4 sm:p-5 pt-1">
        {/* SubTab 1: Interactive Knowledge Graph */}
        {activeSubTab === 'graph' && (
          <div className="flex flex-col gap-4">
            {/* Graph threshold slider bar */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span className="font-semibold text-slate-800">
                  Semantic Linking Threshold (Cosine & Entity Jaccard):
                </span>
                <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                  {similarityThreshold.toFixed(2)}
                </span>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <span className="text-[11px] text-slate-500">More Links</span>
                <input
                  type="range"
                  min="0.1"
                  max="0.6"
                  step="0.02"
                  value={similarityThreshold}
                  onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))}
                  className="w-36 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <span className="text-[11px] text-slate-500">Strict Match</span>

                <button
                  type="button"
                  onClick={handleExportVizHtml}
                  className="ml-2 flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-semibold transition cursor-pointer shadow-2xs whitespace-nowrap"
                  title="Export offline self-contained viz.html interactive graph visualizer"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Download viz.html</span>
                </button>
              </div>
            </div>

            <OKFGraphVisualizer
              graph={okfResult.graph}
              semanticGraph={okfResult.semanticGraph}
              nlpAnalyses={okfResult.nlpAnalyses}
              selectedConceptId={activeConcept?.id}
              onSelectConcept={(conceptId) => {
                const idx = okfResult.concepts.findIndex((c) => c.id === conceptId || c.path === conceptId);
                if (idx !== -1) {
                  setSelectedConceptIndex(idx);
                }
              }}
            />
          </div>
        )}

        {/* SubTab 2: Concept Documents Explorer */}
        {activeSubTab === 'concepts' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Sidebar list of concepts */}
            <div className="lg:col-span-1 flex flex-col gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 max-h-[600px] overflow-y-auto">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider px-1">
                Concept Documents ({okfResult.concepts.length})
              </span>

              <div className="flex flex-col gap-1">
                {okfResult.concepts.map((c, i) => {
                  const isSelected = i === selectedConceptIndex;
                  const type = c.metadata.type || 'concept';

                  return (
                    <button
                      key={c.id || i}
                      type="button"
                      onClick={() => setSelectedConceptIndex(i)}
                      className={`p-2.5 rounded-lg text-left transition flex flex-col gap-1 cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-white hover:bg-slate-100 text-slate-800 border border-slate-200/80'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9px] font-mono uppercase font-bold ${
                            isSelected
                              ? 'bg-indigo-700 text-indigo-100'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {type}
                        </span>
                        <span
                          className={`text-[9px] font-mono ${
                            isSelected ? 'text-indigo-200' : 'text-slate-400'
                          }`}
                        >
                          {deriveTrustTier(c)}
                        </span>
                      </div>
                      <span className="text-xs font-bold truncate">
                        {c.metadata.title || c.path || `Concept ${i + 1}`}
                      </span>
                      <span
                        className={`text-[10px] font-mono truncate ${
                          isSelected ? 'text-indigo-200' : 'text-slate-400'
                        }`}
                      >
                        {c.path}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Main inspector for selected concept */}
            <div className="lg:col-span-3 flex flex-col gap-4">
              {activeConcept ? (
                <div className="flex flex-col gap-3">
                  {/* Concept Header */}
                  <div className="p-4 bg-slate-900 text-white rounded-xl flex items-center justify-between gap-4 border border-slate-800">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          {activeConcept.metadata.type}
                        </span>
                        <h4 className="text-sm font-bold text-white truncate max-w-md">
                          {activeConcept.metadata.title}
                        </h4>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400">
                        Path: {activeConcept.path}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          downloadFile(
                            activeConceptMarkdown,
                            activeConcept.path?.split('/').pop() || 'concept.md',
                            'text/markdown'
                          )
                        }
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Export .md</span>
                      </button>
                    </div>
                  </div>

                  {/* Metadata & NLP Intelligence pill badges */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center gap-3 text-xs">
                    <div className="flex items-center gap-1">
                      <span className="text-slate-500">Status:</span>
                      <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[10px] uppercase">
                        {String(activeConcept.metadata.status || 'stable')}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <span className="text-slate-500">Trust Tier:</span>
                      <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 text-[10px] uppercase">
                        {deriveTrustTier(activeConcept)}
                      </span>
                    </div>

                    {activeConceptNlp && (
                      <>
                        <div className="flex items-center gap-1">
                          <span className="text-slate-500">Readability:</span>
                          <span className="font-mono font-bold text-slate-700 bg-slate-200/80 px-2 py-0.5 rounded text-[10px]">
                            {activeConceptNlp.readability.complexityLabel} ({activeConceptNlp.readability.fleschReadingEase}/100)
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <span className="text-slate-500">Completeness:</span>
                          <span className="font-mono font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded text-[10px]">
                            {activeConceptNlp.qualitySignals.completenessScore}%
                          </span>
                        </div>
                      </>
                    )}

                    {activeConcept.metadata.tags && activeConcept.metadata.tags.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-slate-500">Tags:</span>
                        <div className="flex gap-1 flex-wrap">
                          {activeConcept.metadata.tags.map((t) => (
                            <span
                              key={t}
                              className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200/60 text-[10px] font-mono"
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Discovered NLP Entities Box (if available) */}
                  {activeConceptNlp && activeConceptNlp.entities.length > 0 && (
                    <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl flex flex-col gap-2">
                      <span className="text-[11px] font-bold text-indigo-950 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                        Discovered Semantic Entities & Technical Concepts ({activeConceptNlp.entities.length}):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {activeConceptNlp.entities.map((ent, eIdx) => {
                          const badgeBg =
                            ent.category === 'code'
                              ? 'bg-amber-100 text-amber-900 border-amber-300'
                              : ent.category === 'protocol'
                              ? 'bg-sky-100 text-sky-900 border-sky-300'
                              : ent.category === 'metric'
                              ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                              : 'bg-indigo-100 text-indigo-900 border-indigo-300';
                          return (
                            <span
                              key={eIdx}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-mono border flex items-center gap-1 ${badgeBg}`}
                            >
                              <span className="font-bold">{ent.text}</span>
                              <span className="text-[8px] opacity-70 uppercase tracking-tighter">
                                ({ent.category})
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Serialized OKF Markdown with YAML Frontmatter */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <FileCode className="w-4 h-4 text-indigo-600" />
                        Serialized OKF Markdown with Frontmatter
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {activeConcept.path}
                      </span>
                    </div>

                    <HighlightedCodeBlock
                      value={activeConceptMarkdown}
                      language="markdown"
                    />
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 text-xs italic">
                  Select a concept from the left panel to inspect.
                </div>
              )}
            </div>
          </div>
        )}

        {/* SubTab 3: NLP Intelligence & Quality Matrix (Phase 4) */}
        {activeSubTab === 'nlp-intelligence' && (
          <div className="flex flex-col gap-4">
            {/* Header / Intro Banner */}
            <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    NLP Knowledge Extraction & Quality Matrix
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Extractive summarization, technical entity recognition, TF-IDF keyphrase discovery, and ambiguity scoring.
                  </p>
                </div>
              </div>

              {/* Search / Filter Input */}
              <div className="relative w-full md:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter entities, tags, titles..."
                  value={nlpSearchFilter}
                  onChange={(e) => setNlpSearchFilter(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </div>
            </div>

            {/* Matrix of Concepts & NLP Analytics */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Analyzed Concepts ({filteredConceptsForNlp.length} of {okfResult.concepts.length})
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  Engine: OKF NLP Intelligence (Salience + Readability + NER)
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {filteredConceptsForNlp.map((concept, idx) => {
                  const pathKey = concept.path || concept.id || '';
                  const nlp = okfResult.nlpAnalyses?.[pathKey];
                  const type = concept.metadata.type || 'concept';

                  return (
                    <div
                      key={idx}
                      className="p-4 bg-white border border-slate-200 rounded-xl hover:border-indigo-300 transition shadow-2xs flex flex-col gap-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {type}
                          </span>
                          <h5 className="text-xs font-bold text-slate-900">
                            {concept.metadata.title}
                          </h5>
                          <span className="text-[10px] font-mono text-slate-400 truncate">
                            ({concept.path})
                          </span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          {nlp && (
                            <>
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Completeness: {nlp.qualitySignals.completenessScore}%
                              </span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                {nlp.readability.complexityLabel} ({nlp.readability.fleschReadingEase}/100)
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Salient Summary Description */}
                      <div className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
                        <span className="font-bold text-slate-900">Salient Frontmatter Summary: </span>
                        {concept.metadata.description || 'No description available.'}
                      </div>

                      {/* Discovered Entities & Tags */}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4 text-xs">
                        {concept.metadata.tags && concept.metadata.tags.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] font-semibold text-slate-500">Keyphrases & Tags:</span>
                            {concept.metadata.tags.map((tag, tIdx) => (
                              <span
                                key={tIdx}
                                className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200/60 font-mono text-[10px]"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {nlp && nlp.entities.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] font-semibold text-slate-500">Discovered Entities:</span>
                            {nlp.entities.slice(0, 6).map((ent, eIdx) => (
                              <span
                                key={eIdx}
                                className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-100 text-slate-800 border border-slate-200"
                              >
                                {ent.text}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Ambiguity warnings (if any) */}
                      {nlp && nlp.qualitySignals.ambiguousPhrases.length > 0 && (
                        <div className="flex items-center gap-1.5 text-[11px] text-amber-800 bg-amber-50 p-2 rounded border border-amber-200">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>
                            <strong>Ambiguity Warning:</strong> Found speculative or vague terms (
                            {nlp.qualitySignals.ambiguousPhrases.join(', ')}). Consider replacing with exact definitions before human review.
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* SubTab 3: INDEX.md & Manifest */}
        {activeSubTab === 'index-manifest' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <FileCheck className="w-4 h-4 text-indigo-600" />
                  Reserved Document: INDEX.md
                </h4>
                <button
                  type="button"
                  onClick={() =>
                    downloadFile(
                      okfResult.bundle.indexes[0]?.body || '',
                      'INDEX.md',
                      'text/markdown'
                    )
                  }
                  className="text-[11px] text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer font-medium"
                >
                  <Download className="w-3 h-3" />
                  Download INDEX.md
                </button>
              </div>

              <HighlightedCodeBlock
                value={okfResult.bundle.indexes[0]?.body || '# Knowledge Base Index'}
                language="markdown"
              />
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <FileJson className="w-4 h-4 text-emerald-600" />
                  Bundle Manifest: .okf/manifest.json
                </h4>
                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(
                      JSON.stringify(
                        {
                          version: okfResult.bundle.version,
                          root: okfResult.bundle.root,
                          summary: okfResult.summary,
                          concepts: okfResult.concepts.map((c) => ({
                            id: c.id,
                            path: c.path,
                            type: c.metadata.type,
                            title: c.metadata.title,
                          })),
                        },
                        null,
                        2
                      ),
                      'manifest-json'
                    )
                  }
                  className="text-[11px] text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer font-medium"
                >
                  {copied === 'manifest-json' ? 'Copied JSON' : 'Copy JSON'}
                </button>
              </div>

              <HighlightedCodeBlock
                value={JSON.stringify(
                  {
                    format: 'Open Knowledge Format',
                    version: okfResult.bundle.version || '0.2.0',
                    root: okfResult.bundle.root,
                    summary: okfResult.summary,
                    concepts: okfResult.concepts.map((c) => ({
                      id: c.id,
                      path: c.path,
                      type: c.metadata.type,
                      title: c.metadata.title,
                      tags: c.metadata.tags,
                    })),
                    graph: {
                      nodes_count: okfResult.graph.nodes.length,
                      edges_count: okfResult.graph.edges.length,
                    },
                  },
                  null,
                  2
                )}
                language="json"
              />
            </div>
          </div>
        )}

        {/* SubTab 4: OKF Spec Compliance & Conformance Validation */}
        {activeSubTab === 'validation' && (
          <div className="flex flex-col gap-4">
            <div
              className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
                okfResult.summary.errorCount === 0
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <div className="flex items-center gap-3">
                {okfResult.summary.errorCount === 0 ? (
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="w-8 h-8 text-rose-600 shrink-0" />
                )}
                <div className="flex flex-col">
                  <h4 className="text-sm font-bold">
                    {okfResult.summary.errorCount === 0
                      ? 'OKF v0.2 Specification Compliance Passed'
                      : 'OKF Specification Issues Detected'}
                  </h4>
                  <p className="text-xs opacity-80">
                    Validated against official okf-ts v0.2 bundle conformance rules (validateConcept & validateBundle).
                  </p>
                </div>
              </div>

              <div className="flex flex-col items-end">
                <span className="text-2xl font-black font-mono">
                  {okfResult.summary.errorCount === 0 ? '100%' : `${okfResult.summary.validCount}/${okfResult.summary.totalConcepts}`}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  Bundle Conformance
                </span>
              </div>
            </div>

            {/* Validation Findings Table */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Detailed Validation Findings ({okfResult.bundle.issues.length})
              </span>

              {okfResult.bundle.issues.length === 0 ? (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-600">
                  🎉 No schema errors or warnings detected across {okfResult.concepts.length} concept files.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {okfResult.bundle.issues.map((issue, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border flex items-start justify-between gap-3 text-xs ${
                        issue.severity === 'error'
                          ? 'bg-rose-50 border-rose-200 text-rose-800'
                          : 'bg-amber-50 border-amber-200 text-amber-800'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {issue.severity === 'error' ? (
                          <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        )}
                        <div className="flex flex-col">
                          <span className="font-bold">{issue.message}</span>
                          <span className="text-[10px] font-mono opacity-80">
                            {issue.path ? `File: ${issue.path}` : 'Bundle level'} {issue.field ? `• Field: ${issue.field}` : ''}
                          </span>
                        </div>
                      </div>

                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-white/80 border border-black/10">
                        {issue.code || issue.severity}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SubTab 5: OKF v0.2 Trust & Lifecycle Signals */}
        {activeSubTab === 'trust-lifecycle' && (
          <div className="flex flex-col gap-5">
            {/* OKF 0.2 Trust Signals Header Banner */}
            <div className="p-4 bg-gradient-to-r from-slate-900 to-indigo-950 border border-slate-800 rounded-xl text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold flex items-center gap-2">
                    OKF v0.2 Trust Signals & Attestation Matrix
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/30 text-emerald-300 font-bold">
                      OKF 0.2 Standard
                    </span>
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Continuous verification of the 5 core OKF trust dimensions: Provenance, Trust Tiers, Freshness, Lifecycle, and Attested Computation.
                  </p>
                </div>
              </div>
            </div>

            {/* 5 Core Trust Signals Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* 1. Provenance */}
              <div className="p-3.5 rounded-xl bg-blue-50/80 border border-blue-200 flex flex-col justify-between gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-blue-900 uppercase">1. Provenance</span>
                  <Database className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <span className="text-xl font-black font-mono text-blue-950">
                    {okfResult.concepts.reduce((acc, c) => acc + (c.metadata.sources?.length || 1), 0)}
                  </span>
                  <span className="text-[10px] text-blue-700 ml-1.5">Source Refs</span>
                </div>
                <p className="text-[10px] text-blue-800 leading-snug">
                  Auditable lineage tracking with URIs, author attribution, and usage windows.
                </p>
              </div>

              {/* 2. Trust Tiers */}
              <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200 flex flex-col justify-between gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-emerald-900 uppercase">2. Trust Tiers</span>
                  <Award className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <span className="text-xl font-black font-mono text-emerald-950">
                    {okfResult.summary.trustTiers['human-reviewed']} / {okfResult.summary.trustTiers['machine-confirmed']}
                  </span>
                  <span className="text-[10px] text-emerald-700 ml-1.5">Human / Machine</span>
                </div>
                <p className="text-[10px] text-emerald-800 leading-snug">
                  Hierarchical verification levels derived from cryptographic and reviewer audit records.
                </p>
              </div>

              {/* 3. Freshness */}
              <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 flex flex-col justify-between gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-amber-900 uppercase">3. Freshness</span>
                  <Activity className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <span className="text-xl font-black font-mono text-amber-950">
                    {okfResult.summary.freshCount ?? okfResult.concepts.length}
                  </span>
                  <span className="text-[10px] text-amber-700 ml-1.5">Active Fresh</span>
                </div>
                <p className="text-[10px] text-amber-800 leading-snug">
                  Time-to-live policies governed by <code className="font-mono text-[9px] bg-amber-100 px-1 py-0.5 rounded">stale_after</code> ISO expiration timestamps.
                </p>
              </div>

              {/* 4. Lifecycle */}
              <div className="p-3.5 rounded-xl bg-indigo-50/80 border border-indigo-200 flex flex-col justify-between gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-indigo-900 uppercase">4. Lifecycle</span>
                  <Layers className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                  <span className="text-xl font-black font-mono text-indigo-950">
                    {okfResult.summary.lifecycleCounts?.stable ?? okfResult.concepts.length}
                  </span>
                  <span className="text-[10px] text-indigo-700 ml-1.5">Stable</span>
                </div>
                <p className="text-[10px] text-indigo-800 leading-snug">
                  Explicit maturity stage progression across <code className="font-mono text-[9px] bg-indigo-100 px-1 py-0.5 rounded">draft</code>, <code className="font-mono text-[9px] bg-indigo-100 px-1 py-0.5 rounded">stable</code>, and <code className="font-mono text-[9px] bg-indigo-100 px-1 py-0.5 rounded">deprecated</code>.
                </p>
              </div>

              {/* 5. Attested Computation */}
              <div className="p-3.5 rounded-xl bg-purple-50/80 border border-purple-200 flex flex-col justify-between gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-purple-900 uppercase">5. Attestation</span>
                  <Cpu className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <span className="text-xl font-black font-mono text-purple-950">
                    {okfResult.summary.attestedComputationsCount ?? 0}
                  </span>
                  <span className="text-[10px] text-purple-700 ml-1.5">Attested</span>
                </div>
                <p className="text-[10px] text-purple-800 leading-snug">
                  Executable invariant calculations certified with runtime execution signatures.
                </p>
              </div>
            </div>

            {/* Comprehensive Trust & Signals Inventory Table */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                  OKF v0.2 Trust Signals Inventory
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  {okfResult.concepts.length} concepts verified
                </span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs shadow-sm bg-white">
                <div className="bg-slate-100 p-2.5 font-bold text-slate-700 grid grid-cols-12 gap-2 border-b border-slate-200">
                  <div className="col-span-4">Concept & Provenance Source</div>
                  <div className="col-span-2">Type</div>
                  <div className="col-span-2">Trust Tier</div>
                  <div className="col-span-2">Freshness (Stale After)</div>
                  <div className="col-span-2">Lifecycle & Attestation</div>
                </div>

                <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                  {okfResult.concepts.map((c) => {
                    const tier = deriveTrustTier(c);
                    const status = getStatus(c.metadata);
                    const stale = isStale(c.metadata);
                    const hasComputation = Boolean(c.metadata.computation || c.metadata.runtime);
                    const sourceRef = c.metadata.sources?.[0]?.resource || 'ingested-doc';

                    return (
                      <div key={c.id} className="p-2.5 grid grid-cols-12 gap-2 items-center hover:bg-slate-50 transition">
                        {/* Concept & Provenance */}
                        <div className="col-span-4 min-w-0">
                          <div className="font-medium text-slate-800 truncate">{c.metadata.title || c.path}</div>
                          <div className="text-[10px] font-mono text-slate-400 truncate flex items-center gap-1">
                            <span className="text-slate-500">Src:</span> {sourceRef}
                          </div>
                        </div>

                        {/* Type */}
                        <div className="col-span-2">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-slate-100 text-slate-700 border border-slate-200">
                            {c.metadata.type || 'concept'}
                          </span>
                        </div>

                        {/* Trust Tier */}
                        <div className="col-span-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border inline-flex items-center gap-1 ${
                              tier === 'human-reviewed'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : tier === 'machine-confirmed'
                                ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                : 'bg-slate-50 text-slate-700 border-slate-200'
                            }`}
                          >
                            {tier === 'human-reviewed' && <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />}
                            {tier === 'machine-confirmed' && <Cpu className="w-2.5 h-2.5 text-indigo-600" />}
                            {tier}
                          </span>
                        </div>

                        {/* Freshness */}
                        <div className="col-span-2 min-w-0">
                          <div className="flex items-center gap-1">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
                                stale
                                  ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                  : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              }`}
                            >
                              {stale ? 'Stale' : 'Fresh'}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500 truncate">
                              {c.metadata.stale_after || '1y TTL'}
                            </span>
                          </div>
                        </div>

                        {/* Lifecycle & Attestation */}
                        <div className="col-span-2 flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              status === 'stable'
                                ? 'bg-emerald-100 text-emerald-800'
                                : status === 'draft'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {status}
                          </span>
                          {hasComputation && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-0.5" title="Attested computation invariant">
                              <Cpu className="w-2.5 h-2.5" />
                              Attested
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SubTab 6: AI Agent Skill (SKILL.md) */}
        {activeSubTab === 'agent-skill' && (
          <div className="flex flex-col gap-4">
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <Bot className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold flex items-center gap-2">
                    OKF Agent Skill Specification
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/30 text-indigo-300">
                      SKILL.md
                    </span>
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Instruction standard for AI Agents (Gemini, Claude, Cursor) to parse, validate, and navigate OKF bundles.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => copyToClipboard(OFFICIAL_OKF_SKILL_MD, 'skill-md')}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
                >
                  {copied === 'skill-md' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                      <span>Copy SKILL.md</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <HighlightedCodeBlock
              value={OFFICIAL_OKF_SKILL_MD}
              language="markdown"
            />
          </div>
        )}

        {/* SubTab: Human Natural Language Query Assistant */}
        {activeSubTab === 'human-nl' && (
          <OKFNaturalLanguageQuery
            bundle={okfResult.bundle}
            concepts={okfResult.concepts}
            semanticGraph={okfResult.semanticGraph}
            onNavigateToConcept={(conceptPath) => {
              const idx = okfResult.concepts.findIndex(
                (c) => c.path === conceptPath || c.id === conceptPath
              );
              if (idx >= 0) {
                setSelectedConceptIndex(idx);
                setActiveSubTab('concepts');
              }
            }}
          />
        )}

        {/* SubTab: Graph-Augmented RAG & Agent Retriever */}
        {activeSubTab === 'rag-agent' && (
          <OKFRagPlayground
            concepts={okfResult.concepts}
            semanticGraph={okfResult.semanticGraph}
          />
        )}

        {/* SubTab: AI Agent Query Suite & Universal MCP / REST API Hub */}
        {activeSubTab === 'agent-query-suite' && (
          <OKFAgentQueryHub
            bundle={okfResult.bundle}
            semanticGraph={okfResult.semanticGraph}
          />
        )}

        {/* SubTab: Model Context Protocol (MCP) Tool Configuration Generator */}
        {activeSubTab === 'mcp-generator' && (
          <OKFMcpToolConfigGenerator
            bundle={okfResult.bundle}
            semanticGraph={okfResult.semanticGraph}
          />
        )}

        {/* SubTab: Multi-Format Semantic Exporter (JSON-LD, RDF Turtle, MCP Schema, Obsidian) */}
        {activeSubTab === 'multi-format' && (
          <OKFMultiFormatExporterView
            bundle={okfResult.bundle}
            semanticGraph={okfResult.semanticGraph}
            nlpAnalyses={okfResult.nlpAnalyses}
          />
        )}

        {/* SubTab: Cryptographic Conformance Certificate & SHA-256 Digest */}
        {activeSubTab === 'certification' && (
          <OKFCertificateView
            bundle={okfResult.bundle}
            semanticGraph={okfResult.semanticGraph}
            nlpAnalyses={okfResult.nlpAnalyses}
          />
        )}

        {/* SubTab: Interactive Round-Trip & Import Validator */}
        {activeSubTab === 'round-trip' && <OKFRoundTripValidator />}

        {/* SubTab: Dev Toolkit, Monolithic Slicer & AST Inspector (Phase 1) */}
        {activeSubTab === 'dev-workbench' && (
          <OKFDevWorkbench
            bundle={okfResult.bundle}
            concepts={okfResult.concepts}
            currentMarkdown={markdown}
          />
        )}
      </div>
    </div>
  );
}
