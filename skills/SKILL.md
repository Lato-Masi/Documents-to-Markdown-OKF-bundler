---
name: "skills-master-catalog"
description: >
  Master Catalog and Routing Directory for all agent skills in the workspace.
  Consult this root manifest to determine which specialized skill subdirectory to read
  based on user intent (OKF concepts, Vector DB chunking, Graph-RAG, Firebase, Gemini API, etc.).
---

# Skills Master Catalog & Routing Directory

This document serves as the root discovery and routing index for all specialized skills available to agents in this environment.

---

## 1. Top-Level Skills Architecture

Skills are organized into two primary root domains under `/skills/`:

```
/skills/
├── SKILL.md                          # Master Catalog & Routing Index (This File)
├── okf-skill/                        # Open Knowledge Format (OKF) & MetaAST Master Skill
│   └── SKILL.md
└── system_skills/                    # Core Subsystem & Runtime Capabilities
    ├── vector-db-ingestion/          # Vector DB Formatting & Upserts (Pinecone, Qdrant, pgvector)
    │   └── SKILL.md
    ├── rag-chunking-heuristics/      # Syntax-Aware Markdown Splitter & Atomicity Rules
    │   └── SKILL.md
    ├── graph-rag-hybrid-search/      # Multi-hop Graph Traversal & Reciprocal Rank Fusion (RRF)
    │   └── SKILL.md
    ├── semantic-ontology-export/     # RDF Turtle, JSON-LD & Neo4j Cypher Serialization
    │   └── SKILL.md
    ├── firebase-skill/               # Persistent Firestore Database & Auth Integration
    │   └── SKILL.md
    ├── gemini_api/                   # @google/genai Model Patterns & Multimodal Workflows
    │   └── SKILL.md
    ├── gemini_interactions_api/      # Real-time Interactions & Autonomous Agents
    │   └── SKILL.md
    ├── cloudsql-setup/               # Relational PostgreSQL & Cloud SQL Setup
    │   └── SKILL.md
    ├── cloudsql-execute-sql/         # SQL DQL/DML Query Execution
    │   └── SKILL.md
    ├── cloudsql-update-schema/       # Drizzle Schema Synchronization
    │   └── SKILL.md
    ├── oauth/                        # Third-Party OAuth & Google Workspace Auth
    │   └── SKILL.md
    ├── workspace_integration/        # Google Docs, Sheets, Drive, Gmail Integration
    │   └── SKILL.md
    ├── google_maps_platform/         # Maps, Places, Routes & Geocoding
    │   └── SKILL.md
    ├── image_generation/             # Gemini Image Generation & Editing
    │   └── SKILL.md
    ├── focus_mode/                   # UI Element Selection & Focus Workflows
    │   └── SKILL.md
    └── realtime_guidelines/          # WebSockets & Collaborative Canvases
        └── SKILL.md
```

---

## 2. Dynamic Agent Routing Matrix

Consult this routing table to locate the specific `SKILL.md` needed for your task:

| Task Domain & User Intent | Target Skill Location | Key Responsibilities |
| :--- | :--- | :--- |
| **Open Knowledge Format (OKF)** | `/skills/okf-skill/SKILL.md` | Monolith decomposition into atomic concepts, YAML schemas, DAG validation |
| **Vector DB Payloads & Indexing** | `/skills/system_skills/vector-db-ingestion/SKILL.md` | Pinecone, Qdrant, pgvector schemas; `embeddingText` vs `markdownContent` |
| **Markdown Chunking & Boundary Rules** | `/skills/system_skills/rag-chunking-heuristics/SKILL.md` | Code block / Math / Table atomicity; token budgeting; breadcrumb injection |
| **Graph-RAG & Hybrid Search** | `/skills/system_skills/graph-rag-hybrid-search/SKILL.md` | Reciprocal Rank Fusion (RRF); $k$-hop topological expansion; citation grounding |
| **Linked Data & Graph DB Export** | `/skills/system_skills/semantic-ontology-export/SKILL.md` | W3C Turtle RDF (`.ttl`), JSON-LD Schema.org, Neo4j Cypher, MCP resource sync |
| **Firebase Firestore & Auth** | `/skills/system_skills/firebase-skill/SKILL.md` | Cloud Firestore database provisioning, security rules, RBAC, user auth |
| **Gemini AI & Multimodal SDK** | `/skills/system_skills/gemini_api/SKILL.md` | `@google/genai` TypeScript SDK, model selection, streaming, structured outputs |
| **Relational SQL Database** | `/skills/system_skills/cloudsql-setup/SKILL.md` | PostgreSQL database provisioning, Drizzle ORM, connection strings |

---

## 3. Agent Execution Protocol

1. **Step 1: Intent Identification**: Match the user's request against the keywords and tasks in the Routing Matrix.
2. **Step 2: Read `SKILL.md`**: Before implementing changes, call `view_file` on the respective skill's `SKILL.md`.
3. **Step 3: Execute Compliant Architecture**: Follow the architectural guidelines, schemas, and error-handling strategies defined within that skill.
