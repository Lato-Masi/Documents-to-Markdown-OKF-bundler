/**
 * MetaAST Vector Data Structures & Core Type Definitions
 * 
 * Implements the MetaAST specification schema for Markdown AST nodes,
 * lexical tokens, contextual enrichment metadata, and Vector DB payloads.
 * 
 * Reference: MetaAST Construct (https://metastatic.hexdocs.pm/metast_spec.html)
 */

export type MarkdownBlockNodeType =
  | 'root'
  | 'yaml_frontmatter'
  | 'heading'
  | 'paragraph'
  | 'code_block'
  | 'math_block'
  | 'mermaid_diagram'
  | 'table'
  | 'blockquote'
  | 'list'
  | 'thematic_break'
  | 'html_block';

export type MarkdownInlineNodeType =
  | 'text'
  | 'inline_code'
  | 'inline_math'
  | 'emphasis'
  | 'strong'
  | 'link'
  | 'image'
  | 'html_inline';

export interface SourcePosition {
  start: { line: number; column: number; offset: number };
  end: { line: number; column: number; offset: number };
}

export interface MarkdownLinkRef {
  text: string;
  url: string;
  title?: string;
  isExternal: boolean;
}

export interface MarkdownImageRef {
  alt: string;
  url: string;
  title?: string;
}

export interface MarkdownTableHeader {
  name: string;
  align?: 'left' | 'center' | 'right' | null;
}

export interface MarkdownTableRow {
  cells: string[];
}

export interface MarkdownTableData {
  headers: MarkdownTableHeader[];
  rows: MarkdownTableRow[];
}

/**
 * MetaAST Contextual Enrichment properties.
 * These are calculated and attached during AST traversal and decoration.
 */
export interface MetaASTContext {
  /** Root document title inferred from first H1 or document metadata */
  documentTitle: string;

  /** Hierarchical breadcrumb array from root to current node: ["Doc Title", "Parent H1", "Section H2", "Sub H3"] */
  breadcrumb: string[];

  /** String representation of the breadcrumb hierarchy ("Doc Title > Section > Sub") */
  breadcrumbPath: string;

  /** The closest active heading title governing this node */
  activeHeading: string;

  /** The depth level of the closest heading (1..6) or 0 if top-level */
  activeHeadingLevel: number;

  /** Character count of the raw markdown representation */
  charCount: number;

  /** Estimated token count (~4 characters per token heuristic or exact lexer count) */
  estimatedTokens: number;

  /** Extracted inline or reference links inside this node and its descendants */
  outgoingLinks: MarkdownLinkRef[];

  /** Extracted images inside this node */
  images: MarkdownImageRef[];

  /** If this block contains code, the recognized programming language (e.g., 'typescript', 'python') */
  codeLanguage?: string;

  /** For YAML frontmatter, parsed key-value properties */
  frontmatterAttributes?: Record<string, any>;

  /** Custom arbitrary metadata annotations */
  customAttributes?: Record<string, any>;
}

/**
 * Full MetaAST Node definition.
 * Models Markdown blocks and inlines with precise source mapping and contextual metadata.
 */
export interface MetaASTNode {
  /** Unique deterministic node identifier */
  id: string;

  /** Structural node type */
  type: MarkdownBlockNodeType | MarkdownInlineNodeType;

  /** Exact raw markdown source string corresponding to this node */
  rawText: string;

  /** Source line and character coordinates */
  position?: SourcePosition;

  /** Heading depth (1..6) for heading nodes */
  depth?: number;

  /** Programming language tag for code_blocks */
  language?: string;

  /** Raw code/math/mermaid string inside fences without the enclosing backticks */
  content?: string;

  /** Parsed table structure for table nodes */
  tableData?: MarkdownTableData;

  /** Ordered or unordered for list nodes */
  ordered?: boolean;

  /** MetaAST enrichment metadata container */
  context: MetaASTContext;

  /** Nested child AST nodes */
  children?: MetaASTNode[];
}

/**
 * Vector Database Chunk & Payload schema.
 * Formatted for embedding generation and hybrid search storage across vector databases
 * (Pinecone, Qdrant, Milvus, Chroma, pgvector, Weaviate).
 */
export interface VectorChunkPayload {
  /** Deterministic chunk ID (e.g., "doc_chunk_1") */
  id: string;

  /** 
   * Text specifically prepared for the Vector Embedding Model.
   * Injects document hierarchy, breadcrumbs, and metadata headers so semantic
   * search understands the exact structural context of the chunk.
   */
  embeddingText: string;

  /**
   * The clean, original Markdown snippet returned to LLMs during RAG retrieval.
   */
  markdownContent: string;

  /**
   * Structured metadata attributes indexed for hybrid filtering and faceted vector queries.
   */
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

/**
 * Configuration options for the Vector Chunking pipeline.
 */
export interface VectorChunkOptions {
  /** Target token budget per chunk (default: 800 tokens, ~3200 characters) */
  maxTokensPerChunk?: number;

  /** Minimum token threshold before flushing a chunk on major heading breaks (default: 150 tokens) */
  minHeadingFlushTokens?: number;

  /** Fallback document title if no H1 or frontmatter title is detected */
  defaultDocumentTitle?: string;

  /** Whether to inject YAML frontmatter attributes into chunk metadata (default: true) */
  includeFrontmatterInChunks?: boolean;

  /** Custom chunk ID prefix (default: "chunk") */
  chunkIdPrefix?: string;

  /** Extra custom attributes to attach to all resulting chunks */
  extraMetadata?: Record<string, any>;
}
