import React, { useState } from 'react';
import {
  partitionMarkdownToOKFConcepts,
  compileOKFBundle,
  validateConcept,
  deriveTrustTier,
  type OKFConversionResult,
} from '../lib/okfKnowledgeEngine';
import OKFGraphVisualizer from './OKFGraphVisualizer';
import HighlightedCodeBlock from './HighlightedCodeBlock';
import {
  Upload,
  FileCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileCode,
  Sparkles,
  GitBranch,
  RefreshCw,
  Copy,
  Check,
} from 'lucide-react';

const SAMPLE_OKF_INPUT = `---
type: concept
title: "Distributed Consensus Protocols"
description: "Core algorithms enabling distributed state machines to agree on ledger values."
tags: [distributed-systems, consensus, blockchain, raft]
status: stable
sources:
  - "https://raft.github.io/"
verified:
  by: "Security Working Group"
  date: "2026-04-12"
---

# Distributed Consensus Protocols

Distributed consensus protocols ensure fault tolerance across unreliable networks.

## Core Properties
1. **Safety**: Nothing bad happens (no conflicting decisions).
2. **Liveness**: Eventually something good happens (decisions are reached).

### Directed Dependencies
- Prerequisites: [Network Topologies](../concepts/network-topologies.md)
- Implements: [State Machine Replication](../guidelines/smr-guideline.md)
`;

export default function OKFRoundTripValidator() {
  const [inputText, setInputText] = useState(SAMPLE_OKF_INPUT);
  const [validationResult, setValidationResult] = useState<OKFConversionResult | null>(() => {
    const concepts = partitionMarkdownToOKFConcepts(SAMPLE_OKF_INPUT, {
      sourceFileName: 'imported-sample.md',
    });
    return compileOKFBundle(concepts, 'imported-validation-kb');
  });

  const handleValidate = () => {
    try {
      const concepts = partitionMarkdownToOKFConcepts(inputText, {
        sourceFileName: 'imported-doc.md',
      });
      const res = compileOKFBundle(concepts, 'imported-validation-kb');
      setValidationResult(res);
    } catch (err) {
      console.error('Validation error:', err);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setInputText(content);
        const concepts = partitionMarkdownToOKFConcepts(content, {
          sourceFileName: file.name,
        });
        const res = compileOKFBundle(concepts, file.name.replace(/\.[^/.]+$/, ''));
        setValidationResult(res);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Top Banner */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-indigo-600" />
            Interactive OKF Round-Trip & Import Validator
          </h3>
          <p className="text-xs text-slate-600 mt-0.5">
            Paste any external Markdown document or OKF concept file to verify frontmatter schema conformance, detect relationships, and generate its live knowledge graph.
          </p>
        </div>

        <label className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-2xs shrink-0">
          <Upload className="w-3.5 h-3.5" />
          <span>Upload File (.md / .json)</span>
          <input type="file" accept=".md,.markdown,.json,.txt" onChange={handleFileUpload} className="hidden" />
        </label>
      </div>

      {/* Editor & Validation Action */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-700">
            Source Markdown with OKF Frontmatter:
          </label>
          <button
            type="button"
            onClick={handleValidate}
            className="px-3 py-1 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-bold transition cursor-pointer border border-indigo-200"
          >
            Re-Validate & Re-Build Graph
          </button>
        </div>

        <textarea
          rows={7}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          className="w-full p-3 rounded-xl border border-slate-300 font-mono text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Paste OKF markdown content here..."
        />
      </div>

      {/* Results View */}
      {validationResult && (
        <div className="flex flex-col gap-4">
          {/* Summary Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-white border border-slate-200 rounded-xl flex flex-col gap-1">
              <span className="text-[10px] uppercase font-mono text-slate-500">Extracted Concepts</span>
              <span className="text-lg font-bold text-slate-900">{validationResult.concepts.length}</span>
            </div>
            <div className="p-3 bg-white border border-slate-200 rounded-xl flex flex-col gap-1">
              <span className="text-[10px] uppercase font-mono text-slate-500">Conformance</span>
              <span
                className={`text-lg font-bold ${
                  validationResult.summary.errorCount === 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {validationResult.summary.errorCount === 0 ? '100% Conformant' : `${validationResult.summary.errorCount} Errors`}
              </span>
            </div>
            <div className="p-3 bg-white border border-slate-200 rounded-xl flex flex-col gap-1">
              <span className="text-[10px] uppercase font-mono text-slate-500">Graph Edges</span>
              <span className="text-lg font-bold text-indigo-600">
                {validationResult.semanticGraph?.edges.length || validationResult.graph.edges.length}
              </span>
            </div>
            <div className="p-3 bg-white border border-slate-200 rounded-xl flex flex-col gap-1">
              <span className="text-[10px] uppercase font-mono text-slate-500">Trust Breakdown</span>
              <span className="text-xs font-medium text-slate-700 mt-1">
                {validationResult.summary.trustTiers['human-reviewed']} Human • {validationResult.summary.trustTiers['machine-confirmed']} Machine
              </span>
            </div>
          </div>

          {/* Interactive Graph Visualizer for Imported Data */}
          <OKFGraphVisualizer
            graph={validationResult.graph}
            semanticGraph={validationResult.semanticGraph}
            nlpAnalyses={validationResult.nlpAnalyses}
          />
        </div>
      )}
    </div>
  );
}
