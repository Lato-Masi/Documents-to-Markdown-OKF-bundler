# Technical Architecture & System Reference

> Comprehensive architectural, algorithmic, and feature documentation for the **Open Knowledge Format (OKF v0.2)** Conversion, Graph Analysis, Preflight Certification, and Graph RAG Intelligence Platform.

---

## 1. System Overview

### 1.1 What Is This Application?
The **OKF Knowledge Engineering & Graph RAG Studio** is a full-stack, enterprise-grade platform that converts unstructured, semi-structured, and monolithic Markdown documents into modular, verified, and interconnected **Open Knowledge Format (OKF v0.2)** knowledge bundles.

It provides a unified development environment for:
1. **Document Ingestion & AST Parsing**: Tokenizing and parsing Markdown documents into structured Abstract Syntax Trees.
2. **Concept Slicing & Partitioning**: Splitting linear content into self-contained, typed concept files with frontmatter headers.
3. **NLP Semantic Intelligence**: Extracting named entities, computing BM25/TF-IDF keyphrases, evaluating Flesch-Kincaid readability indices, and generating semantic descriptions.
4. **Graph Construction & Bidirectional Cross-Linking**: Building directed knowledge graphs, computing adjacency matrices, and inferring typed semantic edges (`depends_on`, `relates_to`, `implements`, `verifies`).
5. **OKF v0.2 5-Trust-Signal Management**: Full verification of Provenance, Trust Tiers, Freshness TTLs, Lifecycle States, and Attested Invariant Computations.
6. **Preflight Certification Engine**: Executing 6-stage compliance rules, generating cryptographic bundle digests (SHA-256), and producing verifiable JSON/PDF certificates.
7. **Graph-Augmented Retrieval (Graph RAG)**: Subgraph traversal, topological path retrieval, cosine-similarity embedding search, and prompt synthesis for LLMs.
8. **Multi-Format Export & MCP Server**: Serializing bundles to ZIP archives, JSON-LD, RDF Turtle, Neo4j Cypher scripts, W3C SPARQL triplestores, and Model Context Protocol (MCP) endpoints.
9. **MetaAST Lexer & Vector DB Ingestion**: Zero-dependency deterministic lexing, contextual AST enrichment, table slicing with header preservation, and dual-layer vector DB chunk payloads (`Pinecone`, `Qdrant`, `pgvector`, `ChromaDB`).
10. **Interactive AST & Chunk Explorers**: Visualizing node syntax trees, breadcrumb paths, and token distribution budgets.

---

## 2. Internal Architecture & Data Flow

The following diagram illustrates the internal processing pipeline from raw document ingestion to multi-modal query execution:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           1. INGESTION LAYER                                │
│   Raw Text / Markdown (.md) / Uploaded Files / Sample Datasets              │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       2. AST & SLICING ENGINE                               │
│   src/lib/okfMarkdownSlicer.ts & src/lib/okfCoreParser.ts                   │
│   - AST Tokenization & Heading Boundary Slicing (H1 / H2)                   │
│   - Frontmatter Extraction & Normalization                                  │
│   - Code Block Fencing Isolation                                            │
└──────────────────┬───────────────────────────────────────┬──────────────────┘
                   │                                       │
                   ▼                                       ▼
┌──────────────────────────────────────┐ ┌────────────────────────────────────┐
│      3. NLP SEMANTIC ENGINE          │ │    4. TRUST SIGNALS INJECTOR       │
│  src/lib/okfNlpEngine.ts             │ │  src/lib/okfKnowledgeEngine.ts     │
│  - Named Entity Recognition (NER)    │ │  - Provenance Sources Array        │
│  - TF-IDF Keyphrase Extraction       │ │  - Trust Tiers (deriveTrustTier)   │
│  - Flesch Reading Ease & Grade       │ │  - Stale After (TTL Freshness)     │
│  - Salient Description Synthesis     │ │  - Lifecycle (Draft/Stable/Deprec) │
│  - Jaccard & N-Gram Cosine Vectors   │ │  - Attested Computations & Runtime │
└──────────────────┬───────────────────┘ └─────────────────┬──────────────────┘
                   │                                       │
                   └───────────────────┬───────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                   5. DIRECTED KNOWLEDGE GRAPH ENGINE                        │
