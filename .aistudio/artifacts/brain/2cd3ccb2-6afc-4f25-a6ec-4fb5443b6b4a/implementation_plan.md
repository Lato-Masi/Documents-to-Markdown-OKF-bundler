# Remote API v1 & Interactive Developer Console

Deliver a unified, cross-origin enabled Remote REST & JSON-RPC API (`/api/v1/*`) across all core application pipelines—protected by strict API key authentication—alongside an interactive Developer Console with live endpoint testing, OpenAPI 3.0 specification export, and multi-language SDK snippets (`cURL`, `TypeScript/Node.js`, `Python`).

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions incorporate your confirmed selections from Phase 1:

- **Confirmed Decision 1 — Full Pipeline Coverage**: All five core capability domains (`Convert`, `NLP Analysis`, `Agent Skills & Formal Logic`, `MetaAST & Vector DB Prep`, and `MCP JSON-RPC 2.0`) will be exposed under clean, versioned `/api/v1/*` remote endpoints with structured JSON responses (plus optional SSE/chunked streaming where requested).
- **Confirmed Decision 2 — Strict API Key Authentication**: Every remote `/api/v1/*` call requires a valid API key passed via `Authorization: Bearer <API_KEY>` or `X-API-Key: <API_KEY>` header. Users can generate, rotate, label, and revoke remote API keys from the in-app Developer Console (with an optional server-level `REMOTE_API_KEY` environment variable supported for headless/CI deployments).
- **Confirmed Decision 3 — Interactive Developer Experience**: A dedicated **Remote API & Developer Console** modal/workspace will provide API key management, an interactive request tester, a downloadable/live OpenAPI 3.0 specification (`/api/v1/openapi.json`), and copy-ready code snippets in `cURL`, `TypeScript`, and `Python`.

---

## 1. Overview & Core Concept

- **What It Does**: Exposes the application's document conversion, web scraping, NLP analysis, Agent Skill compilation, MetaAST parsing, and MCP JSON-RPC engines as a secure, remotely callable REST API. External scripts, CI/CD pipelines, autonomous AI agents, and third-party services can invoke these endpoints directly over HTTPS.
- **Target Audience / Persona**: Software engineers, AI/RAG pipeline builders, and technical teams integrating high-fidelity document-to-Markdown conversion, OKF knowledge structuring, and vector chunking into remote workflows.
- **Key Value**: Transforms the browser-based studio into a headless, programmable microservice with zero-friction testing, strict access control, and standards-compliant OpenAPI 3.0 documentation.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Accessing the Console**: Users click the **Remote API** button in the top toolbar to open the Developer Console.
  2. **Managing API Keys**: In the **API Keys & Security** tab, users view their active API keys (with masked previews and tabular request counters), generate new named keys (e.g., `Production RAG Worker`), copy the secret token, or revoke existing keys.
  3. **Exploring & Testing Endpoints**: In the **Interactive API Explorer** tab, users select any endpoint across the 5 pipeline categories, inspect required/optional JSON parameters, edit the request payload, and click **Send Live Request** to inspect the real HTTP status code, latency (`ms`), response headers, and formatted JSON output.
  4. **Copying SDK Snippets & OpenAPI Spec**: Users switch between `cURL`, `TypeScript (fetch)`, and `Python (requests)` tabs with their active base URL and API key pre-filled, or download/copy the full OpenAPI 3.0 JSON specification (`/api/v1/openapi.json`).
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: High-contrast technical developer console matching the existing zinc dark-mode workspace (`bg-zinc-950`, `bg-zinc-900` structural surfaces, `border-zinc-800` 1px hairlines).
  - *Color Palette & Mood*: Dominant neutral dark slate canvas (`#09090B` / `#18181B`), crisp zinc typography (`#F4F4F5` primary, `#A1A1AA` muted), and semantic accents (`#10B981` emerald for `POST`/`200 OK`, `#06B6D4` cyan for `GET`, `#F59E0B` amber for authentication keys, `#EF4444` crimson for `401`/`403`/`500` errors).
  - *Typography & Hierarchy*: Clean sans-serif UI headings paired with strict monospace (`JetBrains Mono` / `font-mono tabular-nums`) for HTTP paths, status codes, latency metrics, key hashes, and JSON payloads.
  - *Component Styling & Layout*: Single-elevation split-pane workbench (Left sidebar: categorized endpoint catalog + key manager; Right pane: parameter editor, code generator, and live response inspector).
- **Interactive Feedback & Motion**: Instant `<150ms` tab transitions, one-click clipboard copy confirmation states, live request spinner with elapsed millisecond counter, and clear `401 Unauthorized` diagnostic banners when testing without a valid key.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Versioned `/api/v1/*` Gateway vs. Modifying Internal UI Routes**
  - *Chosen Approach*: Mount a dedicated `/api/v1` router protected by strict API key authentication and permissive CORS headers (`Access-Control-Allow-Origin: *`), while keeping the existing internal `/api/*` routes intact for the browser UI.
  - *Why*: Ensures the web interface continues functioning seamlessly for interactive users without breaking existing components, while remote consumers get a clean, uniform JSON API contract (`{ success, data, meta: { requestId, durationMs } }`) and strict authentication enforcement.
  - *Alternatives Considered*: Enforcing API keys directly on existing `/api/*` routes, which would block the local web UI unless every frontend `fetch()` call was retrofitted with session tokens.
- **Decision 2: Synchronous JSON Default with Optional Streaming for Remote Clients**
  - *Chosen Approach*: Remote `/api/v1/convert` and `/api/v1/fetch-url` endpoints return structured JSON (`{ success: true, markdown, metadata }`) by default when `Accept: application/json` (or `stream: false`) is used, while supporting chunked text streaming when `stream: true` is passed.
  - *Why*: Remote programmatic clients (Python scripts, webhooks, LangChain/LlamaIndex loaders) strongly prefer deterministic JSON payloads over raw chunked text with heartbeat banners.
