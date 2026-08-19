/**
 * NLP Entity Extraction & MetaAST Semantic Node Tagger
 * 
 * Scans Markdown content and MetaAST nodes to extract:
 * 1. Key Concepts (Algorithms, Architectures, Protocols, Patterns)
 * 2. Organizations & Frameworks (OpenAI, Google, AWS, W3C, Kubernetes, React, Drizzle, etc.)
 * 3. People & Creators (Inventors, Authors, Architects)
 * 4. Technical Terms & Code Identifiers
 * 
 * Attaches extracted entities as contextual 'tags' and graph metadata to MetaAST nodes
 * to dramatically improve Graph-RAG neighborhood discovery and knowledge graph connectivity.
 */

import { MetaASTNode, MetaASTContext } from './metaAst/types';
import { parseMarkdownToAST } from './metaAst/lexerAndParser';
import { enrichMetaAST } from './metaAst/enricher';
import { CustomLexiconEntry, loadCustomLexicon } from './lexiconStorage';
import { compromiseNlp, PosTag } from './compromiseNlp';

export type EntityCategory = 'concept' | 'organization' | 'person' | 'protocol' | 'technology' | 'metric';

export interface ExtractedEntity {
  name: string;
  category: EntityCategory;
  salience: number; // 0.0 to 1.0
  occurrences: number;
  normalizedTag: string; // e.g. "raft-consensus"
  posTags?: PosTag[];
}

export interface NodeEntityTaggingResult {
  nodeId: string;
  tags: string[];
  entities: ExtractedEntity[];
}

export interface DocumentEntityExtractionResult {
  documentTitle: string;
  globalTags: string[];
  entities: ExtractedEntity[];
  entitiesByCategory: Record<EntityCategory, ExtractedEntity[]>;
  taggedNodes: MetaASTNode[];
  summaryGraphConnections: Array<{ sourceTag: string; targetTag: string; weight: number }>;
}

export interface LexiconConfigOptions {
  customEntries?: CustomLexiconEntry[];
  useStoredLexicon?: boolean;
}

// Well-known industry organizations, frameworks, and projects
const KNOWN_ORGANIZATIONS = new Map<string, string>([
  ['google', 'Google'],
  ['deepmind', 'Google DeepMind'],
  ['openai', 'OpenAI'],
  ['microsoft', 'Microsoft'],
  ['anthropic', 'Anthropic'],
  ['meta', 'Meta'],
  ['facebook', 'Meta'],
  ['apple', 'Apple'],
  ['amazon', 'Amazon'],
  ['aws', 'AWS'],
  ['cloudflare', 'Cloudflare'],
  ['apache', 'Apache Software Foundation'],
  ['mozilla', 'Mozilla'],
  ['w3c', 'W3C'],
  ['linux', 'Linux Foundation'],
  ['cncf', 'CNCF'],
  ['github', 'GitHub'],
  ['docker', 'Docker'],
  ['kubernetes', 'Kubernetes'],
  ['pinecone', 'Pinecone'],
  ['qdrant', 'Qdrant'],
  ['redis', 'Redis'],
  ['postgresql', 'PostgreSQL'],
  ['postgres', 'PostgreSQL'],
  ['sqlite', 'SQLite'],
  ['neo4j', 'Neo4j'],
  ['memgraph', 'Memgraph'],
  ['weaviate', 'Weaviate'],
  ['chroma', 'ChromaDB'],
  ['chromadb', 'ChromaDB'],
  ['milvus', 'Milvus'],
  ['firebase', 'Firebase'],
  ['vercel', 'Vercel'],
  ['stripe', 'Stripe'],
]);

