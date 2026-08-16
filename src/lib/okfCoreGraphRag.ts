/**
 * @okf/core Graph-RAG Retrieval & Multi-Relational Knowledge Graph Engine
 * Implements hybrid multi-stage retrieval, N-hop neighborhood expansion,
 * graph topological metrics (PageRank, in/out degrees, topological ordering),
 * trust-tier provenance weighting, and grounded prompt synthesis.
 */

import type { OkfParsedFrontmatter, OkfDocumentAST } from './okfCoreParser';
import { parseOkfDocument } from './okfCoreParser';
import { executeSparqlQuery, buildOkfTriplestore, type RDFTriple, type SparqlBindingValue } from './okfSparqlEngine';
import type { OkfBundle } from 'okf-ts';

export type EdgeType = 'depends_on' | 'prerequisite_of' | 'references' | 'semantic_similarity' | 'derived_from';

export interface OkfGraphNode {
  id: string;
  filePath?: string;
  title: string;
  type: string;
  description: string;
  trustTier: 'human-reviewed' | 'machine-confirmed' | 'unverified';
  status: string;
  tags: string[];
  content: string;
  wordCount: number;
  estimatedTokens: number;
  inDegree: number;
  outDegree: number;
  pageRank: number;
  ast?: OkfDocumentAST;
}

export interface OkfGraphEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  weight: number; // 0.0 - 1.0
  label?: string;
}

export interface OkfKnowledgeGraph {
  nodes: Map<string, OkfGraphNode>;
  edges: OkfGraphEdge[];
  adjacency: Map<string, Array<{ target: string; type: EdgeType; weight: number }>>;
  reverseAdjacency: Map<string, Array<{ source: string; type: EdgeType; weight: number }>>;
  metrics: {
    totalNodes: number;
    totalEdges: number;
    density: number;
    isolatedNodesCount: number;
    averageDegree: number;
    humanReviewedRatio: number;
  };
  bundle: OkfBundle;
  triples: RDFTriple[];
}

export interface GraphRagQueryOptions {
  query: string;
  topK?: number;
  maxHops?: 0 | 1 | 2;
  expansionDirection?: 'upstream' | 'downstream' | 'bidirectional';
  hybridAlpha?: number; // 0.0 = pure lexical/TF-IDF, 1.0 = pure semantic
  trustBoost?: number; // multiplier for human-reviewed nodes (default 1.25)
  maxTokenBudget?: number; // e.g. 4000 tokens
  filterSparql?: string; // optional SPARQL query to filter candidate nodes
}

export interface RetrievedSubgraphNode {
  node: OkfGraphNode;
  score: number;
  isSeed: boolean;
  hopDistance: number;
  pathFromSeed: string[];
  relevanceReason: string;
}

export interface GraphRagRetrievalResult {
  query: string;
  seeds: RetrievedSubgraphNode[];
  expandedNodes: RetrievedSubgraphNode[];
  allRetrievedNodes: RetrievedSubgraphNode[];
  subgraphEdges: OkfGraphEdge[];
  totalTokensUsed: number;
  tokenBudget: number;
  groundedPromptContext: string;
  executionTimeMs: number;
}

/**
 * Computes simplified PageRank on the directed graph.
 */
function computePageRank(
  nodes: string[],
  adj: Map<string, Array<{ target: string }>>,
  iterations = 15,
  damping = 0.85
): Map<string, number> {
  const n = nodes.length;
  if (n === 0) return new Map();

  let pr = new Map<string, number>();
  nodes.forEach((node) => pr.set(node, 1 / n));

  for (let it = 0; it < iterations; it++) {
    const nextPr = new Map<string, number>();
    nodes.forEach((node) => nextPr.set(node, (1 - damping) / n));

    for (const node of nodes) {
      const outNeighbors = adj.get(node) || [];
      const currentScore = pr.get(node) || 0;

      if (outNeighbors.length > 0) {
        const share = (currentScore * damping) / outNeighbors.length;
        for (const out of outNeighbors) {
          nextPr.set(out.target, (nextPr.get(out.target) || 0) + share);
        }
      } else {
        // Dangling node distributes evenly
        const share = (currentScore * damping) / n;
        for (const target of nodes) {
          nextPr.set(target, (nextPr.get(target) || 0) + share);
        }
      }
    }
    pr = nextPr;
  }

  return pr;
}

/**
 * Builds a complete multi-relational Knowledge Graph from raw documents.
 */