│   src/lib/okfSemanticGraphEngine.ts & okf-ts buildGraph                     │
│   - Explicit Dependency Parsing (depends_on, prerequisites)                 │
│   - Semantic Cross-Link Inference (TF-IDF Cosine Similarity Matrix)         │
│   - Cycle Detection & Topological Sort Analysis                             │
│   - Force-Directed 2D/3D Graph Physics Modeling                             │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                6. PREFLIGHT CERTIFICATION & VALIDATION                      │
│   src/lib/okfCertificationEngine.ts & src/lib/okfCoreValidator.ts           │
│   - Schema Invariant Verification (OKF-SPEC-001 through 006)                │
│   - Cryptographic SHA-256 Bundle Checksum & Signature Digest                │
│   - Issue Diagnostic & Automatic Quick-Fix Patching                         │
└──────────────────┬───────────────────────────────────────┬──────────────────┘
                   │                                       │
                   ▼                                       ▼
┌──────────────────────────────────────┐ ┌────────────────────────────────────┐
│      7. GRAPH RAG ENGINE             │ │   8. MULTI-FORMAT EXPORT & MCP     │
│  src/lib/okfCoreGraphRag.ts          │ │  src/lib/okfMultiFormatExporter.ts │
│  - Hybrid Vector + Graph Traversal   │ │  - OKF Compliant ZIP Bundles       │
│  - Subgraph Extraction (k-hops)      │ │  - JSON-LD & RDF Turtle Triples    │
│  - Topological Dependency Ordering   │ │  - Neo4j Cypher CREATE Ingestion   │
│  - LLM Grounding Context Synthesis   │ │  - Model Context Protocol (MCP)    │
└──────────────────────────────────────┘ └────────────────────────────────────┘
```

---

## 3. Core Engine Subsystems

### 3.1 OKF v0.2 Knowledge Engine (`src/lib/okfKnowledgeEngine.ts`)
The core orchestrator wraps the official `okf-ts` specification toolkit. It executes:
- **`partitionMarkdownToConcepts(markdown, options)`**:
  - Scans markdown text while ignoring headings inside fenced code blocks (` ``` `).
  - Determines concept boundaries via configurable delimiters (headings H1/H2, horizontal rules `---`, or custom annotations).
  - Automatically synthesizes YAML frontmatter matching the OKF v0.2 specification.
- **`buildCompleteOKFBundle(concepts, bundleRootName)`**:
  - Aggregates concepts into a verified `OkfBundle`.
  - Automatically generates the reserved `INDEX.md` manifest and `logs/CONVERSION.md` audit log.
  - Computes global bundle metrics: completeness index, readability ease, validation issues count, and trust distributions.

### 3.2 NLP Semantic Intelligence Engine (`src/lib/okfNlpEngine.ts`)
Implements client-side, zero-dependency natural language processing algorithms:
- **Named Entity Recognition (NER)**: Identifies 5 entity categories (`TECH`, `CONCEPT`, `METRIC`, `ORG`, `RULE`) via regex pattern matchers and contextual word embeddings.
- **Keyphrase Extraction**: Ranks phrases using combined Term Frequency (TF) and Inverse Document Frequency (IDF) heuristics with stopwords pruning.
- **Readability Analysis**:
  $$\text{Flesch Reading Ease} = 206.835 - 1.015 \left( \frac{\text{total words}}{\text{total sentences}} \right) - 84.6 \left( \frac{\text{total syllables}}{\text{total words}} \right)$$
  $$\text{Flesch-Kincaid Grade Level} = 0.39 \left( \frac{\text{total words}}{\text{total sentences}} \right) + 11.8 \left( \frac{\text{total syllables}}{\text{total words}} \right) - 15.59$$
- **Quality Scoring**: Evaluates structural completeness ($0-100$) based on header presence, word count density, source attribution, and tag diversity.

### 3.3 Semantic Knowledge Graph Engine (`src/lib/okfSemanticGraphEngine.ts`)
- **Adjacency Computation**: Translates explicit frontmatter arrays (`depends_on`, `prerequisites`, `related_to`) into directed edges.
- **Automated Semantic Cross-Linking**: Computes pairwise cosine similarity between keyphrase vectors of all concepts. If $\text{sim}(C_i, C_j) \ge \tau$ (where $\tau$ defaults to $0.45$), a dynamic `relates_to` edge is established.
- **Graph Metrics**:
  - **In-Degree / Out-Degree**: Identifies foundational hub concepts vs. leaf concepts.
  - **Graph Density**: $\frac{2 |E|}{|V|(|V|-1)}$ for undirected projections.
  - **Orphan Detection**: Flags isolated concepts with zero incoming/outgoing relationships.