- **Decision 3: Hybrid API Key Store (Server Memory + Persistent Local Sync + Env Variable)**
  - *Chosen Approach*: Support a pre-configured `REMOTE_API_KEY` environment variable alongside dynamically generated `okf_live_...` keys managed via the Developer Console and persisted across sessions, with per-key usage timestamps and request counts.
  - *Why*: Allows instant out-of-the-box testing from the UI and external terminals (`curl`) while supporting headless server deployments via `.env`.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   External Clients (cURL, Python, Node, MCP)               │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │ HTTPS + CORS
                                      │ Header: Authorization: Bearer okf_...
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                     Express Server Gateway (server.ts)                     │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │               Remote API v1 Router (/api/v1/*)                       │  │
│  │  • CORS Middleware (Origin: *, Headers: Authorization, X-API-Key)    │  │
│  │  • Strict Auth Middleware (Validates okf_live_* or REMOTE_API_KEY)   │  │
│  │  • Request Audit Logger (Tracks latency, status, endpoint usage)     │  │
│  └──────┬───────────────┬───────────────┬───────────────┬───────────────┘  │
│         │               │               │               │                  │
│         ▼               ▼               ▼               ▼                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │ Convert &  │  │ NLP & OKF  │  │   Skills   │  │ MetaAST &  │            │
│  │  Scraping  │  │  Analysis  │  │  & Logic   │  │  MCP RPC   │            │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘            │
└────────────────────────────────────────────────────────────────────────────┘
                                      ▲
                                      │ Key Management & Live Testing
┌─────────────────────────────────────┴──────────────────────────────────────┐
│               Frontend Developer Console (RemoteApiModal.tsx)              │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────┐  │
│  │ API Key Manager      │  │ Interactive Explorer │  │ OpenAPI 3.0 &    │  │
│  │ (Create/Revoke/Logs) │  │ (Try It Out + JSON)  │  │ SDK Code Gen     │  │
│  └──────────────────────┘  └──────────────────────┘  └──────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Remote API v1 Endpoint Catalog (`/api/v1/*`)**:
  - `GET /api/v1/openapi.json` — Returns the complete OpenAPI 3.0.3 specification dynamically bound to the server's public URL.
  - `GET /api/v1/status` — Authenticated health, pipeline readiness, and key verification endpoint.
  - **1. Convert & Web Extraction Pipeline**:
    - `POST /api/v1/convert/file` — Converts base64-encoded PDF, DOCX, XLSX, CSV, HTML, or Image into clean Markdown + spatial quality diagnostics.
    - `POST /api/v1/convert/url` — Fetches and converts any public URL or document link into clean Markdown with metadata.
    - `POST /api/v1/extract/json` — Extracts strict schema-validated JSON from raw content or a target URL.
    - `POST /api/v1/site/discover` — Inspects domain `robots.txt`, `llms.txt`, and sitemaps.
    - `POST /api/v1/site/map` — Maps domain URLs and hierarchy.
  - **2. NLP & OKF Intelligence Pipeline**:
    - `POST /api/v1/nlp/analyze` — Computes Flesch-Kincaid readability, SMOG index, sentiment, language detection, and keywords.
    - `POST /api/v1/okf/agent` — Runs OKF v1.0 synthesis, compliance auditing, or grounded Q&A.
  - **3. Agent Skills & Formal Logic Pipeline**:
    - `POST /api/v1/skills/synthesize` — Slices monolithic Markdown runbooks into progressive-disclosure Agent Skill packages (`SKILL.md`, `references/`, `scripts/`).
    - `POST /api/v1/skills/validate` — Runs 6-point preflight validation and best-practices auditing.
    - `POST /api/v1/skills/classify-logic` — Performs formal First-Order, Higher-Order, Modal, and Temporal logic classification.
  - **4. MetaAST & Vector DB Pipeline**:
    - `POST /api/v1/meta-ast/parse` — Parses Markdown into an enriched MetaAST block syntax tree.
    - `POST /api/v1/meta-ast/vector-chunks` — Chunks Markdown for vector databases (Pinecone, Qdrant, pgvector) preserving code and table atomicity.
  - **5. Model Context Protocol (MCP)**:
    - `GET /api/v1/mcp/manifest` — Lists registered MCP tools and OKF resources.
    - `POST /api/v1/mcp/rpc` — Executes JSON-RPC 2.0 methods (`initialize`, `tools/list`, `tools/call`, `resources/read`).
    - `POST /api/v1/mcp/query` — Executes graph-expanded concept queries against the active knowledge base.

- **Data Model & State**:
  - `ApiKeyRecord`: `{ id, name, keyPrefix, keyHash, createdAt, lastUsedAt, requestCount, status: 'active' | 'revoked' }`.
  - `ApiAuditLogEntry`: `{ id, timestamp, method, path, statusCode, durationMs, keyName }`.

- **Interactive Component & State Mapping**:
  - **Top Toolbar Trigger (`src/App.tsx`)**: Adds a **Remote API** button (`button#remote-api-open-btn`) in the top toolbar next to the Bring Your Own Key button to launch `RemoteApiModal`.
  - **Key Management (`RemoteApiModal.tsx`)**: Creating a key calls the key management endpoint, displays the generated `okf_live_...` secret once with a one-click copy button, and auto-populates the active key in the Interactive Explorer and SDK code generators.
  - **Live Request Tester**: Selecting an endpoint loads a realistic default JSON body; clicking **Send Request** executes a real `fetch` against `/api/v1/...` with the `Authorization: Bearer <key>` header, updating the response viewer and the live request audit log.
