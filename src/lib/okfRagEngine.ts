/**
 * OKF Graph-Augmented RAG & Retrieval Engine
 * Provides Hybrid Semantic & Directed Sub-Graph Expansion (1-hop & 2-hop traversal)
 * for AI Agent Context Assembly.
 */

import type { OkfConcept, OkfMetadata } from 'okf-ts';
import type { SemanticGraphResult, SemanticEdge } from './okfSemanticGraphEngine';
import {
  calculateIDF,
  computeTfidfVector,
  computeCosineSimilarity,
} from './okfSemanticGraphEngine';
import { tokenizeText, extractKeyphrases, extractEntities } from './okfNlpEngine';
import { deriveTrustTier } from './okfKnowledgeEngine';

export interface RAGSearchMatch {
  concept: OkfConcept<OkfMetadata>;
  score: number;
  matchType: 'direct_similarity' | 'graph_neighbor' | 'exact_keyword';
  relevanceExplanation: string;
  hopDistance: number;
}

export interface GraphAugmentedContext {
  query: string;
  primaryMatches: RAGSearchMatch[];
  expandedSubGraphNodes: OkfConcept<OkfMetadata>[];
  expandedSubGraphEdges: SemanticEdge[];
  assembledContextMarkdown: string;
  totalTokensEstimate: number;
}

/**
 * Searches the OKF bundle using Hybrid Semantic Vector + Subgraph Neighborhood Expansion.
 */