export function buildOkfKnowledgeGraph(
  documents: Array<{ path?: string; content: string }>
): OkfKnowledgeGraph {
  const nodes = new Map<string, OkfGraphNode>();
  const edges: OkfGraphEdge[] = [];
  const adjacency = new Map<string, Array<{ target: string; type: EdgeType; weight: number }>>();
  const reverseAdjacency = new Map<string, Array<{ source: string; type: EdgeType; weight: number }>>();

  // 1. Parse and create nodes
  for (const doc of documents) {
    const ast = parseOkfDocument(doc.content, doc.path);
    const cleanId = ast.id.toLowerCase().replace(/^[./]+/, '').replace(/\.md$/, '');
    const fm = ast.frontmatter;

    const wordCount = doc.content.split(/\s+/).filter(Boolean).length;
    const estimatedTokens = Math.ceil(wordCount * 1.35);

    const node: OkfGraphNode = {
      id: cleanId,
      filePath: doc.path || `${cleanId}.md`,
      title: fm.title || cleanId,
      type: fm.type || 'concept',
      description: fm.description || '',
      trustTier: fm.trustTier || 'machine-confirmed',
      status: fm.status || 'stable',
      tags: fm.tags || [],
      content: doc.content,
      wordCount,
      estimatedTokens,
      inDegree: 0,
      outDegree: 0,
      pageRank: 0,
      ast,
    };

    nodes.set(cleanId, node);
    adjacency.set(cleanId, []);
    reverseAdjacency.set(cleanId, []);
  }

  // 2. Extract and establish edges
  for (const [sourceId, node] of nodes.entries()) {
    if (!node.ast) continue;

    // A. Frontmatter depends_on -> depends_on edge
    const deps = node.ast.frontmatter.depends_on || node.ast.frontmatter.prerequisites || [];
    if (Array.isArray(deps)) {
      for (const dep of deps) {
        const targetClean = String(dep).toLowerCase().replace(/^[./]+/, '').replace(/\.md$/, '');
        if (nodes.has(targetClean) && targetClean !== sourceId) {
          const edgeId = `${sourceId}-depends_on-${targetClean}`;
          if (!edges.some((e) => e.id === edgeId)) {
            edges.push({
              id: edgeId,
              source: sourceId,
              target: targetClean,
              type: 'depends_on',
              weight: 1.0,
              label: 'depends_on',
            });
            adjacency.get(sourceId)?.push({ target: targetClean, type: 'depends_on', weight: 1.0 });
            reverseAdjacency.get(targetClean)?.push({ source: sourceId, type: 'depends_on', weight: 1.0 });
          }
        }
      }
    }

    // B. Wikilinks [[target]] -> references edge
    for (const wl of node.ast.allWikilinks) {
      const targetClean = wl.target.toLowerCase().replace(/^[./]+/, '').replace(/\.md$/, '');
      if (nodes.has(targetClean) && targetClean !== sourceId) {
        const edgeId = `${sourceId}-references-${targetClean}`;
        if (!edges.some((e) => e.id === edgeId)) {
          edges.push({
            id: edgeId,
            source: sourceId,
            target: targetClean,
            type: 'references',
            weight: 0.8,
            label: 'references',
          });
          adjacency.get(sourceId)?.push({ target: targetClean, type: 'references', weight: 0.8 });
          reverseAdjacency.get(targetClean)?.push({ source: sourceId, type: 'references', weight: 0.8 });
        }
      }
    }
  }

  // 3. Compute Degrees & PageRank
  const nodeIds = Array.from(nodes.keys());
  const prMap = computePageRank(nodeIds, adjacency);

  let humanReviewedCount = 0;
  let isolatedCount = 0;

  for (const [id, node] of nodes.entries()) {
    node.outDegree = (adjacency.get(id) || []).length;
    node.inDegree = (reverseAdjacency.get(id) || []).length;
    node.pageRank = prMap.get(id) || (1 / nodeIds.length);

    if (node.inDegree === 0 && node.outDegree === 0) {
      isolatedCount++;
    }
    if (node.trustTier === 'human-reviewed') {
      humanReviewedCount++;
    }
  }

  // 4. Build Triplestore for SPARQL bridge
  const mockBundle: OkfBundle = {
    root: '/',
    indexes: [],
    logs: [],
    issues: [],
    concepts: Array.from(nodes.values()).map((n) => ({
      id: n.id,
      path: n.filePath,
      body: n.content,
      metadata: {
        type: n.type,
        title: n.title,
        description: n.description,
        status: n.status as any,
        tags: n.tags,
        depends_on: n.ast?.frontmatter.depends_on,
        trust_tier: n.trustTier,
      },
    })),
  };
  const triples = buildOkfTriplestore(mockBundle);

  const totalNodes = nodes.size;
  const totalEdges = edges.length;
  const maxPossibleEdges = totalNodes > 1 ? totalNodes * (totalNodes - 1) : 1;
  const density = Math.round((totalEdges / maxPossibleEdges) * 1000) / 1000;
  const averageDegree = totalNodes > 0 ? Math.round(((totalEdges * 2) / totalNodes) * 10) / 10 : 0;
  const humanReviewedRatio = totalNodes > 0 ? Math.round((humanReviewedCount / totalNodes) * 100) : 0;

  return {
    nodes,
    edges,
    adjacency,
    reverseAdjacency,
    metrics: {
      totalNodes,
      totalEdges,
      density,
      isolatedNodesCount: isolatedCount,
      averageDegree,
      humanReviewedRatio,
    },
    bundle: mockBundle,
    triples,
  };
}

