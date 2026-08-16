---
name: okf-skill
description: Comprehensive, unified skill for AI Agents to parse, query, validate, traverse, synthesize, and export Open Knowledge Format (OKF v0.2 / v1.0) bundles. Equips agents with knowledge graph reasoning, YAML frontmatter parsing, the 5 Trust Signals, Preflight certification, Graph-RAG neighborhood retrieval, and MCP protocol tool execution.
---

# Open Knowledge Format (OKF) Agent & Developer Skill

You are an expert AI Agent and system developer equipped with specialized capabilities to read, query, traverse, validate, and construct **Open Knowledge Format (OKF)** bundles.

Specification reference: `https://okf.md/spec/`

---

## 1. OKF v0.2 Concept Schema Specification

Every OKF concept is an individual `.md` file containing a strict YAML frontmatter header followed by standard Markdown content.

```yaml
---
# ==============================================================================
# Mandatory Identifiers & Categorization
# ==============================================================================
type: "concept" # Options: "concept" | "policy" | "architecture" | "metric" | "procedure" | "reference" | "table" | "guideline"
title: "Deterministic Graph Construction Engine"
tags: ["graph", "algorithms", "topology", "okf"]
description: "Sparsely linked directed adjacency graph builder with cosine similarity inference."

# ==============================================================================
# 1. Provenance (Auditable Sources & Attribution)
# ==============================================================================
sources:
  - resource: "https://spec.okf.io/v0.2/graph-engine.pdf"
    id: "okf-spec-graph-01"
    title: "OKF Graph Traversal Specification"
    author: "Architecture Review Board"
    usage_count: 1
    last_modified: "2026-08-15"
    usage_window:
      from: "2026-08-15"
      to: "2027-08-15"

# ==============================================================================
# 2. Trust Tier & Verification
# ==============================================================================
generated:
  by: "okf-nlp-slicer"
  at: "2026-08-15T06:00:00.000Z"
verified:
  by: "lead-architect@example.com"
  at: "2026-08-15T06:30:00.000Z"

# ==============================================================================
# 3. Freshness Policy (TTL Expiration)
# ==============================================================================
stale_after: "2027-08-15"

# ==============================================================================
# 4. Lifecycle State
# ==============================================================================
status: "stable" # Options: "draft" | "review" | "stable" | "deprecated"

# ==============================================================================
# 5. Attested Invariant Computations (Optional: for metrics & formulas)
# ==============================================================================
runtime: "mathjs/12.4"
parameters:
  - name: "nodeCount"
    type: "number"
    required: true
  - name: "edgeCount"
    type: "number"
    required: true
computation: "2 * edgeCount / (nodeCount * (nodeCount - 1))"
attester:
  resource: "urn:okf:attester:standard-v0.2"

# ==============================================================================
# Semantic Relationships & Dependencies
# ==============================================================================
depends_on:
  - "concepts/architecture/ast-parser.md"
prerequisites:
  - "concepts/prerequisites/vector-math.md"
related_to:
  - "concepts/retrieval/graph-rag.md"
---

# Concept Title

Markdown body containing explanations, code blocks, tables, and optional [[wikilinks]].
```

---

## 2. Directory Layout Standard

```
my-okf-knowledge-base/
├── INDEX.md                  # Root manifest, category tree & global metrics
├── logs/
│   └── CONVERSION.md         # Audit log, validation history, and SHA-256 signatures
├── concepts/                 # Domain concept files (.md)
│   ├── architecture/
│   │   ├── ast-parser.md
│   │   └── graph-engine.md
│   ├── policies/
│   │   └── data-governance.md
│   ├── metrics/
│   │   └── graph-density.md
│   └── procedures/
│       └── deployment-checklist.md
└── assets/                   # Referenced images, diagrams, schemas (.svg, .png)
```

---

## 3. The 5 Trust Signals Matrix

| Trust Signal | Field Location | Allowed Values / Format | Purpose |
| :--- | :--- | :--- | :--- |
| **1. Provenance** | `sources: [{...}]` | Array of source objects (`resource`, `title`, `author`, `last_modified`, `usage_window`) | Complete audit trail tracing back to original source material. |
| **2. Trust Tier** | `verified.by` & `generated.by` | `human-reviewed` (has `verified.by`), `machine-confirmed` (has `generated.by`), `unverified` | Quantifies confidence and review rigor. |
| **3. Freshness** | `stale_after` | ISO 8601 Date (`YYYY-MM-DD`) | Time-to-Live freshness preventing outdated knowledge from serving queries. |
| **4. Lifecycle** | `status` | `"draft"` \| `"review"` \| `"stable"` \| `"deprecated"` | Distinguishes current production standards from legacy or WIP guidelines. |
| **5. Attested Calculation** | `computation`, `runtime`, `parameters` | Expression string, runtime engine, parameter typed declarations | Enforces deterministic formula evaluation without LLM hallucination. |

---

## 4. Agent Query Execution Modes

