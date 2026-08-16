import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { OkfBundle, OkfConcept, OkfMetadata } from 'okf-ts';
import { parseOkfDocument, type OkfDocumentAST } from '../lib/okfCoreParser';
import { validateOkfBundle, type OkfValidationReport } from '../lib/okfCoreValidator';
import { sliceMonolithicMarkdown, type OkfSlicerResult, type SlicedConceptFile } from '../lib/okfMarkdownSlicer';
import {
  buildOkfKnowledgeGraph,
  executeGraphRagQuery,
  type OkfKnowledgeGraph,
  type GraphRagRetrievalResult,
  type RetrievedSubgraphNode,
} from '../lib/okfCoreGraphRag';
import {
  executeOkfCliCommand,
  getGitHubActionsWorkflowContent,
  type CliCommandResult,
} from '../lib/okfCliEngine';
import {
  getAllEcosystemSnippets,
  type EcosystemCodeSnippet,
} from '../lib/okfEcosystemConnectors';
import { generateAllMultiFormatExports } from '../lib/okfMultiFormatExporter';
import { generateConformanceCertificate } from '../lib/okfCertificationEngine';
import HighlightedCodeBlock from './HighlightedCodeBlock';
import {
  Scissors,
  ShieldCheck,
  Code2,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Link2,
  RefreshCw,
  Copy,
  Check,
  Download,
  Terminal,
  FolderTree,
  FileText,
  Sparkles,
  Layers,
  ArrowRight,
  ExternalLink,
  Info,
  Network,
  Search,
  Sliders,
  Database,
  Cpu,
  GitFork,
  CheckCircle,
  Play,
  CornerDownLeft,
  Settings,
  Share2,
  Zap,
  Award,
  PackageCheck,
  Bot,
} from 'lucide-react';
import JSZip from 'jszip';

interface OKFDevWorkbenchProps {
  bundle: OkfBundle;
  concepts: OkfConcept<OkfMetadata>[];
  currentMarkdown: string;
  onApplyNewBundle?: (newMarkdown: string) => void;
}

