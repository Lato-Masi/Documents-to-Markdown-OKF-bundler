# Graph-RAG Architecture & Knowledge Synthesis in OKF

## Executive Overview

The Open Knowledge Format (OKF) platform implements a **Hybrid Graph-Augmented Retrieval-Augmented Generation (Graph-RAG)** architecture. 

Unlike traditional (naive) RAG pipelines that partition documents into arbitrary token windows and perform flat vector search, OKF couples **semantic chunking**, **directed relationship graphs**, **$N$-hop neighborhood expansion**, and an **in-memory W3C SPARQL 1.1 triplestore** with **Trust Tier provenance tracking**.

---

## 1. Architectural Comparison: Naive RAG vs. OKF Graph-RAG

```
                               ┌─────────────────────────────────────────────────────────────┐
                               │                    Traditional Naive RAG                    │
                               │  [Document] ──> [512-Token Chunks] ──> [Vector Embedding]  │
                               │                                                │            │
                               │  Query ──> Top-K Vector Search ───────────────> LLM Context │
                               └─────────────────────────────────────────────────────────────┘
                                                              ▼
                               ┌─────────────────────────────────────────────────────────────┐
                               │                    OKF Graph-RAG System                     │
                               │                                                             │
                               │  [OKF Bundle]                                               │
                               │       │                                                     │
                               │       ├─► [Semantic Concept Nodes (Frontmatter + Markdown)] │
                               │       ├─► [Wikilinks & Markdown References [[...]]]        │
                               │       ├─► [NLP TF-IDF & Cosine Similarity Mesh]             │
                               │       └─► [RDF Triplestore (W3C SPARQL 1.1 Ontology)]       │
                               │                                                             │
                               │  Query ──► Hybrid Search (Lexical + Vector + SPARQL)        │
                               │                 │                                           │
                               │                 ▼                                           │
                               │           [Seed Nodes]                                      │
                               │                 │                                           │
                               │                 ▼                                           │
                               │      [N-Hop Graph Expansion]                                │
                               │  (Prerequisites, Dependents, Related)                       │
                               │                 │                                           │
                               │                 ▼                                           │
                               │    [Trust Tier Filter & Assembly]                           │
                               │  (human-reviewed vs. machine-confirmed)                     │
                               │                 │                                           │
                               │                 ▼                                           │
                               │      [Grounded LLM Generation]                              │
                               │     (with Traceable Citations)                              │
                               └─────────────────────────────────────────────────────────────┘
```

| Dimension | Standard Naive RAG | OKF Graph-RAG Architecture |
| :--- | :--- | :--- |
| **Partitioning Strategy** | Fixed-size character/token windows (e.g. 512 tokens with 50-token overlap). Cuts sentences and relational context mid-thought. | **Semantic Atomic Concepts**: Partitions documents by logical boundaries (`:::procedure`, `:::table`, `H2/H3` sections) preserving frontmatter metadata, trust tiers, and lifecycle states. |
| **Relational Topology** | Flat chunk list; zero awareness of upstream prerequisites or downstream dependents. | **Multi-Relational Knowledge Graph**: Models explicit `depends_on`, `prerequisite_of`, `references`, and implicit NLP semantic connections. |
| **Retrieval Strategy** | Pure vector distance (Cosine / Dot product). | **Hybrid Multi-Stage Retrieval**: Vector similarity + keyword frequency (TF-IDF) + deterministic SPARQL ontology pattern matching. |
| **Context Assembly** | Top-$K$ independent chunks concatenated into the prompt. | **$N$-Hop Sub-Graph Expansion**: Discovers seed nodes, then traverses outgoing and incoming edges to assemble a connected neighborhood subgraph. |
| **Verification & Trust** | All ingested text has equal authority. High risk of circular AI hallucinations. | **Two-Tier Trust Engine**: Distinguishes `[human-reviewed]` golden ground truth from `[machine-confirmed]` automated artifacts. |
| **Query Protocols** | Proprietary search endpoints. | **Universal Agent Protocols**: Model Context Protocol (MCP JSON-RPC), REST APIs, W3C SPARQL 1.1, System Skills, and CLI. |

---

## 2. Core Subsystems

