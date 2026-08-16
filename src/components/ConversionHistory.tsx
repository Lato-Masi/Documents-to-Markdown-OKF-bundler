import React, { useState } from "react";
import {
  History,
  Clock,
  FileText,
  Trash2,
  Check,
  Sparkles,
  Zap,
  Boxes,
  ArrowRight,
} from "lucide-react";
import { HistoryItem } from "../types";
import { formatBytes } from "../utils/fileHelpers";

interface ConversionHistoryProps {
  history: HistoryItem[];
  onSelectHistoryItem: (item: HistoryItem) => void;
  onClearHistory: () => void;
  onOpenMultiDocHub?: (targetView?: "okf" | "skills" | "selection") => void;
  onDeleteHistoryItem?: (id: string) => void;
}

export default function ConversionHistory({
  history,
  onSelectHistoryItem,
  onClearHistory,
  onOpenMultiDocHub,
  onDeleteHistoryItem,
}: ConversionHistoryProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  if (history.length === 0) return null;

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
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

  const handleSelectAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedIds.size === history.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(history.map((h) => h.id)));
    }
  };

  return (
    <div className="p-4 bg-zinc-900/60 rounded-xl border border-zinc-800 space-y-3">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
            <History className="w-4 h-4 text-emerald-400" />
            <span>Converted Documents Library ({history.length})</span>
          </h3>

          {history.length >= 2 && onOpenMultiDocHub && (
            <button
              onClick={() => onOpenMultiDocHub("selection")}
              className="px-2 py-0.5 rounded-full bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-300 text-[11px] font-medium transition flex items-center gap-1"
            >
              <Boxes className="w-3 h-3" />
              <span>Multi-Doc Studio</span>
              <ArrowRight className="w-2.5 h-2.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs">
          {history.length >= 2 && (
            <button
              onClick={handleSelectAll}
              className="text-zinc-400 hover:text-zinc-200 transition text-[11px] px-2 py-1 rounded hover:bg-zinc-800"
            >
              {selectedIds.size === history.length ? "Deselect All" : "Select All"}
            </button>
          )}
          <button
            onClick={onClearHistory}
            className="text-zinc-500 hover:text-rose-400 transition flex items-center gap-1 text-[11px] px-2 py-1 rounded hover:bg-zinc-800"
          >
            <Trash2 className="w-3 h-3" />
            Clear
          </button>
        </div>
      </div>

      {/* Multi-Doc Batch Prompt Banner if >= 2 items exist */}
      {history.length >= 2 && onOpenMultiDocHub && (
        <div className="p-2.5 bg-gradient-to-r from-indigo-950/40 via-zinc-900 to-emerald-950/40 border border-indigo-800/40 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-zinc-300">
            <Boxes className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>
              <strong>{history.length} documents converted.</strong> Select specific documents or compile all into a unified OKF knowledge graph or Agent Skill suite:
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => onOpenMultiDocHub("okf")}
              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-[11px] font-semibold transition flex items-center gap-1 shadow"
            >
              <Sparkles className="w-3 h-3" />
              <span>Process OKF ({selectedIds.size > 0 ? selectedIds.size : history.length})</span>
            </button>

            <button
              onClick={() => onOpenMultiDocHub("skills")}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-[11px] font-semibold transition flex items-center gap-1 shadow"
            >
              <Zap className="w-3 h-3" />
              <span>Build Skills ({selectedIds.size > 0 ? selectedIds.size : history.length})</span>
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {history.map((item) => {
          const isSelected = selectedIds.has(item.id);
          const words = item.markdownContent ? item.markdownContent.trim().split(/\s+/).filter(Boolean).length : 0;

          return (
            <div
              key={item.id}
              onClick={() => onSelectHistoryItem(item)}
              className={`flex items-center justify-between p-2.5 rounded-lg border text-left transition cursor-pointer group ${
                isSelected
                  ? "bg-zinc-800/90 border-indigo-500/70"
                  : "bg-zinc-800/40 hover:bg-zinc-800 border-zinc-700/50 hover:border-emerald-500/50"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 pr-1">
                {history.length >= 2 && (
                  <button
                    onClick={(e) => handleToggleSelect(item.id, e)}
                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition ${
                      isSelected
                        ? "bg-emerald-500 border-emerald-400 text-zinc-950"
                        : "border-zinc-600 bg-zinc-950 group-hover:border-zinc-500"
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                  </button>
                )}

                <div className="min-w-0">
                  <div className="text-xs font-medium text-zinc-200 group-hover:text-emerald-400 truncate flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                    <span className="truncate">{item.fileName}</span>
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5 flex items-center gap-1.5">
                    <span>{formatBytes(item.fileSize || item.markdownContent.length)}</span>
                    <span>•</span>
                    <span>{words.toLocaleString()} words</span>
                    <span>•</span>
                    <span className="flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      {item.timestamp}
                    </span>
                  </div>
                </div>
              </div>

              {onDeleteHistoryItem && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteHistoryItem(item.id);
                  }}
                  className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-zinc-700/50 transition opacity-0 group-hover:opacity-100"
                  title="Remove from history"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
