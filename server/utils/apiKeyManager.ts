/**
 * @file server/utils/apiKeyManager.ts
 * @description Manages Remote API v1 keys, constant-time cryptographic verification,
 * sliding-window rate limits, real-time traffic metrics, and persistent disk storage.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";

export interface RemoteApiKeyRecord {
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
  status: "active" | "revoked";
}

export interface RemoteApiKeyWithRateStatus extends RemoteApiKeyRecord {
  currentWindowRequests: number;
  remainingWindowQuota: number;
  windowResetInSeconds: number;
  utilizationPercent: number;
}

export interface RemoteApiAuditLog {
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

export interface TrafficSummaryMetrics {
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

const DEFAULT_DEMO_KEY = process.env.REMOTE_API_KEY || "okf_live_9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c";
const DEFAULT_RATE_LIMIT_PER_MIN = 60;
const RATE_WINDOW_MS = 60_000;

const DATA_DIR = path.join(process.cwd(), ".data");
const STORE_FILE_PATH = path.join(DATA_DIR, "remote-api-store.json");

const apiKeyStore: Map<string, RemoteApiKeyRecord> = new Map();
const keyWindowTimestamps: Map<string, number[]> = new Map();
const auditLogs: RemoteApiAuditLog[] = [];
let activeRequestsInFlight = 0;
let saveDebounceTimer: NodeJS.Timeout | null = null;
let isInitialized = false;

/**
 * Performs constant-time string comparison using SHA-256 digests so lengths do not leak timing info.
 */
export function constantTimeStringEquals(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const hashA = crypto.createHash("sha256").update(a, "utf8").digest();
  const hashB = crypto.createHash("sha256").update(b, "utf8").digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * Hydrates keys and audit logs from .data/remote-api-store.json on startup
 */
function initializeStore() {
  if (isInitialized) return;
  isInitialized = true;

  try {
    if (fs.existsSync(STORE_FILE_PATH)) {
      const raw = fs.readFileSync(STORE_FILE_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.keys)) {
        for (const k of parsed.keys) {
          if (k && k.id && k.rawKey) {
            apiKeyStore.set(k.id, {
              id: k.id,
              name: k.name || "Remote API Key",
              keyPrefix: k.keyPrefix || `${k.rawKey.slice(0, 13)}...${k.rawKey.slice(-4)}`,
              rawKey: k.rawKey,
              createdAt: k.createdAt || new Date().toISOString(),
              lastUsedAt: k.lastUsedAt || null,
              requestCount: Number(k.requestCount) || 0,
              successCount: Number(k.successCount) || 0,
              errorCount: Number(k.errorCount) || 0,
              rateLimitHitCount: Number(k.rateLimitHitCount) || 0,
              rateLimitPerMinute: Number(k.rateLimitPerMinute) || DEFAULT_RATE_LIMIT_PER_MIN,
              status: k.status === "revoked" ? "revoked" : "active",
            });
          }
        }
      }
      if (Array.isArray(parsed?.auditLogs)) {
        auditLogs.push(...parsed.auditLogs.slice(0, 200));
      }
    }
  } catch (err) {
    console.warn("[RemoteApiStore] Notice hydrating store from disk:", err);
  }

  // Ensure default primary key always exists if store is empty
  if (apiKeyStore.size === 0) {
    const defaultId = "key_default_primary";
    apiKeyStore.set(defaultId, {
      id: defaultId,
      name: process.env.REMOTE_API_KEY
        ? "Environment Master Key (REMOTE_API_KEY)"
        : "Default Workspace Remote Key",
      keyPrefix: `${DEFAULT_DEMO_KEY.slice(0, 13)}...${DEFAULT_DEMO_KEY.slice(-4)}`,
      rawKey: DEFAULT_DEMO_KEY,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      requestCount: 0,
      successCount: 0,
      errorCount: 0,
      rateLimitHitCount: 0,
      rateLimitPerMinute: DEFAULT_RATE_LIMIT_PER_MIN,
      status: "active",
    });
    scheduleDiskPersist();
  }
}

/**
 * Atomically writes current keys and audit logs to .data/remote-api-store.json
 */