// Well-known computer scientists, creators, and authors
const KNOWN_PEOPLE = new Map<string, string>([
  ['alan turing', 'Alan Turing'],
  ['tim berners-lee', 'Tim Berners-Lee'],
  ['leslie lamport', 'Leslie Lamport'],
  ['john von neumann', 'John von Neumann'],
  ['linus torvalds', 'Linus Torvalds'],
  ['guido van rossum', 'Guido van Rossum'],
  ['brendan eich', 'Brendan Eich'],
  ['dennis ritchie', 'Dennis Ritchie'],
  ['ken thompson', 'Ken Thompson'],
  ['bjarne stroustrup', 'Bjarne Stroustrup'],
  ['martin fowler', 'Martin Fowler'],
  ['kent beck', 'Kent Beck'],
  ['donald knuth', 'Donald Knuth'],
  ['rich hickey', 'Rich Hickey'],
  ['diego ongaro', 'Diego Ongaro'],
  ['john ousterhout', 'John Ousterhout'],
  ['satoshi nakamoto', 'Satoshi Nakamoto'],
  ['geoffrey hinton', 'Geoffrey Hinton'],
  ['yann lecun', 'Yann LeCun'],
  ['yoshua bengio', 'Yoshua Bengio'],
  ['demis hassabis', 'Demis Hassabis'],
  ['sam altman', 'Sam Altman'],
  ['dario amodei', 'Dario Amodei'],
]);

// Core technical concepts and protocols
const KNOWN_CONCEPTS_AND_PROTOCOLS = new Map<string, { name: string; category: EntityCategory }>([
  ['raft', { name: 'Raft Consensus', category: 'concept' }],
  ['paxos', { name: 'Paxos Consensus', category: 'concept' }],
  ['byzantine fault tolerance', { name: 'Byzantine Fault Tolerance', category: 'concept' }],
  ['bft', { name: 'Byzantine Fault Tolerance', category: 'concept' }],
  ['mapreduce', { name: 'MapReduce', category: 'concept' }],
  ['vector database', { name: 'Vector Database', category: 'technology' }],
  ['vector db', { name: 'Vector Database', category: 'technology' }],
  ['embedding', { name: 'Vector Embedding', category: 'concept' }],
  ['metaast', { name: 'MetaAST Specification', category: 'concept' }],
  ['graph-rag', { name: 'Graph-RAG', category: 'concept' }],
  ['graph rag', { name: 'Graph-RAG', category: 'concept' }],
  ['rag', { name: 'Retrieval-Augmented Generation', category: 'concept' }],
  ['reciprocal rank fusion', { name: 'Reciprocal Rank Fusion', category: 'concept' }],
  ['rrf', { name: 'Reciprocal Rank Fusion', category: 'concept' }],
  ['bm25', { name: 'BM25 Sparse Retrieval', category: 'concept' }],
  ['oauth', { name: 'OAuth 2.0', category: 'protocol' }],
  ['oauth 2.0', { name: 'OAuth 2.0', category: 'protocol' }],
  ['jwt', { name: 'JSON Web Token (JWT)', category: 'protocol' }],
  ['grpc', { name: 'gRPC', category: 'protocol' }],
  ['rest', { name: 'RESTful API', category: 'protocol' }],
  ['graphql', { name: 'GraphQL', category: 'technology' }],
  ['sparql', { name: 'SPARQL', category: 'protocol' }],
  ['rdf', { name: 'Resource Description Framework (RDF)', category: 'protocol' }],
  ['turtle', { name: 'W3C Turtle RDF', category: 'protocol' }],
  ['json-ld', { name: 'JSON-LD', category: 'protocol' }],
  ['mcp', { name: 'Model Context Protocol (MCP)', category: 'protocol' }],
  ['model context protocol', { name: 'Model Context Protocol (MCP)', category: 'protocol' }],
  ['okf', { name: 'Open Knowledge Format (OKF)', category: 'concept' }],
  ['open knowledge format', { name: 'Open Knowledge Format (OKF)', category: 'concept' }],
  ['typescript', { name: 'TypeScript', category: 'technology' }],
  ['javascript', { name: 'JavaScript', category: 'technology' }],
  ['python', { name: 'Python', category: 'technology' }],
  ['rust', { name: 'Rust', category: 'technology' }],
  ['golang', { name: 'Go', category: 'technology' }],
  ['docker', { name: 'Docker Containers', category: 'technology' }],
  ['kubernetes', { name: 'Kubernetes Orchestration', category: 'technology' }],
]);

