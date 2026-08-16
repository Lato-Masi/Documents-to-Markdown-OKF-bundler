import React, { useState, useMemo } from 'react';
import {
  Layers,
  FileText,
  CheckCircle2,
  Check,
  Download,
  Copy,
  Trash2,
  Sparkles,
  Zap,
  Globe,
  UploadCloud,
  Search,
  Filter,
  Eye,
  Edit3,
  Archive,
  ArrowRight,
  BookOpen,
  Boxes,
  Plus,
  RefreshCw,
  FolderTree,
  FileCode,
  ShieldCheck,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import JSZip from 'jszip';
import { HistoryItem } from '../types';
import { formatBytes } from '../utils/fileHelpers';
import { cleanMarkdownOutput } from '../utils/markdownCleaner';
import OKFExplorer from './OKFExplorer';
import AgentSkillExplorer from './AgentSkillExplorer';
import RenderedMarkdownPreview from './RenderedMarkdownPreview';
import MarkdownEditor from './MarkdownEditor';
import ErrorBoundary from './ErrorBoundary';

interface MultiDocProcessingHubProps {
  documents: HistoryItem[];
  onUpdateDocuments: (docs: HistoryItem[]) => void;
  onOpenInSingleView: (item: HistoryItem) => void;
  onAddNewDocument: (name: string, content: string) => void;
}

export type MultiDocActiveView = 'selection' | 'okf' | 'skills' | 'merged' | 'quick_preview';

export default function MultiDocProcessingHub({
  documents,
  onUpdateDocuments,
  onOpenInSingleView,
  onAddNewDocument,
}: MultiDocProcessingHubProps) {
  // Selected Document IDs state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    // By default, select all documents
    return new Set(documents.map((d) => d.id));
  });

  // Keep selected IDs in sync when documents change
  React.useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set<string>();
      const existingIds = new Set(documents.map((d) => d.id));
      for (const id of prev) {
        if (existingIds.has(id)) next.add(id);
      }
      // If none selected, default to all
      if (next.size === 0 && documents.length > 0) {
        return new Set(documents.map((d) => d.id));
      }
      return next;
    });
  }, [documents]);

  const [activeView, setActiveView] = useState<MultiDocActiveView>('selection');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewDoc, setPreviewDoc] = useState<HistoryItem | null>(null);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [copiedMerged, setCopiedMerged] = useState(false);
  const [currentThemeId, setCurrentThemeId] = useState('github-light');

  // Manual Add / Import Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newDocName, setNewDocName] = useState('');
  const [newDocContent, setNewDocContent] = useState('');

  // Filtered documents
  const filteredDocs = useMemo(() => {
    if (!searchQuery.trim()) return documents;
    const q = searchQuery.toLowerCase();
    return documents.filter(
      (d) =>
        d.fileName.toLowerCase().includes(q) ||
        d.markdownContent.toLowerCase().includes(q)
    );
  }, [documents, searchQuery]);

  // Selected Documents Array
  const selectedDocs = useMemo(() => {
    return documents.filter((d) => selectedIds.has(d.id));
  }, [documents, selectedIds]);

  // Stats for Selected Documents
  const selectedStats = useMemo(() => {
    let totalWords = 0;
    let totalChars = 0;
    let totalBytes = 0;

    for (const doc of selectedDocs) {
      const text = doc.markdownContent || '';
      totalChars += text.length;
      totalBytes += doc.fileSize || text.length;
      const words = text.trim().split(/\s+/).filter(Boolean).length;
      totalWords += words;
    }

    const estimatedTokens = Math.round(totalWords * 1.33);

    return {
      docCount: selectedDocs.length,
      totalWords,
      totalChars,
      totalBytes,
      estimatedTokens,
    };
  }, [selectedDocs]);

  // Unified Combined Markdown for Merged View
  const mergedMarkdown = useMemo(() => {
    if (selectedDocs.length === 0) return '';

    const tocLines = [
      '# Master Multi-Document Knowledge Digest\n',
      `*Synthesized from ${selectedDocs.length} converted documents • Total words: ${selectedStats.totalWords.toLocaleString()}*\n`,
      '## Table of Contents\n',
    ];

    selectedDocs.forEach((doc, idx) => {
      const cleanName = doc.fileName.replace(/\.[^/.]+$/, '');
      tocLines.push(`${idx + 1}. [${cleanName}](#doc-${idx + 1}-${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-')})`);
    });

    tocLines.push('\n---\n');

    const bodySections = selectedDocs.map((doc, idx) => {
      const cleanName = doc.fileName.replace(/\.[^/.]+$/, '');
      const anchor = `doc-${idx + 1}-${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      return `<a id="${anchor}"></a>\n\n# Part ${idx + 1}: ${cleanName}\n\n*Source: \`${doc.fileName}\` • Converted at ${doc.timestamp}*\n\n${doc.markdownContent}`;
    });

    return [...tocLines, ...bodySections].join('\n\n');
  }, [selectedDocs, selectedStats.totalWords]);

  // Document format objects for OKF / Skills
  const selectedDocPayloads = useMemo(() => {
    return selectedDocs.map((d) => ({
      fileName: d.fileName.endsWith('.md') ? d.fileName : `${d.fileName}.md`,
      markdown: d.markdownContent,
    }));
  }, [selectedDocs]);

  // Selection handlers
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(documents.map((d) => d.id)));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleInvertSelection = () => {
    setSelectedIds((prev) => {
      const next = new Set<string>();
      for (const d of documents) {
        if (!prev.has(d.id)) {
          next.add(d.id);
        }
      }
      return next;
    });
  };

  const handleDeleteDocument = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = documents.filter((d) => d.id !== id);
    onUpdateDocuments(updated);
  };

  const handleDownloadSingleMd = (doc: HistoryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const blob = new Blob([doc.markdownContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.fileName.endsWith('.md') ? doc.fileName : `${doc.fileName}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Export all selected documents as a ZIP archive
  const handleExportSelectedZip = async () => {
    if (selectedDocs.length === 0) return;
    setIsExportingZip(true);

    try {
      const zip = new JSZip();
      const folder = zip.folder('converted-markdown-documents');

      // Add README index
      const readmeContent = [
        '# Converted Markdown Documents Collection',
        `Generated on: ${new Date().toISOString()}`,
        `Total Documents: ${selectedDocs.length}`,
        `Total Words: ${selectedStats.totalWords.toLocaleString()}`,
        '',
        '## Included Files:',
        ...selectedDocs.map((d, i) => `${i + 1}. \`${d.fileName}\` (${d.fileSize ? formatBytes(d.fileSize) : 'N/A'}, ~${(d.markdownContent.trim().split(/\s+/).length).toLocaleString()} words)`),
      ].join('\n');

      folder?.file('INDEX.md', readmeContent);

      for (const doc of selectedDocs) {
        const safeName = doc.fileName.endsWith('.md') ? doc.fileName : `${doc.fileName}.md`;
        folder?.file(safeName, doc.markdownContent);
      }

      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 },
      });

      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `converted-docs-batch-${selectedDocs.length}-files.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to generate batch zip', err);
    } finally {
      setIsExportingZip(false);
    }
  };

  const handleCopyMerged = () => {
    if (!mergedMarkdown) return;
    navigator.clipboard.writeText(mergedMarkdown);
    setCopiedMerged(true);
    setTimeout(() => setCopiedMerged(false), 2000);
  };

  const handleDownloadMerged = () => {
    if (!mergedMarkdown) return;
    const blob = new Blob([mergedMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `merged_knowledge_digest_${selectedDocs.length}_docs.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSaveNewDoc = () => {
    if (!newDocName.trim() || !newDocContent.trim()) return;
    const safeName = newDocName.trim().endsWith('.md') ? newDocName.trim() : `${newDocName.trim()}.md`;
    onAddNewDocument(safeName, cleanMarkdownOutput(newDocContent));
    setNewDocName('');
    setNewDocContent('');
    setShowAddModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Studio Header & Workflow Guidance */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 sm:p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-500/10 rounded-xl border border-indigo-500/30 text-indigo-400">
                <Boxes className="w-5 h-5" />
              </div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-100 flex items-center gap-2">
                <span>Multi-Document Knowledge & Skill Studio</span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 text-xs font-mono border border-indigo-800/80">
                  {documents.length} Converted Docs
                </span>
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-3xl">
              You have converted multiple individual documents into Markdown. Control each document first, then select all or specific documents to compile into an integrated <strong className="text-zinc-200">Open Knowledge Format (OKF v0.2)</strong> graph or an executable <strong className="text-zinc-200">Agent Skill suite</strong>.
            </p>
          </div>

          {/* Quick Stats Pill */}
          <div className="flex items-center gap-3 bg-zinc-950/80 border border-zinc-800 p-2 sm:p-2.5 rounded-xl text-xs shrink-0">
            <div>
              <div className="text-[10px] uppercase font-semibold text-zinc-500">Selected</div>
              <div className="text-zinc-200 font-bold font-mono">
                {selectedDocs.length} / {documents.length}
              </div>
            </div>
            <div className="h-6 w-px bg-zinc-800" />
            <div>
              <div className="text-[10px] uppercase font-semibold text-zinc-500">Total Words</div>
              <div className="text-emerald-400 font-bold font-mono">
                {selectedStats.totalWords.toLocaleString()}
              </div>
            </div>
            <div className="h-6 w-px bg-zinc-800" />
            <div>
              <div className="text-[10px] uppercase font-semibold text-zinc-500">Est. Tokens</div>
              <div className="text-indigo-400 font-bold font-mono">
                ~{selectedStats.estimatedTokens.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* View Navigation Switcher & Primary Action Triggers */}
        <div className="mt-5 pt-4 border-t border-zinc-800/80 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* View Mode Tabs */}
          <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveView('selection')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap ${
                activeView === 'selection'
                  ? 'bg-zinc-800 text-zinc-100 border border-zinc-700 shadow'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Select Documents ({selectedDocs.length})</span>
            </button>

            <button
              onClick={() => {
                if (selectedDocs.length > 0) setActiveView('okf');
              }}
              disabled={selectedDocs.length === 0}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap ${
                activeView === 'okf'
                  ? 'bg-indigo-950 text-indigo-300 border border-indigo-700 shadow'
                  : selectedDocs.length === 0
                  ? 'text-zinc-600 opacity-50 cursor-not-allowed'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>OKF Knowledge Graph</span>
            </button>

            <button
              onClick={() => {
                if (selectedDocs.length > 0) setActiveView('skills');
              }}
              disabled={selectedDocs.length === 0}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap ${
                activeView === 'skills'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-700 shadow'
                  : selectedDocs.length === 0
                  ? 'text-zinc-600 opacity-50 cursor-not-allowed'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span>Agent Skill (SKILL.md)</span>
            </button>

            <button
              onClick={() => {
                if (selectedDocs.length > 0) setActiveView('merged');
              }}
              disabled={selectedDocs.length === 0}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap ${
                activeView === 'merged'
                  ? 'bg-amber-950 text-amber-300 border border-amber-700 shadow'
                  : selectedDocs.length === 0
                  ? 'text-zinc-600 opacity-50 cursor-not-allowed'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>Merged Document</span>
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 overflow-x-auto">
            <button
              onClick={() => {
                if (selectedDocs.length > 0) setActiveView('okf');
              }}
              disabled={selectedDocs.length === 0}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow"
              title="Compile selected documents into a unified OKF knowledge bundle"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Process OKF Graph</span>
            </button>

            <button
              onClick={() => {
                if (selectedDocs.length > 0) setActiveView('skills');
              }}
              disabled={selectedDocs.length === 0}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow"
              title="Decompose selected procedural documents into an Agent Skill suite"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Build Agent Skill</span>
            </button>

            <button
              onClick={handleExportSelectedZip}
              disabled={selectedDocs.length === 0 || isExportingZip}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 rounded-xl text-xs font-medium transition flex items-center gap-1.5 border border-zinc-700"
              title="Download all selected markdown files as a ZIP archive"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>{isExportingZip ? 'Zipping...' : 'Export ZIP'}</span>
            </button>

            <button
              onClick={() => setShowAddModal(true)}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium transition flex items-center gap-1 border border-zinc-700"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Doc</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Areas based on Active View */}
      {activeView === 'selection' && (
        <div className="space-y-4">
          {/* Selection Toolbar & Filter Bar */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={selectedIds.size === documents.length ? handleDeselectAll : handleSelectAll}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition border border-zinc-700/60"
              >
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center transition ${
                    selectedIds.size === documents.length
                      ? 'bg-emerald-500 border-emerald-400 text-zinc-950'
                      : selectedIds.size > 0
                      ? 'bg-emerald-950 border-emerald-600 text-emerald-400'
                      : 'border-zinc-600 bg-zinc-950'
                  }`}
                >
                  {selectedIds.size === documents.length ? (
                    <Check className="w-3 h-3 stroke-[3]" />
                  ) : selectedIds.size > 0 ? (
                    <span className="w-2 h-0.5 bg-emerald-400 rounded-full" />
                  ) : null}
                </div>
                <span>
                  {selectedIds.size === documents.length ? 'Deselect All' : `Select All (${documents.length})`}
                </span>
              </button>

              <button
                onClick={handleInvertSelection}
                className="px-2.5 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 text-xs transition hover:bg-zinc-800"
              >
                Invert
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search converted documents..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
          </div>

          {/* Document Cards Grid */}
          {filteredDocs.length === 0 ? (
            <div className="p-8 text-center bg-zinc-900/40 border border-zinc-800/80 rounded-2xl space-y-3">
              <FileText className="w-8 h-8 text-zinc-600 mx-auto" />
              <p className="text-sm text-zinc-400">No converted documents match your search criteria.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredDocs.map((doc, idx) => {
                const isSelected = selectedIds.has(doc.id);
                const words = doc.markdownContent.trim().split(/\s+/).filter(Boolean).length;
                const previewSnippet = doc.markdownContent
                  .replace(/^#+\s+/gm, '')
                  .replace(/[*_`#]/g, '')
                  .trim()
                  .slice(0, 140);

                return (
                  <div
                    key={doc.id}
                    onClick={() => handleToggleSelect(doc.id)}
                    className={`relative rounded-xl p-4 border transition cursor-pointer flex flex-col justify-between group ${
                      isSelected
                        ? 'bg-zinc-900 border-indigo-500/60 ring-1 ring-indigo-500/30 shadow-md'
                        : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/80'
                    }`}
                  >
                    <div>
                      {/* Top Bar: Checkbox & File Header */}
                      <div className="flex items-start justify-between gap-2.5 mb-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition ${
                              isSelected
                                ? 'bg-emerald-500 border-emerald-400 text-zinc-950'
                                : 'border-zinc-600 bg-zinc-950 group-hover:border-zinc-500'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>

                          <div className="min-w-0">
                            <h4 className="text-xs sm:text-sm font-semibold text-zinc-200 truncate group-hover:text-indigo-300 transition flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                              <span className="truncate">{doc.fileName}</span>
                            </h4>
                            <div className="text-[10px] text-zinc-500 flex items-center gap-2 mt-0.5">
                              <span>{formatBytes(doc.fileSize || doc.markdownContent.length)}</span>
                              <span>•</span>
                              <span>{doc.timestamp}</span>
                            </div>
                          </div>
                        </div>

                        {/* Badges */}
                        <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-[10px] font-mono text-zinc-400 border border-zinc-700/60 shrink-0">
                          {words.toLocaleString()} words
                        </span>
                      </div>

                      {/* Content Preview Snippet */}
                      <p className="text-xs text-zinc-400 line-clamp-3 leading-relaxed mb-4 bg-zinc-950/50 p-2 rounded-lg border border-zinc-800/60 font-mono text-[11px]">
                        {previewSnippet || '*Empty document*'}
                      </p>
                    </div>

                    {/* Bottom Card Actions */}
                    <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-1 text-xs">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenInSingleView(doc);
                        }}
                        className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-emerald-400 transition flex items-center gap-1 text-[11px]"
                        title="Load into Single Document view to inspect, edit, or adjust threshold"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Inspect & Edit</span>
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => handleDownloadSingleMd(doc, e)}
                          className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
                          title="Download .md file"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteDocument(doc.id, e)}
                          className="p-1.5 rounded hover:bg-rose-950/50 text-zinc-500 hover:text-rose-400 transition"
                          title="Remove from converted library"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* OKF Knowledge Explorer View */}
      {activeView === 'okf' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-indigo-950/40 border border-indigo-800/60 p-3 rounded-xl text-xs">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span className="font-semibold text-indigo-200">
                Multi-Document OKF Knowledge Graph Bundle Active:
              </span>
              <span className="text-zinc-300">
                Compiling concepts across {selectedDocs.length} selected documents.
              </span>
            </div>
            <button
              onClick={() => setActiveView('selection')}
              className="text-xs text-indigo-400 hover:text-indigo-200 transition flex items-center gap-1"
            >
              <span>Modify Selection</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <ErrorBoundary title="Multi-Doc OKF Explorer Error">
            <OKFExplorer documents={selectedDocPayloads} />
          </ErrorBoundary>
        </div>
      )}

      {/* Agent Skills Explorer View */}
      {activeView === 'skills' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-emerald-950/40 border border-emerald-800/60 p-3 rounded-xl text-xs">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span className="font-semibold text-emerald-200">
                Multi-Document Agent Skill Suite Active:
              </span>
              <span className="text-zinc-300">
                Slicing procedures and references across {selectedDocs.length} selected documents.
              </span>
            </div>
            <button
              onClick={() => setActiveView('selection')}
              className="text-xs text-emerald-400 hover:text-emerald-200 transition flex items-center gap-1"
            >
              <span>Modify Selection</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <ErrorBoundary title="Multi-Doc Agent Skill Explorer Error">
            <AgentSkillExplorer documents={selectedDocPayloads} />
          </ErrorBoundary>
        </div>
      )}

      {/* Merged Markdown View */}
      {activeView === 'merged' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-zinc-900 p-3 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-2 text-xs text-zinc-300">
              <BookOpen className="w-4 h-4 text-amber-400" />
              <span className="font-semibold text-zinc-100">Combined Master Document</span>
              <span>({selectedStats.totalWords.toLocaleString()} words across {selectedDocs.length} documents)</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyMerged}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition flex items-center gap-1.5 border border-zinc-700"
              >
                {copiedMerged ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedMerged ? 'Copied' : 'Copy Full Markdown'}</span>
              </button>

              <button
                onClick={handleDownloadMerged}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-medium transition flex items-center gap-1.5 shadow"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Merged .md</span>
              </button>
            </div>
          </div>

          <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 min-h-[400px]">
            <ErrorBoundary title="Merged Markdown Preview Error">
              <RenderedMarkdownPreview
                markdown={mergedMarkdown}
                currentThemeId={currentThemeId}
                onSelectTheme={setCurrentThemeId}
              />
            </ErrorBoundary>
          </div>
        </div>
      )}

      {/* Add / Import Document Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" />
                Add Markdown Document to Library
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-zinc-500 hover:text-zinc-300 text-xs"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Document File Name</label>
                <input
                  type="text"
                  value={newDocName}
                  onChange={(e) => setNewDocName(e.target.value)}
                  placeholder="e.g. operational-guide.md"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Markdown Content</label>
                <textarea
                  value={newDocContent}
                  onChange={(e) => setNewDocContent(e.target.value)}
                  rows={8}
                  placeholder="# Document Title&#10;&#10;Enter or paste markdown text..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-200 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNewDoc}
                disabled={!newDocName.trim() || !newDocContent.trim()}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition shadow"
              >
                Save to Library
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
