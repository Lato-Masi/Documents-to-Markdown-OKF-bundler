import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Download,
  Upload,
  RotateCcw,
  Sparkles,
  Search,
  CheckCircle2,
  HelpCircle,
  FolderDown,
  Layers,
  Tag,
  Sliders,
  AlertCircle,
  Info,
  FileCode,
  FileJson,
  FileSpreadsheet,
  Eye,
  EyeOff,
  Copy,
  ChevronDown
} from 'lucide-react';
import {
  CustomLexiconEntry,
  LexiconCategory,
  BUILTIN_LEXICON_PRESETS,
  loadCustomLexicon,
  saveCustomLexicon,
  loadHiddenPresetIds,
  saveHiddenPresetIds,
  parseAndValidateLexiconFile,
  exportLexiconToCsv
} from '../lib/lexiconStorage';
import { defaultNlpEntityExtractor } from '../lib/nlpEntityExtractor';

interface LexiconConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLexiconChanged?: () => void;
}

const CATEGORY_COLORS: Record<LexiconCategory, { bg: string; text: string; border: string }> = {
  concept: { bg: 'bg-purple-950/60', text: 'text-purple-300', border: 'border-purple-800/80' },
  organization: { bg: 'bg-blue-950/60', text: 'text-blue-300', border: 'border-blue-800/80' },
  person: { bg: 'bg-emerald-950/60', text: 'text-emerald-300', border: 'border-emerald-800/80' },
  protocol: { bg: 'bg-amber-950/60', text: 'text-amber-300', border: 'border-amber-800/80' },
  technology: { bg: 'bg-cyan-950/60', text: 'text-cyan-300', border: 'border-cyan-800/80' },
  metric: { bg: 'bg-rose-950/60', text: 'text-rose-300', border: 'border-rose-800/80' },
};

const JSON_ENVELOPE_SAMPLE = {
  version: "1.0",
  exportedAt: new Date().toISOString(),
  description: "Custom NLP Lexicon definition for domain-specific entity extraction",
  entries: [
    {
      canonicalName: "Raft Consensus",
      category: "concept",
      aliases: ["raft", "raft protocol", "raft-consensus"],
      baseSalience: 0.95,
      description: "Distributed consensus algorithm",
      enabled: true
    },
    {
      canonicalName: "Google DeepMind",
      category: "organization",
      aliases: ["deepmind", "gemini team"],
      baseSalience: 0.85,
      description: "AI research lab",
      enabled: true
    }
  ]
};

const JSON_FLAT_SAMPLE = [
  {
    canonicalName: "Qdrant Vector Engine",
    category: "technology",
    aliases: ["qdrant", "qdrant db"],
    baseSalience: 0.85,
    description: "Open-source vector search engine",
    enabled: true
  },
  {
    canonicalName: "Model Context Protocol",
    category: "protocol",
    aliases: ["mcp", "model context protocol"],
    baseSalience: 0.95,
    description: "Standard for connecting AI models to external tools",
    enabled: true
  }
];

const CSV_SAMPLE = `canonicalName,category,aliases,baseSalience,description,enabled
Raft Consensus,concept,raft; raft protocol; raft-consensus,0.95,"Distributed consensus algorithm",true
Paxos Protocol,concept,paxos; multi-paxos; fast paxos,0.95,"Classic consensus algorithm by Leslie Lamport",true
Google DeepMind,organization,deepmind; google deepmind,0.85,"AI research lab",true
Pinecone Vector DB,technology,pinecone; pinecone db,0.85,"Managed vector database",true
Model Context Protocol,protocol,mcp; model context protocol,0.95,"Standard for connecting AI models to tools",true`;