export function flushStoreToDiskSync(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const payload = JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        keys: Array.from(apiKeyStore.values()),
        auditLogs: auditLogs.slice(0, 200),
      },
      null,
      2
    );
    const tmpFile = `${STORE_FILE_PATH}.tmp`;
    fs.writeFileSync(tmpFile, payload, "utf-8");
    fs.renameSync(tmpFile, STORE_FILE_PATH);
  } catch (err) {
    console.warn("[RemoteApiStore] Failed to persist API store to disk:", err);
  }
}

function scheduleDiskPersist() {
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
  }
  saveDebounceTimer = setTimeout(() => {
    saveDebounceTimer = null;
    flushStoreToDiskSync();
  }, 400);
}

initializeStore();

/**
 * Prunes timestamps older than 60s and returns current sliding-window rate status for a key
 */
export function getKeyRateLimitStatus(keyRecord: RemoteApiKeyRecord): {
  currentWindowRequests: number;
  remainingWindowQuota: number;
  windowResetInSeconds: number;
  utilizationPercent: number;
} {
  const now = Date.now();
  const timestamps = (keyWindowTimestamps.get(keyRecord.id) || []).filter(
    (ts) => now - ts < RATE_WINDOW_MS
  );
  keyWindowTimestamps.set(keyRecord.id, timestamps);

  const limit = Math.max(1, keyRecord.rateLimitPerMinute || DEFAULT_RATE_LIMIT_PER_MIN);
  const currentWindowRequests = timestamps.length;
  const remainingWindowQuota = Math.max(0, limit - currentWindowRequests);
  const oldestTs = timestamps[0];
  const windowResetInSeconds = oldestTs
    ? Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - oldestTs)) / 1000))
    : 60;
  const utilizationPercent = Math.min(100, Math.round((currentWindowRequests / limit) * 100));

  return {
    currentWindowRequests,
    remainingWindowQuota,
    windowResetInSeconds,
    utilizationPercent,
  };
}

/**
 * Generates a new cryptographically strong Remote API Key (`okf_live_<32_hex_chars>`)
 */
export function createRemoteApiKey(
  name: string,
  rateLimitPerMinute = DEFAULT_RATE_LIMIT_PER_MIN
): RemoteApiKeyWithRateStatus {
  initializeStore();
  const cleanName = (name || "Remote Integration Key").trim().slice(0, 64);
  const randomBytes = crypto.randomBytes(16).toString("hex");
  const rawKey = `okf_live_${randomBytes}`;
  const id = `key_${crypto.randomBytes(6).toString("hex")}`;
  const cleanLimit = Math.min(Math.max(5, Number(rateLimitPerMinute) || DEFAULT_RATE_LIMIT_PER_MIN), 5000);

  const record: RemoteApiKeyRecord = {
    id,
    name: cleanName,
    keyPrefix: `${rawKey.slice(0, 13)}...${rawKey.slice(-4)}`,
    rawKey,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    requestCount: 0,
    successCount: 0,
    errorCount: 0,
    rateLimitHitCount: 0,
    rateLimitPerMinute: cleanLimit,
    status: "active",
  };

  apiKeyStore.set(id, record);
  scheduleDiskPersist();

  return {
    ...record,
    ...getKeyRateLimitStatus(record),
  };
}

/**
 * Updates the per-minute rate limit for a specific API key
 */
export function updateRemoteApiKeyRateLimit(
  id: string,
  rateLimitPerMinute: number
): RemoteApiKeyWithRateStatus | null {
  initializeStore();
  const existing = apiKeyStore.get(id);
  if (!existing) return null;
  existing.rateLimitPerMinute = Math.min(Math.max(1, Number(rateLimitPerMinute) || 60), 10000);
  apiKeyStore.set(id, existing);
  scheduleDiskPersist();
  return {
    ...existing,
    ...getKeyRateLimitStatus(existing),
  };
}

/**
 * Resets the sliding window counter for a specific API key
 */
export function resetRemoteApiKeyWindow(id: string): boolean {
  initializeStore();
  if (!apiKeyStore.has(id)) return false;
  keyWindowTimestamps.set(id, []);
  return true;
}

/**
 * Lists all API keys in the registry with live rate-limit status
 */
