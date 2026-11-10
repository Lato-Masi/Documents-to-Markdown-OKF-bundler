# Production Hardening, Security, Resiliency & Quality Audit Plan

Deliver a comprehensive full-stack production hardening pass across security, data persistence, error boundaries, server resiliency, pipeline consistency, and accessibility based on a complete architectural audit of the codebase.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following production hardening decisions incorporate your confirmed selections from Phase 1:

- **Confirmed Decision 1 — Full-Stack Production Hardening**: Remediate all identified security, error boundary, resiliency, consistency, and accessibility findings across both the Express backend and React frontend.
- **Confirmed Decision 2 — Persistent Disk Storage for API Keys & Audit Logs**: Persist API keys, sliding-window quota configurations, and request audit logs to disk (`.data/remote-api-store.json` with atomic write-and-rename and debounced flush) so server restarts preserve all keys and traffic history.
- **Confirmed Decision 3 — Secured `/api/v1/admin/*` Management Routes**: Protect all `/api/v1/admin/*` endpoints against cross-origin abuse using strict same-origin / `Sec-Fetch-Site` verification (for the local browser Developer Console) or a valid `X-Admin-Token` / master `REMOTE_API_KEY` header for authorized administrative callers.

---

## 1. Overview & Audit Findings Summary

Our audit evaluated the application across **7 production readiness pillars**:

1. **Security & Cryptography**:
   - *Finding*: API key comparisons used standard string equality (`===`), and SSRF validation in `remoteApi.ts` checked hostnames without blocking private IPv4/IPv6 CIDR ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `fc00::/7`, `fe80::/10`). Additionally, `/api/v1/admin/*` routes inherited the wildcard `Access-Control-Allow-Origin: *` policy.
   - *Remediation*: Implement constant-time `crypto.timingSafeEqual` key verification, unify a comprehensive IPv4/IPv6 SSRF guard across all URL-fetching routes, restrict `/api/v1/admin/*` with same-origin + `X-Console-Client` / admin token verification, and add baseline HTTP security headers (`X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Request-Id`).
2. **Durability & State Persistence**:
   - *Finding*: API keys and traffic audit logs were stored strictly in volatile memory and reset whenever the server restarted.
   - *Remediation*: Implement an atomic JSON persistence layer (`.data/remote-api-store.json`) with automatic hydration on startup and debounced non-blocking disk writes.
3. **Consistency & Pipeline Unification**:
   - *Finding*: The Remote API's `/api/v1/mcp/*` endpoints returned static stub responses for `search_okf_concepts`, `get_okf_concept`, `traverse_okf_graph`, and `/api/v1/mcp/query` instead of querying the live `currentKnowledgeBase` state in `mcp.ts`.
   - *Remediation*: Extract a shared Knowledge Base store module so `/api/mcp/*` and `/api/v1/mcp/*` operate on the exact same live OKF concepts, graph edges, and resources.
4. **Backend Resiliency & Global Error Handling**:
   - *Finding*: Malformed JSON payloads (`SyntaxError` from `express.json()`) or unhandled async errors returned default HTML stack traces instead of structured JSON, and `server.ts` lacked `SIGTERM`/`SIGINT` graceful shutdown handlers.
   - *Remediation*: Add a global Express JSON error-handling middleware that catches payload parse errors (`400 INVALID_JSON_PAYLOAD`) and unexpected exceptions (`500 INTERNAL_SERVER_ERROR`) without leaking stack traces, plus graceful server shutdown hooks.
5. **Frontend Error Boundaries**:
   - *Finding*: While the main document views in `App.tsx` were wrapped in `<ErrorBoundary>`, the 11 interactive modals (`RemoteApiModal`, `SemanticCrawlModal`, `StrictJsonExtractorModal`, `SiteMapperModal`, `BatchUrlScraperModal`, `SearchAndScrapeModal`, `VectorPrepModal`, `AstExplorerModal`, `ConvertUrlModal`, `ApiKeyModal`, `LexiconConfigModal`) were rendered outside error boundaries—meaning a rendering exception inside any modal would crash the entire application.
   - *Remediation*: Wrap all modal subsystems in isolated `<ErrorBoundary>` containers with recovery actions.
