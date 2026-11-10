import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  Key,
  Play,
  Copy,
  Check,
  Terminal,
  FileJson,
  Shield,
  Plus,
  Trash2,
  RefreshCw,
  Download,
  Lock,
  Code2,
  Activity,
  Eye,
  EyeOff,
  Gauge,
  Zap,
  Search,
  Filter,
  RotateCcw,
} from "lucide-react";

interface RemoteApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  rawKey: string;
  createdAt: string;
  lastUsedAt: string | null;
  requestCount: number;
  successCount: number;
  errorCount: number;
  rateLimitHitCount: number;
  rateLimitPerMinute: number;
  currentWindowRequests: number;
  remainingWindowQuota: number;
  windowResetInSeconds: number;
  utilizationPercent: number;
  status: "active" | "revoked";
}

interface RemoteApiAuditLog {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  category: string;
  statusCode: number;
  durationMs: number;
  keyId: string;
  keyName: string;
  keyPrefix: string;
  clientIp?: string;
  rateLimited?: boolean;
}

interface TrafficSummaryMetrics {
  totalRequests: number;
  activeRequestsInFlight: number;
  successCount: number;
  errorCount: number;
  rateLimitHitCount: number;
  successRatePercent: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  requestsLastMinute: number;
  categoryBreakdown: Record<string, number>;
  statusCodeBreakdown: {
    "2xx": number;
    "4xx": number;
    "429": number;
    "5xx": number;
  };
}

interface ApiEndpointDefinition {
  id: string;
  category: "Convert & Scraping" | "NLP & OKF" | "Skills & Logic" | "MetaAST & Vector" | "MCP JSON-RPC" | "System";
  method: "GET" | "POST";
  path: string;
  title: string;
  description: string;
  defaultBody?: Record<string, any>;
}

function encodeUtf8Base64(str: string): string {
  try {
    const bytes = new TextEncoder().encode(str);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch {
    return "";
  }
}

const API_ENDPOINTS: ApiEndpointDefinition[] = [
  {
    id: "status",
    category: "System",
    method: "GET",
    path: "/api/v1/status",
    title: "Verify API Key & Pipeline Status",
    description: "Validates your Bearer API key, returns server uptime, key request metrics, and active pipeline states.",
  },
  {
    id: "convert-file",
    category: "Convert & Scraping",
    method: "POST",
    path: "/api/v1/convert/file",
    title: "Convert Base64 Document / File to Markdown",
    description: "Converts base64-encoded PDF, DOCX, XLSX, CSV, HTML, or text files into clean GFM Markdown.",
    defaultBody: {
      fileName: "distributed-consensus.md",
      fileType: "text/markdown",
      base64Data: encodeUtf8Base64(
        "# Raft Consensus Protocol\n\nRaft achieves consensus via an elected **Leader** node.\n\n| Node Role | Responsibility |\n| :--- | :--- |\n| Leader | Appends log entries |\n| Follower | Replicates leader log |\n"
      ),
      conversionMode: "standard",
      targetStyle: "gfm",
      qualityThreshold: 75,
    },
  },
  {
    id: "convert-url",
    category: "Convert & Scraping",
    method: "POST",
    path: "/api/v1/convert/url",
    title: "Fetch & Convert Public URL to Markdown",
    description: "Launches headless extraction and Mozilla Readability pruning on any public URL.",
    defaultBody: {
      url: "https://en.wikipedia.org/wiki/Markdown",
      conversionMode: "standard",
    },
  },
  {
    id: "extract-json",
    category: "Convert & Scraping",
    method: "POST",
    path: "/api/v1/extract/json",
    title: "Strict JSON Schema Extraction",
    description: "Extracts structured JSON adhering to a preset or custom JSON Schema from raw text or a URL.",
    defaultBody: {
      content:
        "Service: OrderProcessor v2.4. Latency SLA: 45ms p99. Dependencies: PostgreSQL 16, Redis 7.2, Kafka.",
      presetId: "technical-spec",
      extractionPrompt: "Extract service name, version, SLA metrics, and dependencies.",
    },
  },
  {
    id: "site-discover",
    category: "Convert & Scraping",
    method: "POST",
    path: "/api/v1/site/discover",
    title: "Inspect Domain (robots.txt, llms.txt, sitemaps)",
    description: "Discovers domain crawl rules, AI llms.txt manifests, and sitemap hierarchies.",
    defaultBody: {
      url: "https://playwright.dev",
    },
  },
  {
    id: "site-map",
    category: "Convert & Scraping",
    method: "POST",
    path: "/api/v1/site/map",
    title: "Map Domain Sitemap Hierarchy",
    description: "Extracts and filters domain URLs from XML sitemaps and page links.",
    defaultBody: {
      domainOrSitemapUrl: "https://playwright.dev",
      maxUrls: 50,
    },
  },
  {
    id: "nlp-analyze",
    category: "NLP & OKF",
    method: "POST",
    path: "/api/v1/nlp/analyze",
    title: "NLP Readability, Sentiment & Keyword Analysis",
    description: "Computes Flesch-Kincaid readability, SMOG index, sentiment polarity, language detection, and keywords.",
    defaultBody: {
      text: "Deterministic Abstract Syntax Tree (MetaAST) chunking preserves hierarchical heading breadcrumbs, fenced code block atomicity, and markdown table headers for high-precision Vector Database retrieval.",
    },
  },
  {
    id: "okf-agent",
    category: "NLP & OKF",
    method: "POST",
    path: "/api/v1/okf/agent",
    title: "OKF v1.0 Synthesis, Audit & Grounded Q&A",
    description: "Synthesizes or audits Open Knowledge Format (OKF v1.0) documents using semantic blocks.",
    defaultBody: {
      task: "synthesize",
      userQuery:
        "Create a concise OKF v1.0 specification covering Circuit Breaker states (Closed, Open, Half-Open) and failure thresholds.",
    },
  },
  {
    id: "skills-synthesize",
    category: "Skills & Logic",
    method: "POST",
    path: "/api/v1/skills/synthesize",
    title: "Compile Runbook into Agent Skill Package",
    description:
      "Slices a monolithic Markdown SOP into a progressive-disclosure Agent Skill package (SKILL.md, references/, scripts/) with token metrics.",
    defaultBody: {
      markdown:
        "# PostgreSQL Replica Promotion Runbook\n\n## When to Use\nUse when primary database node is unreachable for >60 seconds.\n\n## Step 1: Verify Replication Lag\n```bash\npsql -c 'SELECT pg_last_wal_replay_lsn();'\n```\n\n## Step 2: Promote Standby\n```bash\npg_ctl promote -D /var/lib/postgresql/data\n```",
      skillName: "postgres-replica-promotion",
      allowedTools: ["bash", "psql"],
    },
  },
  {
    id: "skills-classify-logic",
    category: "Skills & Logic",
    method: "POST",
    path: "/api/v1/skills/classify-logic",
    title: "Formal Logic Classifier (FOL, HOL, Modal, Temporal)",
    description: "Analyzes text for First-Order, Higher-Order, Modal, and Temporal logic structures.",
    defaultBody: {
      text: "For every worker node x in cluster C, if heartbeat(x) fails three consecutive times, the orchestrator must cordon node x before rescheduling pods onto healthy nodes.",
    },
  },
  {
    id: "meta-ast-parse",
    category: "MetaAST & Vector",
    method: "POST",
    path: "/api/v1/meta-ast/parse",
    title: "Parse Markdown into Enriched MetaAST",
    description: "Parses Markdown into an enriched syntax tree with heading breadcrumbs and token counts.",
    defaultBody: {
      documentTitle: "Kubernetes Pod Lifecycle",
      markdown:
        "# Pod Lifecycle\n\n## Readiness Probes\nReadiness probes determine when a container can accept traffic.\n\n```yaml\nreadinessProbe:\n  httpGet:\n    path: /healthz\n    port: 8080\n```",
    },
  },
  {
    id: "meta-ast-vector-chunks",
    category: "MetaAST & Vector",
    method: "POST",
    path: "/api/v1/meta-ast/vector-chunks",
    title: "Chunk Markdown for Vector Databases",
    description: "Chunks Markdown for Pinecone, Qdrant, or pgvector while preserving code and table atomicity.",
    defaultBody: {
      markdown:
        "# Vector Ingestion Guide\n\n## Breadcrumb Context\nEach chunk carries its parent heading chain.\n\n```typescript\nconst chunks = chunkMarkdownForVectorDB(doc, { maxTokensPerChunk: 512 });\n```\n\n| Vector DB | Index Type |\n| :--- | :--- |\n| pgvector | HNSW |\n| Qdrant | Cosine |",
      options: {
        maxTokensPerChunk: 256,
        minHeadingFlushTokens: 80,
        defaultDocumentTitle: "Vector Ingestion Guide",
      },
    },
  },
  {
    id: "mcp-manifest",
    category: "MCP JSON-RPC",
    method: "GET",
    path: "/api/v1/mcp/manifest",
    title: "Get MCP Server Capability Manifest",
    description: "Lists available Model Context Protocol (MCP) tools and OKF knowledge resources.",
  },
  {
    id: "mcp-rpc",
    category: "MCP JSON-RPC",
    method: "POST",
    path: "/api/v1/mcp/rpc",
    title: "Execute MCP JSON-RPC 2.0 Tool Call",
    description: "Invokes MCP JSON-RPC 2.0 methods (`initialize`, `tools/call`) remotely.",
    defaultBody: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "classify_document_logic",
        arguments: {
          text: "If memory utilization exceeds 85% for 5 minutes, trigger horizontal pod autoscaler.",
        },
      },
    },
  },
];

