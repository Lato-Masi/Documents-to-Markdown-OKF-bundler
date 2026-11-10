/**
 * @file server/utils/apiKeyManager.ts
 * @description Manages Remote API v1 keys, strict authentication validation, and request audit logs.
 */

import crypto from "crypto";

export interface RemoteApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  rawKey: string;
  createdAt: string;
  lastUsedAt: string | null;
  requestCount: number;
  status: "active" | "revoked";
}

export interface RemoteApiAuditLog {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  keyName: string;
  keyPrefix: string;
}

const DEFAULT_DEMO_KEY = process.env.REMOTE_API_KEY || "okf_live_9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c";

// In-memory store initialized with a ready-to-use default production key
const apiKeyStore: Map<string, RemoteApiKeyRecord> = new Map();
const auditLogs: RemoteApiAuditLog[] = [];

function initializeDefaultKeys() {
  if (apiKeyStore.size === 0) {
    const defaultId = "key_default_primary";
    apiKeyStore.set(defaultId, {
      id: defaultId,
      name: process.env.REMOTE_API_KEY ? "Environment Master Key (REMOTE_API_KEY)" : "Default Workspace Remote Key",
      keyPrefix: `${DEFAULT_DEMO_KEY.slice(0, 13)}...${DEFAULT_DEMO_KEY.slice(-4)}`,
      rawKey: DEFAULT_DEMO_KEY,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      requestCount: 0,
      status: "active",
    });
  }
}

initializeDefaultKeys();

/**
 * Generates a new cryptographically strong Remote API Key (`okf_live_<32_hex_chars>`)
 */
export function createRemoteApiKey(name: string): RemoteApiKeyRecord {
  initializeDefaultKeys();
  const cleanName = (name || "Remote Integration Key").trim().slice(0, 64);
  const randomBytes = crypto.randomBytes(16).toString("hex");
  const rawKey = `okf_live_${randomBytes}`;
  const id = `key_${crypto.randomBytes(6).toString("hex")}`;

  const record: RemoteApiKeyRecord = {
    id,
    name: cleanName,
    keyPrefix: `${rawKey.slice(0, 13)}...${rawKey.slice(-4)}`,
    rawKey,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    requestCount: 0,
    status: "active",
  };

  apiKeyStore.set(id, record);
  return record;
}

/**
 * Lists all API keys in the registry
 */
export function listRemoteApiKeys(): RemoteApiKeyRecord[] {
  initializeDefaultKeys();
  return Array.from(apiKeyStore.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Revokes an API key by its ID
 */
export function revokeRemoteApiKey(id: string): boolean {
  initializeDefaultKeys();
  const existing = apiKeyStore.get(id);
  if (!existing) return false;
  existing.status = "revoked";
  apiKeyStore.set(id, existing);
  return true;
}

/**
 * Deletes a revoked API key from the registry
 */
export function deleteRemoteApiKey(id: string): boolean {
  initializeDefaultKeys();
  if (apiKeyStore.size <= 1) {
    // Always preserve at least one key or recreate if needed
  }
  return apiKeyStore.delete(id);
}

/**
 * Validates an incoming raw API key string and increments usage counters
 */
export function validateAndTrackApiKey(providedKey: string | undefined): {
  valid: boolean;
  keyRecord?: RemoteApiKeyRecord;
  reason?: string;
} {
  initializeDefaultKeys();

  if (!providedKey || typeof providedKey !== "string" || !providedKey.trim()) {
    return {
      valid: false,
      reason: "Missing API key. Provide 'Authorization: Bearer <API_KEY>' or 'X-API-Key: <API_KEY>' header.",
    };
  }

  const trimmed = providedKey.trim();

  // Check against environment variable if set
  if (process.env.REMOTE_API_KEY && trimmed === process.env.REMOTE_API_KEY.trim()) {
    const envRecord = Array.from(apiKeyStore.values()).find((r) => r.rawKey === trimmed);
    if (envRecord) {
      envRecord.lastUsedAt = new Date().toISOString();
      envRecord.requestCount += 1;
      return { valid: true, keyRecord: envRecord };
    }
  }

  for (const record of apiKeyStore.values()) {
    if (record.rawKey === trimmed) {
      if (record.status === "revoked") {
        return {
          valid: false,
          reason: `API key '${record.keyPrefix}' (${record.name}) has been revoked.`,
        };
      }
      record.lastUsedAt = new Date().toISOString();
      record.requestCount += 1;
      return { valid: true, keyRecord: record };
    }
  }

  return {
    valid: false,
    reason: "Invalid API key. Generate or copy an active 'okf_live_...' key from the Remote API Developer Console.",
  };
}

/**
 * Appends a request entry to the in-memory audit log (capped at 100 entries)
 */
export function recordRemoteApiAudit(entry: Omit<RemoteApiAuditLog, "id" | "timestamp">): RemoteApiAuditLog {
  const fullEntry: RemoteApiAuditLog = {
    id: `req_${crypto.randomBytes(5).toString("hex")}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  auditLogs.unshift(fullEntry);
  if (auditLogs.length > 100) {
    auditLogs.length = 100;
  }
  return fullEntry;
}

/**
 * Returns recent audit logs
 */
export function getRemoteApiAuditLogs(): RemoteApiAuditLog[] {
  return auditLogs;
}

/**
 * Clears audit logs
 */
export function clearRemoteApiAuditLogs(): void {
  auditLogs.length = 0;
}
