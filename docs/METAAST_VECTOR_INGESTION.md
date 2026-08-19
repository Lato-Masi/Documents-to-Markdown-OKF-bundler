# MetaAST & Vector Database Ingestion Architecture

> Specification, architecture, and developer guide for the **Zero-Dependency MetaAST Parser, Contextual Enrichment Layer, and Vector DB Chunking Pipeline**.

---

## 1. Overview & Objective

When feeding Markdown documents into vector databases (such as **Pinecone**, **Qdrant**, **Milvus**, **pgvector**, **ChromaDB**, or **Weaviate**) for Retrieval-Augmented Generation (RAG), standard character/token-based chunking breaks code fences, isolates table rows from headers, and separates paragraphs from their parent section headings.

The **MetaAST Vector Ingestion Subsystem** solves this by:
1. **Deterministic Lexical Parsing**: Parsing Markdown blocks (YAML frontmatter, ATX headings, tables, LaTeX math, Mermaid diagrams, fenced code, lists, and quotes) into an Abstract Syntax Tree (AST) without external dependencies or fragile regexes.
2. **Contextual Enrichment (MetaAST Spec)**: Decorating every AST node with hierarchical breadcrumbs (`H1 > H2 > H3`), active governing section titles, document metadata, outgoing links, and code languages.
3. **Rule-Enforcing Vector Chunking**: Emitting dual-layer payloads—**Context-Enriched Embedding Text** for semantic vector indexing and **Pristine Raw Markdown** for LLM prompt generation.

---

## 2. Ingestion & Transformation Pipeline

```
┌────────────────────────────────────────────────────────┐
│                   Raw Markdown Text                    │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
 ┌──────────────────────────────────────────────────────┐
 │ 1. Deterministic Lexer & AST Parser                  │
 │    - src/lib/metaAst/lexerAndParser.ts               │
 │    - YAML Frontmatter, Code Blocks, LaTeX Math,      │
 │      Mermaid Diagrams, Tables & ATX Headings         │
 └─────────────────────────┬────────────────────────────┘
                           │
                           ▼
 ┌──────────────────────────────────────────────────────┐
 │ 2. MetaAST Context Enrichment Engine                 │
 │    - src/lib/metaAst/enricher.ts                     │
 │    - Dynamic Heading Stack: H1 > H2 > H3 Breadcrumbs │
 │    - Document Title & Frontmatter Resolution         │
 │    - Outgoing Link & Asset Indexing                  │
 └─────────────────────────┬────────────────────────────┘
                           │
                           ▼
 ┌──────────────────────────────────────────────────────┐
 │ 3. Rule-Enforcing Vector Chunk Generator             │
 │    - src/lib/metaAst/vectorChunker.ts                │
 │    - Preserves Code & Math Atomicity                 │
 │    - Table Slicing with Repeated Column Headers      │
 │    - Generates Dual-Layer Vector DB Payloads         │
 └─────────────────────────┬────────────────────────────┘
                           │
                           ▼
 ┌──────────────────────────────────────────────────────┐
 │ 4. Vector DB Storage & Hybrid Retrieval              │
 │    - Vector Embedding Text -> Embedding Model        │
 │    - Clean Markdown Snippet -> Stored Document       │
 │    - Faceted Metadata -> Filter Index                │
 └──────────────────────────────────────────────────────┘
```

---

## 3. Key Rules for Markdown Vector Databases

| Markdown Construct | Chunking & Embedding Rule | Implementation in MetaAST Engine |
| :--- | :--- | :--- |
| **Headings (`#`, `##`, `###`)** | Major headings (H1/H2) trigger a clean chunk boundary flush if the preceding chunk has sufficient content. | `minHeadingFlushTokens` trigger in `vectorChunker.ts`. |
| **Code Blocks (` ``` `)** | **Atomic**: Never sever a function or code block across token chunks. | Oversized code blocks emit dedicated single-node chunks without mid-line splitting. |
| **Markdown Tables (`\| ... \|`)** | **Header Preservation**: Never orphan data rows without their parent column definitions. | Large tables are sliced row-by-row while **repeating the markdown table header row** on every sub-slice. |
| **LaTeX Math (`$$ ... $$`)** | Kept intact as single formula units. | Dedicated `math_block` node preservation. |
| **Breadcrumbs & Hierarchy** | Inject breadcrumb preambles into the text sent to the embedding model. | Formats `Document: <Title>\nPath: <H1 > H2 > H3>\n---\n<Content>` in `embeddingText`. |

---

## 4. Vector Database Payload Specification

Every chunk output by `chunkMarkdownForVectorDB()` adheres to the `VectorChunkPayload` interface:

```typescript
export interface VectorChunkPayload {
  /** Deterministic identifier (e.g. "chunk_1") */
  id: string;

  /** Text sent to the embedding model (enriched with hierarchy) */
  embeddingText: string;

  /** Clean markdown returned to LLMs on RAG retrieval */
  markdownContent: string;

  /** Faceted metadata for hybrid vector queries */
  metadata: {
    documentTitle: string;
    breadcrumb: string;
    breadcrumbList: string[];
    sectionHeading: string;
    sectionHeadingLevel: number;
    chunkType: 'composite' | 'code' | 'table' | 'math' | 'mermaid' | 'frontmatter';
    hasCodeBlock: boolean;
    codeLanguages: string[];
    hasTable: boolean;
    hasMath: boolean;
    hasMermaid: boolean;
    outgoingLinks: string[];
    imageUrls: string[];
    charCount: number;
    estimatedTokens: number;
    chunkIndex: number;
    totalChunks: number;
    customAttributes?: Record<string, any>;
  };
}
```

---

## 5. UI Tools & Explorers

### 5.1 AST Explorer (`AstExplorerModal.tsx`)
- Visualizes parsed block nodes with line-number coordinates.
- Filters by element type (`heading`, `code_block`, `table`, `math_block`, `mermaid_diagram`, `list`, `blockquote`, `yaml_frontmatter`).
- Displays computed breadcrumb paths, outgoing links, and full node JSON.

### 5.2 Vector DB Preparer (`VectorPrepModal.tsx`)
- Configures token budget sliders (`maxTokensPerChunk`, `minHeadingFlushTokens`).
- Previews the dual-layer output (`embeddingText` vs `markdownContent`).
- Generates 1-click upsert code snippets for **Pinecone**, **Qdrant**, **pgvector**, and **ChromaDB**.
- Exports all chunk payloads as formatted `.json` files.
