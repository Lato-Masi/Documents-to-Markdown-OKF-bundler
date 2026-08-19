# Agent Skills & Knowledge Engine Skills Catalog

This catalog documents the specialized system skills designed for autonomous agents, pipelines, and developer workflows across the Open Knowledge Format (OKF), MetaAST Vector Processing, and Graph-RAG architectures.

---

## Skills Index & Routing Table

| Skill Identifier | Location | Primary Focus | Triggers & Use Cases |
| :--- | :--- | :--- | :--- |
| **`vector-db-ingestion`** | `/skills/system_skills/vector-db-ingestion/SKILL.md` | Vector DB formatting & upserting | Ingesting into Pinecone, Qdrant, Milvus, ChromaDB, pgvector; dual-layer chunk formatting |
| **`rag-chunking-heuristics`** | `/skills/system_skills/rag-chunking-heuristics/SKILL.md` | Syntax boundary rules & atomicity | Code/Math preservation, table header replication, token budgeting, heading flushing |
| **`graph-rag-hybrid-search`** | `/skills/system_skills/graph-rag-hybrid-search/SKILL.md` | Multi-hop Graph-RAG & hybrid ranking | Fusing vector similarity with OKF graph topology, Reciprocal Rank Fusion (RRF) |
| **`semantic-ontology-export`** | `/skills/system_skills/semantic-ontology-export/SKILL.md` | Semantic web & graph database export | RDF/Turtle (`.ttl`), JSON-LD, SPARQL, Neo4j Cypher, and MCP resource streaming |
| **`firebase-skill`** | `/skills/system_skills/firebase-skill/SKILL.md` | Firestore & Auth integration | Persistent database setup, rules security, user authentication |
| **`gemini-api`** | `/skills/system_skills/gemini_api/SKILL.md` | Google GenAI SDK patterns | Multimodal OCR, spatial analysis, structured output, function calling |

---

## Detailed Skill Profiles

### 1. `vector-db-ingestion`
* **Purpose:** Standardizes vector payloads, dual-layer separation (`embeddingText` with breadcrumbs vs. `markdownContent` for LLM contexts), and provider-specific client SDK code (Pinecone, Qdrant, pgvector).
* **When to Route:** When an agent needs to index documents, format vector records, or write vector database ingestion scripts.

### 2. `rag-chunking-heuristics`
* **Purpose:** Governs syntax-aware chunk boundaries, strict atomicity for code fences (` ``` `) and math blocks (`$$`), and row-by-row table slicing with repeated headers.
* **When to Route:** When splitting Markdown files, setting chunk token limits, or diagnosing chunk boundary corruption.

### 3. `graph-rag-hybrid-search`
* **Purpose:** Outlines the mathematical fusion (RRF) between dense vector hits, sparse BM25 keyword matching, and $k$-hop topological graph traversal over OKF prerequisite and implementer edges.
* **When to Route:** When executing complex multi-hop question answering or building grounded RAG retrieval pipelines.

### 4. `semantic-ontology-export`
* **Purpose:** Defines conversion patterns from markdown ASTs into W3C Linked Open Data (RDF Turtle, JSON-LD) and Property Graphs (Neo4j Cypher).
* **When to Route:** When exporting knowledge bundles to enterprise graph databases or triplestores.
