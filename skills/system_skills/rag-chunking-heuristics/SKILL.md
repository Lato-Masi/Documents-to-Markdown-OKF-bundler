---
name: "rag-chunking-heuristics"
description: >
  Defines chunking rules, boundary heuristics, and syntax-preservation strategies for
  Markdown, code, LaTeX math, and data tables. Use when configuring text splitters,
  designing RAG pipelines, or optimizing token budgets for retrieval systems.
---

# RAG Chunking Heuristics & Boundary Preservation (`rag-chunking-heuristics`)

This skill defines the mathematical and syntactic rules for chunking unstructured Markdown into high-fidelity retrieval units without semantic or syntactic corruption.

---

## 1. Chunking Boundary Hierarchy

Always respect natural structural boundaries in descending order of priority:

```
Priority 1: Document Root / H1 Level Boundary (Flush chunk immediately)
Priority 2: Major Section (H2 / H3 Level) (Flush if buffer >= minHeadingFlushTokens)
Priority 3: Atomic Block Elements (Code fences, Math formulas, Diagrams)
Priority 4: Table Rows (Split with repeated header replication)
Priority 5: Paragraphs & Blockquotes (Break on double newline '\n\n')
Priority 6: List Items (Group logically; do not break mid-item)
```

---

## 2. Strict Atomicity Directives

### A. Code Fences (` ```lang ... ``` `)
- **NEVER** split a code block across multiple chunks.
- If a code block exceeds `maxTokensPerChunk`, isolate the entire code block as its own dedicated chunk (`chunkType: 'code'`).
- Always preserve the language identifier (`typescript`, `python`, `sql`) in metadata `codeLanguages`.

### B. Mathematical Blocks (`$$ ... $$`)
- Math equations must remain 100% atomic. Splitting LaTeX equations causes formula rendering errors and destroys symbolic vector representations.
- Assign `chunkType: 'math'` and flag `hasMath: true`.

### C. Mermaid & Architecture Diagrams (` ```mermaid ... ``` `)
- Graph definitions must be preserved intact to allow downstream visualizers or agents to reconstruct system architecture diagrams accurately.
- Assign `chunkType: 'mermaid'`.

---

## 3. Large Data Table Slicing Protocol

When a Markdown table exceeds the chunk token limit:
1. Extract the column header line (`| Col 1 | Col 2 | ... |`) and separator line (`| :--- | :--- | ... |`).
2. Slices rows into batches that fit within `maxTokensPerChunk`.
3. **Mandatory**: Prepend the column header and separator to every subsequent table sub-chunk.
4. Set `chunkType: 'table'` and `hasTable: true`.

```markdown
<!-- Chunk 1 -->
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| /api/v1/auth | POST | User authentication |
| /api/v1/users | GET | List active tenants |

<!-- Chunk 2 (Replicated Header) -->
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| /api/v1/logs | GET | Stream execution audit |
| /api/v1/health | GET | Cluster health status |
```

---

## 4. Breadcrumb Ancestry Injection

To solve the "Lost Context Problem" where an isolated paragraph has no semantic connection to its parent topic:
1. Maintain an active heading stack `[H1, H2, H3, H4]`.
2. On each chunk, inject the breadcrumb into `embeddingText`:
   `[Document Title > Section H2 > Sub-section H3]`
3. Provide `breadcrumbList: string[]` in the metadata for exact faceted queries.

---

## 5. Token Budgeting Standard

| Model Generation Context | Recommended Max Chunk Tokens | Heading Flush Threshold |
| :--- | :--- | :--- |
| **Small / Fast (2k-4k ctx)** | 256 tokens (~1,000 chars) | 100 tokens |
| **Standard RAG (8k-32k ctx)** | 512 tokens (~2,000 chars) | 150 tokens |
| **Long Context (128k+ ctx)** | 1024 tokens (~4,000 chars) | 300 tokens |
