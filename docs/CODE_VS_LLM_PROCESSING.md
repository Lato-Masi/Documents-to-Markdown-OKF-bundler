# Code vs. LLM Processing Architecture

> An architectural analysis of deterministic algorithmic code execution versus Large Language Model (LLM) utilization across the Open Knowledge Format (OKF) platform.

---

## 📊 Processing Distribution Overview

The architecture of this application is **predominantly deterministic code (approx. 90–95%)**, with LLM capabilities acting as an **optional enhancement layer (approx. 5–10%)**.

The entire core knowledge pipeline—from document slicing and entity extraction to graph generation, preflight certification, and graph search—runs **100% locally in code without requiring an LLM or API key**.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CORE PIPELINE (~90-95% CODE)                    │
│  ✔ Markdown AST Parsing & Heading Slicing                              │
│  ✔ NLP Tokenization, TF-IDF Keyphrase Extraction & NER Engine          │
│  ✔ Flesch-Kincaid Readability & Quality Scoring Equations              │
│  ✔ OKF v0.2 Frontmatter Synthesis & Trust Signals Injection            │
│  ✔ Directed Graph Adjacency Matrix & Cosine Similarity Linking         │
│  ✔ Tarjan's Cycle Detection & Topological Sorting                      │
│  ✔ Preflight 6-Stage Linter & SHA-256 Checksum Engine                  │
│  ✔ Multi-Format Serialization (ZIP, JSON-LD, RDF Turtle, Neo4j Cypher) │
│  ✔ SPARQL Graph Query Engine & k-Hop Traversal                         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼ (Optional Enrichment)
┌────────────────────────────────────────────────────────────────────────┐
│                     OPTIONAL LLM ENRICHMENT (~5-10%)                   │
│  ✦ Multimodal Vision OCR (extracting text from raw scanned images/PDF) │
│  ✦ Generative Assistant Synthesis in Graph RAG Simulator (optional)    │
│  ✦ AI-assisted Concept Expansion / Paraphrasing (optional)             │
└────────────────────────────────────────────────────────────────────────┘
```

---

## ⚙️ 1. Deterministic Code Subsystems (100% Non-LLM)

The following core subsystems run entirely via standard TypeScript algorithms, data structures, and mathematical formulas:

| Subsystem | What the Code Does | Algorithms / Engineering Principles Used |
| :--- | :--- | :--- |
| **Document Slicing & Partitioning** | Scans markdown text, protects code blocks (` ``` `), identifies boundary headings (H1/H2) or delimiters, and isolates modular concept files. | Custom Regex AST tokenizers, `js-yaml` (`src/lib/okfMarkdownSlicer.ts`) |
| **NLP & Entity Extraction (NER)** | Extracts technical terms, metrics, organizations, policies, and concepts without calling external NLP services. | Heuristic dictionary matchers, regex pattern grammars (`src/lib/okfNlpEngine.ts`) |
| **Keyphrase Extraction & Tagging** | Determines salient terms and domain tags for each concept. | Term Frequency-Inverse Document Frequency (TF-IDF) & BM25 weighting heuristics |
| **Readability Indices & Scoring** | Computes reading ease, school grade levels, and completeness scores ($0-100$). | Exact mathematical formulas (Flesch Reading Ease & Flesch-Kincaid Grade Level) |
| **Graph Construction & Similarity** | Computes cross-concept links and builds graph topology. | High-dimensional Vector Space Model, Cosine Similarity ($N$-gram vectors) (`src/lib/okfSemanticGraphEngine.ts`) |
| **Cycle & Dependency Checks** | Verifies acyclic dependency chains and computes topological order. | Tarjan’s strongly connected components algorithm, DFS traversal |
| **Preflight Certification (Rules 001–006)** | Validates schema conformance, referential integrity, and secret sanitization. | Deterministic schema validators, regex security pattern matchers (`src/lib/okfCertificationEngine.ts`) |
| **Cryptographic Hashing & Verification** | Creates verifiable, tamper-evident bundle fingerprints. | Deterministic SHA-256 cryptographic hashing |
| **Graph RAG Traversal** | Performs $k$-hop neighborhood expansion and path retrieval. | Breadth-First Search (BFS) graph traversal & adjacency lists (`src/lib/okfCoreGraphRag.ts`) |
| **Multi-Format Serialization** | Generates ZIP archives, JSON-LD, RDF Turtle triples, Neo4j Cypher scripts, and MCP schemas. | Native W3C serializers and `jszip` (`src/lib/okfMultiFormatExporter.ts`) |

---

## 🤖 2. Where an LLM Is Used (Optional Layer)

The platform is designed to be fully functional without any external LLM connection. LLMs are invoked only for optional, user-initiated tasks:

1. **Multimodal Document OCR (Ingestion Layer)**:
   - When a user uploads a raw scanned image or visual PDF instead of text, an LLM Vision model (e.g., Gemini Vision) can be invoked to transcribe the visual document into Markdown text before passing it to the local slicing engine.
2. **Generative Query Answering (Graph RAG Simulator)**:
   - Once the local graph engine retrieves and organizes the topological subgraph context, an LLM can be used to synthesize a natural language response grounded strictly in the retrieved concepts.
3. **AI Concept Enrichment & Paraphrasing**:
   - When requested by the user, an LLM can assist in drafting new concepts, expanding brief notes, or rewriting technical descriptions.

---

## 💎 Architectural Benefits of a Code-First Foundation

- ⚡ **Zero Inference Latency**: Slicing a large document, building a 50-node graph, and validating compliance takes **under 150 milliseconds** in client-side TypeScript.
- 💰 **Zero Token Costs**: The entire transformation from document to verified OKF bundle runs locally without consuming API quotas or incurring cloud compute expenses.
- 🔒 **Offline & Air-Gapped Readiness**: The core application can run in secure, air-gapped environments or local Docker containers without outbound internet connectivity.
- 🛡️ **Deterministic & Reproducible**: Graph connections, dependency hierarchies, and SHA-256 hashes are mathematically reproducible and completely immune to generative hallucinations.
- 🎯 **Grounded AI Downstream**: When downstream LLMs *are* connected, they receive structured, topologically sorted context produced by the deterministic code layer, maximizing accuracy and factual consistency.
