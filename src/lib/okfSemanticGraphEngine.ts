/**
 * OKF Semantic Graph & Cross-Linker Engine
 * Implements TF-IDF Cosine Similarity, Jaccard Entity Overlap, Causal / Dependency NLP extraction,
 * and Directed Knowledge Graph Edge generation with OKF v0.2 conformance.
 */

import type { OkfConcept, OkfMetadata, OkfGraph, OkfGraphNode, OkfGraphEdge } from 'okf-ts';
import {
  tokenizeText,
  extractEntities,
  extractKeyphrases,
  type NLPEntity,
  type NLPConceptAnalysis,
} from './okfNlpEngine';

export type OKFEdgeType = 'depends_on' | 'prerequisite_of' | 'implements' | 'references' | 'related_to';

export interface SemanticEdge {
  from: string;
  to: string;
  kind: OKFEdgeType;
  confidence: number;
  directed: boolean;
  sharedEntities: string[];
  sharedKeywords: string[];
  cosineSimilarity: number;
  evidenceSentence?: string;
  exists: boolean;
}

export interface SemanticGraphResult {
  nodes: OkfGraphNode[];
  edges: SemanticEdge[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    edgesByType: Record<OKFEdgeType, number>;
    averageDegree: number;
    graphDensity: number;
  };
}

export interface CrossLinkerOptions {
  similarityThreshold?: number; // default 0.25
  maxLinksPerConcept?: number; // default 6
  enableSemanticDiscovery?: boolean; // default true
  enableCausalDependencies?: boolean; // default true
}

/**
 * Calculates Term Frequency (TF) map for a document.
 */
export function calculateTermFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  if (tokens.length === 0) return tf;

  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }

  // Normalize by total tokens
  for (const [key, count] of tf.entries()) {
    tf.set(key, count / tokens.length);
  }

  return tf;
}

/**
 * Calculates Inverse Document Frequency (IDF) across a collection of documents.
 */
export function calculateIDF(documents: string[][]): Map<string, number> {
  const idf = new Map<string, number>();
  const totalDocs = documents.length;
  if (totalDocs === 0) return idf;

  const docFreq = new Map<string, number>();
  for (const doc of documents) {
    const uniqueTerms = new Set(doc);
    for (const term of uniqueTerms) {
      docFreq.set(term, (docFreq.get(term) || 0) + 1);
    }
  }

  for (const [term, count] of docFreq.entries()) {
    idf.set(term, Math.log((totalDocs + 1) / (count + 1)) + 1);
  }

  return idf;
}

/**
 * Computes TF-IDF vector for a document given global IDF.
 */
export function computeTfidfVector(tokens: string[], idf: Map<string, number>): Map<string, number> {
  const tf = calculateTermFrequency(tokens);
  const tfidf = new Map<string, number>();

  for (const [term, tfVal] of tf.entries()) {
    const idfVal = idf.get(term) || 1.0;
    tfidf.set(term, tfVal * idfVal);
  }

  return tfidf;
}

/**
 * Computes Cosine Similarity between two TF-IDF sparse vectors.
 */
export function computeCosineSimilarity(v1: Map<string, number>, v2: Map<string, number>): number {
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (const [term, val1] of v1.entries()) {
    norm1 += val1 * val1;
    const val2 = v2.get(term);
    if (val2 !== undefined) {
      dotProduct += val1 * val2;
    }
  }

  for (const val of v2.values()) {
    norm2 += val * val;
  }

  if (norm1 === 0 || norm2 === 0) return 0;
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * Computes Jaccard Similarity between two sets of strings.
 */
export function computeJaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
  if (set1.size === 0 && set2.size === 0) return 0;

  let intersectionSize = 0;
  for (const item of set1) {
    if (set2.has(item)) intersectionSize++;
  }

  const unionSize = set1.size + set2.size - intersectionSize;
  return unionSize > 0 ? intersectionSize / unionSize : 0;
}

/**
 * Analyzes whether source concept text implies a causal or prerequisite dependency on target concept.
 */