### 2.1. Semantic Concept Chunking & Ingestion
- **File Ingestion**: Ingests compound Markdown bundles and parses YAML frontmatter.
- **Concept Categorization**: Classifies nodes into structured types:
  - `concept`: Declarative domain knowledge.
  - `procedure`: Step-by-step sequential workflows and execution checklists.
  - `table`: Structured tabular data, metrics, and schema definitions.
  - `architecture`: High-level system topologies and invariant boundaries.

### 2.2. Graph Construction & Link Extraction (`okfSemanticGraphEngine.ts`)
The graph engine automatically constructs directed edges ($E$) between concept nodes ($V$):
1. **Explicit Wikilinks**: Syntaxes such as `[[concept-id]]` and relative paths `[Label](../path/file.md)`.
2. **Structural Dependencies**: Explicit frontmatter metadata fields `depends_on: [auth-service, storage-engine]`.
3. **NLP Cosine Similarity Edges**: Analyzes term frequency across all nodes and creates semantic association edges when similarity exceeds the dynamic threshold ($\theta \ge 0.22$).

### 2.3. $N$-Hop Sub-Graph Neighborhood Expansion (`okfRagEngine.ts`)
When a query is received:
1. **Seed Discovery**: Locates the top-$M$ matching concept nodes using hybrid lexical and semantic similarity scoring.
2. **1-Hop & 2-Hop Traversal**:
   $$\text{SubGraph}(Q) = \text{SeedNodes} \cup \text{Prerequisites}(\text{SeedNodes}) \cup \text{Dependents}(\text{SeedNodes})$$
3. **Budget & Token Optimization**: Assigns token budgets dynamically to prevent prompt overflow while maximizing relational breadth.

### 2.4. W3C SPARQL 1.1 In-Memory Triplestore (`okfSparqlEngine.ts`)
Provides a deterministic RDF querying layer over the OKF knowledge base:
- **Ontology Namespaces**:
  - `okf: <urn:okf:ontology#>`
  - `concept: <urn:okf:concept:>`
  - `dc: <http://purl.org/dc/elements/1.1/>`
- **Supported Operations**:
  - `SELECT`: Tabular projection of matching concept properties, types, and dependencies.
  - `CONSTRUCT`: Generates an RDF Turtle subgraph of matching relationships.
  - `ASK`: Returns boolean verification of topological or invariant assertions.
  - `DESCRIBE`: Retrieves all connected RDF triples for an entity.

---

## 3. Trust-Aware Retrieval: Eliminating AI Hallucination Loops

A known failure mode of standard Graph-RAG is **hallucination amplification**, where an unverified AI-generated node is ingested into the graph and recursively cited as factual ground truth.

OKF solves this with explicit **Trust Tier Provenance**:
- **`[human-reviewed]` (Tier 1)**: Verified by human domain experts; receives maximum priority during context assembly and citation generation.
- **`[machine-confirmed]` (Tier 2)**: Generated by LLM pipelines or automated parsers; explicitly marked with confidence ratings and validation warnings.
- **Cycle & Disconnected Component Auditing**: Flags cyclic dependencies and orphaned nodes before retrieval synthesis.

---

## 4. Interfaces & Agent Access Points

The Graph-RAG engine exposes its capabilities across five user and agent interfaces:

1. **Human Natural Language Assistant (`OKFNaturalLanguageQuery.tsx`)**:
   - Interactive Q&A with 5 response modes (*Comprehensive, Step-by-Step, Prerequisites & Blockers, Data Models, Trust Audit*).
   - Traceable citation cards with direct node inspection and Markdown export.
2. **Graph-Augmented RAG Playground (`OKFRagPlayground.tsx`)**:
   - Visual inspection of retrieved sub-graphs, similarity scores, token allocations, and expansion depth controls.
3. **SPARQL Query Workbench (`OKFSparqlQueryWorkbench.tsx`)**:
   - Live query editor with tabular bindings, W3C SPARQL JSON output, and RDF triple explorer.
4. **Model Context Protocol (MCP) Server (`/api/mcp`)**:
   - JSON-RPC 2.0 interface exposing `mcp.ragQuery`, `mcp.expandGraph`, and `mcp.evaluateSparql` tools to AI agents (Claude Desktop, Cursor, Gemini CLI).
5. **Agent Skills & Multi-Format Exporter (`OKFMultiFormatExporterView.tsx`)**:
   - Instant conversion of the graph into JSON-LD, RDF Turtle, Obsidian Vault with Wikilinks, and System Skills.