### 3.4 Preflight Certification Engine (`src/lib/okfCertificationEngine.ts`)
Implements strict validation checks against OKF specifications:
1. **`OKF-SPEC-001: Schema & Mandatory Structure`**: Verifies `id`, `path`, `metadata.type`, `metadata.title`.
2. **`OKF-SPEC-002: Referential Integrity`**: Ensures every target in `depends_on` or wikilinks resolves to an existing concept in the bundle.
3. **`OKF-SPEC-003: Cyclic Dependency Detection`**: Implements Tarjan's strongly connected components algorithm to detect and flag circular reference chains.
4. **`OKF-SPEC-004: Content & Quality Baseline`**: Asserts concepts contain substantive markdown bodies and meet minimum completeness scores.
5. **`OKF-SPEC-005: Security & Secret Sanitization`**: Scans for leaked private keys, API tokens, passwords, and malicious script injections.
6. **`OKF-SPEC-006: OKF v0.2 Trust Signals Audit`**: Verifies full provenance sources array, valid lifecycle states (`draft`, `stable`, `deprecated`), and freshness TTL dates (`stale_after`).
7. **Cryptographic Checksumming**: Computes SHA-256 digest over normalized concept contents to produce immutable bundle verification seals.

### 3.5 Graph RAG Core Engine (`src/lib/okfCoreGraphRag.ts`)
Provides retrieval augmentation for Generative AI applications:
- **Hybrid Retrieval**: Combines semantic keyword matching with topological graph traversal.
- **$k$-Hop Neighborhood Expansion**: Expands retrieved seed concepts across directed edges up to $k$ hops (default $k=2$).
- **Topological Sorting of Context**: Orders retrieved concepts by dependency hierarchy so LLMs consume prerequisites before downstream concepts.
- **Context Synthesis**: Assembles structured prompt contexts including concept headers, trust tiers, freshness status, and dependency graphs.

---

## 4. OKF v0.2 Technical Specification Reference

### 4.1 Concept File Schema
Every concept is stored as a Markdown file with a strict YAML frontmatter block:

```yaml
---
# Mandatory Identifiers
type: "concept" | "policy" | "architecture" | "metric" | "procedure" | "reference"
title: "Concept Title"
tags: ["tag1", "tag2"]
description: "Salient one-sentence description"

# 1. Provenance (Auditable Sources)
sources:
  - resource: "https://docs.example.com/spec.pdf"
    id: "spec-doc-01"
    title: "System Specification Document"
    author: "Architecture Review Board"
    usage_count: 1
    last_modified: "2026-08-15"
    usage_window:
      from: "2026-08-15"
      to: "2027-08-15"

# 2. Trust Signals (Generated & Verified)
generated:
  by: "okf-nlp-agent"
  at: "2026-08-15T06:00:00.000Z"
verified:
  by: "lead-architect@example.com"
  at: "2026-08-15T06:10:00.000Z"

# 3. Freshness Policy
stale_after: "2027-08-15"

# 4. Lifecycle State
status: "stable" # "draft" | "stable" | "deprecated"

# 5. Attested Invariant Computation (Optional, for metrics/formulas)
runtime: "mathjs/12.4"
parameters:
  - name: "throughput"
    type: "number"
    required: true
  - name: "latencyMs"
    type: "number"
    required: true
computation: "throughput / (latencyMs / 1000)"
attester:
  resource: "urn:okf:attester:standard-v0.2"

# Graph Dependencies
depends_on:
  - "concepts/prerequisite-system.md"
---

# Concept Title

Markdown content with structural headings, lists, tables, and optional [[wikilinks]].
```

### 4.2 Standard Bundle Directory Hierarchy
An exported OKF bundle conforms to the following directory layout:

```
my-bundle/
├── INDEX.md              # Global manifest, trust breakdown & directory table
├── logs/
│   └── CONVERSION.md     # Audit log, timestamps, and validation metrics
├── concepts/             # Core concept definitions
│   ├── architecture/
│   │   ├── storage-engine.md
│   │   └── query-planner.md
│   ├── policies/
│   │   └── data-retention.md
│   └── metrics/
│       └── p99-latency.md
└── assets/               # Referenced diagrams, schemas, and media
```

---

## 5. Technical Feature Guide for Developers & Architects

