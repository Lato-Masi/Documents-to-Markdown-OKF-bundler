---
name: "okf-skill"
description: >
  Master skill for the Open Knowledge Format (OKF) specification and MetaAST vector engine.
  Guides agents on decomposing unstructured documentation into atomic OKF concepts,
  resolving topological dependency graphs, executing Graph-RAG retrieval, generating
  procedural SKILL.md packages, and chunking Markdown for Vector Databases.
---

# Open Knowledge Format (OKF) & MetaAST Skill (`okf-skill`)

This skill defines how agents process, validate, query, and transform knowledge using the Open Knowledge Format (OKF) and the MetaAST vector engine.

---

## 1. OKF Core Concepts & Directory Layout

An OKF repository partitions knowledge into atomic, single-topic concepts and procedural runbooks:

```
.okf/
├── okf.json                  # Root repository manifest & namespace definitions
├── concepts/                 # Declarative factual concepts (Atomic OKF markdown)
│   ├── consensus-raft.md
│   └── distributed-state.md
├── procedures/               # Procedural operational runbooks (or .skills/ packages)
│   └── deploy-sop.md
└── tables/                   # High-density structured datasets & schemas
    └── cluster-nodes.csv
```

### Concept File Schema (`concepts/*.md`)

Every OKF concept file MUST contain YAML frontmatter:

```yaml
---
id: concepts/consensus-raft.md
title: Raft Consensus Protocol
type: concept
trustTier: human-reviewed
prerequisites:
  - concepts/distributed-state.md
relatedConcepts:
  - concepts/paxos.md
tags:
  - consensus
  - distributed-systems
tokenEstimate: 420
---

# Raft Consensus Protocol

Raft is a consensus algorithm designed as an alternative to Paxos. It is meant to be more understandable...
```

---

## 2. MetaAST Vector Chunking & Ingestion

When indexing OKF concepts into Vector DBs (Pinecone, Qdrant, Milvus, ChromaDB, pgvector):
1. **Preserve Code & Math Atomicity**: Code fences (` ``` `) and LaTeX equations (`$$ ... $$`) must not be split across chunks.
2. **Replicate Table Headers**: When splitting large tables across chunks, the column headers must be injected at the top of each slice.
3. **Dual-Layer Payloads**:
   - `embeddingText`: Contains document hierarchy and breadcrumbs (`[Document Title > Section > Sub-section]`).
   - `markdownContent`: Clean, pristine Markdown returned to LLMs for generation.

---

## 3. Graph-RAG Retrieval Workflow

When answering user questions from an OKF knowledge base:
1. **Dense Vector Search**: Query vector database for top-$K$ semantically relevant chunks.
2. **Topological Neighborhood Expansion**:
   - Walk upstream `prerequisites` to retrieve foundational background concepts.
   - Walk downstream `implementers` to retrieve actionable procedures.
3. **Prompt Grounding**: Format retrieved nodes into the LLM system prompt with explicit source citations.
