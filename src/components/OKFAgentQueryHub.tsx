import React, { useState, useEffect } from 'react';
import type { OkfBundle } from 'okf-ts';
import type { SemanticGraphResult } from '../lib/okfSemanticGraphEngine';
import { deriveTrustTier } from '../lib/okfKnowledgeEngine';
import { executeSparqlQuery } from '../lib/okfSparqlEngine';
import OKFSparqlQueryWorkbench from './OKFSparqlQueryWorkbench';
import HighlightedCodeBlock from './HighlightedCodeBlock';
import {
  Terminal,
  Bot,
  Layers,
  Sparkles,
  Search,
  Code2,
  Check,
  Copy,
  Download,
  Play,
  Share2,
  Server,
  Zap,
  BookOpen,
  ArrowRight,
  RefreshCw,
  Sliders,
  FileCode,
  Shield,
  Compass,
  MessageSquare,
  User,
} from 'lucide-react';

interface OKFAgentQueryHubProps {
  bundle: OkfBundle;
  semanticGraph?: SemanticGraphResult;
}

type QueryOption =
  | 'human-natural-language'
  | 'mcp-server'
  | 'rest-api'
  | 'graph-rag'
  | 'skill-md'
  | 'cli-bash'
  | 'sparql-rdf';

export default function OKFAgentQueryHub({
  bundle,
  semanticGraph,
}: OKFAgentQueryHubProps) {
  const [selectedOption, setSelectedOption] = useState<QueryOption>('human-natural-language');
  const [copied, setCopied] = useState<string | null>(null);

  // Live Query Testing State
  const [liveQuery, setLiveQuery] = useState('How does consensus validation handle network partitions?');
  const [liveTrustTier, setLiveTrustTier] = useState<'all' | 'human-reviewed'>('all');
  const [isExecuting, setIsExecuting] = useState(false);
  const [liveOutput, setLiveOutput] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'synced' | 'error'>('idle');

  const bundleTitle = bundle.root || 'Knowledge Base';

  // Sync knowledge base to server on mount / update
  useEffect(() => {
    const syncToServer = async () => {
      try {
        const payload = {
          name: bundleTitle,
          concepts: bundle.concepts.map((c) => {
            const key = c.path || c.id || '';
            const prerequisites = semanticGraph?.edges
              .filter((e) => e.from === key && (e.kind === 'depends_on' || e.kind === 'prerequisite_of'))
              .map((e) => e.to) || [];
            const related = semanticGraph?.edges
              .filter((e) => e.from === key)
              .map((e) => e.to) || [];

            return {
              id: key,
              path: key,
              type: String(c.metadata?.type || 'concept'),
              title: String(c.metadata?.title || key),
              description: String(c.metadata?.description || ''),
              tags: Array.isArray(c.metadata?.tags) ? (c.metadata.tags as string[]) : [],
              status: String(c.metadata?.status || 'stable'),
              trustTier: deriveTrustTier(c),
              body: c.body || '',
              prerequisites,
              relatedConcepts: related,
            };
          }),
        };

        const res = await fetch('/api/mcp/sync-knowledge-base', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          setSyncStatus('synced');
        }
      } catch (e) {
        console.warn('Auto-sync MCP server failed:', e);
        setSyncStatus('error');
      }
    };

    syncToServer();
  }, [bundle, semanticGraph, bundleTitle]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleRunLiveQuery = async () => {
    if (!liveQuery.trim()) return;
    setIsExecuting(true);
    setLiveOutput(null);

    try {
      if (selectedOption === 'human-natural-language') {
        // Run full natural language synthesis
        const response = await fetch('/api/agent/okf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task: 'qa',
            okfContent: `# Knowledge Base Context\n\n` + bundle.concepts.slice(0, 8).map(c => `### ${c.metadata?.title || c.path}\n${c.body}`).join('\n\n'),
            userQuery: liveQuery,
          }),
        });
        
        if (!response.body) {
          throw new Error('No streaming response body');
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          setLiveOutput(accumulated);
        }
      } else if (selectedOption === 'mcp-server') {
        // Run JSON-RPC Tool Call simulation
        const response = await fetch('/api/mcp/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'agent-call-1',
            method: 'tools/call',
            params: {
              name: 'search_okf_concepts',
              arguments: {
                query: liveQuery,
                limit: 5,
              },
            },
          }),
        });
        const data = await response.json();
        setLiveOutput(JSON.stringify(data, null, 2));
      } else if (selectedOption === 'rest-api') {
        // Call /api/mcp/query endpoint
        const response = await fetch('/api/mcp/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: liveQuery,
            trustTier: liveTrustTier,
            topK: 4,
            expandGraph: true,
          }),
        });
        const data = await response.json();
        setLiveOutput(JSON.stringify(data, null, 2));
      } else if (selectedOption === 'sparql-rdf') {
        // Real in-memory W3C SPARQL 1.1 query evaluation
        const sparqlQueryStr = liveQuery.toLowerCase().includes('select') || liveQuery.toLowerCase().includes('ask') || liveQuery.toLowerCase().includes('construct')
          ? liveQuery
          : `PREFIX okf: <urn:okf:ontology#>\nPREFIX dc: <http://purl.org/dc/elements/1.1/>\n\nSELECT ?concept ?title ?type ?trustTier WHERE {\n  ?concept a okf:Concept ;\n           dc:title ?title ;\n           okf:conceptType ?type ;\n           okf:trustTier ?trustTier .\n  FILTER(regex(?title, "${liveQuery.replace(/"/g, '')}", "i") || regex(?type, "${liveQuery.replace(/"/g, '')}", "i"))\n}\nLIMIT 10`;

        const res = executeSparqlQuery(sparqlQueryStr, bundle, semanticGraph);
        setLiveOutput(JSON.stringify(res, null, 2));
      } else {
        // General query endpoint
        const response = await fetch('/api/mcp/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: liveQuery,
            trustTier: liveTrustTier,
            topK: 3,
            expandGraph: true,
          }),
        });
        const data = await response.json();
        setLiveOutput(JSON.stringify(data, null, 2));
      }
    } catch (err: any) {
      setLiveOutput(JSON.stringify({ error: err.message || 'Failed to execute query' }, null, 2));
    } finally {
      setIsExecuting(false);
    }
  };

  // Code snippets generator
  const getOptionSnippet = () => {
    switch (selectedOption) {
      case 'human-natural-language':
        return {
          lang: 'markdown',
          title: 'Human Natural Language Query & Knowledge Synthesis',
          desc: 'Conversational plain-English Q&A interface for human operators with automatic citations, step-by-step procedures, and trust auditing.',
          endpoint: 'POST /api/agent/okf',
          code: `## User Question:
${liveQuery}

## Grounding Context Passed to AI:
- ${bundle.concepts.length} Concept Documents Loaded
- Graph Dependency Expansion: 2-Hops
- Trust Tier Priority: Human-Reviewed > Machine-Confirmed

## Synthesized Plain-English Answer:
${liveOutput || 'Grounded answer will appear here upon query execution...'}`,
          agentConfigSnippet: `// Natural Language Query Client Call:
const response = await fetch('/api/agent/okf', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    task: 'qa',
    okfContent: bundleMarkdownContext,
    userQuery: "${liveQuery.replace(/"/g, '\\"')}"
  })
});`,
        };

      case 'mcp-server':
        return {
          lang: 'json',
          title: 'Model Context Protocol (MCP) JSON-RPC 2.0 Request',
          desc: 'Compatible with Claude Desktop, Cursor, Windsurf, LangChain MCP adapters, and Anthropic Agent clients.',
          endpoint: 'POST /api/mcp/rpc',
          code: JSON.stringify(
            {
              jsonrpc: '2.0',
              id: 'req-001',
              method: 'tools/call',
              params: {
                name: 'search_okf_concepts',
                arguments: {
                  query: liveQuery,
                  limit: 3,
                },
              },
            },
            null,
            2
          ),
          agentConfigSnippet: `// claude_desktop_config.json or cursor settings:
{
  "mcpServers": {
    "okf-knowledge-base": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-fetch", "${window.location.origin}/api/mcp/rpc"]
    }
  }
}`,
        };

      case 'rest-api':
        return {
          lang: 'bash',
          title: 'Direct REST / Agent HTTP Query Endpoint',
          desc: 'Lightweight JSON endpoint providing 1-shot hybrid search with automatic 1-hop sub-graph context expansion.',
          endpoint: 'POST /api/mcp/query',
          code: `curl -X POST "${window.location.origin}/api/mcp/query" \\
  -H "Content-Type: application/json" \\
  -d '{
    "query": "${liveQuery.replace(/"/g, '\\"')}",
    "trustTier": "all",
    "topK": 3,
    "expandGraph": true
  }'`,
          agentConfigSnippet: `// Python LangChain / LlamaIndex agent retriever:
import requests

def okf_agent_retriever(query: str):
    res = requests.post("${window.location.origin}/api/mcp/query", json={
        "query": query,
        "expandGraph": True,
        "topK": 3
    })
    data = res.json()
    return data["assembledContextText"]`,
        };

      case 'graph-rag':
        return {
          lang: 'typescript',
          title: 'Programmatic Graph-Augmented RAG Engine (TypeScript)',
          desc: 'Runs full hybrid vector TF-IDF similarity + BFS sub-graph neighborhood expansion in TypeScript.',
          endpoint: 'Client / Server SDK Module',
          code: `import { queryKnowledgeGraphRAG } from './src/lib/okfRagEngine';

// Execute hybrid vector + directed dependency expansion
const ragResult = queryKnowledgeGraphRAG(
  "${liveQuery.replace(/"/g, '\\"')}",
  bundle.concepts,
  semanticGraph,
  {
    topK: 3,
    expandGraphHops: true,
    maxHops: 2,
    trustTierFilter: "all"
  }
);

console.log("Tokens Assembled:", ragResult.totalTokensEstimate);
console.log("Sub-Graph Nodes:", ragResult.expandedSubGraphNodes.length);
console.log("Context for LLM:\\n", ragResult.assembledContextMarkdown);`,
          agentConfigSnippet: `// Node.js agent pipeline:
const prompt = \`Context: \${ragResult.assembledContextMarkdown}\\n\\nQuestion: \${userQuestion}\`;`,
        };

      case 'skill-md':
        return {
          lang: 'markdown',
          title: 'Agent System Skill Definition (/skills/okf-open-knowledge-format/SKILL.md)',
          desc: 'Self-contained system prompt specification loaded by agents with filesystem access (Gemini Antigravity, Cursor rules).',
          endpoint: 'Workspace File: skills/okf-open-knowledge-format/SKILL.md',
          code: `---
name: "okf-open-knowledge-format"
description: "AI Agent skill for parsing, querying, and traversing Open Knowledge Format bundles."
---

# Agent Guidelines for OKF:
1. Locate root manifest at \`INDEX.md\`
2. Read frontmatter metadata: type, title, tags, trustTier, sources
3. Traverse cross-references [[concept-name]] to discover prerequisites
4. Prioritize [human-reviewed] over [machine-confirmed] nodes
5. Cite specific :::procedure or :::table blocks in generation`,
          agentConfigSnippet: `// Load into system prompt:
const systemInstruction = fs.readFileSync('skills/okf-open-knowledge-format/SKILL.md', 'utf8');`,
        };

      case 'cli-bash':
        return {
          lang: 'bash',
          title: 'Zero-Dependency CLI Querying (ripgrep / grep / jq / awk)',
          desc: 'High-speed filesystem queries that AI agents can execute directly via shell terminal tools.',
          endpoint: 'Local Shell / Subprocess',
          code: `# 1. Find all concepts with stable status and tag 'consensus'
rg -l "^status: stable" concepts/ | xargs rg -l "consensus"

# 2. Extract title and trust tiers using awk & grep
grep -rn "trustTier: human-reviewed" concepts/

# 3. Extract all procedure step headers
rg "^### Step" procedures/ -A 1`,
          agentConfigSnippet: `# Bash agent tool:
export OKF_SEARCH_CMD='rg -i "$QUERY" ./concepts/'`,
        };

      case 'sparql-rdf':
        return {
          lang: 'sparql',
          title: 'W3C SPARQL Triplestore & Ontology Query',
          desc: 'Query exported RDF Turtle (.ttl) or JSON-LD in graph databases (Neo4j, Apache Jena, GraphDB).',
          endpoint: 'SPARQL 1.1 Endpoint / Triplestore',
          code: `PREFIX okf: <urn:okf:ontology#>
PREFIX dc:  <http://purl.org/dc/elements/1.1/>

# Find all human-reviewed procedures and their prerequisites
SELECT ?concept ?title ?prerequisite WHERE {
  ?concept a okf:Concept ;
           dc:title ?title ;
           okf:conceptType "procedure" ;
           okf:trustTier "human-reviewed" ;
           okf:dependsOn ?prerequisite .
}
ORDER BY ?title
LIMIT 10`,
          agentConfigSnippet: `# Python rdflib query:
import rdflib
g = rdflib.Graph()
g.parse("bundle.ttl", format="turtle")
results = g.query(sparql_query)`,
        };
    }
  };

  const currentSnippet = getOptionSnippet();

  return (
    <div className="flex flex-col gap-5">
      {/* Top Banner */}
      <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 rounded-xl text-white shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Bot className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-white tracking-wide uppercase">
              AI Agent Query Suite & Universal Protocols
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Active Server & Endpoints
            </span>
          </div>
          <p className="text-xs text-slate-300">
            Comprehensive suite of querying interfaces for AI agents: Model Context Protocol (MCP), REST API, Graph RAG, System Skills, SPARQL, and CLI.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            MCP Server: Active (Port 3000)
          </span>
        </div>
      </div>

      {/* Query Protocol Selector Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
        <button
          type="button"
          onClick={() => setSelectedOption('human-natural-language')}
          className={`p-3 rounded-xl border text-left transition flex flex-col gap-1.5 cursor-pointer ${
            selectedOption === 'human-natural-language'
              ? 'bg-indigo-50/80 border-indigo-600 shadow-2xs'
              : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <MessageSquare className={`w-4 h-4 ${selectedOption === 'human-natural-language' ? 'text-indigo-600' : 'text-slate-500'}`} />
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800">
              Human
            </span>
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900">Natural Lang</div>
            <div className="text-[10px] text-slate-500 line-clamp-1">Conversational Q&A</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setSelectedOption('mcp-server')}
          className={`p-3 rounded-xl border text-left transition flex flex-col gap-1.5 cursor-pointer ${
            selectedOption === 'mcp-server'
              ? 'bg-indigo-50/80 border-indigo-600 shadow-2xs'
              : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <Server className={`w-4 h-4 ${selectedOption === 'mcp-server' ? 'text-indigo-600' : 'text-slate-500'}`} />
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800">
              RPC 2.0
            </span>
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900">MCP Protocol</div>
            <div className="text-[10px] text-slate-500 line-clamp-1">Claude, Cursor, Agents</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setSelectedOption('rest-api')}
          className={`p-3 rounded-xl border text-left transition flex flex-col gap-1.5 cursor-pointer ${
            selectedOption === 'rest-api'
              ? 'bg-indigo-50/80 border-indigo-600 shadow-2xs'
              : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <Zap className={`w-4 h-4 ${selectedOption === 'rest-api' ? 'text-indigo-600' : 'text-slate-500'}`} />
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
              REST / HTTP
            </span>
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900">Agent REST API</div>
            <div className="text-[10px] text-slate-500 line-clamp-1">1-shot sub-graph query</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setSelectedOption('graph-rag')}
          className={`p-3 rounded-xl border text-left transition flex flex-col gap-1.5 cursor-pointer ${
            selectedOption === 'graph-rag'
              ? 'bg-indigo-50/80 border-indigo-600 shadow-2xs'
              : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <Layers className={`w-4 h-4 ${selectedOption === 'graph-rag' ? 'text-indigo-600' : 'text-slate-500'}`} />
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-sky-100 text-sky-800">
              Vector+Graph
            </span>
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900">Graph RAG Engine</div>
            <div className="text-[10px] text-slate-500 line-clamp-1">2-hop graph expansion</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setSelectedOption('skill-md')}
          className={`p-3 rounded-xl border text-left transition flex flex-col gap-1.5 cursor-pointer ${
            selectedOption === 'skill-md'
              ? 'bg-indigo-50/80 border-indigo-600 shadow-2xs'
              : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <FileCode className={`w-4 h-4 ${selectedOption === 'skill-md' ? 'text-indigo-600' : 'text-slate-500'}`} />
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
              Skill Prompt
            </span>
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900">Agent SKILL.md</div>
            <div className="text-[10px] text-slate-500 line-clamp-1">Gemini / Cursor skill</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setSelectedOption('sparql-rdf')}
          className={`p-3 rounded-xl border text-left transition flex flex-col gap-1.5 cursor-pointer ${
            selectedOption === 'sparql-rdf'
              ? 'bg-indigo-50/80 border-indigo-600 shadow-2xs'
              : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <Compass className={`w-4 h-4 ${selectedOption === 'sparql-rdf' ? 'text-indigo-600' : 'text-slate-500'}`} />
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-purple-100 text-purple-800">
              Triplestore
            </span>
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900">SPARQL / RDF</div>
            <div className="text-[10px] text-slate-500 line-clamp-1">Ontology & Knowledge Graph</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setSelectedOption('cli-bash')}
          className={`p-3 rounded-xl border text-left transition flex flex-col gap-1.5 cursor-pointer ${
            selectedOption === 'cli-bash'
              ? 'bg-indigo-50/80 border-indigo-600 shadow-2xs'
              : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <Terminal className={`w-4 h-4 ${selectedOption === 'cli-bash' ? 'text-indigo-600' : 'text-slate-500'}`} />
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-slate-200 text-slate-800">
              CLI / POSIX
            </span>
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900">Shell Commands</div>
            <div className="text-[10px] text-slate-500 line-clamp-1">rg, grep, jq queries</div>
          </div>
        </button>
      </div>

      {/* Protocol Overview & Details Header */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
              <span>{currentSnippet.title}</span>
              <span className="text-[10px] font-mono font-normal text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                {currentSnippet.endpoint}
              </span>
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">{currentSnippet.desc}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => copyToClipboard(currentSnippet.code, 'snippet-code')}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
            >
              {copied === 'snippet-code' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>Copy Code</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Live Query Interactive Tester */}
        <div className="pt-3 border-t border-slate-200 flex flex-col gap-2">
          <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Play className="w-3.5 h-3.5 text-indigo-600" />
              Live Interactive Agent Query Tester:
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              Active: {bundle.concepts.length} Concept Nodes
            </span>
          </label>

          <div className="flex flex-col sm:flex-row items-stretch gap-2">
            <input
              type="text"
              value={liveQuery}
              onChange={(e) => setLiveQuery(e.target.value)}
              placeholder="Enter question or query term..."
              className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />

            <button
              type="button"
              onClick={handleRunLiveQuery}
              disabled={isExecuting}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
            >
              {isExecuting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Querying...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Execute Query</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Live Output & Code Block Display */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left Column: Code / Protocol Definition */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Code2 className="w-4 h-4 text-indigo-600" />
              Protocol Request / Snippet:
            </span>
          </div>
          <HighlightedCodeBlock
            value={currentSnippet.code}
            language={currentSnippet.lang}
          />
        </div>

        {/* Right Column: Live Agent / Server Response Output */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-emerald-600" />
              Live Server Output / Response:
            </span>
            {liveOutput && (
              <button
                type="button"
                onClick={() => copyToClipboard(liveOutput, 'live-out')}
                className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center gap-1"
              >
                {copied === 'live-out' ? 'Copied' : 'Copy Output'}
              </button>
            )}
          </div>

          <div className="h-full min-h-[220px]">
            {liveOutput ? (
              <HighlightedCodeBlock
                value={liveOutput}
                language="json"
              />
            ) : (
              <div className="h-full min-h-[220px] p-6 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 text-xs flex flex-col items-center justify-center text-center gap-2">
                <Bot className="w-8 h-8 text-slate-600" />
                <p>Click <strong>"Execute Query"</strong> above to test this query mode against the live MCP / REST server.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Agent Integration Recipe / Client Config */}
      <div className="p-4 bg-white border border-slate-200 rounded-xl flex flex-col gap-2">
        <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
          <Share2 className="w-3.5 h-3.5 text-indigo-600" />
          Client Integration Configuration:
        </h4>
        <HighlightedCodeBlock
          value={currentSnippet.agentConfigSnippet}
          language="json"
        />
      </div>
    </div>
  );
}
