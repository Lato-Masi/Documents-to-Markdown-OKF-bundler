/**
 * @file OKFMcpToolConfigGenerator.tsx
 * @description Interactive Model Context Protocol (MCP) Tool Configuration & Server Generator for OKF v0.2.
 *
 * Provides multi-client config generation (Claude Desktop, Cursor, Windsurf, Zed, Cline, OpenAI),
 * standalone executable server generators (Node.js stdio, Python FastMCP, Docker),
 * customizable tool selection matrix, live setup instructions, and an interactive tool testing sandbox.
 */

import React, { useState, useMemo } from 'react';
import type { OkfBundle } from 'okf-ts';
import type { SemanticGraphResult } from '../lib/okfSemanticGraphEngine';
import {
  generateMCPConfiguration,
  getStandardOKFMCPTools,
  getStandardOKFMCPPrompts,
  type MCPClientTarget,
  type MCPTransportType,
  type MCPToolDefinition,
} from '../lib/okfMcpGenerator';
import HighlightedCodeBlock from './HighlightedCodeBlock';
import {
  Server,
  Terminal,
  Cpu,
  Bot,
  Copy,
  Check,
  Download,
  Play,
  Settings2,
  Layers,
  Search,
  BookOpen,
  FileCode,
  ShieldCheck,
  Zap,
  Sliders,
  ExternalLink,
  Code2,
  FolderCode,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  Box,
} from 'lucide-react';

interface OKFMcpToolConfigGeneratorProps {
  bundle: OkfBundle;
  semanticGraph?: SemanticGraphResult;
}

const CLIENT_OPTIONS: Array<{
  id: MCPClientTarget;
  label: string;
  category: 'client' | 'standalone' | 'agent';
  badge: string;
  desc: string;
}> = [
  {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    category: 'client',
    badge: 'JSON Config',
    desc: 'Anthropic Claude Desktop configuration (claude_desktop_config.json)',
  },
  {
    id: 'cursor',
    label: 'Cursor IDE',
    category: 'client',
    badge: '.cursor/mcp.json',
    desc: 'Cursor Agent & Composer MCP configuration',
  },
  {
    id: 'windsurf',
    label: 'Windsurf IDE',
    category: 'client',
    badge: 'Cascade MCP',
    desc: 'Codeium Windsurf IDE Cascade MCP server definition',
  },
  {
    id: 'zed',
    label: 'Zed Editor',
    category: 'client',
    badge: 'context_servers',
    desc: 'Zed Assistant context server configuration block',
  },
  {
    id: 'cline',
    label: 'Cline / Roo Code',
    category: 'client',
    badge: 'VS Code Extension',
    desc: 'Autonomous coding agent tool manifest with auto-approve rules',
  },
  {
    id: 'standalone-node',
    label: 'Standalone Node.js Server',
    category: 'standalone',
    badge: 'mcp-server.js',
    desc: 'Zero-dependency executable Node.js stdio server with embedded knowledge graph',
  },
  {
    id: 'fastmcp-python',
    label: 'Python FastMCP',
    category: 'standalone',
    badge: 'server.py',
    desc: 'Python FastMCP server ready for LangChain, LlamaIndex, and AutoGen',
  },
  {
    id: 'docker',
    label: 'Docker Container',
    category: 'standalone',
    badge: 'Dockerfile',
    desc: 'Self-contained Alpine Linux container runtime configuration',
  },
  {
    id: 'openai',
    label: 'OpenAI / LangChain Tools',
    category: 'agent',
    badge: 'Function Tools',
    desc: 'Standard JSON schema tools array for OpenAI, LangChain, and LlamaIndex',
  },
];

