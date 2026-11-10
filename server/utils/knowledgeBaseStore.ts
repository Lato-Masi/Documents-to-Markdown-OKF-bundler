/**
 * @file server/utils/knowledgeBaseStore.ts
 * @description Shared active OKF Knowledge Base store used across both local (/api/mcp/*)
 * and Remote API v1 (/api/v1/mcp/*) endpoints so agents and the UI operate on unified state.
 */

export interface OKFConceptNode {
  id: string;
  path: string;
  type: string;
  title: string;
  description: string;
  tags: string[];
  status: string;
  trustTier: string;
  body: string;
  prerequisites?: string[];
  relatedConcepts?: string[];
}

export interface ActiveKnowledgeBaseState {
  name: string;
  concepts: OKFConceptNode[];
  rawMarkdown?: string;
  updatedAt: string;
}

const DEFAULT_CONCEPTS: OKFConceptNode[] = [
  {
    id: "consensus-raft",
    path: "concepts/consensus-raft.md",
    type: "concept",
    title: "Raft Distributed Consensus",
    description: "Deterministic leader-based consensus algorithm for replicated state machines.",
    tags: ["distributed-systems", "consensus", "fault-tolerance"],
    status: "stable",
    trustTier: "human-reviewed",
    body: ":::summary\n**Raft** achieves consensus across a cluster by electing a distinguished **Leader** that manages log replication to **Followers**.\n:::\n\n:::concept\nSafety is guaranteed via election term monotonicity and log matching invariants.\n:::",
    prerequisites: ["quorum-majority"],
    relatedConcepts: ["paxos-protocol", "leader-election"],
  },
  {
    id: "quorum-majority",
    path: "concepts/quorum-majority.md",
    type: "concept",
    title: "Strict Majority Quorum",
    description: "Minimum node intersection guarantee for split-brain prevention in distributed clusters.",
    tags: ["distributed-systems", "quorum", "safety"],
    status: "stable",
    trustTier: "human-reviewed",
    body: ":::summary\nA cluster of $2f + 1$ nodes tolerates up to $f$ simultaneous fail-stop node failures while preserving read/write quorum intersection.\n:::",
    prerequisites: [],
    relatedConcepts: ["consensus-raft"],
  },
  {
    id: "meta-ast-chunking",
    path: "procedures/meta-ast-chunking.md",
    type: "procedure",
    title: "MetaAST Semantic Vector Chunking",
    description: "Procedure for partitioning Markdown into context-enriched vector database chunks.",
    tags: ["rag", "vector-db", "meta-ast"],
    status: "stable",
    trustTier: "machine-confirmed",
    body: ":::procedure\n1. Parse raw Markdown into block-level AST nodes.\n2. Preserve fenced code blocks and tables as atomic units.\n3. Prepend ancestor heading breadcrumbs to each emitted vector chunk.\n:::",
    prerequisites: [],
    relatedConcepts: ["consensus-raft"],
  },
];

let currentKnowledgeBase: ActiveKnowledgeBaseState = {
  name: "Default OKF Knowledge Base",
  concepts: DEFAULT_CONCEPTS,
  updatedAt: new Date().toISOString(),
};

export function getActiveKnowledgeBase(): ActiveKnowledgeBaseState {
  return currentKnowledgeBase;
}

export function setActiveKnowledgeBase(payload: {
  name?: string;
  concepts: OKFConceptNode[];
  rawMarkdown?: string;
}): ActiveKnowledgeBaseState {
  currentKnowledgeBase = {
    name: payload.name || "OKF Knowledge Base",
    concepts: payload.concepts,
    rawMarkdown: payload.rawMarkdown || "",
    updatedAt: new Date().toISOString(),
  };
  return currentKnowledgeBase;
}

/**
 * Performs ranked semantic keyword/tag search across active OKF concepts
 */
export function searchKnowledgeBaseConcepts(options: {
  query: string;
  tag?: string;
  type?: string;
  trustTier?: string;
  limit?: number;
}) {
  const q = (options.query || "").toLowerCase().trim();
  const limit = Math.min(Math.max(1, options.limit || 5), 50);

  return currentKnowledgeBase.concepts
    .filter((c) => {
      if (options.tag && !c.tags.some((t) => t.toLowerCase() === options.tag!.toLowerCase())) {
        return false;
      }
      if (options.type && c.type.toLowerCase() !== options.type.toLowerCase()) {
        return false;
      }
      if (options.trustTier && options.trustTier !== "all" && c.trustTier !== options.trustTier) {
        return false;
      }
      return true;
    })
    .map((c) => {
      let score = q === "" ? 1 : 0;
      if (q) {
        const text = `${c.title} ${c.description} ${c.tags.join(" ")} ${c.body}`.toLowerCase();
        if (c.title.toLowerCase().includes(q)) score += 10;
        if (c.description.toLowerCase().includes(q)) score += 5;
        if (c.tags.some((t) => t.toLowerCase().includes(q))) score += 4;
        if (text.includes(q)) score += 2;
      }
      return { concept: c, score };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Finds a single concept by ID or path
 */
export function findKnowledgeBaseConcept(conceptId: string): OKFConceptNode | undefined {
  if (!conceptId) return undefined;
  const clean = conceptId.trim();
  return currentKnowledgeBase.concepts.find(
    (c) => c.id === clean || c.path === clean || c.path.endsWith(clean)
  );
}