export function detectCausalRelationship(
  sourceBody: string,
  targetTitle: string,
  targetSlug: string
): { isDependency: boolean; isImplementation: boolean; evidenceSentence?: string } {
  const cleanTargetTitle = targetTitle.toLowerCase().trim();
  const cleanSlug = targetSlug.toLowerCase().replace(/[-_]/g, ' ');
  const sentences = sourceBody.split(/(?<=[.?!])\s+/);

  for (const sentence of sentences) {
    const lowerSentence = sentence.toLowerCase();
    const mentionsTarget =
      lowerSentence.includes(cleanTargetTitle) ||
      lowerSentence.includes(cleanSlug) ||
      lowerSentence.includes(`[${cleanTargetTitle}]`);

    if (!mentionsTarget) continue;

    // Check for dependency patterns
    const depPatterns = [
      /\b(requires|require|prerequisite|prerequisites|depends on|depend on|needs|before running|must be installed|must be configured|first set up)\b/i,
      /\b(after|following|once|precondition)\b/i,
    ];

    for (const pattern of depPatterns) {
      if (pattern.test(lowerSentence)) {
        return {
          isDependency: true,
          isImplementation: false,
          evidenceSentence: sentence.trim().slice(0, 200),
        };
      }
    }

    // Check for implementation/conformance patterns
    const implPatterns = [
      /\b(implements|implementing|conforms to|complies with|inherits from|extends|realizes|implements specification)\b/i,
      /\b(based on standard|per guideline|following policy)\b/i,
    ];

    for (const pattern of implPatterns) {
      if (pattern.test(lowerSentence)) {
        return {
          isDependency: false,
          isImplementation: true,
          evidenceSentence: sentence.trim().slice(0, 200),
        };
      }
    }
  }

  return { isDependency: false, isImplementation: false };
}

/**
 * Builds an advanced Semantic & Directed Knowledge Graph from an array of OKF Concepts.
 */