export default function OKFMcpToolConfigGenerator({
  bundle,
  semanticGraph,
}: OKFMcpToolConfigGeneratorProps) {
  const bundleTitle = bundle.root || 'OKF Knowledge Base';
  const defaultServerName = `okf-${(bundle.root || 'kb').toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '-')}`;

  // Customization State
  const [selectedClient, setSelectedClient] = useState<MCPClientTarget>('claude-desktop');
  const [serverName, setServerName] = useState(defaultServerName);
  const [transport, setTransport] = useState<MCPTransportType>('stdio');
  const [commandPath, setCommandPath] = useState('node');
  const [customPath, setCustomPath] = useState('');

  // Tool Selection State
  const allAvailableTools = useMemo(() => getStandardOKFMCPTools(bundleTitle), [bundleTitle]);
  const [enabledToolIds, setEnabledToolIds] = useState<string[]>(() =>
    allAvailableTools.filter((t) => t.enabledByDefault).map((t) => t.id)
  );

  // UI state
  const [copied, setCopied] = useState<string | null>(null);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  // Live RPC Simulator State
  const [selectedSimTool, setSelectedSimTool] = useState<string>('search_okf_concepts');
  const [simQuery, setSimQuery] = useState('consensus validation');
  const [simConceptId, setSimConceptId] = useState(bundle.concepts[0]?.path || bundle.concepts[0]?.id || '');
  const [simLimit, setSimLimit] = useState(3);
  const [simRunning, setSimRunning] = useState(false);
  const [simOutput, setSimOutput] = useState<any | null>(null);
  const [simLatency, setSimLatency] = useState<number | null>(null);

  // Toggle tool in generator
  const toggleTool = (toolId: string) => {
    setEnabledToolIds((prev) =>
      prev.includes(toolId) ? prev.filter((id) => id !== toolId) : [...prev, toolId]
    );
  };

  // Generate Current Config
  const generatedConfig = useMemo(() => {
    return generateMCPConfiguration(bundle, semanticGraph, selectedClient, {
      serverName: serverName.trim() || defaultServerName,
      transport,
      commandPath: commandPath.trim() || 'node',
      enabledToolIds,
    });
  }, [bundle, semanticGraph, selectedClient, serverName, defaultServerName, transport, commandPath, enabledToolIds]);

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

  // Execute Live Tool Call Simulation
  const handleRunSimulation = async () => {
    setSimRunning(true);
    setSimOutput(null);
    const startTime = performance.now();

    try {
      let args: any = {};
      if (selectedSimTool.includes('search')) {
        args = { query: simQuery, limit: simLimit };
      } else if (selectedSimTool.includes('get') || selectedSimTool.includes('traverse') || selectedSimTool.includes('verify')) {
        args = { conceptId: simConceptId };
      } else if (selectedSimTool.includes('path')) {
        const first = bundle.concepts[0]?.path || 'start';
        const last = bundle.concepts[bundle.concepts.length - 1]?.path || 'end';
        args = { fromConceptId: first, toConceptId: last };
      }

      // Try server RPC endpoint
      const response = await fetch('/api/mcp/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'sim-' + Date.now(),
          method: 'tools/call',
          params: {
            name: selectedSimTool,
            arguments: args,
          },
        }),
      });

      const data = await response.json();
      const elapsed = Math.round(performance.now() - startTime);
      setSimLatency(elapsed);
      setSimOutput(data);
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - startTime);
      setSimLatency(elapsed);
      setSimOutput({ error: err.message || 'Failed to communicate with MCP server endpoint.' });
    } finally {
      setSimRunning(false);
    }
  };

  const selectedClientMeta = CLIENT_OPTIONS.find((c) => c.id === selectedClient);

  return (
    <div className="flex flex-col gap-6">
      {/* Top Banner */}
      <div className="p-4 sm:p-5 rounded-xl bg-slate-900 text-white border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-start gap-3.5">
          <div className="p-3 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400">
            <Server className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-white tracking-tight">
                Model Context Protocol (MCP) Tool Configuration Generator
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-400/30">
                MCP Spec 2024-11-05
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                {enabledToolIds.length} Tools Enabled
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Export native MCP server configurations, tool manifests, and zero-dependency executable server scripts.
              Instantly connect this OKF knowledge base to Claude Desktop, Cursor, Windsurf, Zed, Cline, or OpenAI agents.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto flex-wrap">
          <button
            type="button"
            onClick={() => copyToClipboard(generatedConfig.content, 'main-config')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition cursor-pointer"
          >
            {copied === 'main-config' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Copied Config</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Config</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() =>
              downloadFile(generatedConfig.content, generatedConfig.filename, generatedConfig.mimeType)
            }
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-medium text-white transition cursor-pointer shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download {generatedConfig.filename}</span>
          </button>
        </div>
      </div>

      {/* Target Client Grid */}
      <div className="flex flex-col gap-2.5">
        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
          <Bot className="w-4 h-4 text-indigo-600" />
          Select Target MCP Client / Server Format
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {CLIENT_OPTIONS.map((opt) => {
            const isSelected = selectedClient === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSelectedClient(opt.id)}
                className={`p-3 rounded-xl border text-left transition flex items-start justify-between gap-3 cursor-pointer ${
                  isSelected
                    ? 'bg-amber-50/70 border-amber-500 ring-2 ring-amber-500/20 text-slate-900 shadow-2xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold truncate">{opt.label}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-medium ${
                        isSelected ? 'bg-amber-200/60 text-amber-900' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {opt.badge}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1 line-clamp-1">{opt.desc}</span>
                </div>

                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                    isSelected ? 'border-amber-600 bg-amber-600 text-white' : 'border-slate-300 bg-white'
                  }`}
                >
                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Configuration & Customizer Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Tool Selection Matrix & Settings (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* Tool Selection Matrix Card */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold text-slate-800">Enabled MCP Tools ({enabledToolIds.length})</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEnabledToolIds(allAvailableTools.map((t) => t.id))}
                  className="text-[11px] font-semibold text-indigo-600 hover:underline cursor-pointer"
                >
                  Enable All
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => setEnabledToolIds(allAvailableTools.filter((t) => t.enabledByDefault).map((t) => t.id))}
                  className="text-[11px] font-semibold text-slate-500 hover:underline cursor-pointer"
                >
                  Reset Defaults
                </button>
              </div>
            </div>

            <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto pr-1">
              {allAvailableTools.map((tool) => {
                const isChecked = enabledToolIds.includes(tool.id);
                return (
                  <label
                    key={tool.id}
                    className={`py-2.5 px-2 flex items-start gap-3 rounded-lg transition cursor-pointer hover:bg-slate-50 ${
                      isChecked ? 'bg-indigo-50/30' : 'opacity-70'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleTool(tool.id)}
                      className="mt-1 h-3.5 w-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                    />
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-semibold text-slate-900">{tool.id}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider ${
                            tool.category === 'search'
                              ? 'bg-blue-100 text-blue-800'
                              : tool.category === 'retrieval'
                              ? 'bg-emerald-100 text-emerald-800'
                              : tool.category === 'graph'
                              ? 'bg-purple-100 text-purple-800'
                              : tool.category === 'trust'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {tool.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-snug mt-0.5">{tool.description}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Quick Customizer Parameters */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Settings2 className="w-4 h-4 text-slate-600" />
                Server Parameters
              </span>
              <button
                type="button"
                onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                className="text-[11px] font-semibold text-indigo-600 hover:underline cursor-pointer"
              >
                {showAdvancedSettings ? 'Hide Options' : 'More Options'}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2.5 text-xs">
              <div>
                <label className="text-[11px] font-medium text-slate-600 mb-1 block">MCP Server ID / Name</label>
                <input
                  type="text"
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                  placeholder="okf-server-name"
                />
              </div>

              {showAdvancedSettings && (
                <>
                  <div>
                    <label className="text-[11px] font-medium text-slate-600 mb-1 block">Transport Protocol</label>
                    <select
                      value={transport}
                      onChange={(e) => setTransport(e.target.value as MCPTransportType)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-amber-500 focus:border-amber-500 bg-white"
                    >
                      <option value="stdio">stdio (Standard I/O Process)</option>
                      <option value="sse">sse (Server-Sent Events)</option>
                      <option value="http">http (HTTP POST JSON-RPC)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-600 mb-1 block">Executable Command</label>
                    <input
                      type="text"
                      value={commandPath}
                      onChange={(e) => setCommandPath(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                      placeholder="node or python or npx"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Code & Config Viewer + Installation Guide (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Installation Instructions Box */}
          <div className="p-4 rounded-xl border border-amber-200/80 bg-amber-50/50 text-slate-800 text-xs">
            <div className="flex items-center gap-2 font-bold text-amber-900 mb-2">
              <CheckCircle2 className="w-4 h-4 text-amber-600" />
              Setup Guide: {selectedClientMeta?.label}
            </div>
            <div className="prose prose-xs max-w-none text-slate-700 font-sans whitespace-pre-wrap leading-relaxed">
              {generatedConfig.instructions}
            </div>
          </div>

          {/* Code Viewer */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-mono font-bold text-slate-800">{generatedConfig.filename}</span>
                <span className="text-[11px] text-slate-400 font-mono">({generatedConfig.mimeType})</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => copyToClipboard(generatedConfig.content, 'code-box')}
                  className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 cursor-pointer"
                >
                  {copied === 'code-box' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="rounded-xl overflow-hidden border border-slate-200 max-h-[460px] overflow-y-auto shadow-2xs">
              <HighlightedCodeBlock
                value={generatedConfig.content}
                language={
                  generatedConfig.filename.endsWith('.json')
                    ? 'json'
                    : generatedConfig.filename.endsWith('.py')
                    ? 'python'
                    : generatedConfig.filename.endsWith('.js')
                    ? 'javascript'
                    : 'text'
                }
              />
            </div>
          </div>
        </div>
      </div>

      {/* Interactive MCP Tool Test & RPC Simulator Sandbox */}
      <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-2xs flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">Live MCP Tool RPC Simulator</h4>
              <p className="text-xs text-slate-500">
                Test JSON-RPC 2.0 tool execution against the live in-memory OKF knowledge graph.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {simLatency !== null && (
              <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                Latency: <span className="text-emerald-700 font-bold">{simLatency}ms</span>
              </span>
            )}
            <button
              type="button"
              onClick={handleRunSimulation}
              disabled={simRunning}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold text-white transition cursor-pointer shadow-2xs"
            >
              {simRunning ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Executing RPC...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Execute Tool Call</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Tool Parameters Form (4 Cols) */}
          <div className="md:col-span-5 flex flex-col gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1 block">Select Tool to Test</label>
              <select
                value={selectedSimTool}
                onChange={(e) => setSelectedSimTool(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono focus:ring-1 focus:ring-indigo-500 bg-white"
              >
                {allAvailableTools.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.id} ({t.category})
                  </option>
                ))}
              </select>
            </div>

            {selectedSimTool.includes('search') ? (
              <>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Search Query</label>
                  <input
                    type="text"
                    value={simQuery}
                    onChange={(e) => setSimQuery(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                    placeholder="e.g. consensus validation"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Max Limit</label>
                  <input
                    type="number"
                    value={simLimit}
                    onChange={(e) => setSimLimit(Number(e.target.value))}
                    min={1}
                    max={20}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Target Concept ID / Path</label>
                <select
                  value={simConceptId}
                  onChange={(e) => setSimConceptId(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono bg-white truncate"
                >
                  {bundle.concepts.map((c) => {
                    const key = c.path || c.id || '';
                    const displayTitle = String(c.metadata?.title || key);
                    return (
                      <option key={key} value={key}>
                        {displayTitle} ({key})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>

          {/* JSON-RPC 2.0 Response Inspector (7 Cols) */}
          <div className="md:col-span-7 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-slate-600 px-1">
              <span className="font-semibold flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-slate-500" />
                JSON-RPC 2.0 Response Payload
              </span>
              {simOutput && (
                <button
                  type="button"
                  onClick={() => copyToClipboard(JSON.stringify(simOutput, null, 2), 'sim-payload')}
                  className="text-[11px] text-indigo-600 hover:underline cursor-pointer"
                >
                  {copied === 'sim-payload' ? 'Copied' : 'Copy JSON'}
                </button>
              )}
            </div>

            <div className="h-[220px] rounded-xl overflow-hidden border border-slate-200 bg-slate-950 p-3 text-xs font-mono text-emerald-400 overflow-y-auto">
              {simOutput ? (
                <pre className="whitespace-pre-wrap">{JSON.stringify(simOutput, null, 2)}</pre>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500 italic text-center px-4">
                  Click "Execute Tool Call" to trigger a simulated JSON-RPC 2.0 MCP invocation against the knowledge graph.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
