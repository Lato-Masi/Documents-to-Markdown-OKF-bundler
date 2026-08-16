/**
 * @file src/components/AgentSkillExplorer.tsx
 * @description Comprehensive UI component for decomposing monolithic runbooks/SOPs into Agent Skills conforming to agentskills.io and Claude Agent Skills specifications.
 *
 * Features:
 * - 100% Deterministic NLP-First Procedural Slicer (Token-Conserving)
 * - Best Practices Compliance Scorecard & Audit against agentskills.io & Claude standards
 * - Progressive Disclosure Token Meter (Discovery vs Activation vs Execution)
 * - Optional On-Demand Gemini AI Enhancement for elevating triggers, workflows & scripts
 * - Canonical Package File Tree (<skill-name>/SKILL.md, references/, scripts/, assets/)
 * - Live Preflight Validator (SKILL-001 through SKILL-006)
 * - Multi-Platform Export (ZIP bundle conforming to standard)
 */

import React, { useMemo, useState } from 'react';
import {
  Folder,
  FileCode,
  FileText,
  Terminal,
  ShieldCheck,
  Download,
  Copy,
  Check,
  Sparkles,
  Zap,
  Info,
  Layers,
  FileBox,
  BrainCircuit,
  GitBranch,
  Search,
  Repeat,
  CheckCircle2,
  Clock,
  Scale,
  ExternalLink,
  Award,
  AlertCircle,
  RefreshCw,
  Sliders,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { sliceMonolithToAgentSkill } from '../lib/skillProceduralSlicer';
import { validateAgentSkill } from '../lib/skillValidator';
import { auditAgentSkillBestPractices, BestPracticesAuditReport } from '../lib/agentSkillBestPracticesEngine';
import { exportAgentSkillAsZip, downloadSkillZip } from '../utils/skillZipExporter';
import { formatTokenCount } from '../utils/tokenEstimator';
import { AgentSkillPackage } from '../types/agentSkill';
import HighlightedCodeBlock from './HighlightedCodeBlock';

interface AgentSkillExplorerProps {
  markdown?: string;
  sourceFileName?: string;
  documents?: { fileName: string; markdown: string }[];
}

export default function AgentSkillExplorer({
  markdown = '',
  sourceFileName = 'runbook.md',
  documents,
}: AgentSkillExplorerProps) {
  const [selectedFilePath, setSelectedFilePath] = useState<string>('SKILL.md');
  const [copied, setCopied] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isEnhancingWithGemini, setIsEnhancingWithGemini] = useState<boolean>(false);
  const [geminiEnhanceResult, setGeminiEnhanceResult] = useState<{
    enhanced: boolean;
    improvements: string[];
    summary: string;
  } | null>(null);
  const [activePackageOverride, setActivePackageOverride] = useState<AgentSkillPackage | null>(null);
  const [simulatedQuery, setSimulatedQuery] = useState<string>('');
  const [showBestPracticesDrawer, setShowBestPracticesDrawer] = useState<boolean>(false);

  // 1. Slice Markdown into Agent Skill Package using local NLP first
  const nlpSkillPackage = useMemo(() => {
    if (documents && documents.length > 0) {
      const combinedMarkdown = documents
        .map((d) => {
          const docTitle = d.fileName.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ');
          return `# ${docTitle}\n\n*Source Document: ${d.fileName}*\n\n${d.markdown}`;
        })
        .join('\n\n---\n\n');

      return sliceMonolithToAgentSkill(combinedMarkdown, {
        customSkillName: 'multi-document-skill-suite',
        customDescription: `Use when instructed to orchestrate, execute, or verify operational workflows across ${documents.length} enterprise manuals: ${documents.map((d) => d.fileName).join(', ')}.`,
      });
    }

    return sliceMonolithToAgentSkill(markdown, {
      customSkillName: sourceFileName.replace(/\.[^/.]+$/, ''),
    });
  }, [markdown, sourceFileName, documents]);

  // Current active package (either NLP base or Gemini-enhanced)
  const skillPackage = activePackageOverride || nlpSkillPackage;

  // 2. Validate against 6-point specification
  const validationReport = useMemo(() => {
    return validateAgentSkill(skillPackage);
  }, [skillPackage]);

  // 3. Best practices audit
  const bestPracticesAudit: BestPracticesAuditReport = useMemo(() => {
    return auditAgentSkillBestPractices(skillPackage);
  }, [skillPackage]);

  // 4. Find selected file content
  const selectedFile = useMemo(() => {
    if (selectedFilePath === 'SKILL.md') {
      return {
        path: `${skillPackage.name}/SKILL.md`,
        name: 'SKILL.md',
        type: 'router',
        content: skillPackage.rootSkillMd,
        tokens: skillPackage.metrics.activationTokens,
        language: 'markdown',
      };
    }

    const ref = skillPackage.references.find((r) => r.relativePath === selectedFilePath);
    if (ref) {
      return {
        path: `${skillPackage.name}/${ref.relativePath}`,
        name: ref.title,
        type: 'reference',
        content: ref.content,
        tokens: ref.estimatedTokens,
        language: 'markdown',
      };
    }

    const script = skillPackage.scripts.find((s) => s.relativePath === selectedFilePath);
    if (script) {
      return {
        path: `${skillPackage.name}/${script.relativePath}`,
        name: script.filename,
        type: 'script',
        content: script.content,
        tokens: script.estimatedTokens,
        language: script.language,
      };
    }

    const asset = skillPackage.assets.find((a) => a.relativePath === selectedFilePath);
    if (asset) {
      const isImage = asset.mimeType?.startsWith('image/');
      return {
        path: `${skillPackage.name}/${asset.relativePath}`,
        name: asset.filename,
        type: 'asset',
        content: asset.content,
        tokens: asset.estimatedTokens,
        language: isImage ? 'image' : asset.mimeType?.includes('json') ? 'json' : 'yaml',
        mimeType: asset.mimeType,
      };
    }

    return null;
  }, [selectedFilePath, skillPackage]);

  // 5. Handle ZIP Export
  const handleExportZip = async () => {
    try {
      setIsExporting(true);
      const blob = await exportAgentSkillAsZip(skillPackage, {
        useDotSkillsPrefix: false,
      });
      downloadSkillZip(blob, `${skillPackage.name}-agent-skill`);
    } catch (err) {
      console.error('Failed to export skill ZIP:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // 6. Handle Gemini AI Refinement (Token-optimized on-demand call)
  const handleEnhanceWithGemini = async () => {
    try {
      setIsEnhancingWithGemini(true);
      const response = await fetch('/api/skills/enhance-with-gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillPackage }),
      });

      const data = await response.json();
      if (data.success && data.skill) {
        setActivePackageOverride(data.skill);
        setGeminiEnhanceResult({
          enhanced: data.enhanced !== false,
          improvements: data.improvementsMade || [],
          summary: data.complianceSummary || 'Skill successfully optimized with Gemini AI.',
        });
      } else {
        alert(data.error || 'Failed to enhance skill with Gemini AI.');
      }
    } catch (err: any) {
      console.error('Gemini enhancement error:', err);
      alert(err.message || 'Error communicating with Gemini service.');
    } finally {
      setIsEnhancingWithGemini(false);
    }
  };

  // 7. Handle Reset to NLP-Only
  const handleResetToNlp = () => {
    setActivePackageOverride(null);
    setGeminiEnhanceResult(null);
  };

  // 8. Handle Copy Active File
  const handleCopyContent = () => {
    if (!selectedFile) return;
    navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 9. Query Activation Matcher simulation
  const queryMatchScore = useMemo(() => {
    if (!simulatedQuery.trim()) return null;
    const q = simulatedQuery.toLowerCase();
    const desc = skillPackage.frontmatter.description.toLowerCase();
    const name = skillPackage.frontmatter.name.toLowerCase();
    const words = q.split(/\s+/).filter((w) => w.length > 2);
    let matchCount = 0;
    for (const w of words) {
      if (desc.includes(w) || name.includes(w)) matchCount++;
    }
    const ratio = words.length > 0 ? matchCount / words.length : 0;
    return {
      activates: ratio > 0.3 || desc.includes(q),
      confidence: Math.min(100, Math.round(ratio * 100 + (desc.includes(q) ? 50 : 0))),
    };
  }, [simulatedQuery, skillPackage]);

  return (
    <div className="space-y-6">
      {/* Header & Best Practices Scorecard Banner */}
      <div className="bg-gradient-to-r from-cyan-950/50 via-zinc-900 to-indigo-950/50 border border-cyan-800/40 rounded-2xl p-4 sm:p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="space-y-1.5 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md bg-cyan-950 border border-cyan-800/80 text-cyan-300 text-xs font-mono font-semibold flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
                <span>Agent Skills Open Standard</span>
              </span>

              {/* Best Practices Score Badge */}
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-zinc-900 border border-zinc-700 text-xs font-mono">
                <Award className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-zinc-400">Score:</span>
                <span
                  className={`font-bold ${
                    bestPracticesAudit.overallScore >= 90
                      ? 'text-emerald-400'
                      : bestPracticesAudit.overallScore >= 75
                      ? 'text-cyan-400'
                      : 'text-amber-400'
                  }`}
                >
                  {bestPracticesAudit.overallScore}/100 (Grade {bestPracticesAudit.grade})
                </span>
              </div>

              {/* Gemini Enhanced Pill */}
              {activePackageOverride && (
                <span className="px-2.5 py-0.5 rounded-md bg-indigo-950 border border-indigo-700 text-indigo-300 text-xs font-mono flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-indigo-400" />
                  <span>Gemini AI Enhanced</span>
                </span>
              )}
            </div>

            <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              <span>{skillPackage.frontmatter.name}</span>
            </h3>
            <p className="text-xs text-zinc-300 max-w-3xl leading-relaxed">
              {skillPackage.frontmatter.description}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
            {/* Enhance with Gemini AI Button */}
            {!activePackageOverride ? (
              <button
                onClick={handleEnhanceWithGemini}
                disabled={isEnhancingWithGemini}
                className="px-3.5 py-2 bg-gradient-to-r from-purple-700 to-indigo-600 hover:from-purple-600 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow-lg disabled:opacity-50"
                title="Use Gemini AI to polish triggers, execution steps, and scripts for 100% compliance"
              >
                {isEnhancingWithGemini ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-200" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-purple-200" />
                )}
                <span>{isEnhancingWithGemini ? 'Optimizing...' : 'Enhance with Gemini AI'}</span>
              </button>
            ) : (
              <button
                onClick={handleResetToNlp}
                className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium transition flex items-center gap-1.5 border border-zinc-700"
                title="Reset to local NLP-only extraction"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reset to NLP</span>
              </button>
            )}

            <button
              onClick={handleCopyContent}
              className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-medium transition flex items-center justify-center gap-1.5 border border-zinc-700/80"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : `Copy ${selectedFile?.name || 'File'}`}</span>
            </button>

            <button
              onClick={handleExportZip}
              disabled={isExporting}
              className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold transition flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>{isExporting ? 'Packaging...' : 'Export Skill (.zip)'}</span>
            </button>
          </div>
        </div>

        {/* Gemini Enhancement Notification */}
        {geminiEnhanceResult && (
          <div className="mt-4 p-3.5 rounded-xl bg-indigo-950/70 border border-indigo-800/80 text-xs text-indigo-200 space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-semibold flex items-center gap-1.5 text-indigo-300">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span>Gemini AI Best Practices Optimization Applied</span>
              </div>
              <span className="text-[10px] font-mono text-indigo-400 bg-indigo-900/60 px-2 py-0.5 rounded">
                Token-Preserving Refinement
              </span>
            </div>
            <p className="text-[11px] text-zinc-300">{geminiEnhanceResult.summary}</p>
            {geminiEnhanceResult.improvements.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                {geminiEnhanceResult.improvements.map((imp, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 text-[11px] text-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{imp}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 3-Tier Progressive Disclosure Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-zinc-800/80">
          <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-3 space-y-1">
            <div className="text-[11px] font-medium text-zinc-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span>Tier 1: Discovery</span>
            </div>
            <div className="text-base font-mono font-bold text-cyan-300">
              {formatTokenCount(skillPackage.metrics.discoveryTokens)}
            </div>
            <div className="text-[10px] text-zinc-400">Startup indexing cost</div>
          </div>

          <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-3 space-y-1">
            <div className="text-[11px] font-medium text-zinc-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-400" />
              <span>Tier 2: Activation</span>
            </div>
            <div className="text-base font-mono font-bold text-indigo-300">
              {formatTokenCount(skillPackage.metrics.activationTokens)}
            </div>
            <div className="text-[10px] text-zinc-400">Root SKILL.md router</div>
          </div>

          <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-3 space-y-1">
            <div className="text-[11px] font-medium text-zinc-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Tier 3: Execution (JIT)</span>
            </div>
            <div className="text-base font-mono font-bold text-emerald-300">
              {formatTokenCount(skillPackage.metrics.executionTokens)}
            </div>
            <div className="text-[10px] text-zinc-400">
              {skillPackage.references.length} refs + {skillPackage.scripts.length} scripts
            </div>
          </div>

          <div className="bg-gradient-to-br from-emerald-950/60 to-cyan-950/60 border border-emerald-800/60 rounded-xl p-3 space-y-1">
            <div className="text-[11px] font-medium text-emerald-400 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-emerald-400" />
              <span>Context Savings</span>
            </div>
            <div className="text-base font-mono font-bold text-emerald-300">
              {skillPackage.metrics.contextSavingsPercentage}% Saved
            </div>
            <div className="text-[10px] text-emerald-400/80">vs monolithic injection</div>
          </div>
        </div>
      </div>

      {/* Best Practices Accordion Drawer */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowBestPracticesDrawer(!showBestPracticesDrawer)}
          className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-zinc-900/60 transition"
        >
          <div className="flex items-center gap-2.5">
            <Award className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
              Agent Skills Best Practices Audit & Compliance Checklist
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono">
              {bestPracticesAudit.checks.filter((c) => c.passed).length}/{bestPracticesAudit.checks.length} Checks Passed
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">
              {showBestPracticesDrawer ? 'Hide Details' : 'View Audit Details'}
            </span>
            {showBestPracticesDrawer ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
          </div>
        </button>

        {showBestPracticesDrawer && (
          <div className="p-5 border-t border-zinc-800 space-y-4 bg-zinc-900/30">
            {/* References Links to agentskills.io & Claude */}
            <div className="flex flex-wrap items-center gap-3 p-3 bg-zinc-900/80 rounded-xl border border-zinc-800 text-xs">
              <span className="text-zinc-400 font-medium flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
                <span>Authoritative Standards:</span>
              </span>
              <a
                href="https://agentskills.io/skill-creation/best-practices"
                target="_blank"
                rel="noreferrer"
                className="text-cyan-400 hover:text-cyan-300 underline font-mono text-[11px] flex items-center gap-1"
              >
                <span>agentskills.io/skill-creation/best-practices</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <span className="text-zinc-400">•</span>
              <a
                href="https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-400 hover:text-indigo-300 underline font-mono text-[11px] flex items-center gap-1"
              >
                <span>platform.claude.com/docs/agent-skills/best-practices</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* Checklist Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {bestPracticesAudit.checks.map((check) => (
                <div
                  key={check.id}
                  className={`p-3 rounded-xl border space-y-1.5 transition ${
                    check.passed
                      ? 'bg-zinc-950/60 border-zinc-800/80'
                      : 'bg-amber-950/20 border-amber-800/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {check.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                      )}
                      <span className="text-xs font-semibold text-zinc-200">{check.name}</span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-400">{check.score}/100</span>
                  </div>

                  <p className="text-[11px] text-zinc-400 leading-relaxed">{check.description}</p>

                  {check.details && (
                    <div className="text-[10px] font-mono text-zinc-300 bg-zinc-900 px-2 py-1 rounded">
                      {check.details}
                    </div>
                  )}

                  {check.recommendation && (
                    <div className="text-[10px] text-amber-300 bg-amber-950/40 p-1.5 rounded border border-amber-900/60">
                      💡 <strong>Recommendation:</strong> {check.recommendation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Workspace: Canonical File Tree on Left, Active File Preview on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Skill Directory Structure */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                <Folder className="w-3.5 h-3.5 text-cyan-400" />
                <span>Canonical File Tree</span>
              </h4>
              <span className="text-[10px] font-mono text-zinc-400">
                /{skillPackage.name}/
              </span>
            </div>

            <div className="space-y-1 text-xs font-mono">
              {/* Root Router */}
              <button
                onClick={() => setSelectedFilePath('SKILL.md')}
                className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between transition ${
                  selectedFilePath === 'SKILL.md'
                    ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/80 font-bold'
                    : 'text-zinc-300 hover:bg-zinc-900'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <FileText className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="truncate">SKILL.md (Router)</span>
                </div>
                <span className="text-[10px] text-zinc-400 shrink-0">
                  {formatTokenCount(skillPackage.metrics.activationTokens)}
                </span>
              </button>

              {/* References Subdirectory */}
              {skillPackage.references.length > 0 && (
                <div className="pl-2 pt-2 space-y-1">
                  <div className="text-[10px] uppercase font-bold text-zinc-400 flex items-center gap-1.5 py-1">
                    <Folder className="w-3 h-3 text-indigo-400" />
                    <span>references/ ({skillPackage.references.length})</span>
                  </div>
                  {skillPackage.references.map((ref) => (
                    <button
                      key={ref.relativePath}
                      onClick={() => setSelectedFilePath(ref.relativePath)}
                      className={`w-full text-left pl-4 pr-3 py-1.5 rounded-lg flex items-center justify-between transition ${
                        selectedFilePath === ref.relativePath
                          ? 'bg-indigo-950/80 text-indigo-300 border border-indigo-800/80 font-bold'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <FileCode className="w-3 h-3 text-indigo-400 shrink-0" />
                        <span className="truncate">{ref.title}</span>
                      </div>
                      <span className="text-[10px] text-zinc-400 shrink-0">{ref.estimatedTokens}t</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Scripts Subdirectory */}
              {skillPackage.scripts.length > 0 && (
                <div className="pl-2 pt-2 space-y-1">
                  <div className="text-[10px] uppercase font-bold text-zinc-400 flex items-center gap-1.5 py-1">
                    <Folder className="w-3 h-3 text-emerald-400" />
                    <span>scripts/ ({skillPackage.scripts.length})</span>
                  </div>
                  {skillPackage.scripts.map((script) => (
                    <button
                      key={script.relativePath}
                      onClick={() => setSelectedFilePath(script.relativePath)}
                      className={`w-full text-left pl-4 pr-3 py-1.5 rounded-lg flex items-center justify-between transition ${
                        selectedFilePath === script.relativePath
                          ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 font-bold'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <Terminal className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span className="truncate">{script.filename}</span>
                      </div>
                      <span className="text-[10px] text-zinc-400 shrink-0">{script.language}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Assets Subdirectory */}
              {skillPackage.assets.length > 0 && (
                <div className="pl-2 pt-2 space-y-1">
                  <div className="text-[10px] uppercase font-bold text-zinc-400 flex items-center gap-1.5 py-1">
                    <Folder className="w-3 h-3 text-amber-400" />
                    <span>assets/ ({skillPackage.assets.length})</span>
                  </div>
                  {skillPackage.assets.map((asset) => (
                    <button
                      key={asset.relativePath}
                      onClick={() => setSelectedFilePath(asset.relativePath)}
                      className={`w-full text-left pl-4 pr-3 py-1.5 rounded-lg flex items-center justify-between transition ${
                        selectedFilePath === asset.relativePath
                          ? 'bg-amber-950/80 text-amber-300 border border-amber-800/80 font-bold'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <FileBox className="w-3 h-3 text-amber-400 shrink-0" />
                        <span className="truncate">{asset.filename}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Trigger Activation Simulator */}
          <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 space-y-3">
            <h4 className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Skill Trigger Simulator</span>
            </h4>
            <p className="text-[11px] text-zinc-400">
              Test whether an agent will activate this skill based on its YAML description triggers.
            </p>
            <input
              type="text"
              value={simulatedQuery}
              onChange={(e) => setSimulatedQuery(e.target.value)}
              placeholder="e.g. Please deploy the staging cluster..."
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-xl text-xs text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-cyan-500 font-sans"
            />

            {queryMatchScore && (
              <div
                className={`p-3 rounded-xl border text-xs space-y-1 ${
                  queryMatchScore.activates
                    ? 'bg-emerald-950/50 border-emerald-800/60 text-emerald-300'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                }`}
              >
                <div className="font-semibold flex items-center justify-between">
                  <span>{queryMatchScore.activates ? '✓ Skill Activated' : '○ Standby (No match)'}</span>
                  <span className="font-mono">{queryMatchScore.confidence}% match</span>
                </div>
                <div className="text-[10px] text-zinc-400">
                  {queryMatchScore.activates
                    ? 'Description triggers matched. The agent will load SKILL.md into active context.'
                    : 'Query keywords did not trigger activation criteria in the description.'}
                </div>
              </div>
            )}
          </div>

          {/* NLP Logic & Formal Construct Analysis */}
          {skillPackage.logicClassification && (
            <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                  <BrainCircuit className="w-3.5 h-3.5 text-cyan-400" />
                  <span>NLP Logic Classification</span>
                </h4>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    skillPackage.logicClassification.recommendedTarget === 'skill'
                      ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/80'
                      : 'bg-indigo-950 text-indigo-300 border border-indigo-800/80'
                  }`}
                >
                  {skillPackage.logicClassification.proceduralScore}% Procedural
                </span>
              </div>

              {/* Progress Confidence Bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-zinc-400">
                  <span>Declarative (OKF)</span>
                  <span>Procedural (SKILL.md)</span>
                </div>
                <div className="h-2 w-full bg-zinc-900 rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-indigo-500 transition-all duration-500"
                    style={{ width: `${skillPackage.logicClassification.declarativeScore}%` }}
                  />
                  <div
                    className="h-full bg-cyan-400 transition-all duration-500"
                    style={{ width: `${skillPackage.logicClassification.proceduralScore}%` }}
                  />
                </div>
              </div>

              <p className="text-[11px] text-zinc-400 leading-relaxed">
                {skillPackage.logicClassification.explanation}
              </p>
            </div>
          )}
        </div>

        {/* Right Column: Code & Markdown Inspector */}
        <div className="lg:col-span-8 space-y-3">
          {selectedFile && (
            <div className="bg-zinc-950 rounded-2xl border border-zinc-800 overflow-hidden shadow-2xl">
              {/* File Header */}
              <div className="px-4 py-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2 font-mono text-xs text-zinc-200">
                  <span className="text-cyan-400 font-bold">{selectedFile.path}</span>
                  <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-[10px] text-zinc-400">
                    {formatTokenCount(selectedFile.tokens)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                    {selectedFile.language}
                  </span>
                </div>
              </div>

              {/* Code / Image Content */}
              <div className="p-4 overflow-x-auto max-h-[600px] overflow-y-auto">
                {selectedFile.language === 'image' ? (
                  <div className="flex flex-col items-center justify-center p-6 bg-zinc-900/50 rounded-xl border border-zinc-800 space-y-4">
                    <img
                      src={`data:${selectedFile.mimeType || 'image/png'};base64,${selectedFile.content}`}
                      alt={selectedFile.name}
                      className="max-h-[350px] max-w-full rounded-lg shadow-lg object-contain border border-zinc-800"
                    />
                    <div className="text-center space-y-1">
                      <div className="text-xs font-mono font-bold text-zinc-200">{selectedFile.name}</div>
                      <div className="text-[11px] text-zinc-400">Decoupled binary asset • {selectedFile.mimeType}</div>
                    </div>
                  </div>
                ) : (
                  <HighlightedCodeBlock value={selectedFile.content} language={selectedFile.language} />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
