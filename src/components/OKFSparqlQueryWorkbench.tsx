import React, { useState, useMemo } from 'react';
import type { OkfBundle } from 'okf-ts';
import type { SemanticGraphResult } from '../lib/okfSemanticGraphEngine';
import {
  executeSparqlQuery,
  buildOkfTriplestore,
  SAMPLE_SPARQL_QUERIES,
  type SparqlQueryResult,
  compactUri,
  DEFAULT_PREFIXES,
} from '../lib/okfSparqlEngine';
import HighlightedCodeBlock from './HighlightedCodeBlock';
import {
  Database,
  Play,
  Copy,
  Check,
  Download,
  RefreshCw,
  Layers,
  Sparkles,
  Table as TableIcon,
  Code2,
  FileJson,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Clock,
  Terminal,
} from 'lucide-react';

interface OKFSparqlQueryWorkbenchProps {
  bundle: OkfBundle;
  semanticGraph?: SemanticGraphResult;
}

export default function OKFSparqlQueryWorkbench({
  bundle,
  semanticGraph,
}: OKFSparqlQueryWorkbenchProps) {
  const [sparqlQuery, setSparqlQuery] = useState(SAMPLE_SPARQL_QUERIES[0].query);
  const [selectedSample, setSelectedSample] = useState(SAMPLE_SPARQL_QUERIES[0].id);
  const [viewFormat, setViewFormat] = useState<'table' | 'json' | 'triples'>('table');
  const [copied, setCopied] = useState<string | null>(null);

  // Compute total triplestore stats
  const triplestore = useMemo(() => {
    return buildOkfTriplestore(bundle, semanticGraph);
  }, [bundle, semanticGraph]);

  // Execute query result
  const queryResult: { result?: SparqlQueryResult; error?: string } = useMemo(() => {
    if (!sparqlQuery.trim()) {
      return { error: 'Please provide a valid SPARQL query.' };
    }
    try {
      const res = executeSparqlQuery(sparqlQuery, bundle, semanticGraph);
      return { result: res };
    } catch (err: any) {
      return { error: err.message || 'Syntax or evaluation error in SPARQL query.' };
    }
  }, [sparqlQuery, bundle, semanticGraph]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleSelectSample = (sampleId: string) => {
    const sample = SAMPLE_SPARQL_QUERIES.find((s) => s.id === sampleId);
    if (sample) {
      setSelectedSample(sampleId);
      setSparqlQuery(sample.query);
    }
  };

  const exportResultsAsJson = () => {
    if (!queryResult.result) return;
    const blob = new Blob([JSON.stringify(queryResult.result, null, 2)], {
      type: 'application/sparql-results+json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `okf-sparql-results-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Top Banner */}
      <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 rounded-xl text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold tracking-wide uppercase">
                W3C SPARQL 1.1 In-Memory Triplestore & Ontology Workbench
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Live Query Engine
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Execute real SPARQL 1.1 (SELECT, CONSTRUCT, ASK, DESCRIBE) queries directly over the RDF graph derived from OKF concepts and semantic edges.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-300 font-mono bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <span>{triplestore.length} RDF Triples Active</span>
          </span>
        </div>
      </div>

      {/* Preset Queries Toolbar */}
      <div className="flex flex-col gap-2 p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            Sample SPARQL Queries:
          </span>
          <span className="text-[11px] text-slate-500">Click any preset to load</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {SAMPLE_SPARQL_QUERIES.map((sample) => (
            <button
              key={sample.id}
              type="button"
              onClick={() => handleSelectSample(sample.id)}
              className={`p-2.5 rounded-lg border text-left transition flex flex-col gap-1 cursor-pointer ${
                selectedSample === sample.id
                  ? 'bg-indigo-50/90 border-indigo-500 text-indigo-900 shadow-2xs'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="text-xs font-bold line-clamp-1">{sample.title}</div>
              <div className="text-[10px] text-slate-500 line-clamp-2">{sample.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Query Editor & Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Editor (6 Cols) */}
        <div className="lg:col-span-6 flex flex-col gap-2 bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-bold text-slate-800">SPARQL 1.1 Query Input</span>
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard(sparqlQuery, 'query')}
              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              {copied === 'query' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
              <span>Copy Query</span>
            </button>
          </div>

          <textarea
            value={sparqlQuery}
            onChange={(e) => {
              setSparqlQuery(e.target.value);
              setSelectedSample('');
            }}
            rows={14}
            className="w-full p-3 font-mono text-xs text-slate-900 bg-slate-950 text-indigo-300 rounded-lg border border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="PREFIX okf: <urn:okf:ontology#>..."
          />
        </div>

        {/* Results Viewer (6 Cols) */}
        <div className="lg:col-span-6 flex flex-col gap-2 bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <TableIcon className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-bold text-slate-800">
                Evaluation Output & Bindings
              </span>
              {queryResult.result && (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-100 text-emerald-800 font-bold flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {queryResult.result.executionTimeMs}ms
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px]">
                <button
                  type="button"
                  onClick={() => setViewFormat('table')}
                  className={`px-2 py-1 rounded-md font-medium transition cursor-pointer ${
                    viewFormat === 'table' ? 'bg-white text-indigo-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Table
                </button>
                <button
                  type="button"
                  onClick={() => setViewFormat('json')}
                  className={`px-2 py-1 rounded-md font-medium transition cursor-pointer ${
                    viewFormat === 'json' ? 'bg-white text-indigo-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  W3C JSON
                </button>
                <button
                  type="button"
                  onClick={() => setViewFormat('triples')}
                  className={`px-2 py-1 rounded-md font-medium transition cursor-pointer ${
                    viewFormat === 'triples' ? 'bg-white text-indigo-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All Triples ({triplestore.length})
                </button>
              </div>

              {queryResult.result && (
                <button
                  type="button"
                  onClick={exportResultsAsJson}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                  title="Download SPARQL JSON"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Result Content */}
          <div className="flex-1 overflow-auto max-h-[380px] rounded-lg border border-slate-200 bg-slate-50/50 p-2">
            {queryResult.error ? (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{queryResult.error}</span>
              </div>
            ) : viewFormat === 'triples' ? (
              <div className="flex flex-col gap-1 font-mono text-[11px]">
                {triplestore.slice(0, 100).map((t, idx) => (
                  <div key={idx} className="p-1.5 bg-white rounded border border-slate-200 flex items-center gap-2">
                    <span className="text-indigo-700 font-bold">{compactUri(t.subject, DEFAULT_PREFIXES)}</span>
                    <span className="text-slate-500 font-semibold">{compactUri(t.predicate, DEFAULT_PREFIXES)}</span>
                    <span className="text-emerald-700">{t.isUri ? compactUri(t.object, DEFAULT_PREFIXES) : `"${t.object}"`}</span>
                  </div>
                ))}
                {triplestore.length > 100 && (
                  <div className="text-center text-slate-500 text-xs py-2">
                    Showing 100 of {triplestore.length} triples in store.
                  </div>
                )}
              </div>
            ) : viewFormat === 'json' ? (
              <HighlightedCodeBlock
                value={JSON.stringify(queryResult.result?.data, null, 2)}
                language="json"
              />
            ) : queryResult.result?.queryType === 'ASK' ? (
              <div className="p-8 flex flex-col items-center justify-center text-center gap-3">
                <div
                  className={`p-3 rounded-full ${
                    queryResult.result.data.boolean
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {queryResult.result.data.boolean ? (
                    <CheckCircle2 className="w-8 h-8" />
                  ) : (
                    <AlertCircle className="w-8 h-8" />
                  )}
                </div>
                <div className="text-sm font-bold text-slate-800">
                  SPARQL ASK Result:{' '}
                  <span className={queryResult.result.data.boolean ? 'text-emerald-600' : 'text-rose-600'}>
                    {queryResult.result.data.boolean ? 'TRUE' : 'FALSE'}
                  </span>
                </div>
              </div>
            ) : queryResult.result?.queryType === 'CONSTRUCT' ? (
              <HighlightedCodeBlock
                value={queryResult.result.data.output}
                language="turtle"
              />
            ) : queryResult.result?.queryType === 'SELECT' || queryResult.result?.queryType === 'DESCRIBE' ? (
              (() => {
                const selectData = queryResult.result.data as { head: { vars: string[] }; results: { bindings: Array<Record<string, { type: string; value: string }>> } };
                if (selectData.results.bindings.length === 0) {
                  return (
                    <div className="p-8 text-center text-slate-400 text-xs">
                      Query returned 0 matching bindings.
                    </div>
                  );
                }
                return (
                  <table className="w-full text-left text-xs border-collapse bg-white rounded-lg shadow-2xs">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold font-mono">
                        {selectData.head.vars.map((v) => (
                          <th key={v} className="p-2 border-r border-slate-200 last:border-r-0">
                            ?{v}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectData.results.bindings.map((binding, rowIdx) => (
                        <tr
                          key={rowIdx}
                          className="border-b border-slate-100 hover:bg-indigo-50/50 font-mono text-[11px]"
                        >
                          {selectData.head.vars.map((v) => {
                            const cell = binding[v];
                            if (!cell) {
                              return (
                                <td key={v} className="p-2 text-slate-300 italic border-r border-slate-100 last:border-r-0">
                                  unbound
                                </td>
                              );
                            }
                            return (
                              <td
                                key={v}
                                className={`p-2 border-r border-slate-100 last:border-r-0 ${
                                  cell.type === 'uri' ? 'text-indigo-700 font-semibold' : 'text-slate-800'
                                }`}
                              >
                                {cell.type === 'uri' ? compactUri(cell.value, DEFAULT_PREFIXES) : cell.value}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
