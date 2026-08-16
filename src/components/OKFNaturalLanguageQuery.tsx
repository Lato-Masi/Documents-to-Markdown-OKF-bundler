import React, { useState, useMemo, useEffect } from 'react';
import type { OkfConcept, OkfMetadata, OkfBundle } from 'okf-ts';
import type { SemanticGraphResult } from '../lib/okfSemanticGraphEngine';
import { queryKnowledgeGraphRAG, type GraphAugmentedContext } from '../lib/okfRagEngine';
import { deriveTrustTier } from '../lib/okfKnowledgeEngine';
import HighlightedCodeBlock from './HighlightedCodeBlock';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Search,
  Sparkles,
  MessageSquare,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Layers,
  GitBranch,
  Copy,
  Check,
  Download,
  RefreshCw,
  Send,
  HelpCircle,
  Lightbulb,
  ShieldCheck,
  Table as TableIcon,
  ChevronRight,
  ExternalLink,
  History,
  FileText,
  BadgeAlert,
  ArrowRight,
  Maximize2,
  X,
  Share2,
} from 'lucide-react';

interface OKFNaturalLanguageQueryProps {
  bundle: OkfBundle;
  concepts: OkfConcept<OkfMetadata>[];
  semanticGraph?: SemanticGraphResult;
  onNavigateToConcept?: (conceptPath: string) => void;
}

type HumanQueryMode = 'comprehensive' | 'procedure' | 'prerequisites' | 'tables' | 'trust-audit';