export function listRemoteApiKeys(): RemoteApiKeyWithRateStatus[] {
  initializeStore();
  return Array.from(apiKeyStore.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((record) => ({
      ...record,
      ...getKeyRateLimitStatus(record),
    }));
}

/**
 * Revokes an API key by its ID
 */
export function revokeRemoteApiKey(id: string): boolean {
  initializeStore();
  const existing = apiKeyStore.get(id);
  if (!existing) return false;
  existing.status = "revoked";
  apiKeyStore.set(id, existing);
  scheduleDiskPersist();
  return true;
}

/**
 * Deletes a revoked API key from the registry
 */
export function deleteRemoteApiKey(id: string): boolean {
  initializeStore();
  keyWindowTimestamps.delete(id);
  const deleted = apiKeyStore.delete(id);
  if (deleted) {
    scheduleDiskPersist();
  }
  return deleted;
}

/**
 * Increments or decrements the in-flight active requests gauge
 */
export function incrementActiveRequests(): void {
  activeRequestsInFlight += 1;
}

export function decrementActiveRequests(): void {
  activeRequestsInFlight = Math.max(0, activeRequestsInFlight - 1);
}

/**
 * Validates an incoming raw API key string using constant-time comparison,
 * checks sliding-window rate limits, and updates counters.
 */
export function validateAndTrackApiKey(providedKey: string | undefined): {
  valid: boolean;
  rateLimited?: boolean;
  keyRecord?: RemoteApiKeyWithRateStatus;
  reason?: string;
} {
  initializeStore();

  if (!providedKey || typeof providedKey !== "string" || !providedKey.trim()) {
    return {
      valid: false,
      reason: "Missing API key. Provide 'Authorization: Bearer <API_KEY>' or 'X-API-Key: <API_KEY>' header.",
    };
  }

  const trimmed = providedKey.trim();
  let matchedRecord: RemoteApiKeyRecord | undefined;

  if (process.env.REMOTE_API_KEY && constantTimeStringEquals(trimmed, process.env.REMOTE_API_KEY.trim())) {
    matchedRecord = Array.from(apiKeyStore.values()).find((r) =>
      constantTimeStringEquals(r.rawKey, trimmed)
    );
  }

  if (!matchedRecord) {
    for (const record of apiKeyStore.values()) {
      if (constantTimeStringEquals(record.rawKey, trimmed)) {
        matchedRecord = record;
        break;
      }
    }
  }

  if (!matchedRecord) {
    return {
      valid: false,
      reason: "Invalid API key. Generate or copy an active 'okf_live_...' key from the Remote API Developer Console.",
    };
  }

  if (matchedRecord.status === "revoked") {
    return {
      valid: false,
      keyRecord: { ...matchedRecord, ...getKeyRateLimitStatus(matchedRecord) },
      reason: `API key '${matchedRecord.keyPrefix}' (${matchedRecord.name}) has been revoked.`,
    };
  }

  // Check sliding-window rate limit before recording the new timestamp
  const preStatus = getKeyRateLimitStatus(matchedRecord);
  if (preStatus.currentWindowRequests >= matchedRecord.rateLimitPerMinute) {
    matchedRecord.requestCount += 1;
    matchedRecord.rateLimitHitCount += 1;
    matchedRecord.errorCount += 1;
    matchedRecord.lastUsedAt = new Date().toISOString();
    scheduleDiskPersist();
    return {
      valid: false,
      rateLimited: true,
      keyRecord: { ...matchedRecord, ...preStatus },
      reason: `Rate limit exceeded for key '${matchedRecord.name}' (${matchedRecord.rateLimitPerMinute} req/min). Quota resets in ${preStatus.windowResetInSeconds}s.`,
    };
  }

  // Record timestamp in sliding window
  const timestamps = keyWindowTimestamps.get(matchedRecord.id) || [];
  timestamps.push(Date.now());
  keyWindowTimestamps.set(matchedRecord.id, timestamps);

  matchedRecord.lastUsedAt = new Date().toISOString();
  matchedRecord.requestCount += 1;
  scheduleDiskPersist();

  return {
    valid: true,
    keyRecord: { ...matchedRecord, ...getKeyRateLimitStatus(matchedRecord) },
  };
}

/**
 * Maps an API path to a pipeline category label
 */
export function inferEndpointCategory(path: string): string {
  if (path.includes("/convert") || path.includes("/extract") || path.includes("/site")) {
    return "Convert & Scraping";
  }
  if (path.includes("/nlp") || path.includes("/okf")) {
    return "NLP & OKF";
  }
  if (path.includes("/skills")) {
    return "Skills & Logic";
  }
  if (path.includes("/meta-ast")) {
    return "MetaAST & Vector";
  }
  if (path.includes("/mcp")) {
    return "MCP JSON-RPC";
  }
  return "System";
}

/**
 * Appends a request entry to the audit log (capped at 200 entries), updates key counters, and schedules disk persistence
 */
export function recordRemoteApiAudit(
  entry: Omit<RemoteApiAuditLog, "id" | "timestamp" | "category"> & { category?: string }
): RemoteApiAuditLog {
  const category = entry.category || inferEndpointCategory(entry.path);
  const fullEntry: RemoteApiAuditLog = {
    id: `req_${crypto.randomBytes(5).toString("hex")}`,
    timestamp: new Date().toISOString(),
    ...entry,
    category,
  };

  if (entry.keyId && apiKeyStore.has(entry.keyId) && !entry.rateLimited) {
    const rec = apiKeyStore.get(entry.keyId)!;
    if (entry.statusCode >= 200 && entry.statusCode < 400) {
      rec.successCount += 1;
    } else {
      rec.errorCount += 1;
    }
  }

  auditLogs.unshift(fullEntry);
  if (auditLogs.length > 200) {
    auditLogs.length = 200;
  }
  scheduleDiskPersist();
  return fullEntry;
}

/**
 * Returns recent audit logs
 */
export function getRemoteApiAuditLogs(): RemoteApiAuditLog[] {
  initializeStore();
  return auditLogs;
}

/**
 * Clears audit logs and persists to disk
 */
export function clearRemoteApiAuditLogs(): void {
  auditLogs.length = 0;
  scheduleDiskPersist();
}

/**
 * Computes real-time aggregate traffic telemetry across all keys and audit logs
 */
export function getTrafficSummaryMetrics(): TrafficSummaryMetrics {
  initializeStore();
  const now = Date.now();
  const totalRequests = auditLogs.length;

  let successCount = 0;
  let errorCount = 0;
  let rateLimitHitCount = 0;
  let requestsLastMinute = 0;
  const latencies: number[] = [];

  const categoryBreakdown: Record<string, number> = {
    "Convert & Scraping": 0,
    "NLP & OKF": 0,
    "Skills & Logic": 0,
    "MetaAST & Vector": 0,
    "MCP JSON-RPC": 0,
    System: 0,
  };

  const statusCodeBreakdown = {
    "2xx": 0,
    "4xx": 0,
    "429": 0,
    "5xx": 0,
  };

  for (const log of auditLogs) {
    latencies.push(log.durationMs);
    const logTime = new Date(log.timestamp).getTime();
    if (now - logTime <= 60_000) {
      requestsLastMinute += 1;
    }

    categoryBreakdown[log.category] = (categoryBreakdown[log.category] || 0) + 1;

    if (log.statusCode === 429) {
      statusCodeBreakdown["429"] += 1;
      rateLimitHitCount += 1;
      errorCount += 1;
    } else if (log.statusCode >= 200 && log.statusCode < 300) {
      statusCodeBreakdown["2xx"] += 1;
      successCount += 1;
    } else if (log.statusCode >= 400 && log.statusCode < 500) {
      statusCodeBreakdown["4xx"] += 1;
      errorCount += 1;
    } else if (log.statusCode >= 500) {
      statusCodeBreakdown["5xx"] += 1;
      errorCount += 1;
    }
  }

  const avgLatencyMs =
    latencies.length > 0
      ? Math.round(latencies.reduce((acc, v) => acc + v, 0) / latencies.length)
      : 0;

  const sortedLatencies = [...latencies].sort((a, b) => a - b);
  const p95Index = Math.max(0, Math.ceil(sortedLatencies.length * 0.95) - 1);
  const p95LatencyMs = sortedLatencies.length > 0 ? sortedLatencies[p95Index] : 0;

  const successRatePercent =
    totalRequests > 0 ? Math.round((successCount / totalRequests) * 1000) / 10 : 100;

  return {
    totalRequests,
    activeRequestsInFlight,
    successCount,
    errorCount,
    rateLimitHitCount,
    successRatePercent,
    avgLatencyMs,
    p95LatencyMs,
    requestsLastMinute,
    categoryBreakdown,
    statusCodeBreakdown,
  };
}