const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'could', 'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further',
  'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
  'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me', 'more', 'most', 'my', 'myself',
  'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves',
  'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their',
  'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too',
  'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who',
  'whom', 'why', 'with', 'would', 'you', 'your', 'yours', 'yourself', 'yourselves', 'also', 'e.g', 'i.e',
  'etc', 'note', 'see', 'example', 'page', 'doc', 'docs', 'using', 'used', 'file', 'files', 'true', 'false',
  'null', 'undefined', 'return', 'const', 'let', 'var', 'function', 'class', 'import', 'export', 'from'
]);

/**
 * Normalizes a string into a clean tag slug: "Open Knowledge Format" -> "open-knowledge-format"
 */
export function normalizeEntityToTag(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
}

/**
 * NLP Entity Extraction Engine
 */
export class NlpEntityExtractor {
  private customLexicon: CustomLexiconEntry[] = [];
  private useStored: boolean;

  constructor(options: LexiconConfigOptions = { useStoredLexicon: true }) {
    this.useStored = options.useStoredLexicon ?? true;
    if (options.customEntries) {
      this.customLexicon = [...options.customEntries];
    } else if (this.useStored) {
      this.refreshLexiconFromStorage();
    }
  }

  public setCustomLexicon(entries: CustomLexiconEntry[]): void {
    this.customLexicon = [...entries];
  }

  public registerLexiconEntry(entry: CustomLexiconEntry): void {
    this.customLexicon.push(entry);
  }

  public refreshLexiconFromStorage(): void {
    try {
      this.customLexicon = loadCustomLexicon().filter(e => e.enabled !== false);
    } catch {
      this.customLexicon = [];
    }
  }