const DEFAULT_TRAFFIC: TrafficSummaryMetrics = {
  totalRequests: 0,
  activeRequestsInFlight: 0,
  successCount: 0,
  errorCount: 0,
  rateLimitHitCount: 0,
  successRatePercent: 100,
  avgLatencyMs: 0,
  p95LatencyMs: 0,
  requestsLastMinute: 0,
  categoryBreakdown: {
    "Convert & Scraping": 0,
    "NLP & OKF": 0,
    "Skills & Logic": 0,
    "MetaAST & Vector": 0,
    "MCP JSON-RPC": 0,
    System: 0,
  },
  statusCodeBreakdown: {
    "2xx": 0,
    "4xx": 0,
    "429": 0,
    "5xx": 0,
  },
};

interface RemoteApiModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function RemoteApiModal({ isOpen, onClose }: RemoteApiModalProps) {
  const [activeTab, setActiveTab] = useState<"explorer" | "traffic" | "keys" | "openapi">("explorer");
  const [keys, setKeys] = useState<RemoteApiKeyRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<RemoteApiAuditLog[]>([]);
  const [traffic, setTraffic] = useState<TrafficSummaryMetrics>(DEFAULT_TRAFFIC);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [newKeyName, setNewKeyName] = useState<string>("");
  const [newKeyRateLimit, setNewKeyRateLimit] = useState<number>(60);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<RemoteApiKeyRecord | null>(null);
  const [revealedKeyIds, setRevealedKeyIds] = useState<Record<string, boolean>>({});
  const [editingRateLimitByKey, setEditingRateLimitByKey] = useState<Record<string, number>>({});

  // Traffic Monitor State
  const [autoPollTraffic, setAutoPollTraffic] = useState<boolean>(true);
  const [isSimulatingBurst, setIsSimulatingBurst] = useState<boolean>(false);
  const [logSearchQuery, setLogSearchQuery] = useState<string>("");
  const [logKeyFilter, setLogKeyFilter] = useState<string>("all");
  const [logStatusFilter, setLogStatusFilter] = useState<"all" | "2xx" | "4xx" | "429" | "5xx">("all");
  const [logMethodFilter, setLogMethodFilter] = useState<"all" | "GET" | "POST">("all");

  // Explorer state
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpointDefinition>(API_ENDPOINTS[0]);
  const [requestBodyText, setRequestBodyText] = useState<string>("");
  const [jsonValidationError, setJsonValidationError] = useState<string>("");
  const [snippetLang, setSnippetLang] = useState<"curl" | "typescript" | "python">("curl");
  const [testUnauthenticated, setTestUnauthenticated] = useState<boolean>(false);

  // Live Response state
  const [isSending, setIsSending] = useState<boolean>(false);
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [responseDurationMs, setResponseDurationMs] = useState<number | null>(null);
  const [responseRateHeaders, setResponseRateHeaders] = useState<{
    limit: string | null;
    remaining: string | null;
    reset: string | null;
  } | null>(null);
  const [responseBody, setResponseBody] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // OpenAPI state
  const [openApiJson, setOpenApiJson] = useState<string>("");

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