export function buildSemanticGraph(
  concepts: OkfConcept<OkfMetadata>[],
  nlpAnalyses?: Record<string, NLPConceptAnalysis>,
  options: CrossLinkerOptions = {}
): SemanticGraphResult {
  const similarityThreshold = options.similarityThreshold ?? 0.22;
  const maxLinks = options.maxLinksPerConcept ?? 6;

  // 1. Prepare Document Token Collections
  const docTokens: string[][] = [];
  const conceptMap = new Map<string, OkfConcept<OkfMetadata>>();
  const entitySets = new Map<string, Set<string>>();
  const tagSets = new Map<string, Set<string>>();

  for (const c of concepts) {
    const key = c.path || c.id;
    conceptMap.set(key, c);

    const fullText = `${c.metadata.title} ${c.metadata.description || ''} ${c.body}`;
    const tokens = tokenizeText(fullText);
    docTokens.push(tokens);

    // Entities
    const nlp = nlpAnalyses?.[key];
    const entities = nlp?.entities || extractEntities(fullText);
    entitySets.set(key, new Set(entities.map((e) => e.text.toLowerCase())));

    // Tags
    const tags = c.metadata.tags || [];
    tagSets.set(key, new Set(tags.map((t) => t.toLowerCase())));
  }

  // 2. Compute IDF & TF-IDF Vectors
  const idf = calculateIDF(docTokens);
  const tfidfVectors = new Map<string, Map<string, number>>();

  concepts.forEach((c, idx) => {
    const key = c.path || c.id;
    tfidfVectors.set(key, computeTfidfVector(docTokens[idx], idf));
  });

  // 3. Build Nodes
  const nodes: OkfGraphNode[] = concepts.map((c) => ({
    id: c.path || c.id,
    concept: c,
    valid: true,
  }));

  const edges: SemanticEdge[] = [];
  const edgeKeySet = new Set<string>();

  // 4. Discover Edges (Explicit References + Causal Dependency + Semantic Similarity)
  for (let i = 0; i < concepts.length; i++) {
    const src = concepts[i];
    const srcKey = src.path || src.id;
    const srcType = src.metadata.type || 'concept';
    const srcVector = tfidfVectors.get(srcKey)!;
    const srcEntities = entitySets.get(srcKey)!;
    const srcTags = tagSets.get(srcKey)!;

    const candidateEdges: SemanticEdge[] = [];

    for (let j = 0; j < concepts.length; j++) {
      if (i === j) continue;
      const tgt = concepts[j];
      const tgtKey = tgt.path || tgt.id;
      const tgtType = tgt.metadata.type || 'concept';
      const tgtVector = tfidfVectors.get(tgtKey)!;
      const tgtEntities = entitySets.get(tgtKey)!;
      const tgtTags = tagSets.get(tgtKey)!;

      // Compute shared items
      const sharedEnts = Array.from(srcEntities).filter((e) => tgtEntities.has(e));
      const sharedKws = Array.from(srcTags).filter((t) => tgtTags.has(t));

      // Calculate similarities
      const cosine = computeCosineSimilarity(srcVector, tgtVector);
      const jaccard = computeJaccardSimilarity(srcEntities, tgtEntities);
      const compositeSimilarity = 0.65 * cosine + 0.35 * jaccard;

      const tgtSlug = (tgt.path || '').split('/').pop()?.replace('.md', '') || '';
      const explicitMention =
        src.body.toLowerCase().includes(tgt.metadata.title.toLowerCase()) ||
        src.body.includes(tgtKey) ||
        src.body.includes(`(${tgtKey})`) ||
        src.body.includes(`(../${tgtKey})`);

      // Causal detection
      const causal = detectCausalRelationship(src.body, tgt.metadata.title, tgtSlug);

      let kind: OKFEdgeType | null = null;
      let directed = false;
      let confidence = 0.5;
      let evidence = causal.evidenceSentence;

      if (causal.isDependency) {
        kind = 'depends_on';
        directed = true;
        confidence = 0.95;
      } else if (causal.isImplementation || (srcType === 'procedure' && tgtType === 'guideline' && compositeSimilarity > 0.2)) {
        kind = 'implements';
        directed = true;
        confidence = 0.9;
        if (!evidence) {
          evidence = `${src.metadata.title} implements guidelines defined in ${tgt.metadata.title}.`;
        }
      } else if (explicitMention) {
        kind = 'references';
        directed = true;
        confidence = 0.85;
        if (!evidence) {
          evidence = `${src.metadata.title} explicitly references ${tgt.metadata.title}.`;
        }
      } else if (compositeSimilarity >= similarityThreshold || sharedEnts.length >= 2) {
        kind = 'related_to';
        directed = false;
        confidence = Math.min(0.95, Math.round(compositeSimilarity * 100) / 100);
        if (!evidence) {
          evidence = `Shared technical entities: ${sharedEnts.slice(0, 4).join(', ') || 'Domain context'}.`;
        }
      }

      if (kind) {
        candidateEdges.push({
          from: srcKey,
          to: tgtKey,
          kind,
          directed,
          confidence,
          sharedEntities: sharedEnts,
          sharedKeywords: sharedKws,
          cosineSimilarity: Math.round(cosine * 100) / 100,
          evidenceSentence: evidence,
          exists: true,
        });
      }
    }

    // Sort candidate edges by priority & similarity, cap at maxLinks
    const priorityWeight: Record<OKFEdgeType, number> = {
      depends_on: 4,
      implements: 3,
      references: 2,
      prerequisite_of: 2,
      related_to: 1,
    };

    candidateEdges.sort((a, b) => {
      const pDiff = (priorityWeight[b.kind] || 0) - (priorityWeight[a.kind] || 0);
      if (pDiff !== 0) return pDiff;
      return b.confidence - a.confidence;
    });

    const topCandidates = candidateEdges.slice(0, maxLinks);
    for (const edge of topCandidates) {
      const edgeKey = edge.directed ? `${edge.from}->${edge.to}` : [edge.from, edge.to].sort().join('<->');
      if (!edgeKeySet.has(edgeKey)) {
        edgeKeySet.add(edgeKey);
        edges.push(edge);
      }
    }
  }

  // 5. Calculate Graph Stats
  const edgesByType: Record<OKFEdgeType, number> = {
    depends_on: 0,
    prerequisite_of: 0,
    implements: 0,
    references: 0,
    related_to: 0,
  };

  for (const e of edges) {
    if (edgesByType[e.kind] !== undefined) {
      edgesByType[e.kind]++;
    }
  }

  const totalNodes = nodes.length;
  const totalEdges = edges.length;
  const averageDegree = totalNodes > 0 ? Math.round(((2 * totalEdges) / totalNodes) * 10) / 10 : 0;
  const maxPossibleEdges = (totalNodes * (totalNodes - 1)) / 2;
  const graphDensity = maxPossibleEdges > 0 ? Math.round((totalEdges / maxPossibleEdges) * 100) / 100 : 0;

  return {
    nodes,
    edges,
    stats: {
      totalNodes,
      totalEdges,
      edgesByType,
      averageDegree,
      graphDensity,
    },
  };
}

