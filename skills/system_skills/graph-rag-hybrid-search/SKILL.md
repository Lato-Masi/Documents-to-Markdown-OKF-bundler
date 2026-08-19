---
name: "graph-rag-hybrid-search"
description: >
  Combines relational knowledge graph topology (OKF concept nodes, prerequisites,
  implementers) with dense vector similarity search and Reciprocal Rank Fusion (RRF).
  Use when answering complex multi-hop queries, performing neighborhood graph expansion,
  or constructing grounded RAG contexts.
---

# Graph-RAG Hybrid Search Skill (`graph-rag-hybrid-search`)

This skill defines the retrieval algorithms for fusing vector space nearest-neighbor search with directed topological graph traversals.

---

## 1. Graph-RAG Retrieval Pipeline

```
                               ┌───────────────────────────┐
                               │   User Natural Language   │
                               └─────────────┬─────────────┘
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       ▼                                           ▼
          ┌─────────────────────────┐                 ┌─────────────────────────┐
          │  Vector Similarity Top-K│                 │ Keyword / BM25 Inverted │
          └────────────┬────────────┘                 └────────────┬────────────┘
                       │                                           │
                       └─────────────────────┬─────────────────────┘
                                             │
                                             ▼
                              ┌─────────────────────────────┐
                              │ Reciprocal Rank Fusion (RRF)│
                              └──────────────┬──────────────┘
                                             │
                                             ▼ (Primary Hit Nodes)
                              ┌─────────────────────────────┐
                              │ k-Hop Directed Graph Walk   │
                              │ • Prerequisites (Upstream)  │
                              │ • Implementers (Downstream) │
                              │ • Related Concept Cross-refs│
                              └──────────────┬──────────────┘
                                             │
                                             ▼
                              ┌─────────────────────────────┐
                              │   Grounded Context Prompt   │
                              │   (With Explicit Citations) │
                              └─────────────────────────────┘
```

---

## 2. Reciprocal Rank Fusion (RRF) Algorithm

When merging results from multiple retrieval strategies (Vector Search, BM25 Keyword Search, and Graph Degree Centrality):

$$\text{RRF Score}(d) = \sum_{m \in M} \frac{1}{k + r_m(d)}$$

Where:
- $M$ is the set of retrieval models (dense vector, sparse BM25, graph proximity).
- $r_m(d)$ is the rank of document $d$ in model $m$ (1-indexed).
- $k$ is a smoothing constant (typically $k = 60$).

### TypeScript Implementation

```typescript
export function reciprocalRankFusion(
  rankedLists: Array<Array<{ id: string; score: number }>>,
  k = 60
): Array<{ id: string; fusedScore: number }> {
  const scoreMap = new Map<string, number>();

  for (const list of rankedLists) {
    list.forEach((item, rank) => {
      const current = scoreMap.get(item.id) || 0;
      scoreMap.set(item.id, current + 1 / (k + (rank + 1)));
    });
  }

  return Array.from(scoreMap.entries())
    .map(([id, fusedScore]) => ({ id, fusedScore }))
    .sort((a, b) => b.fusedScore - a.fusedScore);
}
```

---

## 3. $k$-Hop Topological Neighborhood Expansion

Once the top $N$ seed nodes are retrieved:
1. **Upstream Step**: Retrieve all `prerequisites` listed in YAML frontmatter to give the LLM prerequisite foundation concepts.
2. **Downstream Step**: Inspect `implementers` or `references` to fetch concrete procedures and runbooks.
3. **Budget Guard**: Bound expansion by maximum hops ($h \le 2$) and maximum total context tokens ($\le 8,000$ tokens).

---

## 4. Citation Grounding Format

Format the final aggregated context into the system prompt using clear semantic delimiters:

```markdown
You are answering a question based strictly on the following grounded knowledge graph:

=== CONCEPT [concepts/consensus.md] (Trust Tier: human-reviewed) ===
# Raft Consensus Protocol
...

=== DEPENDENCY [concepts/log-replication.md] (Hop: 1, Prerequisite) ===
# Log Replication Mechanics
...

Instructions:
- Ground every claim with a markdown link or bracket citation: [Title](okf://path)
- If information is not in the context, explicitly state what is missing.
```