export function queryKnowledgeGraphRAG(
  query: string,
  concepts: OkfConcept<OkfMetadata>[],
  semanticGraph?: SemanticGraphResult,
  options: {
    topK?: number;
    expandGraphHops?: boolean;
    maxHops?: number;
    trustTierFilter?: 'all' | 'human-reviewed' | 'machine-confirmed';
  } = {}
): GraphAugmentedContext {
  const topK = options.topK ?? 3;
  const expandGraphHops = options.expandGraphHops ?? true;
  const maxHops = options.maxHops ?? 2;
  const trustFilter = options.trustTierFilter ?? 'all';

  const cleanQuery = query.trim().toLowerCase();
  const queryTokens = tokenizeText(query);
  const queryEntities = extractEntities(query).map((e) => e.text.toLowerCase());

  // 1. Prepare Document Vectors
  const docTokens = concepts.map((c) => {
    return tokenizeText(`${c.metadata.title} ${c.metadata.description || ''} ${c.body}`);
  });
  const allDocs = [...docTokens, queryTokens];
  const idf = calculateIDF(allDocs);

  const queryVector = computeTfidfVector(queryTokens, idf);
  const conceptVectors = docTokens.map((tokens) => computeTfidfVector(tokens, idf));

  // 2. Score Candidates
  const scoredMatches: { concept: OkfConcept<OkfMetadata>; score: number; explanation: string }[] = [];

  concepts.forEach((concept, idx) => {
    // Filter by trust tier if requested
    if (trustFilter !== 'all') {
      const trust = deriveTrustTier(concept);
      if (trust !== trustFilter) return;
    }

    const cTitle = (concept.metadata.title || '').toLowerCase();
    const cTags = (concept.metadata.tags || []).map((t) => t.toLowerCase());
    const cBody = concept.body.toLowerCase();

    // Cosine similarity
    const cosine = computeCosineSimilarity(queryVector, conceptVectors[idx]);

    // Exact keyword or entity overlap boost
    let boost = 0;
    let explanation = `Semantic TF-IDF similarity: ${Math.round(cosine * 100)}%`;

    if (cTitle.includes(cleanQuery) || cleanQuery.includes(cTitle)) {
      boost += 0.35;
      explanation = `Exact title match with query: "${concept.metadata.title}"`;
    }

    for (const qEnt of queryEntities) {
      if (cBody.includes(qEnt) || cTags.includes(qEnt)) {
        boost += 0.15;
        explanation += ` • Mentions entity "${qEnt}"`;
      }
    }

    const totalScore = Math.min(1.0, cosine + boost);

    if (totalScore > 0.08 || boost > 0) {
      scoredMatches.push({
        concept,
        score: totalScore,
        explanation,
      });
    }
  });

  scoredMatches.sort((a, b) => b.score - a.score);

  const primaryTopMatches: RAGSearchMatch[] = scoredMatches.slice(0, topK).map((m) => ({
    concept: m.concept,
    score: Math.round(m.score * 100) / 100,
    matchType: 'direct_similarity',
    relevanceExplanation: m.explanation,
    hopDistance: 0,
  }));

  // 3. Sub-Graph Neighborhood Expansion
  const primaryKeys = new Set(primaryTopMatches.map((m) => m.concept.path || m.concept.id));
  const expandedNodeMap = new Map<string, OkfConcept<OkfMetadata>>();
  const expandedEdges: SemanticEdge[] = [];
  const conceptKeyMap = new Map<string, OkfConcept<OkfMetadata>>();

  concepts.forEach((c) => {
    conceptKeyMap.set(c.path || c.id, c);
  });

  // Add primary nodes
  primaryTopMatches.forEach((m) => {
    expandedNodeMap.set(m.concept.path || m.concept.id, m.concept);
  });

  if (expandGraphHops && semanticGraph && maxHops >= 1) {
    for (const m of primaryTopMatches) {
      const srcKey = m.concept.path || m.concept.id;
      // Find direct neighbors (1-hop)
      const directEdges = semanticGraph.edges.filter(
        (e) => e.from === srcKey || e.to === srcKey
      );

      for (const edge of directEdges) {
        const neighborKey = edge.from === srcKey ? edge.to : edge.from;
        const neighborConcept = conceptKeyMap.get(neighborKey);

        if (neighborConcept && !expandedNodeMap.has(neighborKey)) {
          expandedNodeMap.set(neighborKey, neighborConcept);
          expandedEdges.push(edge);
        }
      }
    }
  }

  // 4. Assemble Graph-Augmented Markdown Context for Agent
  const assembledBlocks: string[] = [];

  assembledBlocks.push(`# Graph-Augmented RAG Retrieval Context for Query: "${query}"\n`);
  assembledBlocks.push(`## 📌 Primary Concept Matches (${primaryTopMatches.length})`);

  for (const match of primaryTopMatches) {
    const c = match.concept;
    assembledBlocks.push(
      `\n### Concept: ${c.metadata.title} (\`${c.path || c.id}\`)` +
        `\n- **Type**: \`${c.metadata.type || 'concept'}\` | **Trust**: \`${deriveTrustTier(c)}\` | **Relevance**: ${Math.round(match.score * 100)}%` +
        `\n- **Rationale**: ${match.relevanceExplanation}` +
        `\n- **Summary**: ${c.metadata.description || 'N/A'}` +
        `\n\n\`\`\`markdown\n${c.body.slice(0, 800)}${c.body.length > 800 ? '\n...[truncated for context efficiency]' : ''}\n\`\`\``
    );
  }

  const neighborNodes = Array.from(expandedNodeMap.values()).filter(
    (c) => !primaryKeys.has(c.path || c.id)
  );

  if (neighborNodes.length > 0) {
    assembledBlocks.push(`\n## 🕸️ Graph-Expanded Neighbors & Dependencies (${neighborNodes.length})`);
    for (const neighbor of neighborNodes) {
      assembledBlocks.push(
        `- **${neighbor.metadata.title}** (\`${neighbor.path}\` - \`${neighbor.metadata.type}\`): ${neighbor.metadata.description || 'Connected via knowledge graph relation'}`
      );
    }
  }

  if (expandedEdges.length > 0) {
    assembledBlocks.push(`\n## 🔗 Directed Knowledge Graph Edges (${expandedEdges.length})`);
    for (const edge of expandedEdges) {
      const srcTitle = conceptKeyMap.get(edge.from)?.metadata.title || edge.from;
      const tgtTitle = conceptKeyMap.get(edge.to)?.metadata.title || edge.to;
      assembledBlocks.push(
        `- **${srcTitle}** --[*\`${edge.kind}\`* (${Math.round(edge.confidence * 100)}% conf)]--> **${tgtTitle}**${edge.evidenceSentence ? ` (*${edge.evidenceSentence.replace(/\*/g, '')}*)` : ''}`
      );
    }
  }

  const assembledContextMarkdown = assembledBlocks.join('\n');
  const totalTokensEstimate = Math.round(assembledContextMarkdown.length / 4);

  return {
    query,
    primaryMatches: primaryTopMatches,
    expandedSubGraphNodes: Array.from(expandedNodeMap.values()),
    expandedSubGraphEdges: expandedEdges,
    assembledContextMarkdown,
    totalTokensEstimate,
  };
}