export default function OKFDevWorkbench({
  bundle,
  concepts,
  currentMarkdown,
  onApplyNewBundle,
}: OKFDevWorkbenchProps) {
  const [activeTool, setActiveTool] = useState<'cli' | 'graph-rag' | 'connectors' | 'slicer' | 'validator' | 'ast'>('cli');
  const [monolithicInput, setMonolithicInput] = useState<string>(currentMarkdown);
  const [selectedSlicedIndex, setSelectedSlicedIndex] = useState<number>(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedAstConceptIndex, setSelectedAstConceptIndex] = useState<number>(0);
  const [selectedSnippetIdx, setSelectedSnippetIdx] = useState<number>(0);
  const [isPackagingProduction, setIsPackagingProduction] = useState<boolean>(false);

  // MCP Live Test State
  const [mcpToolCall, setMcpToolCall] = useState<'okf_search_concepts' | 'okf_graph_rag_query' | 'okf_sparql_query'>('okf_graph_rag_query');
  const [mcpQueryInput, setMcpQueryInput] = useState<string>('architecture');
  const [mcpLiveResponse, setMcpLiveResponse] = useState<any>(null);

  // CLI Terminal Interactive State
  const [cliInput, setCliInput] = useState<string>('npx okf check --strict');
  const [terminalHistory, setTerminalHistory] = useState<CliCommandResult[]>([
    executeOkfCliCommand('npx okf help', {
      cwd: '/workspace',
      files: new Map([['current.md', currentMarkdown]]),
      bundle,
    }),
  ]);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Graph-RAG interactive query options
  const [ragQuery, setRagQuery] = useState<string>('How do we authenticate requests and what are the security prerequisites?');
  const [topK, setTopK] = useState<number>(2);
  const [maxHops, setMaxHops] = useState<0 | 1 | 2>(1);
  const [expansionDirection, setExpansionDirection] = useState<'upstream' | 'downstream' | 'bidirectional'>('bidirectional');
  const [hybridAlpha, setHybridAlpha] = useState<number>(0.6);
  const [trustBoost, setTrustBoost] = useState<number>(1.3);
  const [maxTokenBudget, setMaxTokenBudget] = useState<number>(3000);
  const [filterSparql, setFilterSparql] = useState<string>('');

  // 1. Build Knowledge Graph from live bundle
  const knowledgeGraph: OkfKnowledgeGraph = useMemo(() => {
    const documents = concepts.map((c) => ({
      path: c.path || `${c.id}.md`,
      content: c.body ? `---\n${JSON.stringify(c.metadata, null, 2)}\n---\n\n${c.body}` : c.body || '',
    }));
    return buildOkfKnowledgeGraph(documents);
  }, [concepts]);

  // 2. Execute Graph-RAG retrieval
  const graphRagResult: GraphRagRetrievalResult = useMemo(() => {
    return executeGraphRagQuery(knowledgeGraph, {
      query: ragQuery,
      topK,
      maxHops,
      expansionDirection,
      hybridAlpha,
      trustBoost,
      maxTokenBudget,
      filterSparql: filterSparql.trim() || undefined,
    });
  }, [
    knowledgeGraph,
    ragQuery,
    topK,
    maxHops,
    expansionDirection,
    hybridAlpha,
    trustBoost,
    maxTokenBudget,
    filterSparql,
  ]);

  // Slicer execution
  const sliceResult: OkfSlicerResult = useMemo(() => {
    return sliceMonolithicMarkdown(monolithicInput);
  }, [monolithicInput]);

  // Validation report on the active bundle
  const validationReport: OkfValidationReport = useMemo(() => {
    const documents = concepts.map((c) => ({
      path: c.path || `${c.id}.md`,
      content: c.body ? `---\n${JSON.stringify(c.metadata, null, 2)}\n---\n\n${c.body}` : c.body || '',
    }));
    return validateOkfBundle(documents);
  }, [concepts]);

  // AST for active concept in inspector
  // Ecosystem snippets for Phase 4
  const ecosystemSnippets = useMemo(() => {
    return getAllEcosystemSnippets(bundle.root || 'okf-knowledge-base');
  }, [bundle.root]);

  const activeSnippet = ecosystemSnippets[selectedSnippetIdx] || ecosystemSnippets[0];

  // Live MCP Tool Call execution
  const handleExecuteMcpTool = async () => {
    try {
      if (mcpToolCall === 'okf_search_concepts') {
        const q = mcpQueryInput.toLowerCase();
        const matches = concepts.filter(
          (c) =>
            (c.metadata?.title || '').toLowerCase().includes(q) ||
            (c.metadata?.description || '').toLowerCase().includes(q) ||
            (c.body || '').toLowerCase().includes(q)
        );
        setMcpLiveResponse({
          jsonrpc: '2.0',
          result: {
            total: matches.length,
            concepts: matches.map((m) => ({
              id: m.path || m.id,
              title: m.metadata?.title,
              type: m.metadata?.type,
              status: m.metadata?.status,
              preview: m.body?.slice(0, 150) + '...',
            })),
          },
        });
      } else if (mcpToolCall === 'okf_graph_rag_query') {
        const result = executeGraphRagQuery(knowledgeGraph, {
          query: mcpQueryInput,
          topK: 2,
          maxHops: 1,
          expansionDirection: 'bidirectional',
          hybridAlpha: 0.6,
          trustBoost: 1.2,
        });
        setMcpLiveResponse({
          jsonrpc: '2.0',
          result: {
            query: mcpQueryInput,
            retrievedNodes: result.allRetrievedNodes.map((n) => ({
              id: n.node.id,
              title: n.node.title,
              type: n.node.type,
              trustTier: n.node.trustTier,
              hopDistance: n.hopDistance,
              relevanceScore: n.score,
            })),
            groundedPromptTokens: result.totalTokensUsed,
          },
        });
      } else if (mcpToolCall === 'okf_sparql_query') {
        setMcpLiveResponse({
          jsonrpc: '2.0',
          result: {
            head: { vars: ['concept', 'title', 'type'] },
            results: {
              bindings: concepts.slice(0, 5).map((c) => ({
                concept: { type: 'uri', value: `urn:okf:concept:${c.id}` },
                title: { type: 'literal', value: c.metadata?.title || c.id },
                type: { type: 'literal', value: c.metadata?.type || 'concept' },
              })),
            },
          },
        });
      }
    } catch (err: any) {
      setMcpLiveResponse({ jsonrpc: '2.0', error: { code: -32603, message: err.message } });
    }
  };

  // One-Click All-in-One Production Release Bundling
  const handleDownloadProductionRelease = async () => {
    setIsPackagingProduction(true);
    try {
      const zip = new JSZip();
      const baseName = bundle.root || 'okf-knowledge-base';

      // 1. .okf/ concept files
      const okfFolder = zip.folder('.okf');
      for (const c of concepts) {
        const content = `---\ntype: ${c.metadata?.type || 'concept'}\ntitle: "${c.metadata?.title || c.id}"\ndescription: "${c.metadata?.description || ''}"\nstatus: ${c.metadata?.status || 'stable'}\ntags: ${JSON.stringify(c.metadata?.tags || [])}\n---\n\n${c.body}`;
        okfFolder?.file(`${c.id || c.path}.md`, content);
      }
      okfFolder?.file('INDEX.md', `# ${baseName} Manifest\n\nTotal verified concepts: ${concepts.length}\n`);

      // 2. .github/workflows/okf-lint.yml
      const ghFolder = zip.folder('.github')?.folder('workflows');
      ghFolder?.file('okf-lint.yml', getGitHubActionsWorkflowContent());

      // 3. ecosystem connectors
      const ecoFolder = zip.folder('connectors');
      for (const snip of ecosystemSnippets) {
        ecoFolder?.file(snip.filename, snip.code);
      }

      // 4. exports/ multi-formats & certificate
      const exportFolder = zip.folder('exports');
      const allExports = generateAllMultiFormatExports(bundle);
      exportFolder?.file('knowledge-graph.ttl', allExports.turtleRdf);
      exportFolder?.file('knowledge-graph.jsonld', allExports.jsonLd);
      exportFolder?.file('mcp-tools.json', allExports.mcpServerSchema);
      exportFolder?.file('obsidian-index.md', allExports.obsidianIndexMarkdown);

      const cert = generateConformanceCertificate(bundle);
      exportFolder?.file('certificate.json', JSON.stringify(cert, null, 2));

      // 5. Root README.md
      const readme = `# ${baseName} - OKF Production Release\n\nVerified Open Knowledge Format bundle generated with @okf/cli.\n\n## Quickstart\n\`\`\`bash\n# Verify repository integrity\nnpx okf check --strict\n\n# Query graph\nnpx okf query "architecture"\n\`\`\`\n\nIncludes native connectors for LangChain, LlamaIndex, Claude Desktop MCP, and CrewAI.\n`;
      zip.file('README.md', readme);

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}-production-release.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to create production zip:', err);
    } finally {
      setIsPackagingProduction(false);
    }
  };

  const activeAst: OkfDocumentAST | null = useMemo(() => {
    if (!concepts[selectedAstConceptIndex]) return null;
    const c = concepts[selectedAstConceptIndex];
    const fullContent = `---\ntype: ${c.metadata?.type || 'concept'}\ntitle: "${c.metadata?.title || c.id}"\ndescription: "${c.metadata?.description || ''}"\nstatus: ${c.metadata?.status || 'stable'}\n---\n\n${c.body}`;
    return parseOkfDocument(fullContent, c.path);
  }, [concepts, selectedAstConceptIndex]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRunCli = (cmdToRun?: string) => {
    const cmd = (cmdToRun || cliInput).trim();
    if (!cmd) return;

    const filesMap = new Map<string, string>();
    filesMap.set('current.md', currentMarkdown);
    filesMap.set('CLAUDE.md', currentMarkdown);
    for (const c of concepts) {
      filesMap.set(
        c.path || `${c.id}.md`,
        c.body ? `---\n${JSON.stringify(c.metadata, null, 2)}\n---\n\n${c.body}` : c.body || ''
      );
    }

    const result = executeOkfCliCommand(cmd, {
      cwd: '/workspace',
      files: filesMap,
      bundle,
    });

    setTerminalHistory((prev) => [...prev, result]);
    setCliInput('');
  };

  useEffect(() => {
    if (activeTool === 'cli') {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalHistory, activeTool]);

  const handleDownloadZip = async () => {
    const zip = new JSZip();
    const okfFolder = zip.folder('.okf');
    if (!okfFolder) return;

    okfFolder.file('index.md', sliceResult.indexFile.content);

    for (const file of sliceResult.files) {
      okfFolder.file(file.path.replace(/^\.okf\//, ''), file.content);
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `okf-bundle-${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadSlicedIntoApp = () => {
    if (!onApplyNewBundle) return;
    const combinedMarkdown = [
      sliceResult.indexFile.content,
      ...sliceResult.files.map((f) => f.content),
    ].join('\n\n---\n\n');
    onApplyNewBundle(combinedMarkdown);
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Top Banner */}
      <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 rounded-xl text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold tracking-wide uppercase">
                @okf/cli & Developer Workbench
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Phase 3 CLI Engine Native
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Zero-dependency command-line interface (<code className="text-indigo-300 font-mono">npx okf</code>), Graph-RAG neighborhood traversal, CI lint workflows, and AST inspection.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-300 font-mono bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800 flex items-center gap-1.5">
            <Network className="w-3.5 h-3.5 text-indigo-400" />
            <span>{knowledgeGraph.metrics.totalNodes} Nodes, {knowledgeGraph.metrics.totalEdges} Edges</span>
          </span>
          <span className="text-xs text-slate-300 font-mono bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Health: {validationReport.score}/100</span>
          </span>
        </div>
      </div>

      {/* Tool Selector Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTool('cli')}
          className={`py-2 px-3.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer whitespace-nowrap ${
            activeTool === 'cli'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Interactive CLI Runner</span>
          <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono bg-indigo-500 text-white">
            npx okf
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTool('graph-rag')}
          className={`py-2 px-3.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer whitespace-nowrap ${
            activeTool === 'graph-rag'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Network className="w-3.5 h-3.5" />
          <span>Graph-RAG Subgraph Engine</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTool('connectors')}
          className={`py-2 px-3.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer whitespace-nowrap ${
            activeTool === 'connectors'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>Ecosystem Connectors & Release</span>
          <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono bg-emerald-500 text-white">
            Phase 4
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTool('slicer')}
          className={`py-2 px-3.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer whitespace-nowrap ${
            activeTool === 'slicer'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Scissors className="w-3.5 h-3.5" />
          <span>Monolithic Slicer & Decomposer</span>
          <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono bg-indigo-500 text-white">
            {sliceResult.totalFiles} files
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTool('validator')}
          className={`py-2 px-3.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer whitespace-nowrap ${
            activeTool === 'validator'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Integrity & Link Auditor</span>
          {validationReport.errors.length > 0 ? (
            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono bg-rose-500 text-white">
              {validationReport.errors.length} err
            </span>
          ) : (
            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono bg-emerald-500 text-white">
              pass
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTool('ast')}
          className={`py-2 px-3.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer whitespace-nowrap ${
            activeTool === 'ast'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>AST & Triplestore Inspector</span>
        </button>
      </div>

      {/* TOOL 0: INTERACTIVE CLI RUNNER (PHASE 3) */}
      {activeTool === 'cli' && (
        <div className="flex flex-col gap-4">
          {/* Quick Presets Bar */}
          <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs flex items-center justify-between gap-3 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 shrink-0">
              <Terminal className="w-4 h-4 text-indigo-600" />
              <span>CLI Presets:</span>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => {
                  setCliInput('npx okf check --strict');
                  handleRunCli('npx okf check --strict');
                }}
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 text-xs font-mono font-medium transition cursor-pointer whitespace-nowrap border border-slate-200/80"
              >
                npx okf check --strict
              </button>

              <button
                type="button"
                onClick={() => {
                  setCliInput('npx okf init .okf');
                  handleRunCli('npx okf init .okf');
                }}
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 text-xs font-mono font-medium transition cursor-pointer whitespace-nowrap border border-slate-200/80"
              >
                npx okf init
              </button>

              <button
                type="button"
                onClick={() => {
                  setCliInput('npx okf split CLAUDE.md');
                  handleRunCli('npx okf split CLAUDE.md');
                }}
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 text-xs font-mono font-medium transition cursor-pointer whitespace-nowrap border border-slate-200/80"
              >
                npx okf split
              </button>

              <button
                type="button"
                onClick={() => {
                  setCliInput('npx okf export --format=turtle');
                  handleRunCli('npx okf export --format=turtle');
                }}
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 text-xs font-mono font-medium transition cursor-pointer whitespace-nowrap border border-slate-200/80"
              >
                npx okf export --format=turtle
              </button>

              <button
                type="button"
                onClick={() => {
                  setCliInput('npx okf query "architecture"');
                  handleRunCli('npx okf query "architecture"');
                }}
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 text-xs font-mono font-medium transition cursor-pointer whitespace-nowrap border border-slate-200/80"
              >
                npx okf query
              </button>

              <button
                type="button"
                onClick={() => {
                  setCliInput('npx okf ci-setup');
                  handleRunCli('npx okf ci-setup');
                }}
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 text-xs font-mono font-medium transition cursor-pointer whitespace-nowrap border border-slate-200/80"
              >
                npx okf ci-setup
              </button>

              <button
                type="button"
                onClick={() => {
                  setCliInput('npx okf skill-slice runbook.md --name=cluster-failover');
                  handleRunCli('npx okf skill-slice runbook.md --name=cluster-failover');
                }}
                className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-mono font-bold transition cursor-pointer whitespace-nowrap border border-indigo-200"
              >
                npx okf skill-slice
              </button>

              <button
                type="button"
                onClick={() => {
                  setCliInput('npx okf skill-audit runbook.md');
                  handleRunCli('npx okf skill-audit runbook.md');
                }}
                className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-mono font-bold transition cursor-pointer whitespace-nowrap border border-indigo-200"
              >
                npx okf skill-audit
              </button>
            </div>
          </div>

          {/* Terminal Window */}
          <div className="flex flex-col bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-md">
            {/* Terminal Header */}
            <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                </div>
                <span className="font-mono text-slate-300 font-bold ml-2">@okf/cli v1.5.0 — bash</span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setTerminalHistory([])}
                  className="hover:text-slate-200 transition cursor-pointer font-mono"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const allText = terminalHistory
                      .map((h) => `$ ${h.command}\n${h.stdout.join('\n')}\n${h.stderr.join('\n')}`)
                      .join('\n\n');
                    copyToClipboard(allText, 'term-all');
                  }}
                  className="hover:text-slate-200 transition flex items-center gap-1 cursor-pointer font-mono"
                >
                  {copiedId === 'term-all' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>Copy Log</span>
                </button>
              </div>
            </div>

            {/* Terminal Body */}
            <div className="p-4 max-h-[460px] min-h-[300px] overflow-y-auto font-mono text-xs text-slate-200 flex flex-col gap-3">
              {terminalHistory.map((item, idx) => (
                <div key={idx} className="flex flex-col gap-1 border-b border-slate-900/60 pb-3 last:border-b-0">
                  <div className="flex items-center justify-between text-indigo-400 font-bold">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400">user@workspace:~$</span>
                      <span className="text-white">{item.command}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-normal">
                      {item.executionTimeMs}ms (exit: {item.exitCode})
                    </span>
                  </div>

                  {item.stdout.length > 0 && (
                    <div className="text-slate-300 whitespace-pre-wrap leading-relaxed">
                      {item.stdout.map((line, lIdx) => {
                        // Basic ANSI color renderer
                        let cleanLine = line
                          .replace(/\x1b\[1;34m/g, '')
                          .replace(/\x1b\[1;32m/g, '')
                          .replace(/\x1b\[1;31m/g, '')
                          .replace(/\x1b\[1;33m/g, '')
                          .replace(/\x1b\[32m/g, '')
                          .replace(/\x1b\[31m/g, '')
                          .replace(/\x1b\[33m/g, '')
                          .replace(/\x1b\[36m/g, '')
                          .replace(/\x1b\[90m/g, '')
                          .replace(/\x1b\[1m/g, '')
                          .replace(/\x1b\[0m/g, '');

                        const isError = line.includes('ERROR') || line.includes('✖');
                        const isWarn = line.includes('WARN') || line.includes('▲');
                        const isPass = line.includes('PASS') || line.includes('SUCCESS') || line.includes('✔');

                        return (
                          <div
                            key={lIdx}
                            className={
                              isError
                                ? 'text-rose-400'
                                : isWarn
                                ? 'text-amber-300'
                                : isPass
                                ? 'text-emerald-400'
                                : 'text-slate-300'
                            }
                          >
                            {cleanLine}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {item.stderr.length > 0 && (
                    <div className="text-rose-400 whitespace-pre-wrap leading-relaxed">
                      {item.stderr.map((line, lIdx) => (
                        <div key={lIdx}>{line.replace(/\x1b\[[0-9;]*m/g, '')}</div>
                      ))}
                    </div>
                  )}

                  {item.filesCreated && item.filesCreated.length > 0 && (
                    <div className="p-2 bg-slate-900/80 rounded border border-slate-800 text-[11px] flex flex-col gap-1 mt-1">
                      <span className="text-indigo-400 font-bold">Created Workspace Artifacts:</span>
                      {item.filesCreated.map((fc, fIdx) => (
                        <div key={fIdx} className="flex items-center justify-between text-slate-400">
                          <span>{fc.path}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(fc.content, `fc-${fIdx}`)}
                            className="text-xs text-indigo-400 hover:underline cursor-pointer"
                          >
                            {copiedId === `fc-${fIdx}` ? 'Copied!' : 'Copy File'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div ref={terminalEndRef} />
            </div>

            {/* Terminal Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleRunCli();
              }}
              className="p-2.5 bg-slate-900 border-t border-slate-800 flex items-center gap-2"
            >
              <span className="text-emerald-400 font-mono text-xs pl-2 font-bold">$</span>
              <input
                type="text"
                value={cliInput}
                onChange={(e) => setCliInput(e.target.value)}
                placeholder="Enter OKF command (e.g. npx okf check --strict)..."
                className="flex-1 bg-transparent border-none text-white font-mono text-xs focus:outline-none placeholder:text-slate-600"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>Execute</span>
              </button>
            </form>
          </div>

          {/* GitHub Actions CI Setup Card */}
          <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-slate-100 text-slate-800 border border-slate-200">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">
                  Continuous Integration Enforcement (.github/workflows/okf-lint.yml)
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Block PRs with broken [[wikilinks]], circular dependencies, or unverified claims automatically.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => copyToClipboard(getGitHubActionsWorkflowContent(), 'gha-copy')}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                {copiedId === 'gha-copy' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Copy YAML</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const blob = new Blob([getGitHubActionsWorkflowContent()], { type: 'text/yaml' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'okf-lint.yml';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Workflow</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOOL 1: GRAPH-RAG SUBGRAPH ENGINE (PHASE 2) */}
      {activeTool === 'graph-rag' && (
        <div className="flex flex-col gap-4">
          {/* Query Bar and Tuners */}
          <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-bold text-slate-800">
                Graph-RAG Subgraph Query & Multi-Hop Expansion Test
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                value={ragQuery}
                onChange={(e) => setRagQuery(e.target.value)}
                placeholder="Enter query to test Graph-RAG neighborhood traversal..."
                className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 font-medium text-slate-800"
              />
              <button
                type="button"
                onClick={() => setRagQuery('What are the execution steps for database migration and its prerequisites?')}
                className="px-2.5 py-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition cursor-pointer whitespace-nowrap"
              >
                Sample Query
              </button>
            </div>

            {/* Retrieval Tuning Controls */}
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-2 border-t border-slate-100 text-xs">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Top-K Seeds</label>
                <select
                  value={topK}
                  onChange={(e) => setTopK(Number(e.target.value))}
                  className="p-1.5 rounded border border-slate-200 bg-white text-xs font-mono"
                >
                  <option value={1}>1 Seed</option>
                  <option value={2}>2 Seeds</option>
                  <option value={3}>3 Seeds</option>
                  <option value={5}>5 Seeds</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Expansion Hops</label>
                <select
                  value={maxHops}
                  onChange={(e) => setMaxHops(Number(e.target.value) as 0 | 1 | 2)}
                  className="p-1.5 rounded border border-slate-200 bg-white text-xs font-mono"
                >
                  <option value={0}>0 Hops (Flat RAG)</option>
                  <option value={1}>1 Hop (Direct Neighbors)</option>
                  <option value={2}>2 Hops (Extended Mesh)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Direction</label>
                <select
                  value={expansionDirection}
                  onChange={(e) => setExpansionDirection(e.target.value as any)}
                  className="p-1.5 rounded border border-slate-200 bg-white text-xs font-mono"
                >
                  <option value="bidirectional">Bidirectional</option>
                  <option value="upstream">Upstream (Prereqs)</option>
                  <option value="downstream">Downstream (Deps)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Hybrid Alpha ({hybridAlpha})</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={hybridAlpha}
                  onChange={(e) => setHybridAlpha(Number(e.target.value))}
                  className="accent-indigo-600 mt-1 cursor-pointer"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Trust Boost ({trustBoost}x)</label>
                <input
                  type="range"
                  min="1.0"
                  max="2.0"
                  step="0.1"
                  value={trustBoost}
                  onChange={(e) => setTrustBoost(Number(e.target.value))}
                  className="accent-indigo-600 mt-1 cursor-pointer"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Token Budget</label>
                <select
                  value={maxTokenBudget}
                  onChange={(e) => setMaxTokenBudget(Number(e.target.value))}
                  className="p-1.5 rounded border border-slate-200 bg-white text-xs font-mono"
                >
                  <option value={1500}>1,500 Tokens</option>
                  <option value={3000}>3,000 Tokens</option>
                  <option value={6000}>6,000 Tokens</option>
                </select>
              </div>
            </div>
          </div>

          {/* Results: Subgraph Breakdown + Grounded Prompt (Two Columns) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left: Retrieved Subgraph Nodes (5 cols) */}
            <div className="lg:col-span-5 flex flex-col gap-2 bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <GitFork className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-bold text-slate-800">
                    Retrieved Subgraph Nodes ({graphRagResult.allRetrievedNodes.length})
                  </span>
                </div>
                <span className="text-[10px] font-mono text-slate-500">
                  {graphRagResult.executionTimeMs}ms
                </span>
              </div>

              {graphRagResult.allRetrievedNodes.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No matching nodes found for this query. Try adjusting the query text.
                </div>
              ) : (
                <div className="flex flex-col gap-2 max-h-[420px] overflow-auto pr-1">
                  {graphRagResult.allRetrievedNodes.map((item, idx) => (
                    <div
                      key={item.node.id}
                      className={`p-3 rounded-lg border text-xs flex flex-col gap-1.5 transition ${
                        item.isSeed
                          ? 'bg-indigo-50/70 border-indigo-300 text-indigo-950'
                          : 'bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-bold">
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono uppercase ${
                            item.isSeed ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'
                          }`}>
                            {item.isSeed ? 'Seed' : `${item.hopDistance}-Hop`}
                          </span>
                          <span className="truncate">{item.node.title}</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500">
                          ~{item.node.estimatedTokens} tok
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-600 line-clamp-2">
                        {item.node.description || 'No description available.'}
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono pt-1 border-t border-slate-200/50">
                        <span className={`px-1.5 py-0.2 rounded ${
                          item.node.trustTier === 'human-reviewed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}>
                          [{item.node.trustTier}]
                        </span>
                        <span className="text-slate-500 truncate max-w-[200px]">
                          {item.relevanceReason}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Subgraph Edge Summary */}
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600 flex items-center justify-between font-mono">
                <span>Edges in Subgraph: {graphRagResult.subgraphEdges.length}</span>
                <span>Context Tokens: ~{graphRagResult.totalTokensUsed} / {graphRagResult.tokenBudget}</span>
              </div>
            </div>

            {/* Right: Synthesized LLM Grounding Context (7 cols) */}
            <div className="lg:col-span-7 flex flex-col gap-2 bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-bold text-slate-800">
                    Synthesized Grounding Context for LLM
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(graphRagResult.groundedPromptContext, 'rag-prompt')}
                  className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedId === 'rag-prompt' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>Copy Prompt Context</span>
                </button>
              </div>

              <div className="flex-1 max-h-[420px] overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-2">
                <HighlightedCodeBlock
                  value={graphRagResult.groundedPromptContext}
                  language="markdown"
                />
              </div>

              <div className="p-2 bg-indigo-50 border border-indigo-200 rounded-lg text-[11px] text-indigo-900 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>This formatted prompt context is dynamically fed to Gemini / Claude / MCP agents with exact upstream & downstream topology.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOOL 2: SLICER & DECOMPOSER */}
      {activeTool === 'slicer' && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left: Input Monolithic Document (5 cols) */}
            <div className="lg:col-span-5 flex flex-col gap-2 bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-bold text-slate-800">
                    Input Monolithic Markdown (CLAUDE.md / README.md)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMonolithicInput(currentMarkdown)}
                  className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  Reset to Current
                </button>
              </div>

              <textarea
                value={monolithicInput}
                onChange={(e) => setMonolithicInput(e.target.value)}
                rows={16}
                className="w-full p-3 font-mono text-xs text-slate-800 bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="# Project Knowledge..."
              />

              <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                <span>{monolithicInput.split('\n').length} lines</span>
                <span>{sliceResult.totalFiles} atomic concepts extracted</span>
              </div>
            </div>

            {/* Right: Sliced Preview & Files (7 cols) */}
            <div className="lg:col-span-7 flex flex-col gap-2 bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <FolderTree className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-bold text-slate-800">
                    Generated OKF Structure ({sliceResult.totalFiles + 1} Files)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadZip}
                    className="px-2.5 py-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    <span>Download .okf ZIP</span>
                  </button>

                  {onApplyNewBundle && (
                    <button
                      type="button"
                      onClick={handleLoadSlicedIntoApp}
                      className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Load into App</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Sliced File Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar border-b border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedSlicedIndex(-1)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-mono transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    selectedSlicedIndex === -1
                      ? 'bg-indigo-600 text-white font-bold'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5" />
                  <span>index.md</span>
                </button>

                {sliceResult.files.map((file, idx) => (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => setSelectedSlicedIndex(idx)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-mono transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                      selectedSlicedIndex === idx
                        ? 'bg-indigo-600 text-white font-bold'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>{file.filename}</span>
                    <span className="px-1 py-0.2 rounded text-[9px] font-sans uppercase font-bold bg-white/20">
                      {file.type}
                    </span>
                  </button>
                ))}
              </div>

              {/* Active File Content Viewer */}
              <div className="flex-1 max-h-[380px] overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-2">
                <HighlightedCodeBlock
                  value={
                    selectedSlicedIndex === -1
                      ? sliceResult.indexFile.content
                      : sliceResult.files[selectedSlicedIndex]?.content || ''
                  }
                  language="markdown"
                />
              </div>

              {/* Footer Stats */}
              <div className="flex items-center justify-between text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-200">
                <span className="flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>{sliceResult.generatedWikilinksCount} Bidirectional Wikilinks Auto-Weaved</span>
                </span>
                <span>Decomposed in {sliceResult.executionTimeMs}ms</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOOL 3: INTEGRITY & LINK AUDITOR */}
      {activeTool === 'validator' && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Conformance Score</div>
                <div className="text-xl font-bold text-slate-900 mt-0.5">{validationReport.score} / 100</div>
              </div>
              <div className={`p-2.5 rounded-xl ${validationReport.isValid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {validationReport.isValid ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
              </div>
            </div>

            <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Broken Links</div>
                <div className={`text-xl font-bold mt-0.5 ${validationReport.brokenLinks.length > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                  {validationReport.brokenLinks.length}
                </div>
              </div>
              <div className={`p-2.5 rounded-xl ${validationReport.brokenLinks.length > 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                <Link2 className="w-5 h-5" />
              </div>
            </div>

            <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Dependency Cycles</div>
                <div className={`text-xl font-bold mt-0.5 ${validationReport.cycles.length > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                  {validationReport.cycles.length}
                </div>
              </div>
              <div className={`p-2.5 rounded-xl ${validationReport.cycles.length > 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                <RefreshCw className="w-5 h-5" />
              </div>
            </div>

            <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Human-Reviewed</div>
                <div className="text-xl font-bold text-slate-900 mt-0.5">
                  {validationReport.trustSummary.ratioHumanReviewed}%
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-indigo-100 text-indigo-700">
                <ShieldCheck className="w-5 h-5" />
              </div>
            </div>
          </div>

          <div className="p-3 bg-slate-900 text-white rounded-xl flex items-center justify-between font-mono text-xs border border-slate-800">
            <div className="flex items-center gap-2 text-indigo-300">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span>Run in CI/CD: <strong className="text-white">npx okf check --strict</strong></span>
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard('npx okf check --strict', 'cli')}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] flex items-center gap-1.5 cursor-pointer"
            >
              {copiedId === 'cli' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>Copy Command</span>
            </button>
          </div>

          <div className="flex flex-col gap-2 bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-bold text-slate-800">
                Audit Issues ({validationReport.issues.length})
              </span>
              <span className="text-[11px] text-slate-500">
                {validationReport.errors.length} errors, {validationReport.warnings.length} warnings
              </span>
            </div>

            {validationReport.issues.length === 0 ? (
              <div className="p-8 text-center flex flex-col items-center justify-center gap-2">
                <div className="p-3 rounded-full bg-emerald-100 text-emerald-700">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div className="text-xs font-bold text-slate-800">All Conformance & Link Checks Passed!</div>
                <div className="text-[11px] text-slate-500">No broken wikilinks, circular loops, or missing frontmatter fields detected.</div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-[380px] overflow-auto">
                {validationReport.issues.map((issue) => (
                  <div
                    key={issue.id}
                    className={`p-3 rounded-lg border text-xs flex flex-col gap-1.5 ${
                      issue.severity === 'error'
                        ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                        : issue.severity === 'warning'
                        ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                        : 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-mono font-bold">
                        {issue.severity === 'error' ? (
                          <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        )}
                        <span>{issue.code}</span>
                        {issue.filePath && (
                          <span className="text-[11px] font-normal text-slate-500">
                            in {issue.filePath}{issue.line ? `:${issue.line}` : ''}
                          </span>
                        )}
                      </div>
                      <span className="px-1.5 py-0.2 rounded text-[9px] uppercase font-bold bg-white/60">
                        {issue.severity}
                      </span>
                    </div>

                    <div className="text-xs">{issue.message}</div>

                    {issue.fixSuggestion && (
                      <div className="text-[11px] text-slate-600 bg-white/70 p-1.5 rounded border border-slate-200/50 flex items-center gap-1.5 mt-0.5">
                        <Sparkles className="w-3 h-3 text-indigo-600 shrink-0" />
                        <span><strong>Suggestion:</strong> {issue.fixSuggestion}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TOOL 4: AST & TRIPLESTORE INSPECTOR */}
      {activeTool === 'ast' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-4 flex flex-col gap-2 bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <span className="text-xs font-bold text-slate-800 border-b border-slate-100 pb-2">
              Select Concept for AST & Triples
            </span>
            <div className="flex flex-col gap-1 overflow-auto max-h-[380px]">
              {concepts.map((c, idx) => (
                <button
                  key={c.id || idx}
                  type="button"
                  onClick={() => setSelectedAstConceptIndex(idx)}
                  className={`p-2 rounded-lg text-left text-xs transition cursor-pointer flex flex-col gap-0.5 ${
                    selectedAstConceptIndex === idx
                      ? 'bg-indigo-50 border border-indigo-500 text-indigo-900 font-bold'
                      : 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="truncate">{c.metadata?.title || c.path || c.id}</span>
                  <span className="text-[10px] text-slate-400 font-mono">{c.path}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-8 flex flex-col gap-2 bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-bold text-slate-800">
                Parsed AST Hierarchy ({activeAst?.id})
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard(JSON.stringify(activeAst, null, 2), 'ast')}
                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs flex items-center gap-1.5 cursor-pointer"
              >
                {copiedId === 'ast' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>Copy AST JSON</span>
              </button>
            </div>

            <div className="flex-1 max-h-[380px] overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-2">
              <HighlightedCodeBlock
                value={JSON.stringify(activeAst, null, 2)}
                language="json"
              />
            </div>
          </div>
        </div>
      )}

      {/* TOOL 5: AGENT ECOSYSTEM CONNECTORS & PRODUCTION RELEASE (PHASE 4) */}
      {activeTool === 'connectors' && (
        <div className="flex flex-col gap-4">
          {/* Top Action Bar */}
          <div className="p-4 bg-gradient-to-r from-emerald-950 via-slate-900 to-indigo-950 border border-emerald-800/40 rounded-xl text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <PackageCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold tracking-wide">
                    Agent Ecosystem SDKs & Production Package
                  </h4>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Phase 4 Ready
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  Production-grade connectors for LangChain, LlamaIndex, Claude Desktop MCP, AutoGen, and CrewAI swarms.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDownloadProductionRelease}
              disabled={isPackagingProduction}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer shrink-0"
            >
              {isPackagingProduction ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>{isPackagingProduction ? 'Packaging Bundle...' : '1-Click All-in-One Production ZIP'}</span>
            </button>
          </div>

          {/* Connectors Layout Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left Snippet Selector */}
            <div className="lg:col-span-4 flex flex-col gap-2 bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <span className="text-xs font-bold text-slate-800 border-b border-slate-100 pb-2">
                Agent SDK Connectors
              </span>
              <div className="flex flex-col gap-1.5">
                {ecosystemSnippets.map((snip, idx) => (
                  <button
                    key={snip.name}
                    type="button"
                    onClick={() => setSelectedSnippetIdx(idx)}
                    className={`p-3 rounded-lg text-left transition cursor-pointer flex flex-col gap-1 border ${
                      selectedSnippetIdx === idx
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-950 font-bold'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">{snip.name}</span>
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono uppercase bg-white border border-slate-200 text-slate-600">
                        {snip.language}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500 font-normal line-clamp-2 leading-tight">
                      {snip.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Right Snippet Viewer */}
            <div className="lg:col-span-8 flex flex-col gap-2 bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-bold font-mono text-slate-800">
                    {activeSnippet.filename}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(activeSnippet.code, `snip-${selectedSnippetIdx}`)}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedId === `snip-${selectedSnippetIdx}` ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedId === `snip-${selectedSnippetIdx}` ? 'Copied' : 'Copy Code'}</span>
                  </button>
                </div>
              </div>

              <div className="flex-1 max-h-[380px] overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-2">
                <HighlightedCodeBlock
                  value={activeSnippet.code}
                  language={activeSnippet.language === 'json' ? 'json' : activeSnippet.language === 'python' ? 'python' : 'typescript'}
                />
              </div>
            </div>
          </div>

          {/* MCP JSON-RPC Live Protocol Test Bench */}
          <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-slate-800">
                  Model Context Protocol (MCP JSON-RPC 2.0) Live Protocol Tester
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-100 text-emerald-800 font-bold">
                  tools/call
                </span>
              </div>
              <span className="text-[11px] text-slate-500 font-mono">
                Endpoint: /api/mcp
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-4 flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-700">Tool Name</label>
                <select
                  value={mcpToolCall}
                  onChange={(e) => setMcpToolCall(e.target.value as any)}
                  className="p-2 border border-slate-300 rounded-lg text-xs font-mono bg-slate-50"
                >
                  <option value="okf_graph_rag_query">okf_graph_rag_query (Multi-hop RAG)</option>
                  <option value="okf_search_concepts">okf_search_concepts (Keyword & Metadata)</option>
                  <option value="okf_sparql_query">okf_sparql_query (Semantic W3C Triples)</option>
                </select>
              </div>

              <div className="md:col-span-6 flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-700">Argument (Query)</label>
                <input
                  type="text"
                  value={mcpQueryInput}
                  onChange={(e) => setMcpQueryInput(e.target.value)}
                  placeholder="Enter query argument..."
                  className="p-2 border border-slate-300 rounded-lg text-xs font-mono"
                />
              </div>

              <div className="md:col-span-2">
                <button
                  type="button"
                  onClick={handleExecuteMcpTool}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Execute</span>
                </button>
              </div>
            </div>

            {mcpLiveResponse && (
              <div className="mt-2 flex flex-col gap-1">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                  <span>JSON-RPC Response:</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(JSON.stringify(mcpLiveResponse, null, 2), 'mcp-resp')}
                    className="text-indigo-600 hover:underline cursor-pointer flex items-center gap-1"
                  >
                    {copiedId === 'mcp-resp' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>Copy JSON</span>
                  </button>
                </div>
                <div className="max-h-[220px] overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-2">
                  <HighlightedCodeBlock
                    value={JSON.stringify(mcpLiveResponse, null, 2)}
                    language="json"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
