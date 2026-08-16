import React, { useState, useMemo } from 'react';
import type { OkfBundle } from 'okf-ts';
import type { SemanticGraphResult } from '../lib/okfSemanticGraphEngine';
import type { NLPConceptAnalysis } from '../lib/okfNlpEngine';
import {
  generateConformanceCertificate,
  type ConformanceCertificate,
} from '../lib/okfCertificationEngine';
import HighlightedCodeBlock from './HighlightedCodeBlock';
import {
  ShieldCheck,
  Award,
  Lock,
  FileCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  Check,
  Download,
  Key,
  Database,
  Layers,
  Sparkles,
} from 'lucide-react';

interface OKFCertificateViewProps {
  bundle: OkfBundle;
  semanticGraph?: SemanticGraphResult;
  nlpAnalyses?: Record<string, NLPConceptAnalysis>;
}

export default function OKFCertificateView({
  bundle,
  semanticGraph,
  nlpAnalyses,
}: OKFCertificateViewProps) {
  const [viewMode, setViewMode] = useState<'visual' | 'markdown' | 'json'>('visual');
  const [copied, setCopied] = useState<string | null>(null);

  const cert: ConformanceCertificate = useMemo(() => {
    return generateConformanceCertificate(bundle, semanticGraph, nlpAnalyses);
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

  return (
    <div className="flex flex-col gap-5">
      {/* Top Certification Badge Banner */}
      <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 rounded-xl text-white shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={`p-3 rounded-xl border ${
              cert.status === 'CERTIFIED_GOLD'
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                : cert.status === 'CERTIFIED_SILVER'
                ? 'bg-slate-200/20 border-slate-300/40 text-slate-200'
                : 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400'
            }`}
          >
            <Award className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-white tracking-wide">
                OKF v0.2 Cryptographic Conformance Certificate
              </h3>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold uppercase tracking-wider ${
                  cert.status === 'CERTIFIED_GOLD'
                    ? 'bg-amber-500 text-slate-950'
                    : cert.status === 'CERTIFIED_SILVER'
                    ? 'bg-slate-200 text-slate-950'
                    : 'bg-indigo-600 text-white'
                }`}
              >
                {cert.status.replace('_', ' ')}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Certificate ID: <code className="font-mono text-indigo-300">{cert.certificateId}</code> • Issued:{' '}
              {new Date(cert.issuedAt).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Score & Actions */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center bg-slate-950/80 px-4 py-2 rounded-xl border border-slate-800">
            <span className="text-[10px] uppercase font-mono text-slate-400">Conformance Score</span>
            <span className="text-2xl font-black text-emerald-400">{cert.overallScore}/100</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() =>
                downloadFile(cert.certificateMarkdown, `OKF_CERTIFICATE_${cert.certificateId}.md`, 'text/markdown')
              }
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download (.md)</span>
            </button>
            <button
              type="button"
              onClick={() =>
                downloadFile(JSON.stringify(cert, null, 2), `OKF_CERTIFICATE_${cert.certificateId}.json`, 'application/json')
              }
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition flex items-center gap-1.5 cursor-pointer border border-slate-700"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download (.json)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mode Selector Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setViewMode('visual')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
            viewMode === 'visual'
              ? 'bg-indigo-600 text-white shadow-2xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          Visual Scorecard & Checksums
        </button>
        <button
          type="button"
          onClick={() => setViewMode('markdown')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
            viewMode === 'markdown'
              ? 'bg-indigo-600 text-white shadow-2xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          Formal Markdown Report
        </button>
        <button
          type="button"
          onClick={() => setViewMode('json')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
            viewMode === 'json'
              ? 'bg-indigo-600 text-white shadow-2xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          Raw JSON Certificate
        </button>
      </div>

      {/* Visual Scorecard */}
      {viewMode === 'visual' && (
        <div className="flex flex-col gap-5">
          {/* Rule Evaluation Checklist */}
          <div className="flex flex-col gap-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              Specification Compliance Rule Checklist (OKF v0.2 Standard)
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {cert.ruleChecks.map((rule) => (
                <div
                  key={rule.id}
                  className={`p-3.5 rounded-xl border flex flex-col gap-1.5 ${
                    rule.status === 'passed'
                      ? 'bg-emerald-50/50 border-emerald-200 text-slate-900'
                      : rule.status === 'warning'
                      ? 'bg-amber-50/50 border-amber-200 text-slate-900'
                      : 'bg-rose-50/50 border-rose-200 text-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {rule.status === 'passed' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : rule.status === 'warning' ? (
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-600" />
                      )}
                      <span className="text-xs font-bold text-slate-900">{rule.name}</span>
                    </div>
                    <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-white/80 border border-slate-200 font-bold">
                      {rule.id}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed pl-6">
                    {rule.details}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Cryptographic SHA-256 Checksums Manifest */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Lock className="w-4 h-4 text-indigo-600" />
                Cryptographic File Digest Manifest (SHA-256)
              </h4>
              <span className="text-xs text-slate-500 font-mono">
                Total Files: {cert.fileManifestChecksums.length}
              </span>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-mono text-[10px]">
                    <tr>
                      <th className="p-3">File Path</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Size</th>
                      <th className="p-3">SHA-256 Digest</th>
                      <th className="p-3 text-right">Copy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {cert.fileManifestChecksums.map((file, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition">
                        <td className="p-3 font-medium text-slate-900">{file.path}</td>
                        <td className="p-3 text-slate-500">{file.type}</td>
                        <td className="p-3 text-slate-500">{file.sizeBytes} B</td>
                        <td className="p-3 text-indigo-700 font-bold truncate max-w-xs">
                          {file.sha256}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => copyToClipboard(file.sha256, `sha-${i}`)}
                            className="p-1 rounded hover:bg-slate-200 text-slate-500 transition cursor-pointer"
                            title="Copy SHA-256"
                          >
                            {copied === `sha-${i}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Markdown View */}
      {viewMode === 'markdown' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs font-bold text-white font-mono">CONFORMANCE_CERTIFICATE.md</span>
            <button
              type="button"
              onClick={() => copyToClipboard(cert.certificateMarkdown, 'cert-md')}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1 cursor-pointer"
            >
              {copied === 'cert-md' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
              <span>Copy Markdown</span>
            </button>
          </div>
          <div className="max-h-[500px] overflow-y-auto p-4">
            <HighlightedCodeBlock value={cert.certificateMarkdown} language="markdown" />
          </div>
        </div>
      )}

      {/* JSON View */}
      {viewMode === 'json' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs font-bold text-white font-mono">certificate.json</span>
            <button
              type="button"
              onClick={() => copyToClipboard(JSON.stringify(cert, null, 2), 'cert-json')}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1 cursor-pointer"
            >
              {copied === 'cert-json' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
              <span>Copy JSON</span>
            </button>
          </div>
          <div className="max-h-[500px] overflow-y-auto p-4">
            <HighlightedCodeBlock value={JSON.stringify(cert, null, 2)} language="json" />
          </div>
        </div>
      )}
    </div>
  );
}