  const fetchKeysAndLogs = async () => {
    try {
      const res = await fetch("/api/v1/admin/keys");
      if (res.ok) {
        const data = await res.json();
        const keyList: RemoteApiKeyRecord[] = data.keys || [];
        setKeys(keyList);
        setAuditLogs(data.auditLogs || []);
        if (data.traffic) {
          setTraffic(data.traffic);
        }
        const firstActive = keyList.find((k) => k.status === "active");
        if (firstActive && !selectedKey) {
          setSelectedKey(firstActive.rawKey);
        }
      }
    } catch (e) {
      console.error("Failed to load API keys and traffic:", e);
    }
  };

  const fetchOpenApiSpec = async () => {
    try {
      const res = await fetch("/api/v1/openapi.json");
      if (res.ok) {
        const spec = await res.json();
        setOpenApiJson(JSON.stringify(spec, null, 2));
      }
    } catch (e) {
      console.error("Failed to load OpenAPI spec:", e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchKeysAndLogs();
      fetchOpenApiSpec();
    }
  }, [isOpen]);

  // Real-time polling when modal is open and auto-refresh is enabled
  useEffect(() => {
    if (!isOpen || !autoPollTraffic) return;
    const interval = setInterval(() => {
      fetchKeysAndLogs();
    }, 2000);
    return () => clearInterval(interval);
  }, [isOpen, autoPollTraffic, selectedKey]);

  // Close modal on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (selectedEndpoint.defaultBody) {
      setRequestBodyText(JSON.stringify(selectedEndpoint.defaultBody, null, 2));
    } else {
      setRequestBodyText("");
    }
    setJsonValidationError("");
    setResponseStatus(null);
    setResponseDurationMs(null);
    setResponseRateHeaders(null);
    setResponseBody("");
  }, [selectedEndpoint]);

  const filteredLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      if (logKeyFilter !== "all" && log.keyName !== logKeyFilter) {
        return false;
      }
      if (logMethodFilter !== "all" && log.method !== logMethodFilter) {
        return false;
      }
      if (logStatusFilter !== "all") {
        if (logStatusFilter === "2xx" && (log.statusCode < 200 || log.statusCode >= 300)) return false;
        if (logStatusFilter === "429" && log.statusCode !== 429) return false;
        if (logStatusFilter === "4xx" && (log.statusCode < 400 || log.statusCode >= 500)) return false;
        if (logStatusFilter === "5xx" && log.statusCode < 500) return false;
      }
      if (logSearchQuery.trim()) {
        const q = logSearchQuery.toLowerCase();
        const hay = `${log.path} ${log.keyName} ${log.category} ${log.statusCode} ${log.method}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [auditLogs, logKeyFilter, logMethodFilter, logStatusFilter, logSearchQuery]);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/v1/admin/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newKeyName.trim() || "Production Remote Key",
          rateLimitPerMinute: newKeyRateLimit,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.key) {
          setNewlyCreatedKey(data.key);
          setSelectedKey(data.key.rawKey);
          setNewKeyName("");
          await fetchKeysAndLogs();
        }
      }
    } catch (err) {
      console.error("Failed to create key:", err);
    }
  };

  const handleUpdateKeyRateLimit = async (id: string, limit: number) => {
    try {
      const res = await fetch(`/api/v1/admin/keys/${id}/rate-limit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rateLimitPerMinute: limit }),
      });
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys || []);
        if (data.traffic) setTraffic(data.traffic);
      }
    } catch (err) {
      console.error("Failed to update rate limit:", err);
    }
  };

  const handleResetKeyWindow = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/admin/keys/${id}/reset-window`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys || []);
        if (data.traffic) setTraffic(data.traffic);
      }
    } catch (err) {
      console.error("Failed to reset rate window:", err);
    }
  };

  const handleRevokeKey = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/admin/keys/${id}/revoke`, { method: "POST" });
      if (res.ok) {
        await fetchKeysAndLogs();
      }
    } catch (err) {
      console.error("Failed to revoke key:", err);
    }
  };

  const handleDeleteKey = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/admin/keys/${id}`, { method: "DELETE" });
      if (res.ok) {
        await fetchKeysAndLogs();
      }
    } catch (err) {
      console.error("Failed to delete key:", err);
    }
  };

  const handleClearAuditLogs = async () => {
    try {
      const res = await fetch("/api/v1/admin/logs/clear", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs([]);
        if (data.traffic) setTraffic(data.traffic);
      }
    } catch (err) {
      console.error("Failed to clear logs:", err);
    }
  };

  const handleSimulateTrafficBurst = async () => {
    const activeKeyObj = keys.find((k) => k.rawKey === selectedKey && k.status === "active") || keys.find((k) => k.status === "active");
    if (!activeKeyObj) return;

    setIsSimulatingBurst(true);
    try {
      const headers = {
        Authorization: `Bearer ${activeKeyObj.rawKey}`,
        "Content-Type": "application/json",
      };

      const burstCalls = [
        fetch("/api/v1/status", { method: "GET", headers }),
        fetch("/api/v1/nlp/analyze", {
          method: "POST",
          headers,
          body: JSON.stringify({
            text: "Real-time API traffic monitoring measures throughput, sliding-window rate limits, and p95 latency.",
          }),
        }),
        fetch("/api/v1/skills/classify-logic", {
          method: "POST",
          headers,
          body: JSON.stringify({
            text: "For every incoming request r, if rateWindow(r.key) exceeds threshold, return HTTP 429.",
          }),
        }),
        fetch("/api/v1/meta-ast/parse", {
          method: "POST",
          headers,
          body: JSON.stringify({
            documentTitle: "Traffic Burst Sample",
            markdown: "# API Telemetry\n\n## Rate Limits\nEnforced per 60-second sliding window.",
          }),
        }),
        fetch("/api/v1/mcp/manifest", { method: "GET", headers }),
      ];

      await Promise.all(burstCalls);
      await fetchKeysAndLogs();
    } catch (err) {
      console.error("Traffic simulation error:", err);
    } finally {
      setIsSimulatingBurst(false);
    }
  };

  const handleSendLiveRequest = async () => {
    if (selectedEndpoint.method === "POST" && requestBodyText.trim()) {
      try {
        JSON.parse(requestBodyText);
        setJsonValidationError("");
      } catch (syntaxErr: any) {
        setJsonValidationError(
          syntaxErr?.message || "Invalid JSON syntax in Request Payload. Please fix before sending."
        );
        return;
      }
    }

    setIsSending(true);
    setResponseStatus(null);
    setResponseDurationMs(null);
    setResponseRateHeaders(null);
    setResponseBody("");

    const startTime = performance.now();
    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
      };

      if (!testUnauthenticated && selectedKey) {
        headers["Authorization"] = `Bearer ${selectedKey}`;
      }

      const fetchOptions: RequestInit = {
        method: selectedEndpoint.method,
        headers,
      };

      if (selectedEndpoint.method === "POST") {
        headers["Content-Type"] = "application/json";
        fetchOptions.body = requestBodyText || "{}";
      }

      const res = await fetch(selectedEndpoint.path, fetchOptions);
      const elapsed = Math.round(performance.now() - startTime);
      setResponseStatus(res.status);
      setResponseDurationMs(elapsed);
      setResponseRateHeaders({
        limit: res.headers.get("X-RateLimit-Limit"),
        remaining: res.headers.get("X-RateLimit-Remaining"),
        reset: res.headers.get("X-RateLimit-Reset"),
      });

      const text = await res.text();
      try {
        const parsed = JSON.parse(text);
        setResponseBody(JSON.stringify(parsed, null, 2));
      } catch {
        setResponseBody(text);
      }

      fetchKeysAndLogs();
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - startTime);
      setResponseStatus(500);
      setResponseDurationMs(elapsed);
      setResponseBody(JSON.stringify({ error: err?.message || "Network request failed" }, null, 2));
    } finally {
      setIsSending(false);
    }
  };

  const activeKeyForSnippet = testUnauthenticated ? "" : selectedKey || "okf_live_YOUR_API_KEY";
  const fullUrl = `${baseUrl}${selectedEndpoint.path}`;

  const generateCodeSnippet = (): string => {
    if (snippetLang === "curl") {
      const authLine = activeKeyForSnippet ? ` \\\n  -H "Authorization: Bearer ${activeKeyForSnippet}"` : "";
      if (selectedEndpoint.method === "GET") {
        return `curl -X GET "${fullUrl}"${authLine} \\\n  -H "Accept: application/json"`;
      }
      const compactBody = requestBodyText.replace(/'/g, "'\\''");
      return `curl -X POST "${fullUrl}"${authLine} \\\n  -H "Content-Type: application/json" \\\n  -d '${compactBody}'`;
    }

    if (snippetLang === "typescript") {
      const headersObj: Record<string, string> = {
        ...(activeKeyForSnippet ? { Authorization: `Bearer ${activeKeyForSnippet}` } : {}),
        ...(selectedEndpoint.method === "POST" ? { "Content-Type": "application/json" } : {}),
      };
      return `const response = await fetch("${fullUrl}", {
  method: "${selectedEndpoint.method}",
  headers: ${JSON.stringify(headersObj, null, 4).replace(/\n/g, "\n  ")},${
        selectedEndpoint.method === "POST"
          ? `\n  body: JSON.stringify(${requestBodyText || "{}"}),`
          : ""
      }
});