export default function LexiconConfigModal({
  isOpen,
  onClose,
  onLexiconChanged,
}: LexiconConfigModalProps) {
  const [entries, setEntries] = useState<CustomLexiconEntry[]>([]);
  const [hiddenPresetIds, setHiddenPresetIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  // New entry form state
  const [isAdding, setIsAdding] = useState(false);
  const [newCanonicalName, setNewCanonicalName] = useState('');
  const [newCategory, setNewCategory] = useState<LexiconCategory>('concept');
  const [newAliases, setNewAliases] = useState('');
  const [newBaseSalience, setNewBaseSalience] = useState<number>(0.9);
  const [newDescription, setNewDescription] = useState('');

  // Editing form state
  const [editCanonicalName, setEditCanonicalName] = useState('');
  const [editCategory, setEditCategory] = useState<LexiconCategory>('concept');
  const [editAliases, setEditAliases] = useState('');
  const [editBaseSalience, setEditBaseSalience] = useState<number>(0.9);
  const [editDescription, setEditDescription] = useState('');

  // Format Specification Modal / Drawer state
  const [showSpecModal, setShowSpecModal] = useState<boolean>(false);
  const [specTab, setSpecTab] = useState<'csv' | 'json_envelope' | 'json_array'>('csv');
  const [copiedSpec, setCopiedSpec] = useState<boolean>(false);

  // Export dropdown state
  const [showExportMenu, setShowExportMenu] = useState<boolean>(false);

  // Notification feedback
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setEntries(loadCustomLexicon());
      setHiddenPresetIds(loadHiddenPresetIds());
      setIsAdding(false);
      setEditingEntryId(null);
      setShowSpecModal(false);
      setShowExportMenu(false);
    }
  }, [isOpen]);

  const showFeedback = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => setFeedbackMessage(null), 3000);
  };

  const handleSaveAndSync = (updated: CustomLexiconEntry[]) => {
    setEntries(updated);
    saveCustomLexicon(updated);
    defaultNlpEntityExtractor.refreshLexiconFromStorage();
    if (onLexiconChanged) onLexiconChanged();
  };

  const handleToggleEntry = (id: string) => {
    const updated = entries.map((entry) =>
      entry.id === id ? { ...entry, enabled: entry.enabled === false ? true : false } : entry
    );
    handleSaveAndSync(updated);
  };

  const handleDeleteEntry = (id: string) => {
    const updated = entries.filter((e) => e.id !== id);
    handleSaveAndSync(updated);
    showFeedback('Lexicon entry removed');
  };

  const handleAddNewEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCanonicalName.trim()) return;

    const parsedAliases = newAliases
      .split(',')
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean);

    const newEntry: CustomLexiconEntry = {
      id: `entry_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      canonicalName: newCanonicalName.trim(),
      category: newCategory,
      aliases: parsedAliases,
      baseSalience: Number(newBaseSalience) || 0.85,
      description: newDescription.trim() || undefined,
      enabled: true,
    };

    const updated = [newEntry, ...entries];
    handleSaveAndSync(updated);

    // Reset form
    setNewCanonicalName('');
    setNewAliases('');
    setNewDescription('');
    setNewBaseSalience(0.9);
    setIsAdding(false);
    showFeedback(`Added "${newEntry.canonicalName}" to active lexicon`);
  };

  const handleStartEdit = (entry: CustomLexiconEntry) => {
    setEditingEntryId(entry.id);
    setEditCanonicalName(entry.canonicalName);
    setEditCategory(entry.category);
    setEditAliases((entry.aliases || []).join(', '));
    setEditBaseSalience(entry.baseSalience || 0.85);
    setEditDescription(entry.description || '');
  };

  const handleSaveEdit = (id: string) => {
    if (!editCanonicalName.trim()) return;

    const parsedAliases = editAliases
      .split(',')
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean);

    const updated = entries.map((entry) =>
      entry.id === id
        ? {
            ...entry,
            canonicalName: editCanonicalName.trim(),
            category: editCategory,
            aliases: parsedAliases,
            baseSalience: Number(editBaseSalience) || 0.85,
            description: editDescription.trim() || undefined,
          }
        : entry
    );

    handleSaveAndSync(updated);
    setEditingEntryId(null);
    showFeedback(`Updated "${editCanonicalName}"`);
  };

  const handleLoadPreset = (preset: typeof BUILTIN_LEXICON_PRESETS[0]) => {
    const existingNames = new Set(entries.map((e) => e.canonicalName.toLowerCase()));
    const newItems: CustomLexiconEntry[] = [];

    preset.entries.forEach((item) => {
      if (!existingNames.has(item.canonicalName.toLowerCase())) {
        newItems.push({
          id: `entry_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          ...item,
          enabled: true,
        });
      }
    });

    if (newItems.length === 0) {
      showFeedback(`All entries from ${preset.name} are already present`);
      return;
    }

    const updated = [...newItems, ...entries];
    handleSaveAndSync(updated);
    showFeedback(`Loaded ${newItems.length} entries from ${preset.name}`);
  };

  // Delete preset pack and remove its terms from active lexicon if user wants
  const handleDeletePresetPack = (presetId: string, presetName: string) => {
    const removeTerms = window.confirm(
      `Delete preset pack "${presetName}"?\n\nClick OK to also remove this pack's terms from your active lexicon, or Cancel to just delete the pack card.`
    );

    const updatedHidden = Array.from(new Set([...hiddenPresetIds, presetId]));
    setHiddenPresetIds(updatedHidden);
    saveHiddenPresetIds(updatedHidden);

    if (removeTerms) {
      const preset = BUILTIN_LEXICON_PRESETS.find((p) => p.id === presetId);
      if (preset) {
        const presetNames = new Set(preset.entries.map((e) => e.canonicalName.toLowerCase()));
        const updatedEntries = entries.filter((e) => !presetNames.has(e.canonicalName.toLowerCase()));
        handleSaveAndSync(updatedEntries);
      }
    }

    showFeedback(`Deleted preset pack "${presetName}"`);
  };

  // Restore all hidden preset packs
  const handleRestoreAllPresets = () => {
    setHiddenPresetIds([]);
    saveHiddenPresetIds([]);
    showFeedback('Restored all built-in preset packs');
  };

  const handleResetToDefaults = () => {
    if (window.confirm('Reset lexicon to default system dictionaries? Any custom additions will be cleared.')) {
      setHiddenPresetIds([]);
      saveHiddenPresetIds([]);
      const defaultEntries: CustomLexiconEntry[] = [];
      BUILTIN_LEXICON_PRESETS.forEach((preset) => {
        preset.entries.forEach((entry) => {
          defaultEntries.push({
            id: `entry_${Math.random().toString(36).substring(2, 9)}`,
            ...entry,
            enabled: true,
          });
        });
      });
      handleSaveAndSync(defaultEntries);
      showFeedback('Reset lexicon to built-in presets');
    }
  };

  const handleExportJson = () => {
    setShowExportMenu(false);
    const payload = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      description: 'NLP Custom Lexicon & Domain Entity Specification',
      totalEntries: entries.length,
      entries: entries.map((e) => ({
        id: e.id,
        canonicalName: e.canonicalName,
        category: e.category,
        aliases: e.aliases || [],
        baseSalience: e.baseSalience || 0.85,
        description: e.description || '',
        enabled: e.enabled !== false,
      })),
    };
    const jsonStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nlp_custom_lexicon_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showFeedback('Exported lexicon as JSON');
  };

  const handleExportCsv = () => {
    setShowExportMenu(false);
    const csvContent = exportLexiconToCsv(entries);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nlp_custom_lexicon_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showFeedback('Exported lexicon as CSV');
  };

  // Unified File Importer supporting CSV, JSON Envelope, and JSON Flat Array
  const handleUniversalImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const fileContent = evt.target?.result as string;
        const result = parseAndValidateLexiconFile(fileContent, file.name);

        if (!result.success || result.entries.length === 0) {
          alert(`Import Error: ${result.error || 'No valid entity entries found in file.'}`);
          return;
        }

        const existingMap = new Map(entries.map((item) => [item.canonicalName.toLowerCase(), item]));
        let addedCount = 0;
        let updatedCount = 0;

        result.entries.forEach((newEntry) => {
          const key = newEntry.canonicalName.toLowerCase();
          if (existingMap.has(key)) {
            existingMap.set(key, { ...existingMap.get(key)!, ...newEntry });
            updatedCount++;
          } else {
            existingMap.set(key, newEntry);
            addedCount++;
          }
        });

        const merged = Array.from(existingMap.values());
        handleSaveAndSync(merged);
        const formatLabel = result.format === 'csv' ? 'CSV' : result.format === 'json_envelope' ? 'JSON Envelope' : 'JSON Array';
        showFeedback(`Imported (${formatLabel}): ${addedCount} added, ${updatedCount} merged/updated`);
      } catch (err: any) {
        alert(`Failed to parse file: ${err?.message || 'Invalid syntax'}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCopySpec = () => {
    let contentToCopy = '';
    if (specTab === 'csv') {
      contentToCopy = CSV_SAMPLE;
    } else if (specTab === 'json_envelope') {
      contentToCopy = JSON.stringify(JSON_ENVELOPE_SAMPLE, null, 2);
    } else {
      contentToCopy = JSON.stringify(JSON_FLAT_SAMPLE, null, 2);
    }
    navigator.clipboard.writeText(contentToCopy);
    setCopiedSpec(true);
    setTimeout(() => setCopiedSpec(false), 2000);
  };

  const visiblePresets = BUILTIN_LEXICON_PRESETS.filter((p) => !hiddenPresetIds.includes(p.id));

  const filteredEntries = entries.filter((entry) => {
    const matchesCategory = selectedCategory === 'all' || entry.category === selectedCategory;
    const matchesSearch =
      !searchQuery.trim() ||
      entry.canonicalName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (entry.aliases || []).some((a) => a.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (entry.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-700/80 rounded-2xl w-full max-w-5xl h-[88vh] flex flex-col shadow-2xl overflow-hidden relative">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-950/80 border border-purple-800/80 text-purple-300">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-zinc-100">
                  NLP Custom Lexicon & Entity Dictionary
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-900/60 border border-purple-700/60 text-purple-300 font-mono">
                  {entries.filter((e) => e.enabled !== false).length} Active Terms
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Configure domain entities, synonyms, and acronyms in CSV or JSON to guide MetaAST node tagging and Graph-RAG neighborhood discovery.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSpecModal(true)}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-purple-300 text-xs font-semibold flex items-center gap-1.5 border border-purple-800/50 transition cursor-pointer"
              title="View CSV and JSON import/export specifications and schema"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Import Specs</span>
            </button>

            {/* Export Dropdown Menu (CSV & JSON) */}
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold flex items-center gap-1.5 border border-zinc-700 transition cursor-pointer"
                title="Export lexicon to CSV or JSON"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export</span>
                <ChevronDown className="w-3 h-3 text-zinc-400" />
              </button>

              {showExportMenu && (
                <div className="absolute right-0 mt-1 w-44 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl py-1 z-30 animate-in fade-in duration-100">
                  <button
                    onClick={handleExportCsv}
                    className="w-full px-3 py-2 text-left text-xs font-semibold text-zinc-200 hover:bg-zinc-800 flex items-center gap-2 transition cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                    <div>
                      <div className="font-bold">Export as CSV</div>
                      <div className="text-[10px] text-zinc-400 font-normal">Spreadsheet friendly</div>
                    </div>
                  </button>
                  <button
                    onClick={handleExportJson}
                    className="w-full px-3 py-2 text-left text-xs font-semibold text-zinc-200 hover:bg-zinc-800 flex items-center gap-2 transition cursor-pointer border-t border-zinc-800"
                  >
                    <FileJson className="w-4 h-4 text-purple-400" />
                    <div>
                      <div className="font-bold">Export as JSON</div>
                      <div className="text-[10px] text-zinc-400 font-normal">Full envelope format</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Import Button supporting .csv and .json */}
            <label className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold flex items-center gap-1.5 border border-zinc-700 transition cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>Import</span>
              <input
                type="file"
                accept=".csv,.json"
                onChange={handleUniversalImport}
                className="hidden"
              />
            </label>

            <button
              onClick={handleResetToDefaults}
              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700 transition cursor-pointer"
              title="Reset to default dictionaries"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-sm transition ml-2 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedbackMessage && (
          <div className="px-6 py-2 bg-purple-950/80 border-b border-purple-800/80 text-purple-200 text-xs flex items-center gap-2 animate-in slide-in-from-top duration-200 shrink-0">
            <CheckCircle2 className="w-4 h-4 text-purple-400" />
            <span>{feedbackMessage}</span>
          </div>
        )}

        {/* Preset Packs Banner */}
        <div className="px-6 py-3 bg-zinc-950/50 border-b border-zinc-800 shrink-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Built-in Domain Dictionaries</span>
              {hiddenPresetIds.length > 0 && (
                <span className="text-[11px] text-zinc-500 font-normal ml-2">
                  ({hiddenPresetIds.length} preset pack{hiddenPresetIds.length > 1 ? 's' : ''} deleted)
                </span>
              )}
            </div>
            {hiddenPresetIds.length > 0 && (
              <button
                onClick={handleRestoreAllPresets}
                className="text-[11px] text-purple-400 hover:text-purple-300 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Restore Deleted Packs</span>
              </button>
            )}
          </div>

          {visiblePresets.length === 0 ? (
            <div className="py-3 px-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-400 flex items-center justify-between">
              <span>All preset packs have been deleted. You can restore them anytime.</span>
              <button
                onClick={handleRestoreAllPresets}
                className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-purple-300 text-xs font-semibold transition cursor-pointer"
              >
                Restore Default Presets
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2.5">
              {visiblePresets.map((preset) => (
                <div
                  key={preset.id}
                  className="p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800 hover:border-zinc-700 flex flex-col justify-between transition group relative"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs font-bold text-zinc-200 mb-0.5">
                      <span className="truncate pr-2">{preset.name}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-zinc-400 font-mono">
                          {preset.entries.length} terms
                        </span>
                        <button
                          onClick={() => handleDeletePresetPack(preset.id, preset.name)}
                          className="p-1 rounded hover:bg-red-950/60 text-zinc-500 hover:text-red-400 transition cursor-pointer opacity-80 group-hover:opacity-100"
                          title={`Delete preset pack "${preset.name}"`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <div className="text-[11px] text-zinc-400 line-clamp-1 mb-2">
                      {preset.description}
                    </div>
                  </div>
                  <button
                    onClick={() => handleLoadPreset(preset)}
                    className="w-full py-1 rounded bg-zinc-800 hover:bg-purple-900/40 text-purple-300 hover:text-purple-200 text-[11px] font-semibold flex items-center justify-center gap-1 border border-zinc-700/60 hover:border-purple-700 transition cursor-pointer"
                  >
                    <FolderDown className="w-3 h-3" />
                    <span>Load Preset Pack</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Search & Filter Bar */}
        <div className="px-6 py-3 bg-zinc-950/40 border-b border-zinc-800 flex items-center justify-between gap-3 shrink-0">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search terms, aliases, or descriptions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Category Filter Badges */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {['all', 'concept', 'organization', 'person', 'protocol', 'technology', 'metric'].map(
              (cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition capitalize cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-purple-600 text-white font-bold'
                      : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {cat}
                </button>
              )
            )}
          </div>

          <button
            onClick={() => setIsAdding(!isAdding)}
            className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow transition cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Term</span>
          </button>
        </div>

        {/* Modal Main Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Add New Entry Form Drawer */}
          {isAdding && (
            <form
              onSubmit={handleAddNewEntry}
              className="p-4 rounded-xl bg-zinc-950 border border-purple-900/60 space-y-3 animate-in slide-in-from-top-2 duration-200"
            >
              <div className="flex items-center justify-between text-xs font-bold text-purple-300">
                <div className="flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" />
                  <span>Add New Domain Entity to Lexicon</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    Canonical Entity Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Raft Consensus"
                    value={newCanonicalName}
                    onChange={(e) => setNewCanonicalName(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Entity Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as LexiconCategory)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-purple-500"
                  >
                    <option value="concept">Concept / Algorithm</option>
                    <option value="organization">Organization / Lab</option>
                    <option value="person">Person / Author</option>
                    <option value="protocol">Protocol / Standard</option>
                    <option value="technology">Technology / Database</option>
                    <option value="metric">Metric / Benchmark</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    Base Salience ({newBaseSalience})
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="1.0"
                    step="0.05"
                    value={newBaseSalience}
                    onChange={(e) => setNewBaseSalience(parseFloat(e.target.value))}
                    className="w-full mt-2 accent-purple-500"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    Synonyms, Acronyms & Aliases (comma separated)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. raft, raft protocol, raft-consensus"
                    value={newAliases}
                    onChange={(e) => setNewAliases(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Description</label>
                  <input
                    type="text"
                    placeholder="Brief semantic context"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save to Lexicon</span>
                </button>
              </div>
            </form>
          )}

          {/* Lexicon Table / Cards List */}
          {filteredEntries.length === 0 ? (
            <div className="py-16 text-center text-zinc-500">
              <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <div className="text-sm font-semibold text-zinc-400">No lexicon entries match</div>
              <div className="text-xs mt-1">Try adjusting your filter or search query.</div>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredEntries.map((entry) => {
                const isEditing = editingEntryId === entry.id;
                const colors = CATEGORY_COLORS[entry.category] || CATEGORY_COLORS.concept;

                if (isEditing) {
                  return (
                    <div
                      key={entry.id}
                      className="p-3.5 rounded-xl bg-zinc-950 border border-purple-700 space-y-3"
                    >
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div>
                          <label className="block text-[10px] text-zinc-400 mb-1">
                            Canonical Name
                          </label>
                          <input
                            type="text"
                            value={editCanonicalName}
                            onChange={(e) => setEditCanonicalName(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-zinc-400 mb-1">Category</label>
                          <select
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value as LexiconCategory)}
                            className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200"
                          >
                            <option value="concept">Concept / Algorithm</option>
                            <option value="organization">Organization / Lab</option>
                            <option value="person">Person / Author</option>
                            <option value="protocol">Protocol / Standard</option>
                            <option value="technology">Technology / Database</option>
                            <option value="metric">Metric / Benchmark</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-zinc-400 mb-1">
                            Salience ({editBaseSalience})
                          </label>
                          <input
                            type="range"
                            min="0.5"
                            max="1.0"
                            step="0.05"
                            value={editBaseSalience}
                            onChange={(e) => setEditBaseSalience(parseFloat(e.target.value))}
                            className="w-full mt-1 accent-purple-500"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-[10px] text-zinc-400 mb-1">
                            Aliases (comma separated)
                          </label>
                          <input
                            type="text"
                            value={editAliases}
                            onChange={(e) => setEditAliases(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-zinc-400 mb-1">
                            Description
                          </label>
                          <input
                            type="text"
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setEditingEntryId(null)}
                          className="px-2.5 py-1 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSaveEdit(entry.id)}
                          className="px-2.5 py-1 rounded bg-purple-600 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Done</span>
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={entry.id}
                    className={`p-3 rounded-xl bg-zinc-950/80 border ${
                      entry.enabled !== false ? 'border-zinc-800' : 'border-zinc-800/40 opacity-50'
                    } flex items-center justify-between gap-4 hover:border-zinc-700 transition`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* Checkbox toggle */}
                      <input
                        type="checkbox"
                        checked={entry.enabled !== false}
                        onChange={() => handleToggleEntry(entry.id)}
                        className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-purple-600 focus:ring-0 cursor-pointer"
                        title={entry.enabled !== false ? 'Active' : 'Disabled'}
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-zinc-200 truncate">
                            {entry.canonicalName}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${colors.bg} ${colors.text} ${colors.border} border`}
                          >
                            {entry.category}
                          </span>
                          <span className="text-[10px] text-zinc-400 font-mono">
                            salience: {entry.baseSalience || 0.85}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap mt-1">
                          {(entry.aliases || []).map((alias, aIdx) => (
                            <span
                              key={aIdx}
                              className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-400"
                            >
                              "{alias}"
                            </span>
                          ))}
                          {entry.description && (
                            <span className="text-[11px] text-zinc-400 ml-1 truncate">
                              • {entry.description}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleStartEdit(entry)}
                        className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
                        title="Edit entry"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteEntry(entry.id)}
                        className="p-1.5 rounded-lg hover:bg-red-950/40 text-zinc-400 hover:text-red-400 transition cursor-pointer"
                        title="Delete entry"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-zinc-800 bg-zinc-950/80 flex items-center justify-between text-xs text-zinc-400 shrink-0">
          <div className="flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-zinc-400" />
            <span>
              Configured lexicon terms automatically trigger during Markdown parsing and enrich MetaAST nodes for graph routing. Supports CSV and JSON imports.
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition cursor-pointer"
          >
            Close
          </button>
        </div>

        {/* Import File Specification Drawer / Modal */}
        {showSpecModal && (
          <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col p-6 animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-purple-950 border border-purple-800 text-purple-300">
                  <FileCode className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">
                    NLP Custom Lexicon Import & Export Specifications
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Create domain dictionaries in simple CSV format (Excel / Sheets compatible) or structured JSON.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowSpecModal(false)}
                className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-sm transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Format Selector Tabs */}
            <div className="flex items-center gap-2 pb-3 border-b border-zinc-800 shrink-0">
              <button
                onClick={() => setSpecTab('csv')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                  specTab === 'csv'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
                <span>Format 1: Simple CSV (Recommended)</span>
              </button>

              <button
                onClick={() => setSpecTab('json_envelope')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                  specTab === 'json_envelope'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                <FileJson className="w-4 h-4 text-purple-300" />
                <span>Format 2: JSON Envelope</span>
              </button>

              <button
                onClick={() => setSpecTab('json_array')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                  specTab === 'json_array'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                <Layers className="w-4 h-4 text-purple-300" />
                <span>Format 3: JSON Flat Array</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs text-zinc-300 py-3">
              {/* Tab Description & Guide */}
              {specTab === 'csv' && (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/80 text-emerald-200">
                    <div className="font-bold flex items-center gap-1.5 text-xs text-emerald-300 mb-1">
                      <FileSpreadsheet className="w-4 h-4" />
                      <span>CSV Format (Easiest to Create and Edit in Excel, Numbers, or Google Sheets)</span>
                    </div>
                    <p className="text-[11px] text-zinc-300 leading-relaxed">
                      Create a standard comma-delimited spreadsheet. Use semicolons (<code className="text-emerald-300 font-mono">;</code>) or pipes (<code className="text-emerald-300 font-mono">|</code>) to separate multiple aliases for an entity.
                    </p>
                  </div>

                  <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2">
                    <div className="text-zinc-300 font-semibold text-xs">CSV Column Headers & Usage:</div>
                    <ul className="list-disc list-inside space-y-1 text-zinc-400 text-[11px] leading-relaxed">
                      <li><strong className="text-zinc-200 font-mono">canonicalName</strong> (Required): The display name of the concept or technology.</li>
                      <li><strong className="text-zinc-200 font-mono">category</strong> (Optional): <code className="text-purple-300">concept</code>, <code className="text-blue-300">organization</code>, <code className="text-emerald-300">person</code>, <code className="text-amber-300">protocol</code>, <code className="text-cyan-300">technology</code>, or <code className="text-rose-300">metric</code>.</li>
                      <li><strong className="text-zinc-200 font-mono">aliases</strong> (Optional): Alternate terms or acronyms separated by semicolons (e.g. <code className="text-emerald-300">"raft; raft protocol; raft-consensus"</code>).</li>
                      <li><strong className="text-zinc-200 font-mono">baseSalience</strong> (Optional): Priority weight between 0.0 and 1.0 (defaults to 0.85).</li>
                      <li><strong className="text-zinc-200 font-mono">description</strong> (Optional): Semantic definition or domain context.</li>
                      <li><strong className="text-zinc-200 font-mono">enabled</strong> (Optional): <code className="text-emerald-300">true</code> or <code className="text-emerald-300">false</code>.</li>
                    </ul>
                  </div>
                </div>
              )}

              {specTab === 'json_envelope' && (
                <div className="p-3.5 rounded-xl bg-purple-950/40 border border-purple-800/80 space-y-2">
                  <div className="font-bold text-purple-300 flex items-center gap-1.5">
                    <FileJson className="w-4 h-4" />
                    <span>JSON Envelope Format (Includes Version & Metadata)</span>
                  </div>
                  <p className="text-zinc-300 text-[11px] leading-relaxed">
                    Root object containing an <code className="text-purple-300 font-mono">entries</code> array along with format versioning and export timestamps.
                  </p>
                </div>
              )}

              {specTab === 'json_array' && (
                <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
                  <div className="font-bold text-purple-300 flex items-center gap-1.5">
                    <Layers className="w-4 h-4" />
                    <span>JSON Flat Array Format (Direct List of Entities)</span>
                  </div>
                  <p className="text-zinc-300 text-[11px] leading-relaxed">
                    A simple array of entity objects directly at the root level of the JSON document.
                  </p>
                </div>
              )}

              {/* Field Reference Table */}
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                <div className="font-bold text-zinc-200 text-xs">Entity Properties Reference</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-400 text-[11px]">
                        <th className="pb-2 font-mono">Field Name</th>
                        <th className="pb-2 font-mono">Type</th>
                        <th className="pb-2">Required</th>
                        <th className="pb-2">Allowed Values & Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60 font-mono text-[11px]">
                      <tr>
                        <td className="py-2 text-purple-300 font-bold">canonicalName</td>
                        <td className="py-2 text-zinc-400">string</td>
                        <td className="py-2 text-emerald-400">Yes</td>
                        <td className="py-2 text-zinc-300 font-sans">
                          Display title of the entity (e.g. <code className="text-purple-300">"Raft Consensus"</code>).
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 text-purple-300 font-bold">category</td>
                        <td className="py-2 text-zinc-400">string</td>
                        <td className="py-2 text-zinc-500">Optional</td>
                        <td className="py-2 text-zinc-300 font-sans">
                          <code className="text-purple-300">concept</code> | <code className="text-blue-300">organization</code> | <code className="text-emerald-300">person</code> | <code className="text-amber-300">protocol</code> | <code className="text-cyan-300">technology</code> | <code className="text-rose-300">metric</code>.
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 text-purple-300 font-bold">aliases</td>
                        <td className="py-2 text-zinc-400">string / string[]</td>
                        <td className="py-2 text-zinc-500">Optional</td>
                        <td className="py-2 text-zinc-300 font-sans">
                          Semicolon-separated in CSV (e.g. <code className="text-purple-300">"raft; pbft"</code>) or string array in JSON.
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 text-purple-300 font-bold">baseSalience</td>
                        <td className="py-2 text-zinc-400">number</td>
                        <td className="py-2 text-zinc-500">Optional</td>
                        <td className="py-2 text-zinc-300 font-sans">
                          Graph weight between <code className="text-purple-300">0.0</code> and <code className="text-purple-300">1.0</code> (default: <code className="text-purple-300">0.85</code>).
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 text-purple-300 font-bold">description</td>
                        <td className="py-2 text-zinc-400">string</td>
                        <td className="py-2 text-zinc-500">Optional</td>
                        <td className="py-2 text-zinc-300 font-sans">
                          Context summary attached to the entity and graph nodes.
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 text-purple-300 font-bold">enabled</td>
                        <td className="py-2 text-zinc-400">boolean</td>
                        <td className="py-2 text-zinc-500">Optional</td>
                        <td className="py-2 text-zinc-300 font-sans">
                          Whether actively matching during NLP parsing (default: <code className="text-purple-300">true</code>).
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Interactive Example & Copy */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-zinc-200">
                    Sample {specTab === 'csv' ? 'CSV Content' : specTab === 'json_envelope' ? 'JSON Envelope' : 'JSON Array'}
                  </span>
                  <button
                    onClick={handleCopySpec}
                    className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-purple-300 text-xs font-semibold flex items-center gap-1 border border-zinc-700 transition cursor-pointer"
                  >
                    {copiedSpec ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSpec ? 'Copied' : 'Copy Sample Template'}</span>
                  </button>
                </div>
                <pre className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl text-emerald-300 font-mono text-[11px] whitespace-pre-wrap leading-relaxed overflow-x-auto">
                  {specTab === 'csv'
                    ? CSV_SAMPLE
                    : specTab === 'json_envelope'
                    ? JSON.stringify(JSON_ENVELOPE_SAMPLE, null, 2)
                    : JSON.stringify(JSON_FLAT_SAMPLE, null, 2)}
                </pre>
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-800 flex justify-end">
              <button
                onClick={() => setShowSpecModal(false)}
                className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition cursor-pointer"
              >
                Close Specification
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
