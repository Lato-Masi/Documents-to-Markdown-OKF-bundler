import React, { useState, useMemo } from 'react';
import type { OkfConcept, OkfMetadata } from 'okf-ts';
import type { SemanticGraphResult } from '../lib/okfSemanticGraphEngine';
import {
  queryKnowledgeGraphRAG,
  type GraphAugmentedContext,
  type RAGSearchMatch,
} from '../lib/okfRagEngine';
import HighlightedCodeBlock from './HighlightedCodeBlock';
import {
  Sparkles,
  Bot,
  Search,
  Send,
  RefreshCw,
  Copy,
  Check,
  Download,
  Terminal,
  Share2,
  ChevronRight,
  GitBranch,
  FileText,
  Sliders,
  Layers,
  ArrowRight,
} from 'lucide-react';

interface OKFRagPlaygroundProps {
  concepts: OkfConcept<OkfMetadata>[];
  semanticGraph?: SemanticGraphResult;
}

export default function OKFRagPlayground({
  concepts,
  semanticGraph,
}: OKFRagPlaygroundProps) {
  const [searchQuery, setSearchQuery] = useState('How does authentication and authorization work?');
  const [expandHops, setExpandHops] = useState(true);
  const [maxHops, setMaxHops] = useState(2);
  const [topK, setTopK] = useState(3);
  const [trustTierFilter, setTrustTierFilter] = useState<
    'all' | 'human-reviewed' | 'machine-confirmed'
  >('all');

  const [agentResponse, setAgentResponse] = useState('');
  const [isAgentLoading, setIsAgentLoading] = useState(false);
  const [agentError, setAgentError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  // Compute Hybrid Vector + Graph Neighborhood Context
  const ragContext: GraphAugmentedContext = useMemo(() => {
    if (!searchQuery.trim()) {
      return {
        query: '',
        primaryMatches: [],
        expandedSubGraphNodes: [],
        expandedSubGraphEdges: [],
        assembledContextMarkdown: 'Please enter a search query above.',
        totalTokensEstimate: 0,
      };
    }
    return queryKnowledgeGraphRAG(searchQuery, concepts, semanticGraph, {
      topK,
      expandGraphHops: expandHops,
      maxHops,
      trustTierFilter,
    });
  }, [searchQuery, concepts, semanticGraph, topK, expandHops, maxHops, trustTierFilter]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleExecuteGroundedAgent = async () => {
    if (!searchQuery.trim()) return;

    setIsAgentLoading(true);
    setAgentError('');
    setAgentResponse('');

    try {
      const response = await fetch('/api/agent/okf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'qa',
          okfContent: ragContext.assembledContextMarkdown,
          userQuery: searchQuery,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with status ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No readable response stream received.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let streamedText = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        streamedText += chunk;
        setAgentResponse(streamedText);
      }
    } catch (err: any) {
      console.error('Agent RAG execution failed:', err);
      setAgentError(err.message || 'Failed to query Gemini OKF Agent.');
    } finally {
      setIsAgentLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Top Banner */}
      <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 rounded-xl text-white shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-white tracking-wide uppercase">
              Graph-Augmented RAG & Agent Sub-Graph Context Retriever
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Vector Cosine + Graph Hops
            </span>
          </div>
          <p className="text-xs text-slate-300">
            Performs hybrid vector TF-IDF retrieval + directed graph traversal (1-hop / 2-hop prerequisite expansion) to assemble high-fidelity context for AI Agents.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800 text-xs font-mono text-indigo-300">
            ~{ragContext.totalTokensEstimate} Tokens Assembled
          </span>
        </div>
      </div>

      {/* Query Bar & Controls */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ask a question or search for concepts across the knowledge graph..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans shadow-2xs"
            />
          </div>

          <button
            type="button"
            onClick={handleExecuteGroundedAgent}
            disabled={isAgentLoading || !searchQuery.trim()}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer disabled:bg-slate-300 shadow-2xs shrink-0"
          >
            {isAgentLoading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Retrieving & Answering...</span>
              </>
            ) : (
              <>
                <Bot className="w-4 h-4" />
                <span>Run Grounded RAG Agent</span>
              </>
            )}
          </button>
        </div>

        {/* Filters & RAG Hyperparameters */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 text-xs text-slate-600">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-700">Top-K Direct Hits:</span>
              <select
                value={topK}
                onChange={(e) => setTopK(parseInt(e.target.value))}
                className="px-2 py-0.5 rounded bg-white border border-slate-300 text-xs font-mono"
              >
                <option value="1">Top 1</option>
                <option value="2">Top 2</option>
                <option value="3">Top 3</option>
                <option value="5">Top 5</option>
              </select>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={expandHops}
                onChange={(e) => setExpandHops(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600"
              />
              <span className="font-semibold text-slate-700">Expand Graph Neighbors (Hops)</span>
            </label>

            {expandHops && (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Max Hops:</span>
                <select
                  value={maxHops}
                  onChange={(e) => setMaxHops(parseInt(e.target.value))}
                  className="px-2 py-0.5 rounded bg-white border border-slate-300 text-xs font-mono"
                >
                  <option value="1">1-Hop (Direct)</option>
                  <option value="2">2-Hop (Transitive)</option>
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Trust Filter:</span>
            <select
              value={trustTierFilter}
              onChange={(e) => setTrustTierFilter(e.target.value as any)}
              className="px-2 py-0.5 rounded bg-white border border-slate-300 text-xs font-mono"
            >
              <option value="all">All Trust Tiers</option>
              <option value="human-reviewed">Human-Reviewed Only</option>
              <option value="machine-confirmed">Machine-Confirmed Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Grid: Left Column = RAG Subgraph Inspector, Right Column = Agent Output */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Subgraph Retrieval Inspector (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 flex flex-col gap-2.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-indigo-400" />
                Retrieved Subgraph Nodes ({ragContext.expandedSubGraphNodes.length})
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {ragContext.primaryMatches.length} Direct • {ragContext.expandedSubGraphNodes.length - ragContext.primaryMatches.length} Expanded
              </span>
            </div>

            {/* Match Cards */}
            <div className="flex flex-col gap-2 max-h-[460px] overflow-y-auto pr-1">
              {ragContext.primaryMatches.map((m, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg bg-slate-950 border border-indigo-900/60 flex flex-col gap-1 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white truncate max-w-[200px]">
                      {m.concept.metadata.title}
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300">
                      {Math.round(m.score * 100)}% Sim
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 truncate">
                    {m.concept.path} ({m.concept.metadata.type})
                  </span>
                  <p className="text-[11px] text-slate-300 line-clamp-2 italic">
                    {m.concept.metadata.description || m.concept.body.slice(0, 100)}
                  </p>
                </div>
              ))}

              {/* Traversed Edges */}
              {ragContext.expandedSubGraphEdges.length > 0 && (
                <div className="pt-2 border-t border-slate-800 flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Graph Traversal Edges ({ragContext.expandedSubGraphEdges.length}):
                  </span>
                  {ragContext.expandedSubGraphEdges.map((e, idx) => (
                    <div
                      key={idx}
                      className="p-1.5 rounded bg-slate-950/70 border border-slate-800/80 text-[11px] text-slate-300 flex items-center justify-between gap-1 truncate"
                    >
                      <span className="truncate text-indigo-300 font-mono text-[10px]">{e.from}</span>
                      <span className="text-[9px] font-mono px-1 rounded bg-slate-800 text-amber-300 shrink-0">
                        {e.kind}
                      </span>
                      <span className="truncate text-emerald-300 font-mono text-[10px]">{e.to}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: AI Agent Answer & Grounding Stream (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-3">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 flex flex-col gap-3 min-h-[420px]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold text-slate-200">
                  Grounded Knowledge Agent Response
                </span>
                {isAgentLoading && (
                  <span className="text-[10px] text-amber-400 font-mono animate-pulse">
                    Generating with Graph Context...
                  </span>
                )}
              </div>

              {agentResponse && !isAgentLoading && (
                <button
                  type="button"
                  onClick={() => copyToClipboard(agentResponse, 'agent-rag')}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1 transition cursor-pointer border border-slate-700"
                >
                  {copied === 'agent-rag' ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-slate-400" />
                      <span>Copy Answer</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {agentError && (
              <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-200 text-xs rounded-lg font-mono">
                ⚠️ {agentError}
              </div>
            )}

            {agentResponse ? (
              <div className="overflow-y-auto max-h-[460px]">
                <HighlightedCodeBlock value={agentResponse} language="markdown" />
              </div>
            ) : isAgentLoading ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3 text-center">
                <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
                <p className="text-xs">Traversing knowledge graph and formulating citation-grounded response...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-slate-500 gap-2 text-center p-4">
                <Bot className="w-10 h-10 opacity-40 text-indigo-400" />
                <p className="text-xs">
                  Click <strong>"Run Grounded RAG Agent"</strong> to execute Gemini AI reasoning over the retrieved sub-graph and dependencies.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