/**
 * Enriches partitioned concept markdown files with structured, typed cross-reference link sections.
 */
export function enrichConceptsWithSemanticCrossLinks(
  concepts: OkfConcept<OkfMetadata>[],
  nlpAnalyses?: Record<string, NLPConceptAnalysis>,
  options: CrossLinkerOptions = {}
): OkfConcept<OkfMetadata>[] {
  if (concepts.length <= 1) return concepts;

  const graphResult = buildSemanticGraph(concepts, nlpAnalyses, options);
  const conceptMap = new Map<string, OkfConcept<OkfMetadata>>();
  for (const c of concepts) {
    conceptMap.set(c.path || c.id, c);
  }

  // Group outgoing edges for each concept
  const outgoingMap = new Map<string, SemanticEdge[]>();
  for (const e of graphResult.edges) {
    if (!outgoingMap.has(e.from)) outgoingMap.set(e.from, []);
    outgoingMap.get(e.from)!.push(e);

    // If undirected, add reverse link too
    if (!e.directed) {
      if (!outgoingMap.has(e.to)) outgoingMap.set(e.to, []);
      outgoingMap.get(e.to)!.push({
        ...e,
        from: e.to,
        to: e.from,
      });
    }
  }

  for (const concept of concepts) {
    const key = concept.path || concept.id;
    const links = outgoingMap.get(key) || [];
    if (links.length === 0) continue;

    // Categorize links
    const dependencies: string[] = [];
    const implementations: string[] = [];
    const references: string[] = [];
    const related: string[] = [];

    for (const link of links) {
      const target = conceptMap.get(link.to);
      if (!target) continue;
      const targetTitle = target.metadata.title || link.to;
      const relPath = `../${target.path || link.to}`;
      const reasonSuffix = link.evidenceSentence ? ` — *${link.evidenceSentence.replace(/\*/g, '')}*` : '';

      const linkMd = `- [${targetTitle}](${relPath})${reasonSuffix}`;

      if (link.kind === 'depends_on') {
        dependencies.push(linkMd);
      } else if (link.kind === 'implements') {
        implementations.push(linkMd);
      } else if (link.kind === 'references') {
        references.push(linkMd);
      } else {
        related.push(linkMd);
      }
    }

    // Build structured cross-reference section
    const crossRefBlocks: string[] = [];

    if (dependencies.length > 0) {
      crossRefBlocks.push(`### Prerequisites & Dependencies\n${dependencies.join('\n')}`);
    }
    if (implementations.length > 0) {
      crossRefBlocks.push(`### Specifications & Conformance\n${implementations.join('\n')}`);
    }
    if (references.length > 0) {
      crossRefBlocks.push(`### References & Direct Citations\n${references.join('\n')}`);
    }
    if (related.length > 0) {
      crossRefBlocks.push(`### Related Knowledge Graph Concepts\n${related.join('\n')}`);
    }

    if (crossRefBlocks.length > 0 && !concept.body.includes('## Knowledge Graph & Cross-References')) {
      concept.body += `\n\n## Knowledge Graph & Cross-References\n\n${crossRefBlocks.join('\n\n')}`;
    }
  }

  return concepts;
}
