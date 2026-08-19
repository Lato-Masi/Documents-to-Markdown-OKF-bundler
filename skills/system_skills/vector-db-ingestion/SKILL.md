---
name: "vector-db-ingestion"
description: >
  Standardizes how agents format, partition, embed, and upsert contextual chunks into
  Vector Databases (Pinecone, Qdrant, Milvus, ChromaDB, pgvector, Weaviate). Use when the application
  requires vector embeddings, semantic retrieval, RAG storage, or Vector DB payload generation
  using the dual-layer MetaAST architecture.
---

# Vector Database Ingestion Skill (`vector-db-ingestion`)

This skill provides architectural patterns, schema definitions, and client SDK integration recipes for ingesting structured Markdown chunks into production Vector Databases.

---

## 1. Core Principles: Dual-Layer Ingestion Architecture

Every chunk ingested into a Vector DB must adhere to the **Dual-Layer MetaAST standard**:

```
                              ┌───────────────────────────────┐
                              │  MetaAST Vector Chunk Payload │
                              └───────────────┬───────────────┘
                                              │
                    ┌─────────────────────────┴─────────────────────────┐
                    ▼                                                   ▼
       ┌─────────────────────────┐                         ┌─────────────────────────┐
       │     embeddingText       │                         │     markdownContent     │
       ├─────────────────────────┤                         ├─────────────────────────┤
       │ • Context breadcrumbs   │                         │ • Clean original syntax │
       │ • Structural preamble   │                         │ • Atomic code blocks    │
       │ • Entity summary        │                         │ • Replicated table hdrs │
       │ ➔ FED TO EMBEDDING MODEL│                         │ ➔ RETURNED TO LLM PROMPT│
       └─────────────────────────┘                         └─────────────────────────┘
```

1. **`embeddingText` (Dense Representation Layer)**:
   - Injected with document title, breadcrumb ancestry (`H1 > H2 > H3`), and chunk category prefix.
   - Purpose: Optimizes cosine similarity and dense retrieval accuracy by ensuring search queries match isolated paragraphs without losing their parent context.

2. **`markdownContent` (Generative Context Layer)**:
   - Contains clean, unaltered Markdown with preserved code blocks, mathematical equations (`$$`), and Markdown tables.
   - Purpose: Direct injection into the LLM system prompt for grounded, hallucination-free reasoning.

---

## 2. Standardized Vector Metadata Schema

All vector upserts MUST include this structured metadata payload for hybrid search and faceted filtering:

```typescript
export interface VectorMetadataPayload {
  documentTitle: string;        // e.g., "Raft Consensus Protocol"
  breadcrumb: string;           // e.g., "Architecture > Consensus > Leader Election"
  breadcrumbList: string[];     // ["Architecture", "Consensus", "Leader Election"]
  sectionHeading: string;       // "Leader Election"
  sectionHeadingLevel: number;  // 3
  chunkType: "composite" | "code" | "table" | "math" | "mermaid" | "frontmatter";
  hasCodeBlock: boolean;
  codeLanguages: string[];      // ["typescript", "go"]
  hasTable: boolean;
  hasMath: boolean;
  hasMermaid: boolean;
  charCount: number;
  estimatedTokens: number;
  chunkIndex: number;
  totalChunks: number;
}
```

---

## 3. Provider-Specific Ingestion Recipes

### A. Pinecone (`@pinecone-database/pinecone`)

```typescript
import { Pinecone } from "@pinecone-database/pinecone";
import { VectorChunkPayload } from "@/lib/metaAst/types";

export async function upsertToPinecone(
  chunks: VectorChunkPayload[],
  embeddings: number[][],
  indexName: string
) {
  const pc = new Pinecone();
  const index = pc.index(indexName);

  const records = chunks.map((chunk, idx) => ({
    id: chunk.id,
    values: embeddings[idx],
    metadata: {
      ...chunk.metadata,
      markdownContent: chunk.markdownContent,
      embeddingText: chunk.embeddingText,
    },
  }));

  // Batch in batches of 100
  const BATCH_SIZE = 100;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    await index.upsert(records.slice(i, i + BATCH_SIZE));
  }
}
```

### B. Qdrant (`@qdrant/js-client-rest`)

```typescript
import { QdrantClient } from "@qdrant/js-client-rest";
import { VectorChunkPayload } from "@/lib/metaAst/types";

export async function upsertToQdrant(
  chunks: VectorChunkPayload[],
  embeddings: number[][],
  collectionName: string
) {
  const client = new QdrantClient({ url: process.env.QDRANT_URL });

  const points = chunks.map((chunk, idx) => ({
    id: chunk.id,
    vector: embeddings[idx],
    payload: {
      ...chunk.metadata,
      markdownContent: chunk.markdownContent,
      embeddingText: chunk.embeddingText,
    },
  }));

  await client.upsert(collectionName, {
    wait: true,
    points,
  });
}
```

### C. PostgreSQL with `pgvector` & Drizzle ORM

```typescript
import { pgTable, text, vector, jsonb, integer, boolean } from "drizzle-orm/pg-core";

export const knowledgeVectors = pgTable("knowledge_vectors", {
  id: text("id").primaryKey(),
  documentTitle: text("document_title").notNull(),
  breadcrumb: text("breadcrumb").notNull(),
  chunkType: text("chunk_type").notNull(),
  hasCodeBlock: boolean("has_code_block").default(false),
  estimatedTokens: integer("estimated_tokens").notNull(),
  embedding: vector("embedding", { dimensions: 768 }).notNull(),
  markdownContent: text("markdown_content").notNull(),
  metadata: jsonb("metadata").notNull(),
});
```

---

## 4. Hybrid Search (Dense + Sparse BM25) Pattern

When implementing RAG queries:
1. Filter vector spaces by `chunkType` or `codeLanguages` metadata.
2. Rank candidates using **Reciprocal Rank Fusion (RRF)** across dense embeddings and BM25 keywords.
3. Return `markdownContent` to the generation model with strict citation anchors `[DocumentTitle > Breadcrumb]`.