const result = await response.json();
console.log(result);`;
    }

    return `import requests

url = "${fullUrl}"
headers = {
    ${activeKeyForSnippet ? `"Authorization": "Bearer ${activeKeyForSnippet}",\n    ` : ""}"Content-Type": "application/json"
}
${
  selectedEndpoint.method === "POST"
    ? `payload = ${requestBodyText || "{}"}\n\nresponse = requests.post(url, headers=headers, json=payload)`
    : `response = requests.get(url, headers=headers)`
}
print(response.status_code)
print(response.json())`;
  };

  const categories = ["All", "System", "Convert & Scraping", "NLP & OKF", "Skills & Logic", "MetaAST & Vector", "MCP JSON-RPC"];
  const filteredEndpoints =
    selectedCategory === "All"
      ? API_ENDPOINTS
      : API_ENDPOINTS.filter((ep) => ep.category === selectedCategory);

  const uniqueKeyNamesInLogs = Array.from(new Set(auditLogs.map((l) => l.keyName)));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="remote-api-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4"
    >
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-6xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Top Modal Header */}
        <div className="px-5 py-3.5 border-b border-zinc-800 bg-zinc-900/70 flex items-center justify-between gap-4 shrink-0 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 id="remote-api-modal-title" className="text-base font-bold text-zinc-100 tracking-tight">
                  Remote API v1 Gateway & Developer Console
                </h2>
                <span className="text-xs font-mono text-emerald-400">
                  {baseUrl}/api/v1
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Strict API key authentication · Sliding-window rate limiting · Live API Traffic Monitor
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Primary Navigation Tabs */}
            <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800 overflow-x-auto no-scrollbar">
              <button
                id="remote-api-tab-explorer"
                type="button"
                onClick={() => setActiveTab("explorer")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeTab === "explorer"
                    ? "bg-zinc-800 text-emerald-400 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Play className="w-3.5 h-3.5" />
                <span>Interactive Explorer</span>
              </button>
              <button
                id="remote-api-tab-traffic"
                type="button"
                onClick={() => setActiveTab("traffic")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeTab === "traffic"
                    ? "bg-zinc-800 text-emerald-400 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>API Traffic Monitor</span>
                <span className="font-mono tabular-nums text-[11px] text-zinc-400">
                  ({traffic.totalRequests})
                </span>
              </button>
              <button
                id="remote-api-tab-keys"
                type="button"
                onClick={() => setActiveTab("keys")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeTab === "keys"
                    ? "bg-zinc-800 text-amber-400 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                <span>API Keys</span>
                <span className="font-mono tabular-nums text-[11px] text-zinc-400">
                  ({keys.filter((k) => k.status === "active").length})
                </span>
              </button>
              <button
                id="remote-api-tab-openapi"
                type="button"
                onClick={() => setActiveTab("openapi")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeTab === "openapi"
                    ? "bg-zinc-800 text-cyan-400 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <FileJson className="w-3.5 h-3.5" />
                <span>OpenAPI 3.0 Spec</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition cursor-pointer"
              title="Close Console"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Workspace Body */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* TAB 1: INTERACTIVE API EXPLORER */}
          {activeTab === "explorer" && (
            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
              {/* Left Sidebar: Endpoint Catalog */}
              <div className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-zinc-800 bg-zinc-900/30 flex flex-col shrink-0 max-h-60 lg:max-h-none">
                <div className="p-3 border-b border-zinc-800 flex items-center gap-1 overflow-x-auto no-scrollbar">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium whitespace-nowrap shrink-0 transition cursor-pointer ${
                        selectedCategory === cat
                          ? "bg-zinc-800 text-zinc-100 border border-zinc-700"
                          : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/60">
                  {filteredEndpoints.map((ep) => {
                    const isSelected = selectedEndpoint.id === ep.id;
                    return (
                      <button
                        key={ep.id}
                        type="button"
                        onClick={() => setSelectedEndpoint(ep)}
                        className={`w-full text-left px-4 py-3 transition flex flex-col gap-1 cursor-pointer ${
                          isSelected ? "bg-zinc-800/90" : "hover:bg-zinc-900/60"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-zinc-100 truncate">
                            {ep.title}
                          </span>
                          <span
                            className={`text-[10px] font-mono font-bold shrink-0 ${
                              ep.method === "GET" ? "text-cyan-400" : "text-emerald-400"
                            }`}
                          >
                            {ep.method}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-zinc-400 truncate">
                          {ep.path}
                        </div>
                        <div className="text-[11px] text-zinc-500">
                          {ep.category}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right Main Pane: Request Builder, Code Snippets & Live Response */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span
                        className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                          selectedEndpoint.method === "GET"
                            ? "bg-cyan-950/60 border-cyan-800 text-cyan-300"
                            : "bg-emerald-950/60 border-emerald-800 text-emerald-300"
                        }`}
                      >
                        {selectedEndpoint.method}
                      </span>
                      <code className="text-sm font-mono text-zinc-100 select-all">
                        {fullUrl}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(fullUrl, "endpoint-url")}
                        className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 cursor-pointer"
                      >
                        {copiedId === "endpoint-url" ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-zinc-400">{selectedEndpoint.description}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      id="remote-api-send-request-btn"
                      type="button"
                      onClick={handleSendLiveRequest}
                      disabled={isSending}
                      className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition flex items-center gap-2 shadow-sm cursor-pointer whitespace-nowrap"
                    >
                      {isSending ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Executing...</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Send Live Request</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Authentication Bar */}
                <div className="p-3.5 rounded-lg bg-zinc-900 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                    <div className="text-xs">
                      <span className="font-semibold text-zinc-200">Strict API Key Authentication</span>
                      <span className="text-zinc-400 ml-2">
                        Header: <code className="font-mono text-amber-300">Authorization: Bearer &lt;API_KEY&gt;</code>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <select
                      value={selectedKey}
                      onChange={(e) => setSelectedKey(e.target.value)}
                      disabled={testUnauthenticated}
                      className="bg-zinc-950 border border-zinc-700 rounded-md px-2.5 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-amber-500 disabled:opacity-50"
                    >
                      {keys
                        .filter((k) => k.status === "active")
                        .map((k) => (
                          <option key={k.id} value={k.rawKey}>
                            {k.name} ({k.remainingWindowQuota}/{k.rateLimitPerMinute} rpm left)
                          </option>
                        ))}
                    </select>

                    <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={testUnauthenticated}
                        onChange={(e) => setTestUnauthenticated(e.target.checked)}
                        className="rounded border-zinc-700 bg-zinc-950 text-amber-500"
                      />
                      <span>Test without key (Verify 401 rejection)</span>
                    </label>
                  </div>
                </div>

                {/* Two-Column Split: Request Payload & Code Generator vs. Live Response */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    {selectedEndpoint.method === "POST" && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-zinc-300">
                            Request JSON Payload
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              setRequestBodyText(
                                JSON.stringify(selectedEndpoint.defaultBody || {}, null, 2)
                              )
                            }
                            className="text-[11px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
                          >
                            Reset Default Payload
                          </button>
                        </div>
                        <textarea
                          value={requestBodyText}
                          onChange={(e) => {
                            setRequestBodyText(e.target.value);
                            if (jsonValidationError) setJsonValidationError("");
                          }}
                          rows={9}
                          spellCheck={false}
                          className={`w-full rounded-lg bg-zinc-900 border p-3 text-xs font-mono text-zinc-100 focus:outline-none ${
                            jsonValidationError
                              ? "border-red-500/80 focus:border-red-500"
                              : "border-zinc-800 focus:border-emerald-500/60"
                          }`}
                        />
                        {jsonValidationError && (
                          <p className="text-[11px] font-mono text-red-400">
                            {jsonValidationError}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Remote SDK Code Snippet Generator */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
                          <Code2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Remote Caller Code Snippet</span>
                        </div>
                        <div className="flex items-center gap-1 bg-zinc-900 p-0.5 rounded-md border border-zinc-800">
                          {(["curl", "typescript", "python"] as const).map((lang) => (
                            <button
                              key={lang}
                              type="button"
                              onClick={() => setSnippetLang(lang)}
                              className={`px-2 py-1 rounded text-[11px] font-mono transition cursor-pointer ${
                                snippetLang === lang
                                  ? "bg-zinc-800 text-emerald-400 font-semibold"
                                  : "text-zinc-400 hover:text-zinc-200"
                              }`}
                            >
                              {lang === "curl" ? "cURL" : lang === "typescript" ? "TypeScript" : "Python"}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="relative">
                        <pre className="rounded-lg bg-zinc-900 border border-zinc-800 p-3.5 text-xs font-mono text-zinc-200 overflow-x-auto max-h-64">
                          {generateCodeSnippet()}
                        </pre>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(generateCodeSnippet(), "code-snippet")}
                          className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[11px] font-medium text-zinc-200 flex items-center gap-1 cursor-pointer"
                        >
                          {copiedId === "code-snippet" ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Column 2: Live Response Inspector */}
                  <div className="space-y-2 flex flex-col">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="text-xs font-semibold text-zinc-300">
                        Live Server Response
                      </span>
                      {responseStatus !== null && (
                        <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
                          <span
                            className={
                              responseStatus >= 200 && responseStatus < 300
                                ? "text-emerald-400 font-semibold"
                                : responseStatus === 429
                                ? "text-amber-400 font-semibold"
                                : "text-red-400 font-semibold"
                            }
                          >
                            HTTP {responseStatus}
                          </span>
                          <span className="text-zinc-600">·</span>
                          <span className="text-zinc-400">{responseDurationMs} ms</span>
                          {responseRateHeaders?.remaining !== null && responseRateHeaders?.limit !== null && (
                            <>
                              <span className="text-zinc-600">·</span>
                              <span className="text-zinc-400">
                                Quota: {responseRateHeaders.remaining}/{responseRateHeaders.limit} rpm
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-h-[300px] rounded-lg bg-zinc-900 border border-zinc-800 p-3.5 relative flex flex-col">
                      {responseBody ? (
                        <>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(responseBody, "response-json")}
                            className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[11px] text-zinc-200 flex items-center gap-1 cursor-pointer"
                          >
                            {copiedId === "response-json" ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy JSON</span>
                              </>
                            )}
                          </button>
                          <pre className="text-xs font-mono text-zinc-200 overflow-auto max-h-[420px] whitespace-pre-wrap">
                            {responseBody}
                          </pre>
                        </>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-zinc-500 space-y-2">
                          <Terminal className="w-8 h-8 text-zinc-600" />
                          <p className="text-xs font-medium text-zinc-400">
                            Ready to execute remote API call
                          </p>
                          <p className="text-[11px] text-zinc-500 max-w-xs">
                            Click &ldquo;Send Live Request&rdquo; to invoke <code className="font-mono text-zinc-400">{selectedEndpoint.path}</code> with your active API key.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: REAL-TIME API TRAFFIC MONITOR DASHBOARD */}
          {activeTab === "traffic" && (
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
              {/* Top Control Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
                <div>
                  <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <span>Real-Time API Traffic Monitor</span>
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Live request metrics, per-key sliding-window rate-limit utilization (60s window), and usage audit logs.
                  </p>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  <button
                    id="simulate-traffic-burst-btn"
                    type="button"
                    onClick={handleSimulateTrafficBurst}
                    disabled={isSimulatingBurst}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    title="Execute 5 concurrent API calls across pipelines to populate live traffic metrics"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>{isSimulatingBurst ? "Sending Burst..." : "Simulate 5-Call Burst"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAutoPollTraffic((prev) => !prev)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                      autoPollTraffic
                        ? "bg-zinc-900 border-emerald-700/70 text-emerald-300"
                        : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${autoPollTraffic ? "animate-spin" : ""}`} />
                    <span>{autoPollTraffic ? "Live Polling (2s)" : "Polling Paused"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={fetchKeysAndLogs}
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-200 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Refresh Now</span>
                  </button>
                </div>
              </div>

              {/* Section 1: Active Request Metrics (4-Column KPI Grid) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1">
                  <div className="text-xs text-zinc-400 flex items-center justify-between">
                    <span>Total Requests & In-Flight</span>
                    <span className="font-mono text-[11px] text-emerald-400">
                      {traffic.activeRequestsInFlight} active
                    </span>
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-zinc-100">
                    {traffic.totalRequests}
                  </div>
                  <div className="text-[11px] text-zinc-400 font-mono tabular-nums">
                    {traffic.requestsLastMinute} req/min · {traffic.statusCodeBreakdown["2xx"]} 2xx OK
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1">
                  <div className="text-xs text-zinc-400 flex items-center justify-between">
                    <span>Success Rate</span>
                    <span className="font-mono text-[11px] text-zinc-400">
                      {traffic.errorCount} errors
                    </span>
                  </div>
                  <div
                    className={`text-2xl font-bold font-mono tabular-nums ${
                      traffic.successRatePercent >= 95
                        ? "text-emerald-400"
                        : traffic.successRatePercent >= 80
                        ? "text-amber-400"
                        : "text-red-400"
                    }`}
                  >
                    {traffic.successRatePercent.toFixed(1)}%
                  </div>
                  <div className="text-[11px] text-zinc-400 font-mono tabular-nums">
                    4xx: {traffic.statusCodeBreakdown["4xx"]} · 5xx: {traffic.statusCodeBreakdown["5xx"]}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1">
                  <div className="text-xs text-zinc-400 flex items-center justify-between">
                    <span>Response Latency</span>
                    <span className="font-mono text-[11px] text-cyan-400">
                      p95: {traffic.p95LatencyMs} ms
                    </span>
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-zinc-100">
                    {traffic.avgLatencyMs} <span className="text-sm font-normal text-zinc-400">ms avg</span>
                  </div>
                  <div className="text-[11px] text-zinc-400 font-mono tabular-nums">
                    Measured across {traffic.totalRequests} calls
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1">
                  <div className="text-xs text-zinc-400 flex items-center justify-between">
                    <span>Rate-Limit Throttles (HTTP 429)</span>
                    <span className="font-mono text-[11px] text-amber-400">
                      60s window
                    </span>
                  </div>
                  <div
                    className={`text-2xl font-bold font-mono tabular-nums ${
                      traffic.rateLimitHitCount > 0 ? "text-amber-400" : "text-zinc-100"
                    }`}
                  >
                    {traffic.rateLimitHitCount}
                  </div>
                  <div className="text-[11px] text-zinc-400 font-mono tabular-nums">
                    {keys.filter((k) => k.status === "active").length} active keys enforced
                  </div>
                </div>
              </div>

              {/* Section 2: Per-Key Rate-Limit Status & Quota Utilization */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                      <Gauge className="w-3.5 h-3.5 text-amber-400" />
                      <span>Per-Key Rate-Limit Status & Live Quota Utilization</span>
                    </h4>
                    <p className="text-[11px] text-zinc-400">
                      Configure per-minute request quotas (RPM) for each API key or reset the active 60-second sliding window.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 overflow-hidden bg-zinc-900/40">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-900/80 text-[11px] font-medium text-zinc-400">
                        <th className="py-2.5 px-4">API Key</th>
                        <th className="py-2.5 px-4">Rate-Limit Utilization (60s Window)</th>
                        <th className="py-2.5 px-4 text-right">Remaining</th>
                        <th className="py-2.5 px-4 text-right">Window Reset</th>
                        <th className="py-2.5 px-4 text-right">Total / 429s</th>
                        <th className="py-2.5 px-4 text-right">Quota Limit (RPM)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60 text-xs">
                      {keys.map((k) => {
                        const draftLimit = editingRateLimitByKey[k.id] ?? k.rateLimitPerMinute;
                        const isThrottled = k.remainingWindowQuota === 0 && k.status === "active";
                        const isWarning = k.utilizationPercent >= 75 && !isThrottled;

                        return (
                          <tr key={k.id} className="hover:bg-zinc-900/60">
                            <td className="py-3 px-4">
                              <div className="font-medium text-zinc-100">{k.name}</div>
                              <div className="text-[11px] font-mono text-zinc-400">
                                {k.keyPrefix} · {k.status === "active" ? "Active" : "Revoked"}
                              </div>
                            </td>

                            <td className="py-3 px-4 min-w-[220px]">
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                                  <span
                                    className={
                                      isThrottled
                                        ? "text-red-400 font-semibold"
                                        : isWarning
                                        ? "text-amber-400 font-semibold"
                                        : "text-emerald-400"
                                    }
                                  >
                                    {isThrottled
                                      ? "Throttled (429 Exceeded)"
                                      : isWarning
                                      ? "Approaching Limit"
                                      : "Nominal"}
                                  </span>
                                  <span className="text-zinc-300">
                                    {k.currentWindowRequests} / {k.rateLimitPerMinute} req ({k.utilizationPercent}%)
                                  </span>
                                </div>
                                <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                                  <div
                                    className={`h-full transition-all duration-200 ${
                                      isThrottled
                                        ? "bg-red-500"
                                        : isWarning
                                        ? "bg-amber-500"
                                        : "bg-emerald-500"
                                    }`}
                                    style={{ width: `${Math.min(100, k.utilizationPercent)}%` }}
                                  />
                                </div>
                              </div>
                            </td>

                            <td className="py-3 px-4 text-right font-mono tabular-nums text-zinc-200">
                              {k.remainingWindowQuota} req
                            </td>

                            <td className="py-3 px-4 text-right font-mono tabular-nums text-zinc-400">
                              {k.currentWindowRequests > 0 ? `${k.windowResetInSeconds}s` : "Idle (60s)"}
                            </td>

                            <td className="py-3 px-4 text-right font-mono tabular-nums">
                              <span className="text-zinc-200">{k.requestCount}</span>
                              <span className="text-zinc-600 mx-1">/</span>
                              <span className={k.rateLimitHitCount > 0 ? "text-amber-400 font-semibold" : "text-zinc-500"}>
                                {k.rateLimitHitCount}
                              </span>
                            </td>

                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <input
                                  type="number"
                                  min={1}
                                  max={10000}
                                  value={draftLimit}
                                  onChange={(e) =>
                                    setEditingRateLimitByKey((prev) => ({
                                      ...prev,
                                      [k.id]: Number(e.target.value),
                                    }))
                                  }
                                  className="w-20 rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-right text-xs font-mono tabular-nums text-zinc-100 focus:outline-none focus:border-amber-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleUpdateKeyRateLimit(k.id, draftLimit)}
                                  className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[11px] font-medium text-zinc-200 cursor-pointer whitespace-nowrap"
                                >
                                  Apply
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleResetKeyWindow(k.id)}
                                  className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-zinc-100 cursor-pointer"
                                  title="Reset 60s sliding window counter"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section 3: Pipeline Traffic Distribution */}
              <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-200">
                    Pipeline Traffic Distribution
                  </span>
                  <span className="text-[11px] font-mono tabular-nums text-zinc-400">
                    {traffic.totalRequests} total logged calls
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {Object.entries(traffic.categoryBreakdown).map(([cat, count]) => {
                    const pct =
                      traffic.totalRequests > 0
                        ? Math.round((count / traffic.totalRequests) * 100)
                        : 0;
                    return (
                      <div key={cat} className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/80 space-y-1">
                        <div className="text-[11px] text-zinc-400 truncate">{cat}</div>
                        <div className="flex items-baseline justify-between font-mono tabular-nums">
                          <span className="text-sm font-bold text-zinc-100">{count}</span>
                          <span className="text-[11px] text-zinc-500">{pct}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Section 4: Filterable API Key Usage & Request Logs */}
              <div className="space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Filter className="w-3.5 h-3.5 text-emerald-400" />
                    <h4 className="text-xs font-semibold text-zinc-200">
                      API Key Usage & Request Telemetry Logs ({filteredLogs.length})
                    </h4>
                  </div>

                  {/* Interactive Filter Bar */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={logSearchQuery}
                        onChange={(e) => setLogSearchQuery(e.target.value)}
                        placeholder="Search path, key, status..."
                        className="pl-8 pr-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <select
                      value={logKeyFilter}
                      onChange={(e) => setLogKeyFilter(e.target.value)}
                      className="rounded-lg bg-zinc-900 border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none"
                    >
                      <option value="all">All API Keys</option>
                      {uniqueKeyNamesInLogs.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>

                    <div className="flex items-center gap-1 p-0.5 bg-zinc-900 border border-zinc-800 rounded-lg">
                      {(["all", "2xx", "4xx", "429", "5xx"] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setLogStatusFilter(st)}
                          className={`px-2 py-1 rounded text-[11px] font-mono transition cursor-pointer ${
                            logStatusFilter === st
                              ? "bg-zinc-800 text-zinc-100 font-semibold"
                              : "text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          {st === "all" ? "All Status" : st}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1 p-0.5 bg-zinc-900 border border-zinc-800 rounded-lg">
                      {(["all", "GET", "POST"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setLogMethodFilter(m)}
                          className={`px-2 py-1 rounded text-[11px] font-mono transition cursor-pointer ${
                            logMethodFilter === m
                              ? "bg-zinc-800 text-zinc-100 font-semibold"
                              : "text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          {m === "all" ? "All Methods" : m}
                        </button>
                      ))}
                    </div>

                    {auditLogs.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearAuditLogs}
                        className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
                      >
                        Clear Logs
                      </button>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 overflow-hidden bg-zinc-900/40">
                  {filteredLogs.length === 0 ? (
                    <div className="p-8 text-center space-y-2">
                      <p className="text-xs font-medium text-zinc-300">
                        No API usage logs match the current filter
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        Click &ldquo;Simulate 5-Call Burst&rdquo; above or send a request from the Interactive Explorer to inspect live traffic telemetry.
                      </p>
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-zinc-800 bg-zinc-900/80 text-[11px] font-medium text-zinc-400">
                          <th className="py-2.5 px-4">Timestamp</th>
                          <th className="py-2.5 px-4">Endpoint & Pipeline</th>
                          <th className="py-2.5 px-4">API Key</th>
                          <th className="py-2.5 px-4 text-right">Status</th>
                          <th className="py-2.5 px-4 text-right">Latency</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60 text-xs font-mono tabular-nums">
                        {filteredLogs.slice(0, 50).map((log) => (
                          <tr key={log.id} className="hover:bg-zinc-900/60">
                            <td className="py-2.5 px-4 text-zinc-400 whitespace-nowrap">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </td>
                            <td className="py-2.5 px-4">
                              <div className="flex items-center gap-2">
                                <span
                                  className={
                                    log.method === "GET"
                                      ? "text-cyan-400 font-bold"
                                      : "text-emerald-400 font-bold"
                                  }
                                >
                                  {log.method}
                                </span>
                                <span className="text-zinc-100">{log.path}</span>
                                <span className="text-zinc-600">·</span>
                                <span className="font-sans text-[11px] text-zinc-400">
                                  {log.category}
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-4 font-sans">
                              <span className="text-zinc-200">{log.keyName}</span>
                              <span className="text-zinc-600 mx-1">·</span>
                              <span className="font-mono text-[11px] text-zinc-400">
                                {log.keyPrefix}
                              </span>
                            </td>
                            <td
                              className={`py-2.5 px-4 text-right font-semibold ${
                                log.statusCode >= 200 && log.statusCode < 300
                                  ? "text-emerald-400"
                                  : log.statusCode === 429
                                  ? "text-amber-400"
                                  : "text-red-400"
                              }`}
                            >
                              {log.statusCode === 429 ? "429 Throttled" : `HTTP ${log.statusCode}`}
                            </td>
                            <td className="py-2.5 px-4 text-right text-zinc-300">
                              {log.durationMs} ms
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: API KEYS & PROVISIONING */}
          {activeTab === "keys" && (
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
              <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-amber-400" />
                    <span>Generate New Remote API Key</span>
                  </h3>
                  <p className="text-xs text-zinc-400">
                    All requests to <code className="font-mono text-zinc-300">/api/v1/*</code> require a valid active key via <code className="font-mono text-zinc-300">Authorization: Bearer &lt;key&gt;</code> or <code className="font-mono text-zinc-300">X-API-Key</code>.
                  </p>
                </div>

                <form onSubmit={handleCreateKey} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <input
                    type="text"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="Key label (e.g., Production RAG Pipeline, LangChain Worker)"
                    className="flex-1 rounded-lg bg-zinc-950 border border-zinc-800 px-3.5 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                  />
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-zinc-400 whitespace-nowrap">Rate Limit (RPM):</label>
                    <input
                      type="number"
                      min={5}
                      max={5000}
                      value={newKeyRateLimit}
                      onChange={(e) => setNewKeyRateLimit(Number(e.target.value))}
                      className="w-24 rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs font-mono tabular-nums text-zinc-100 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Generate API Key</span>
                  </button>
                </form>

                {newlyCreatedKey && (
                  <div className="p-3.5 rounded-lg bg-emerald-950/40 border border-emerald-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-emerald-300">
                        New API Key Generated: {newlyCreatedKey.name} ({newlyCreatedKey.rateLimitPerMinute} RPM)
                      </div>
                      <code className="text-xs font-mono text-zinc-100 select-all break-all">
                        {newlyCreatedKey.rawKey}
                      </code>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(newlyCreatedKey.rawKey, "new-key")}
                      className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      {copiedId === "new-key" ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Secret Key</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Active Keys Table */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-zinc-300">
                  Registered API Keys
                </h3>
                <div className="rounded-xl border border-zinc-800 overflow-hidden bg-zinc-900/40">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-900/80 text-[11px] font-medium text-zinc-400">
                        <th className="py-2.5 px-4">Key Name</th>
                        <th className="py-2.5 px-4">Secret Token</th>
                        <th className="py-2.5 px-4">Status</th>
                        <th className="py-2.5 px-4 text-right">Quota (60s)</th>
                        <th className="py-2.5 px-4 text-right">Total Calls</th>
                        <th className="py-2.5 px-4">Last Used</th>
                        <th className="py-2.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60 text-xs">
                      {keys.map((k) => {
                        const isRevealed = Boolean(revealedKeyIds[k.id]);
                        return (
                          <tr key={k.id} className="hover:bg-zinc-900/60">
                            <td className="py-3 px-4 font-medium text-zinc-100">{k.name}</td>
                            <td className="py-3 px-4 font-mono text-zinc-300">
                              <div className="flex items-center gap-2">
                                <span>{isRevealed ? k.rawKey : k.keyPrefix}</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRevealedKeyIds((prev) => ({ ...prev, [k.id]: !prev[k.id] }))
                                  }
                                  className="text-zinc-400 hover:text-zinc-200 cursor-pointer"
                                  title={isRevealed ? "Hide key" : "Reveal full key"}
                                >
                                  {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(k.rawKey, k.id)}
                                  className="text-zinc-400 hover:text-zinc-200 cursor-pointer"
                                  title="Copy API key"
                                >
                                  {copiedId === k.id ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={
                                  k.status === "active"
                                    ? "text-emerald-400 font-medium"
                                    : "text-red-400 font-medium"
                                }
                              >
                                {k.status === "active" ? "Active" : "Revoked"}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-zinc-300">
                              {k.currentWindowRequests}/{k.rateLimitPerMinute} rpm
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-zinc-200">
                              {k.requestCount}
                            </td>
                            <td className="py-3 px-4 font-mono tabular-nums text-zinc-400">
                              {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleTimeString() : "Never"}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {k.status === "active" ? (
                                  <button
                                    type="button"
                                    onClick={() => handleRevokeKey(k.id)}
                                    className="px-2.5 py-1 rounded bg-red-950/60 hover:bg-red-900/60 border border-red-800/70 text-red-300 text-[11px] font-medium cursor-pointer"
                                  >
                                    Revoke
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteKey(k.id)}
                                    className="p-1 text-zinc-400 hover:text-red-400 cursor-pointer"
                                    title="Delete key record"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: OPENAPI 3.0.3 SPECIFICATION */}
          {activeTab === "openapi" && (
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-zinc-100">
                    OpenAPI 3.0.3 Machine-Readable Specification
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Import directly into Postman, Insomnia, Swagger UI, LangChain, or OpenAI Custom Actions:
                    <code className="font-mono text-cyan-300 ml-1.5 select-all">
                      {baseUrl}/api/v1/openapi.json
                    </code>
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(openApiJson, "openapi-spec")}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-medium text-zinc-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedId === "openapi-spec" ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Copied Spec</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy JSON</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const blob = new Blob([openApiJson], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "openapi-v1.json";
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download openapi.json</span>
                  </button>
                </div>
              </div>

              <pre className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 text-xs font-mono text-zinc-200 overflow-auto max-h-[62vh]">
                {openApiJson || "Loading OpenAPI 3.0.3 specification..."}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