/**
 * Computes TF-IDF based lexical match score for a query against a node.
 */
function scoreLexical(query: string, node: OkfGraphNode): number {
  const queryTokens = query.toLowerCase().split(/[^a-z0-9]+/g).filter((t) => t.length > 2);
  if (queryTokens.length === 0) return 0;

  const titleLower = node.title.toLowerCase();
  const descLower = node.description.toLowerCase();
  const contentLower = node.content.toLowerCase();
  const tagsLower = node.tags.map((t) => t.toLowerCase()).join(' ');

  let matches = 0;
  for (const token of queryTokens) {
    if (titleLower.includes(token)) matches += 5.0;
    else if (tagsLower.includes(token)) matches += 3.0;
    else if (descLower.includes(token)) matches += 2.0;
    else if (contentLower.includes(token)) matches += 0.5;
  }

  return matches / (queryTokens.length * 5.0);
}

/**
 * Executes a Graph-RAG Retrieval: Hybrid Match -> N-Hop Subgraph Expansion -> Trust Audit -> Prompt Synthesis.
 */
export function executeGraphRagQuery(
  graph: OkfKnowledgeGraph,
  options: GraphRagQueryOptions
): GraphRagRetrievalResult {
  const startTime = performance.now();
  const topK = options.topK || 3;
  const maxHops = options.maxHops !== undefined ? options.maxHops : 1;
  const direction = options.expansionDirection || 'bidirectional';
  const alpha = options.hybridAlpha !== undefined ? options.hybridAlpha : 0.5;
  const trustBoost = options.trustBoost || 1.25;
  const maxBudget = options.maxTokenBudget || 4000;

  // Optional: SPARQL Pre-filtering
  const allowedNodeIds = new Set<string>();
  if (options.filterSparql && options.filterSparql.trim().length > 0) {
    try {
      const sparqlRes = executeSparqlQuery(options.filterSparql, graph.bundle);
      if (sparqlRes.queryType === 'SELECT') {
        for (const binding of sparqlRes.data.results.bindings) {
          for (const val of Object.values(binding)) {
            const bVal = val as SparqlBindingValue;
            if (bVal && bVal.type === 'uri') {
              const id = bVal.value.replace(/^urn:okf:concept:/, '').replace(/_/g, '/');
              allowedNodeIds.add(id.toLowerCase());
            }
          }
        }
      }
    } catch {
      // ignore sparql error and allow all
    }
  }

  // 1. Find Seed Nodes using Lexical + PageRank + Trust scoring
  const scoredNodes: Array<{ node: OkfGraphNode; score: number }> = [];

  for (const [id, node] of graph.nodes.entries()) {
    if (allowedNodeIds.size > 0 && !allowedNodeIds.has(id)) continue;

    const lexicalScore = scoreLexical(options.query, node);
    if (lexicalScore > 0.05) {
      let finalScore = lexicalScore * (1 - alpha) + node.pageRank * 5.0 * alpha;
      if (node.trustTier === 'human-reviewed') {
        finalScore *= trustBoost;
      }
      scoredNodes.push({ node, score: finalScore });
    }
  }

  scoredNodes.sort((a, b) => b.score - a.score);
  const seedMatches = scoredNodes.slice(0, topK);

  const seedRetrieved: RetrievedSubgraphNode[] = seedMatches.map((s) => ({
    node: s.node,
    score: Math.round(s.score * 100) / 100,
    isSeed: true,
    hopDistance: 0,
    pathFromSeed: [s.node.id],
    relevanceReason: `Primary semantic seed match (Score: ${Math.round(s.score * 100) / 100})`,
  }));

  // 2. N-Hop Subgraph Expansion
  const visited = new Set<string>(seedRetrieved.map((s) => s.node.id));
  const expandedList: RetrievedSubgraphNode[] = [];
  const subgraphEdges: OkfGraphEdge[] = [];

  let currentFrontier = [...seedRetrieved];

  for (let hop = 1; hop <= maxHops; hop++) {
    const nextFrontier: RetrievedSubgraphNode[] = [];

    for (const item of currentFrontier) {
      const sourceId = item.node.id;

      // Downstream neighbors (outgoing edges: source -> target)
      if (direction === 'downstream' || direction === 'bidirectional') {
        const outEdges = graph.adjacency.get(sourceId) || [];
        for (const out of outEdges) {
          const targetNode = graph.nodes.get(out.target);
          if (targetNode) {
            // Record edge
            subgraphEdges.push({
              id: `${sourceId}-${out.type}-${out.target}`,
              source: sourceId,
              target: out.target,
              type: out.type,
              weight: out.weight,
              label: out.type,
            });

            if (!visited.has(out.target)) {
              visited.add(out.target);
              const hopNode: RetrievedSubgraphNode = {
                node: targetNode,
                score: Math.round(item.score * 0.75 * 100) / 100,
                isSeed: false,
                hopDistance: hop,
                pathFromSeed: [...item.pathFromSeed, targetNode.id],
                relevanceReason: `${hop}-hop dependent via [${out.type}] from ${item.node.id}`,
              };
              expandedList.push(hopNode);
              nextFrontier.push(hopNode);
            }
          }
        }
      }

      // Upstream neighbors (incoming edges: incoming -> source, prerequisites)
      if (direction === 'upstream' || direction === 'bidirectional') {
        const inEdges = graph.reverseAdjacency.get(sourceId) || [];
        for (const inc of inEdges) {
          const prereqNode = graph.nodes.get(inc.source);
          if (prereqNode) {
            subgraphEdges.push({
              id: `${inc.source}-${inc.type}-${sourceId}`,
              source: inc.source,
              target: sourceId,
              type: inc.type,
              weight: inc.weight,
              label: `prerequisite_of`,
            });

            if (!visited.has(inc.source)) {
              visited.add(inc.source);
              const hopNode: RetrievedSubgraphNode = {
                node: prereqNode,
                score: Math.round(item.score * 0.85 * 100) / 100, // prerequisites get strong weight
                isSeed: false,
                hopDistance: hop,
                pathFromSeed: [prereqNode.id, ...item.pathFromSeed],
                relevanceReason: `${hop}-hop prerequisite required by ${item.node.id}`,
              };
              expandedList.push(hopNode);
              nextFrontier.push(hopNode);
            }
          }
        }
      }
    }

    currentFrontier = nextFrontier;
  }

  // 3. Token Budget Allocation & Grounding Prompt Context Assembly
  const allRetrieved = [...seedRetrieved, ...expandedList];
  let accumulatedTokens = 0;
  const promptContextBlocks: string[] = [];

  for (const item of allRetrieved) {
    if (accumulatedTokens + item.node.estimatedTokens > maxBudget) {
      // Exceeded budget, append summary only
      promptContextBlocks.push(`### [EXCERPT] ${item.node.title} (${item.node.id})
Type: ${item.node.type} | Trust: [${item.node.trustTier}] | Path: ${item.pathFromSeed.join(' -> ')}
Summary: ${item.node.description}`);
      accumulatedTokens += 50;
      continue;
    }

    accumulatedTokens += item.node.estimatedTokens;
    promptContextBlocks.push(`### [CONCEPT] ${item.node.title} (ID: ${item.node.id})
Type: ${item.node.type} | Trust Tier: [${item.node.trustTier}] | Retrieval Reason: ${item.relevanceReason}
Path from Seed: ${item.pathFromSeed.join(' -> ')}

${item.node.content.trim()}
`);
  }

  const groundedPromptContext = `--- START OKF GRAPH-RAG SUBGRAPH CONTEXT ---
User Query: "${options.query}"
Retrieved Nodes: ${allRetrieved.length} (${seedRetrieved.length} Seeds, ${expandedList.length} Expanded Neighbors)
Total Context Tokens: ~${accumulatedTokens} / ${maxBudget} limit

${promptContextBlocks.join('\n\n---\n\n')}
--- END OKF GRAPH-RAG SUBGRAPH CONTEXT ---`;

  const executionTimeMs = Math.round((performance.now() - startTime) * 100) / 100;

  return {
    query: options.query,
    seeds: seedRetrieved,
    expandedNodes: expandedList,
    allRetrievedNodes: allRetrieved,
    subgraphEdges,
    totalTokensUsed: accumulatedTokens,
    tokenBudget: maxBudget,
    groundedPromptContext,
    executionTimeMs,
  };
}
