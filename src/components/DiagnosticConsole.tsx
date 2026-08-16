import React, { useState } from "react";
import { Terminal, ChevronDown, ChevronUp, Activity, CheckCircle2, AlertTriangle, XCircle, Info, RefreshCcw } from "lucide-react";

export interface DiagnosticLog {
  id: string;
  timestamp: string;
  type: "info" | "success" | "warn" | "error" | "chunk";
  message: string;
  details?: string;
}

export interface StreamMetrics {
  status: "idle" | "connecting" | "streaming" | "completed" | "error";
  chunksReceived: number;
  totalBytes: number;
  charsReceived: number;
  startTime: number | null;
  endTime: number | null;
  chunkRate: number;
}

interface DiagnosticConsoleProps {
  logs: DiagnosticLog[];
  metrics: StreamMetrics;
  onClearLogs?: () => void;
}

export default function DiagnosticConsole({ logs, metrics, onClearLogs }: DiagnosticConsoleProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [showChunkLogs, setShowChunkLogs] = useState(false);

  const elapsedTime = metrics.startTime
    ? Math.floor(((metrics.endTime || Date.now()) - metrics.startTime) / 1000)
    : 0;

  const filteredLogs = showChunkLogs
    ? logs
    : logs.filter((log) => log.type !== "chunk");

  const getStatusBadge = () => {
    switch (metrics.status) {
      case "connecting":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <RefreshCcw className="w-3 h-3 animate-spin" /> Connecting
          </span>
        );
      case "streaming":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Activity className="w-3 h-3 animate-pulse" /> Streaming Active
          </span>
        );
      case "completed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" /> Completed
          </span>
        );
      case "error":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3 h-3" /> Error
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
            Idle
          </span>
        );
    }
  };

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
      {/* Console Header Bar */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-3 bg-zinc-900 flex items-center justify-between cursor-pointer select-none hover:bg-zinc-800/60 transition"
      >
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-emerald-500/10 rounded-lg text-emerald-400 border border-emerald-500/20">
            <Terminal className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
              <span>Live Diagnostic Stream Console</span>
              {getStatusBadge()}
            </h4>
            <p className="text-[11px] text-zinc-400">
              {metrics.chunksReceived} chunks • {metrics.charsReceived.toLocaleString()} chars • {elapsedTime}s elapsed
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-zinc-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-400" />
          )}
        </div>
      </div>

      {/* Expanded Console View */}
      {isOpen && (
        <div className="p-4 space-y-3 border-t border-zinc-800 bg-zinc-950/80 font-mono text-xs">
          {/* Live Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <div className="p-2 bg-zinc-900 rounded-lg border border-zinc-800">
              <span className="text-zinc-500 block">Status</span>
              <span className="font-semibold text-zinc-200 uppercase">{metrics.status}</span>
            </div>
            <div className="p-2 bg-zinc-900 rounded-lg border border-zinc-800">
              <span className="text-zinc-500 block">Chunks / Rate</span>
              <span className="font-semibold text-zinc-200">
                {metrics.chunksReceived} ({metrics.chunkRate.toFixed(1)}/s)
              </span>
            </div>
            <div className="p-2 bg-zinc-900 rounded-lg border border-zinc-800">
              <span className="text-zinc-500 block">Total Data</span>
              <span className="font-semibold text-zinc-200">
                {(metrics.totalBytes / 1024).toFixed(1)} KB ({metrics.charsReceived.toLocaleString()} chars)
              </span>
            </div>
            <div className="p-2 bg-zinc-900 rounded-lg border border-zinc-800">
              <span className="text-zinc-500 block">Elapsed Time</span>
              <span className="font-semibold text-zinc-200">{elapsedTime}s</span>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1 border-t border-zinc-800/60">
            <label className="flex items-center gap-1.5 cursor-pointer hover:text-zinc-200">
              <input
                type="checkbox"
                checked={showChunkLogs}
                onChange={(e) => setShowChunkLogs(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0"
              />
              <span>Show Raw Stream Chunks</span>
            </label>

            <div className="flex items-center gap-3">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const logText = logs
                    .map((l) => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}${l.details ? ` - ${l.details}` : ""}`)
                    .join("\n");
                  navigator.clipboard.writeText(logText);
                  alert("Diagnostic logs copied to clipboard!");
                }}
                className="hover:text-zinc-200 underline text-[11px]"
              >
                Copy Diagnostics
              </button>

              {onClearLogs && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClearLogs();
                  }}
                  className="hover:text-zinc-200 underline text-[11px]"
                >
                  Clear Log
                </button>
              )}
            </div>
          </div>

          {/* Terminal Output Log List */}
          <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1 text-[11px] scrollbar-thin">
            {filteredLogs.length === 0 ? (
              <p className="text-zinc-500 italic py-2 text-center">No diagnostic events recorded yet.</p>
            ) : (
              filteredLogs.map((log) => {
                let icon = <Info className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />;
                let textClass = "text-zinc-300";

                if (log.type === "success") {
                  icon = <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />;
                  textClass = "text-emerald-300";
                } else if (log.type === "warn") {
                  icon = <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />;
                  textClass = "text-amber-300";
                } else if (log.type === "error") {
                  icon = <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />;
                  textClass = "text-rose-300";
                } else if (log.type === "chunk") {
                  icon = <Activity className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />;
                  textClass = "text-zinc-400";
                }

                return (
                  <div key={log.id} className="flex items-start gap-2 leading-relaxed font-mono">
                    <span className="text-zinc-600 shrink-0 text-[10px]">{log.timestamp}</span>
                    {icon}
                    <div className="flex-1 min-w-0">
                      <span className={textClass}>{log.message}</span>
                      {log.details && (
                        <pre className="text-[10px] text-zinc-500 bg-zinc-900/90 p-1.5 rounded mt-0.5 overflow-x-auto">
                          {log.details}
                        </pre>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