export default function OKFNaturalLanguageQuery({
  bundle,
  concepts,
  semanticGraph,
  onNavigateToConcept,
}: OKFNaturalLanguageQueryProps) {
  const [query, setQuery] = useState('');
  const [queryMode, setQueryMode] = useState<HumanQueryMode>('comprehensive');
  const [trustFilter, setTrustFilter] = useState<'all' | 'human-reviewed'>('all');
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedConceptPreview, setSelectedConceptPreview] = useState<OkfConcept<OkfMetadata> | null>(null);

  // Query History
  const [queryHistory, setQueryHistory] = useState<
    Array<{
      id: string;
      query: string;
      mode: HumanQueryMode;
      timestamp: string;
      answerSummary: string;
    }>
  >([]);

  // Dynamically generate preset questions based on bundle concepts
  const presetQuestions = useMemo(() => {
    const questions: Array<{ text: string; mode: HumanQueryMode; icon: any; desc: string }> = [];

    const procedureConcept = concepts.find(
      (c) => c.metadata?.type === 'procedure' || c.path?.includes('procedure')
    );
    if (procedureConcept) {
      questions.push({
        text: `What are the step-by-step procedures for ${procedureConcept.metadata?.title || 'this system'}?`,
        mode: 'procedure',
        icon: CheckCircle2,
        desc: 'Extracts actionable steps, prerequisites, and execution commands',
      });
    }

    const tableConcept = concepts.find(
      (c) => c.metadata?.type === 'table' || c.body.includes('|')
    );
    if (tableConcept) {
      questions.push({
        text: `Summarize all data models, schemas, and parameter tables`,
        mode: 'tables',
        icon: TableIcon,
        desc: 'Compares tabular specifications and key-value limits',
      });
    }

    questions.push({
      text: `Explain the core architecture overview and how key concepts interact`,
      mode: 'comprehensive',
      icon: Lightbulb,
      desc: 'Plain-English synthesis of the primary system components',
    });

    questions.push({
      text: `What prerequisites and dependency chains must be fulfilled first?`,
      mode: 'prerequisites',
      icon: GitBranch,
      desc: 'Traces directed upstream prerequisites and downstream dependents',
    });

    questions.push({
      text: `Audit all human-reviewed vs machine-confirmed claims and specifications`,
      mode: 'trust-audit',
      icon: ShieldCheck,
      desc: 'Evaluates veracity and verification sources across all nodes',
    });

    return questions;
  }, [concepts]);

  // Compute Hybrid Vector + Graph Neighborhood Context for the current query
  const ragContext: GraphAugmentedContext = useMemo(() => {
    if (!query.trim()) {
      return {
        query: '',
        primaryMatches: [],
        expandedSubGraphNodes: [],
        expandedSubGraphEdges: [],
        assembledContextMarkdown: '',
        totalTokensEstimate: 0,
      };
    }
    return queryKnowledgeGraphRAG(query, concepts, semanticGraph, {
      topK: 4,
      expandGraphHops: true,
      maxHops: 2,
      trustTierFilter: trustFilter,
    });
  }, [query, concepts, semanticGraph, trustFilter]);

  const handleRunNaturalLanguageQuery = async (queryText?: string, mode?: HumanQueryMode) => {
    const q = queryText || query;
    const m = mode || queryMode;
    if (!q.trim()) return;

    if (queryText) setQuery(queryText);
    if (mode) setQueryMode(mode);

    setIsLoading(true);
    setError(null);
    setAnswer('');

    // Formulate custom system prompting tailored to human query modes
    let modeInstruction = '';
    switch (m) {
      case 'procedure':
        modeInstruction = 'Focus on extracting and formatting step-by-step procedures, required prerequisites, validation checkpoints, and command-line actions in clear sequential order.';
        break;
      case 'prerequisites':
        modeInstruction = 'Focus on explaining the directed dependency graph, upstream prerequisites, why certain concepts must be understood before others, and potential blockers.';
        break;
      case 'tables':
        modeInstruction = 'Focus on extracting, structuring, and comparing tabular data schemas, parameter limits, quantitative values, and data relationships.';
        break;
      case 'trust-audit':
        modeInstruction = 'Focus on auditing claims with explicit citations to source files, highlighting which knowledge is [human-reviewed] vs [machine-confirmed], and flagging any unverified assumptions.';
        break;
      case 'comprehensive':
      default:
        modeInstruction = 'Provide a clear, engaging, and comprehensive plain-English explanation with bold key terms, high-level summary, and bulleted details.';
        break;
    }

    try {
      const response = await fetch('/api/agent/okf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'qa',
          okfContent: ragContext.assembledContextMarkdown || `# Knowledge Base Concepts\n\n` + concepts.map(c => `### ${c.metadata?.title || c.path}\n${c.body}`).join('\n\n'),
          userQuery: `${q}\n\n[Human Query Mode Guidance: ${modeInstruction}]`,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with status ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response stream available');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        accumulatedText += chunk;
        setAnswer(accumulatedText);
      }

      // Add to query history
      setQueryHistory((prev) => [
        {
          id: Date.now().toString(),
          query: q,
          mode: m,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          answerSummary: accumulatedText.slice(0, 140) + '...',
        },
        ...prev.slice(0, 7),
      ]);
    } catch (err: any) {
      console.error('Human Query Error:', err);
      setError(err.message || 'Failed to query knowledge base.');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadAnswerReport = () => {
    if (!answer) return;
    const reportContent = `# Natural Language Query Report: ${bundle.root || 'Knowledge Base'}\n\n` +
      `**Question**: ${query}\n` +
      `**Query Mode**: ${queryMode}\n` +
      `**Timestamp**: ${new Date().toISOString()}\n\n` +
      `---\n\n` +
      `## Answer\n\n${answer}\n\n` +
      `---\n\n` +
      `## Cited OKF Concepts & Sources\n\n` +
      ragContext.primaryMatches.map(m => `- **[${m.concept.metadata?.type || 'concept'}] ${m.concept.metadata?.title || m.concept.path}** (Trust: ${deriveTrustTier(m.concept)}, Relevance: ${Math.round(m.score * 100)}%)\n  *${m.concept.metadata?.description || ''}*`).join('\n') +
      `\n\nGenerated by OKF Human Natural Language Assistant.`;

    const blob = new Blob([reportContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `okf-query-answer-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* Header Banner */}
      <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 rounded-xl text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold tracking-wide uppercase">
                Natural Language Knowledge Assistant
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Human-Centric Interface
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Ask questions in plain conversational English. The assistant performs hybrid vector search + directed dependency graph traversal to provide grounded, citation-backed answers.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-300 font-mono bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800 flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
            <span>{concepts.length} Concept Documents</span>
          </span>
        </div>
      </div>

      {/* Query Formulation Box */}
      <div className="p-4 bg-white border border-slate-200 rounded-xl flex flex-col gap-4 shadow-xs">
        {/* Mode Selector Tabs */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            Select Explanation Mode:
          </span>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setQueryMode('comprehensive')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                queryMode === 'comprehensive'
                  ? 'bg-indigo-600 text-white font-bold shadow-2xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Lightbulb className="w-3.5 h-3.5" />
              <span>Comprehensive Overview</span>
            </button>

            <button
              type="button"
              onClick={() => setQueryMode('procedure')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                queryMode === 'procedure'
                  ? 'bg-indigo-600 text-white font-bold shadow-2xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Step-by-Step Guide</span>
            </button>

            <button
              type="button"
              onClick={() => setQueryMode('prerequisites')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                queryMode === 'prerequisites'
                  ? 'bg-indigo-600 text-white font-bold shadow-2xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>Prerequisites & Blockers</span>
            </button>

            <button
              type="button"
              onClick={() => setQueryMode('tables')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                queryMode === 'tables'
                  ? 'bg-indigo-600 text-white font-bold shadow-2xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Tables & Data Models</span>
            </button>

            <button
              type="button"
              onClick={() => setQueryMode('trust-audit')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                queryMode === 'trust-audit'
                  ? 'bg-indigo-600 text-white font-bold shadow-2xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Trust & Source Audit</span>
            </button>
          </div>
        </div>

        {/* Input Bar */}
        <div className="relative">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRunNaturalLanguageQuery();
                }}
                placeholder="Ask any question about concepts, procedures, tables, or architecture..."
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            </div>

            <button
              type="button"
              onClick={() => handleRunNaturalLanguageQuery()}
              disabled={isLoading || !query.trim()}
              className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition flex items-center gap-2 cursor-pointer shadow-2xs shrink-0"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Synthesizing...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Ask Assistant</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Suggested Quick Questions */}
        <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span className="font-semibold flex items-center gap-1">
              <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
              Suggested Questions for this Knowledge Base:
            </span>
            <span>Click any pill to query instantly</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {presetQuestions.map((pq, idx) => {
              const IconComp = pq.icon;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleRunNaturalLanguageQuery(pq.text, pq.mode)}
                  className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 text-left transition flex items-start gap-2 cursor-pointer group"
                >
                  <div className="p-1 rounded bg-white border border-slate-200 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition shrink-0 mt-0.5">
                    <IconComp className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800 group-hover:text-indigo-900 line-clamp-1">
                      {pq.text}
                    </div>
                    <div className="text-[10px] text-slate-500 line-clamp-1">
                      {pq.desc}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content: Answer + Grounded Sources Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column (8 Cols): Grounded Answer */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Answer Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-indigo-100 text-indigo-700">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    Assistant Synthesis & Grounded Answer
                  </h4>
                  <span className="text-[10px] text-slate-500">
                    Mode: <span className="font-semibold text-indigo-700">{queryMode}</span> • Grounded in {ragContext.primaryMatches.length} primary concept documents
                  </span>
                </div>
              </div>

              {answer && !isLoading && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(answer)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-500" />
                        <span>Copy Answer</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={downloadAnswerReport}
                    className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Report</span>
                  </button>
                </div>
              )}
            </div>

            {/* Answer Body */}
            {isLoading && !answer && (
              <div className="p-10 flex flex-col items-center justify-center text-center gap-3 text-slate-500">
                <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
                <div>
                  <div className="text-xs font-bold text-slate-800">Traversing Knowledge Graph & Synthesizing...</div>
                  <div className="text-[11px] text-slate-400">Retrieving concept nodes and expanding directed prerequisite chains...</div>
                </div>
              </div>
            )}

            {!isLoading && !answer && !error && (
              <div className="p-10 bg-slate-50 border border-slate-100 rounded-xl flex flex-col items-center justify-center text-center gap-2 text-slate-500">
                <MessageSquare className="w-8 h-8 text-slate-400" />
                <div className="text-xs font-bold text-slate-700">No Query Executed Yet</div>
                <p className="text-[11px] text-slate-500 max-w-md">
                  Type a question in the search bar above or click one of the suggested query pills to receive a grounded answer with concept citations.
                </p>
              </div>
            )}

            {answer && (
              <div className="prose prose-indigo prose-sm max-w-none text-xs leading-relaxed text-slate-800">
                <Markdown remarkPlugins={[remarkGfm]}>
                  {answer}
                </Markdown>
              </div>
            )}
          </div>
        </div>

        {/* Right Column (4 Cols): Cited Concept Cards & Graph Hops */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span>Grounded Knowledge Blocks ({ragContext.primaryMatches.length})</span>
              </div>
              <span className="text-[10px] font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                ~{ragContext.totalTokensEstimate} tokens
              </span>
            </div>

            {ragContext.primaryMatches.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs flex flex-col items-center gap-1.5">
                <BookOpen className="w-6 h-6 text-slate-300" />
                <span>Enter a query to inspect cited concept nodes.</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5 max-h-[480px] overflow-y-auto pr-1">
                {ragContext.primaryMatches.map((match, idx) => {
                  const c = match.concept;
                  const key = c.path || c.id || `concept-${idx}`;
                  const trust = deriveTrustTier(c);

                  return (
                    <div
                      key={key}
                      className="p-3 rounded-lg border border-slate-200 bg-slate-50/80 hover:bg-indigo-50/40 hover:border-indigo-200 transition flex flex-col gap-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-slate-200 text-slate-800">
                              {c.metadata?.type || 'concept'}
                            </span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                trust === 'human-reviewed'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {trust}
                            </span>
                          </div>
                          <h5 className="text-xs font-bold text-slate-900 mt-1 line-clamp-1">
                            {c.metadata?.title || key}
                          </h5>
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedConceptPreview(c)}
                          className="p-1 rounded hover:bg-slate-200 text-slate-600 transition cursor-pointer shrink-0"
                          title="Quick Preview Concept"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {c.metadata?.description && (
                        <p className="text-[11px] text-slate-600 line-clamp-2">
                          {c.metadata.description}
                        </p>
                      )}

                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[10px] text-slate-500 font-mono">
                        <span>Path: {c.path || key}</span>
                        <span className="font-bold text-indigo-700">
                          Match: {Math.round(match.score * 100)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Query History Panel */}
          {queryHistory.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col gap-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <History className="w-3.5 h-3.5 text-indigo-600" />
                <span>Recent Human Queries ({queryHistory.length})</span>
              </div>

              <div className="flex flex-col gap-1.5">
                {queryHistory.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleRunNaturalLanguageQuery(item.query, item.mode)}
                    className="p-2 rounded-lg bg-slate-50 hover:bg-indigo-50 border border-slate-200 text-left transition flex items-center justify-between gap-2 cursor-pointer group"
                  >
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-slate-800 group-hover:text-indigo-900 line-clamp-1">
                        {item.query}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {item.mode} • {item.timestamp}
                      </span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Concept Modal Preview */}
      {selectedConceptPreview && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600" />
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    {selectedConceptPreview.metadata?.title || selectedConceptPreview.path}
                  </h4>
                  <span className="text-[10px] font-mono text-slate-500">
                    {selectedConceptPreview.path}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedConceptPreview(null)}
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex flex-col gap-3">
              <div className="p-3 bg-slate-100 rounded-lg text-xs font-mono text-slate-700">
                <div>type: {String(selectedConceptPreview.metadata?.type || 'concept')}</div>
                <div>status: {String(selectedConceptPreview.metadata?.status || 'stable')}</div>
                <div>trustTier: {deriveTrustTier(selectedConceptPreview)}</div>
                <div>tags: [{Array.isArray(selectedConceptPreview.metadata?.tags) ? (selectedConceptPreview.metadata.tags as string[]).join(', ') : ''}]</div>
              </div>

              <div className="prose prose-sm max-w-none text-xs text-slate-800">
                <Markdown remarkPlugins={[remarkGfm]}>
                  {selectedConceptPreview.body}
                </Markdown>
              </div>
            </div>

            <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setSelectedConceptPreview(null)}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