  /**
   * Scans a textual block and extracts recognized entities, concepts, people, and orgs.
   */
  public extractFromText(text: string, dynamicLexicon?: CustomLexiconEntry[]): ExtractedEntity[] {
    if (!text || !text.trim()) return [];

    const entitiesMap = new Map<string, ExtractedEntity>();
    const activeLexicon = dynamicLexicon || (this.customLexicon.length > 0 ? this.customLexicon : (this.useStored ? loadCustomLexicon().filter(e => e.enabled !== false) : []));

    // 0. High-Priority Custom Lexicon Matching
    for (const entry of activeLexicon) {
      if (entry.enabled === false) continue;
      const allAliases = [entry.canonicalName, ...(entry.aliases || [])];
      for (const alias of allAliases) {
        if (!alias || alias.trim().length === 0) continue;
        const escaped = alias.trim().replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
        const matches = text.match(regex);
        if (matches && matches.length > 0) {
          const existing = entitiesMap.get(entry.canonicalName);
          const baseSal = entry.baseSalience || 0.85;
          entitiesMap.set(entry.canonicalName, {
            name: entry.canonicalName,
            category: entry.category,
            salience: Math.min(1.0, baseSal + matches.length * 0.05),
            occurrences: (existing?.occurrences || 0) + matches.length,
            normalizedTag: normalizeEntityToTag(entry.canonicalName),
          });
          break; // Matched this entry, move to next
        }
      }
    }

    // 1. Scan for Known People
    for (const [key, formalName] of KNOWN_PEOPLE.entries()) {
      if (entitiesMap.has(formalName)) continue;
      const regex = new RegExp(`\\b${key}\\b`, 'gi');
      const matches = text.match(regex);
      if (matches && matches.length > 0) {
        entitiesMap.set(formalName, {
          name: formalName,
          category: 'person',
          salience: Math.min(1.0, 0.7 + matches.length * 0.1),
          occurrences: matches.length,
          normalizedTag: normalizeEntityToTag(formalName),
        });
      }
    }

    // 2. Scan for Known Organizations
    for (const [key, formalName] of KNOWN_ORGANIZATIONS.entries()) {
      if (entitiesMap.has(formalName)) continue;
      const regex = new RegExp(`\\b${key}\\b`, 'gi');
      const matches = text.match(regex);
      if (matches && matches.length > 0) {
        const existing = entitiesMap.get(formalName);
        entitiesMap.set(formalName, {
          name: formalName,
          category: 'organization',
          salience: Math.min(1.0, 0.65 + matches.length * 0.1),
          occurrences: (existing?.occurrences || 0) + matches.length,
          normalizedTag: normalizeEntityToTag(formalName),
        });
      }
    }

    // 3. Scan for Known Concepts & Protocols
    for (const [key, info] of KNOWN_CONCEPTS_AND_PROTOCOLS.entries()) {
      if (entitiesMap.has(info.name)) continue;
      const regex = new RegExp(`\\b${key.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'gi');
      const matches = text.match(regex);
      if (matches && matches.length > 0) {
        const existing = entitiesMap.get(info.name);
        entitiesMap.set(info.name, {
          name: info.name,
          category: info.category,
          salience: Math.min(1.0, 0.75 + matches.length * 0.1),
          occurrences: (existing?.occurrences || 0) + matches.length,
          normalizedTag: normalizeEntityToTag(info.name),
        });
      }
    }

    // 4. Compromise-Style Tokenization, POS Tagging & Noun Phrase Chunking
    const parsedSentences = compromiseNlp.tokenize(text);
    const extractedNounPhrases = compromiseNlp.extractNounPhrases(parsedSentences);

    for (const phrase of extractedNounPhrases) {
      const candidate = phrase.trim();
      const lower = candidate.toLowerCase();
      if (!STOPWORDS.has(lower) && candidate.length > 3 && !entitiesMap.has(candidate)) {
        entitiesMap.set(candidate, {
          name: candidate,
          category: 'concept',
          salience: 0.65,
          occurrences: 1,
          normalizedTag: normalizeEntityToTag(candidate),
          posTags: ['Noun', 'ProperNoun'],
        });
      }
    }

    // 5. Scan tokens for high-salience individual Acronyms and TechnicalTerms
    for (const sentence of parsedSentences) {
      for (const token of sentence.tokens) {
        if (token.tags.has('Acronym') && !STOPWORDS.has(token.normal) && !entitiesMap.has(token.text)) {
          entitiesMap.set(token.text, {
            name: token.text,
            category: 'protocol',
            salience: 0.7,
            occurrences: 1,
            normalizedTag: normalizeEntityToTag(token.text),
            posTags: Array.from(token.tags),
          });
        } else if (token.tags.has('TechnicalTerm') && !STOPWORDS.has(token.normal) && !entitiesMap.has(token.text)) {
          entitiesMap.set(token.text, {
            name: token.text,
            category: 'technology',
            salience: 0.65,
            occurrences: 1,
            normalizedTag: normalizeEntityToTag(token.text),
            posTags: Array.from(token.tags),
          });
        }
      }
    }

    // 6. Code & Backtick identifiers (e.g. `upsert_points`, `generateContent`)
    const codeRegex = /`([a-zA-Z_][a-zA-Z0-9_-]{2,35})`/g;
    let match: RegExpExecArray | null;
    while ((match = codeRegex.exec(text)) !== null) {
      const ident = match[1].trim();
      if (!STOPWORDS.has(ident.toLowerCase()) && !entitiesMap.has(ident)) {
        entitiesMap.set(ident, {
          name: ident,
          category: 'technology',
          salience: 0.55,
          occurrences: 1,
          normalizedTag: normalizeEntityToTag(ident),
          posTags: ['TechnicalTerm'],
        });
      }
    }

    return Array.from(entitiesMap.values()).sort((a, b) => b.salience - a.salience);
  }

  /**
   * Enriches all MetaAST nodes with extracted NLP entity tags in their `context.customAttributes.tags`.
   */
  public tagMetaASTNodes(nodes: MetaASTNode[], dynamicLexicon?: CustomLexiconEntry[]): {
    taggedNodes: MetaASTNode[];
    documentEntities: ExtractedEntity[];
    globalTags: string[];
  } {
    const globalEntitiesMap = new Map<string, ExtractedEntity>();

    const taggedNodes = nodes.map((node) => {
      // Extract from the node's raw text and active heading
      const textToScan = `${node.context.activeHeading || ''} ${node.rawText}`;
      const nodeEntities = this.extractFromText(textToScan, dynamicLexicon);

      // Collect node tags
      const nodeTags = Array.from(
        new Set([
          ...(node.context.customAttributes?.tags || []),
          ...nodeEntities.map((e) => e.normalizedTag),
        ])
      );

      // Aggregate into document-wide map
      nodeEntities.forEach((entity) => {
        const existing = globalEntitiesMap.get(entity.name);
        if (existing) {
          existing.occurrences += entity.occurrences;
          existing.salience = Math.min(1.0, existing.salience + 0.05);
        } else {
          globalEntitiesMap.set(entity.name, { ...entity });
        }
      });

      // Attach tags directly to the node's context
      const updatedContext: MetaASTContext = {
        ...node.context,
        customAttributes: {
          ...node.context.customAttributes,
          tags: nodeTags,
          extractedEntities: nodeEntities,
        },
      };

      return {
        ...node,
        context: updatedContext,
      };
    });

    const documentEntities = Array.from(globalEntitiesMap.values()).sort(
      (a, b) => b.salience - a.salience
    );
    const globalTags = documentEntities.map((e) => e.normalizedTag);

    return {
      taggedNodes,
      documentEntities,
      globalTags,
    };
  }

  /**
   * Main pipeline entry point: takes raw Markdown, parses to MetaAST, runs NLP entity extraction,
   * tags every AST node, and calculates co-occurrence graph connections.
   */
  public processMarkdown(
    markdown: string,
    documentTitle: string = 'Untitled Document',
    dynamicLexicon?: CustomLexiconEntry[]
  ): DocumentEntityExtractionResult {
    const rawNodes = parseMarkdownToAST(markdown);
    const enrichedNodes = enrichMetaAST(rawNodes, { defaultDocumentTitle: documentTitle });
    const { taggedNodes, documentEntities, globalTags } = this.tagMetaASTNodes(enrichedNodes, dynamicLexicon);

    // Group entities by category
    const entitiesByCategory: Record<EntityCategory, ExtractedEntity[]> = {
      concept: [],
      organization: [],
      person: [],
      protocol: [],
      technology: [],
      metric: [],
    };

    documentEntities.forEach((entity) => {
      if (entitiesByCategory[entity.category]) {
        entitiesByCategory[entity.category].push(entity);
      }
    });

    // Build co-occurrence connection matrix between tags across nodes
    const pairWeights = new Map<string, number>();
    taggedNodes.forEach((node) => {
      const tags: string[] = node.context.customAttributes?.tags || [];
      for (let i = 0; i < tags.length; i++) {
        for (let j = i + 1; j < tags.length; j++) {
          const t1 = tags[i];
          const t2 = tags[j];
          const key = t1 < t2 ? `${t1}|${t2}` : `${t2}|${t1}`;
          pairWeights.set(key, (pairWeights.get(key) || 0) + 1);
        }
      }
    });

    const summaryGraphConnections = Array.from(pairWeights.entries())
      .map(([pair, weight]) => {
        const [sourceTag, targetTag] = pair.split('|');
        return { sourceTag, targetTag, weight };
      })
      .sort((a, b) => b.weight - a.weight);

    return {
      documentTitle,
      globalTags,
      entities: documentEntities,
      entitiesByCategory,
      taggedNodes,
      summaryGraphConnections,
    };
  }
}

export const defaultNlpEntityExtractor = new NlpEntityExtractor();