### 5.1 Interactive Graph Visualizer
- **Physics-Based Force Simulation**: Renders concepts as nodes and dependencies as directional vectors with real-time repulsive charge and link springs.
- **Visual Filters**:
  - Filter by **Concept Type** (`concept`, `policy`, `metric`, `procedure`, `architecture`).
  - Filter by **Trust Tier** (`human-reviewed`, `machine-confirmed`, `unverified`).
  - Filter by **Lifecycle Status** (`stable`, `draft`, `deprecated`).
  - Filter by **Freshness** (Active Fresh vs. Expired Stale).
- **Interactive Node Inspection**: Click any node to view isolated subgraphs, in-degree/out-degree counts, source attribution, and full Markdown AST preview.

### 5.2 Preflight Certification & Audit Seals
- **Real-Time Linting**: Runs 6 verification passes simultaneously, highlighting exact line numbers and providing 1-click automatic fixes.
- **Cryptographic Fingerprint**: Generates a tamper-evident SHA-256 bundle hash for compliance verification.
- **Exportable Certification Seals**: Download official JSON verification artifacts or print formatted compliance reports.

### 5.3 Graph RAG Playground
- **Vector + Graph Semantic Search**: Test prompt queries against the knowledge base in real time.
- **Hop Radius Configuration**: Tune $k$-hop traversal depth ($1-4$ hops) and similarity thresholds ($0.0-1.0$).
- **Context Grounding Output**: Inspect the exact synthesized context window payload ready to be injected into Gemini, Claude, or GPT models.

### 5.4 Multi-Format Ecosystem Exporter
- **ZIP Bundle**: Native OKF v0.2 directory structure with sanitized file paths.
- **JSON-LD**: W3C-compliant Linked Data schema (`@context: "https://schema.org"`).
- **RDF Turtle (`.ttl`)**: Semantic Web triples for triplestores (Apache Jena, Blazegraph).
- **Neo4j Cypher**: Parameterized `CREATE` query script for direct ingestion into Neo4j graph databases.
- **Model Context Protocol (MCP)**: JSON schema descriptors for Anthropic Claude Desktop and MCP agent tool integrations.
- **SPARQL Endpoint**: Built-in client-side SPARQL engine for running direct graph queries (`SELECT ?concept ?type WHERE { ... }`).

---

## 6. How to Best Use This Application

### Step 1: Ingestion & Slicing
1. Paste your raw Markdown document or load one of the built-in enterprise blueprints (e.g., *Microservices Architecture*, *HIPAA Compliance*, *Graph Database Spec*).
2. Configure **Slicing Granularity** (Auto-detect, H1/H2 Headings, or custom delimiters).
3. Set default metadata options: Author name, Source URL, Actor ID, and Freshness TTL days.
4. Click **Convert to OKF Bundle**.

### Step 2: Inspection & Verification
1. Open the **OKF Bundle Explorer** tab.
2. Review the **5 Trust Signals Matrix** to verify Provenance, Freshness, and Trust Tiers.
3. Switch to the **Knowledge Graph** sub-tab to inspect connectivity, identify orphan nodes, and verify prerequisite chains.
4. Check the **NLP Semantic Intelligence** tab to review entity distributions and readability grade levels.

### Step 3: Preflight Validation & Patching
1. Open the **Preflight & Certification** tab.
2. Review any triggered warnings or errors (e.g., missing prerequisite links, broken source references).
3. Click **Apply Automated Quick-Fix** to resolve schema non-conformances automatically.
4. Verify that the bundle achieves **Certified Gold / Platinum** status.

### Step 4: Retrieval & Export
1. Use the **Graph RAG Simulator** to run sample queries and verify that context retrieval captures necessary dependency chains.
2. Go to the **Export & Connectors** tab to download the verified `.zip` bundle, copy the Neo4j Cypher script, or configure MCP endpoints.

---

## 7. Performance & Security Considerations

- **Client-Side Execution**: All AST parsing, NLP extraction, graph construction, and cryptographic hashing execute entirely within the local browser runtime using Web Workers and optimized typed arrays.
- **Deterministic Hashing**: Bundle digests use normalized line endings (`\n`) and sorted key hierarchies to ensure identical SHA-256 fingerprints across operating systems.
- **Zero Hallucination Grounding**: By enforcing strict source provenance and attested computation runtimes, downstream LLMs are provided with deterministic factual anchors.