### Mode A: Graph-Augmented RAG (2-Hop Sub-Graph Traversal)
When querying an OKF knowledge base:
1. **Vector / Keyword Seed**: Locate matching concept nodes via TF-IDF cosine similarity or tag filters.
2. **Neighborhood Expansion**: Traverse `prerequisites`, `depends_on`, and outbound wikilinks up to 2 hops.
3. **Sub-Graph Context Assembly**: Inject only the traversed sub-graph into prompt context, ordering prerequisites before dependent concepts.

### Mode B: Model Context Protocol (MCP Tools)
- `search_okf_concepts(query, trustTier, limit)`: Full-text and tag search.
- `get_okf_concept(conceptId)`: Fetch raw frontmatter schema and body text.
- `traverse_okf_graph(conceptId, direction, maxHops)`: Extract dependency paths.
- `validate_okf_syntax(markdown)`: Audit adherence to the OKF specification.

### Mode C: Direct HTTP API Query
- `POST /api/mcp/query`: Lightweight single-shot agent endpoint returning grounded context with 1-hop graph expansion.
- `POST /api/mcp/rpc`: JSON-RPC 2.0 endpoint for MCP standard clients.
- `POST /api/agent/okf`: Streaming Gemini inference agent with task modes `qa`, `audit`, and `synthesize`.

---

## 5. Core TypeScript API Usage

### 5.1 Slicing & Parsing Monolithic Markdown
```typescript
import { partitionMarkdownToConcepts } from '@/lib/okfKnowledgeEngine';

const sliceResult = partitionMarkdownToConcepts(markdownText, {
  slicingStrategy: 'h2_boundary',
  authorName: 'Domain Expert',
  sourceUrl: 'https://docs.example.com/spec.md',
  actorId: 'auto-slicer-agent',
  freshnessDays: 365,
  defaultStatus: 'stable'
});
```

### 5.2 Preflight Certification & Validation
```typescript
import { runPreflightSuite } from '@/lib/okfCertificationEngine';

const preflightReport = runPreflightSuite(concepts, {
  strictMode: true,
  checkCycles: true,
  checkSecrets: true,
  verifyProvenance: true
});
```

### 5.3 Semantic Graph Construction & Cross-Linking
```typescript
import { buildSemanticKnowledgeGraph } from '@/lib/okfSemanticGraphEngine';

const graph = buildSemanticKnowledgeGraph(concepts, {
  similarityThreshold: 0.45,
  inferCrossLinks: true
});
```

### 5.4 Graph RAG Context Retrieval
```typescript
import { executeGraphRagQuery } from '@/lib/okfCoreGraphRag';

const retrievalResult = executeGraphRagQuery(prompt, graph, concepts, {
  maxHops: 2,
  minSimilarity: 0.35,
  topK: 5,
  includePrerequisites: true
});
```

### 5.5 Multi-Format Export
```typescript
import { exportMultiFormat } from '@/lib/okfMultiFormatExporter';

const zipBlob = await exportMultiFormat.toZip(bundle);
const jsonLd = exportMultiFormat.toJsonLd(bundle);
const turtleRdf = exportMultiFormat.toTurtle(bundle);
const cypherScript = exportMultiFormat.toCypher(bundle);
const mcpSchema = exportMultiFormat.toMcpSchema(bundle);
```

---

## 6. Command Line Interface (@okf/cli)

```bash
# Initialize a new OKF repository structure
npx okf init my-knowledge-base

# Lint and certify knowledge bundle (detect broken links, cycles, and missing trust signals)
npx okf check --strict

# Split monolithic markdown file into atomic concepts
npx okf split large-document.md --out-dir=./concepts

# Export to Obsidian, Turtle (RDF), JSON-LD, or CSV
npx okf export --format=turtle

# Query Graph-RAG neighborhood context
npx okf query "How does the cache invalidation procedure work?" --hops=2

# Generate automated GitHub Actions workflow for PR checks
npx okf ci-setup
```

---

## 7. Preflight Compliance Invariants (OKF-SPEC-001 through 006)

1. **OKF-SPEC-001 (Schema Completeness)**: `type`, `title`, and `description` must exist and be non-empty strings.
2. **OKF-SPEC-002 (Referential Integrity)**: All target paths in `depends_on`, `prerequisites`, and `related_to` must resolve to valid concept files in the bundle.
3. **OKF-SPEC-003 (Acyclic Dependencies)**: Explicit dependency chains (`depends_on`) must not form closed cycles ($A \rightarrow B \rightarrow A$).
4. **OKF-SPEC-004 (Content Density)**: Markdown body must contain substantive text (minimum 20 words) with proper heading hierarchy.
5. **OKF-SPEC-005 (Secret Sanitization)**: Markdown content and frontmatter must never contain raw API keys, private tokens, passwords, or malicious scripts.
6. **OKF-SPEC-006 (Trust Signal Rigor)**: `sources` must contain at least 1 valid source entry with an active `usage_window`, `status` must be one of `draft|review|stable|deprecated`, and `stale_after` must be a valid future ISO date.

---

## 8. Agent Response Best Practices
- Always ground answers in cited OKF documents with their trust tier (`[human-reviewed]` vs `[machine-confirmed]`).
- State explicitly if prerequisites are required before executing a procedure.
- If synthesizing new OKF files, output valid YAML frontmatter and maintain bidirectional links.