6. **Usability, Keyboard Navigation & UTF-8 Safety**:
   - *Finding*: `RemoteApiModal` used raw `btoa()` which throws `InvalidCharacterError` on Unicode strings, lacked `Escape` key dismissal, and did not validate JSON syntax in the Interactive Explorer before sending POST requests.
   - *Remediation*: Use UTF-8 safe `TextEncoder` base64 encoding, add `Escape` key listener and `role="dialog"` / `aria-modal="true"` attributes, and validate JSON payloads client-side with clear inline feedback before dispatching POST requests.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  - **Seamless Recovery in Modals**: If any modal encounters an unexpected runtime error, an isolated Error Boundary card appears inside the modal overlay with a **Reset & Close** button, keeping the user's converted Markdown and workspace state intact.
  - **Pre-Flight JSON Validation in API Explorer**: When editing JSON request bodies in the Interactive Explorer, malformed JSON is immediately flagged with a crisp diagnostic message before the request is sent.
  - **Keyboard & Accessibility Ergonomics**: Pressing `Esc` cleanly closes active modals; all interactive controls include accessible titles, `focus-visible` rings, and tabular numeral alignment (`tabular-nums`).
- **Visual Identity & Theme**:
  - Preserves the high-contrast dark zinc developer console aesthetic (`bg-zinc-950`, `bg-zinc-900`, `border-zinc-800`, emerald/amber/cyan/rose semantic status indicators, and `font-mono tabular-nums` telemetry).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Atomic Disk Persistence vs. External Database**
  - *Chosen Approach*: Store API keys, rate-limit settings, and recent audit logs in `.data/remote-api-store.json` using atomic temp-file write + rename and debounced saves.
  - *Why*: Zero external infrastructure dependencies, instant startup hydration, crash-safe writes, and full compatibility with containerized environments.
- **Decision 2: Same-Origin + Custom Header Guard for `/api/v1/admin/*`**
  - *Chosen Approach*: Split CORS policies so `/api/v1/admin/*` rejects cross-origin browser requests (`Sec-Fetch-Site: cross-site` or mismatched `Origin`) unless authenticated with a valid `Authorization: Bearer <MASTER_KEY>` or `X-Console-Client: okf-internal-console` from the same host.
  - *Why*: Prevents malicious third-party websites from silently enumerating or revoking a user's API keys via cross-origin `fetch()` calls while keeping the in-app Developer Console seamless.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        Express Server (server.ts)                          │
│  • Security Headers (X-Content-Type-Options, Referrer-Policy, X-Request-Id)│
│  • Global JSON Error Boundary Middleware (400 Bad JSON / 500 Safe Error)   │
│  • Graceful Shutdown Handler (SIGTERM / SIGINT)                            │
└───────────────┬────────────────────────────────────────┬───────────────────┘
                │                                        │
                ▼                                        ▼
┌───────────────────────────────────────┐  ┌─────────────────────────────────┐
│   Admin Guard (/api/v1/admin/*)       │  │ Remote Gateway (/api/v1/*)      │
│  • Same-Origin / Sec-Fetch-Site Check │  │  • Wildcard CORS for 3P Clients │
│  • X-Console-Client / Admin Auth      │  │  • Timing-Safe Key Verification │
└───────────────┬───────────────────────┘  │  • Sliding-Window Rate Limiter  │
                │                          │  • Unified IPv4/IPv6 SSRF Guard │
                ▼                          └─────────────┬───────────────────┘
┌────────────────────────────────────────────────────────┴───────────────────┐
│              Shared Core Stores & Persistent Disk Layer                    │
│  • .data/remote-api-store.json (Atomic Write + Startup Hydration)          │
│  • Shared OKF Knowledge Base Store (Unifies /api/mcp & /api/v1/mcp)        │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Interactive Component & State Mapping**:
  - **Unified SSRF Guard**: Centralizes `validateSafeRemoteUrl(url)` in `urlValidator.ts` blocking loopback, link-local, RFC 1918 private IPv4 ranges, IPv6 unique-local/link-local addresses, and cloud metadata endpoints across both `convert.ts` and `remoteApi.ts`.
  - **Shared MCP Knowledge Base**: Synchronizes concepts across the UI's Multi-Doc Studio, `/api/mcp/*`, and `/api/v1/mcp/*` so remote agents can search, read, and traverse the active knowledge graph.
  - **Modal Error Boundaries & Keyboard UX**: Wraps modal instances in `App.tsx` with `<ErrorBoundary>` and adds `Escape` key handling and pre-flight JSON validation in `RemoteApiModal.tsx`.
