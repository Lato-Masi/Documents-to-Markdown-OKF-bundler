/**
 * Rule-Enforcing Vector Chunk Generator & Storage Payload Builder
 * 
 * Implements Phase 4 of the MetaAST vector database ingestion pipeline:
 * - Packs MetaAST nodes into token-budgeted chunks
 * - Enforces element atomicity (Code Blocks, Math, Mermaid never severed)
 * - Table Slicing with repeated Header Preservation
 * - Dual-layer output generation:
 *     1. Context-enriched `embeddingText` for high-precision semantic search
 *     2. Clean `markdownContent` for LLM prompt injection
 * - Structured metadata generation for hybrid vector databases
 */

import {
  MetaASTNode,
  VectorChunkPayload,
  VectorChunkOptions,
  MarkdownLinkRef,
  MarkdownImageRef,
} from './types';
import { parseMarkdownToAST } from './lexerAndParser';
import { enrichMetaAST } from './enricher';
import { defaultNlpEntityExtractor } from '../nlpEntityExtractor';

export class MetaASTVectorChunker {
  private maxTokens: number;
  private minHeadingFlushTokens: number;
  private defaultTitle: string;
  private includeFrontmatter: boolean;
  private chunkIdPrefix: string;
  private extraMetadata: Record<string, any>;

  constructor(options: VectorChunkOptions = {}) {
    this.maxTokens = options.maxTokensPerChunk || 800; // ~3200 chars
    this.minHeadingFlushTokens = options.minHeadingFlushTokens || 150;
    this.defaultTitle = options.defaultDocumentTitle || 'Untitled Document';
    this.includeFrontmatter = options.includeFrontmatterInChunks ?? true;
    this.chunkIdPrefix = options.chunkIdPrefix || 'chunk';
    this.extraMetadata = options.extraMetadata || {};
  }

  /**
   * Main entry point: transforms raw Markdown or enriched MetaAST nodes into vector DB payloads
   */
  public chunk(input: string | MetaASTNode[]): VectorChunkPayload[] {
    let enrichedNodes: MetaASTNode[];

    if (typeof input === 'string') {
      const rawNodes = parseMarkdownToAST(input);
      const baseEnriched = enrichMetaAST(rawNodes, {
        defaultDocumentTitle: this.defaultTitle,
        customAttributes: this.extraMetadata,
      });
      const nlpTagged = defaultNlpEntityExtractor.tagMetaASTNodes(baseEnriched);
      enrichedNodes = nlpTagged.taggedNodes;
    } else {
      enrichedNodes = input;
    }

    if (!enrichedNodes || enrichedNodes.length === 0) {
      return [];
    }

    const chunks: VectorChunkPayload[] = [];
    let currentBatch: MetaASTNode[] = [];
    let currentTokenCount = 0;

    const flushBatch = () => {
      if (currentBatch.length === 0) return;

      const chunkPayload = this.buildChunkPayload(currentBatch, chunks.length);
      chunks.push(chunkPayload);

      currentBatch = [];
      currentTokenCount = 0;
    };

    for (const node of enrichedNodes) {
      // Skip frontmatter from standard chunks if configured, though metadata remains
      if (node.type === 'yaml_frontmatter' && !this.includeFrontmatter) {
        continue;
      }

      const nodeTokens = node.context.estimatedTokens;

      // RULE 1: Major Heading Boundary Flush (H1 or H2)
      // When a new major section begins and we already have accumulated enough context
      if (
        node.type === 'heading' &&
        node.depth !== undefined &&
        node.depth <= 2 &&
        currentTokenCount >= this.minHeadingFlushTokens
      ) {
        flushBatch();
      }

      // RULE 2: Oversized Single Node Handling
      if (nodeTokens > this.maxTokens) {
        flushBatch(); // Flush any pending nodes first

        // Sub-rule 2a: Oversized Tables -> Slice rows & Repeat Header
        if (node.type === 'table') {
          const slicedTableNodes = this.sliceOversizedTable(node, this.maxTokens);
          for (const subNode of slicedTableNodes) {
            currentBatch = [subNode];
            flushBatch();
          }
          continue;
        }

        // Sub-rule 2b: Code Block / Math / Mermaid / Long Paragraph
        // Atomic push: emit dedicated single-node chunk to preserve syntax integrity
        currentBatch = [node];
        flushBatch();
        continue;
      }

      // RULE 3: Token Budget Exceeded -> Flush and start new chunk
      if (currentTokenCount + nodeTokens > this.maxTokens) {
        flushBatch();
      }

      currentBatch.push(node);
      currentTokenCount += nodeTokens;
    }

    // Flush any remaining nodes
    flushBatch();

    // Final pass: Update totalChunks across all items
    const total = chunks.length;
    chunks.forEach((chunk, idx) => {
      chunk.metadata.chunkIndex = idx;
      chunk.metadata.totalChunks = total;
    });

    return chunks;
  }

  /**
   * Slices a large Markdown table into smaller chunks, repeating the table header on every slice.
   */
  private sliceOversizedTable(tableNode: MetaASTNode, maxTokens: number): MetaASTNode[] {
    const lines = tableNode.rawText.split('\n').filter(l => l.trim().length > 0);
    if (lines.length <= 3) {
      return [tableNode];
    }

    const headerLine = lines[0];
    const dividerLine = lines[1] || '|---|---|';
    const dataRows = lines.slice(2);

    const baseHeaderChars = headerLine.length + dividerLine.length + 2;
    const maxCharsPerTable = maxTokens * 4;

    const subNodes: MetaASTNode[] = [];
    let currentRows: string[] = [];
    let currentChars = baseHeaderChars;

    for (const row of dataRows) {
      if (currentChars + row.length > maxCharsPerTable && currentRows.length > 0) {
        const subTableText = [headerLine, dividerLine, ...currentRows].join('\n');
        subNodes.push({
          ...tableNode,
          id: `${tableNode.id}_slice_${subNodes.length}`,
          rawText: subTableText,
          context: {
            ...tableNode.context,
            charCount: subTableText.length,
            estimatedTokens: Math.ceil(subTableText.length / 4),
          },
        });
        currentRows = [];
        currentChars = baseHeaderChars;
      }

      currentRows.push(row);
      currentChars += row.length + 1;
    }

    if (currentRows.length > 0) {
      const subTableText = [headerLine, dividerLine, ...currentRows].join('\n');
      subNodes.push({
        ...tableNode,
        id: `${tableNode.id}_slice_${subNodes.length}`,
        rawText: subTableText,
        context: {
          ...tableNode.context,
          charCount: subTableText.length,
          estimatedTokens: Math.ceil(subTableText.length / 4),
        },
      });
    }

    return subNodes;
  }

  /**
   * Builds the dual-layer VectorChunkPayload from a batch of MetaAST nodes.
   */
  private buildChunkPayload(batch: MetaASTNode[], chunkIndex: number): VectorChunkPayload {
    const firstNode = batch[0];
    const docTitle = firstNode.context.documentTitle || this.defaultTitle;
    const breadcrumbList = firstNode.context.breadcrumb || [];
    const breadcrumb = firstNode.context.breadcrumbPath || docTitle;
    const sectionHeading = firstNode.context.activeHeading || docTitle;
    const sectionHeadingLevel = firstNode.context.activeHeadingLevel || 0;

    // 1. Construct Clean Markdown Content (for LLM generation)
    const markdownContent = batch.map(n => n.rawText).join('\n\n');

    // 2. Construct Dual-Layer Embedding Text (with contextual hierarchy for dense vectors)
    let embeddingHeader = `Document: ${docTitle}`;
    if (breadcrumb && breadcrumb !== docTitle) {
      embeddingHeader += `\nPath: ${breadcrumb}`;
    }
    if (firstNode.context.frontmatterAttributes) {
      const tags = firstNode.context.frontmatterAttributes.tags;
      if (tags) {
        embeddingHeader += `\nTags: ${Array.isArray(tags) ? tags.join(', ') : tags}`;
      }
    }
    // Collect any NLP-extracted tags from the nodes in this chunk batch
    const batchTags = Array.from(
      new Set(
        batch.flatMap(n => (n.context.customAttributes?.tags as string[]) || [])
      )
    );
    if (batchTags.length > 0 && !firstNode.context.frontmatterAttributes?.tags) {
      embeddingHeader += `\nEntity Tags: ${batchTags.join(', ')}`;
    }
    const embeddingText = `${embeddingHeader}\n---\n${markdownContent}`;

    // 3. Aggregate Metadata Attributes
    const hasCodeBlock = batch.some(n => n.type === 'code_block');
    const hasTable = batch.some(n => n.type === 'table');
    const hasMath = batch.some(n => n.type === 'math_block');
    const hasMermaid = batch.some(n => n.type === 'mermaid_diagram');

    const codeLanguages = Array.from(
      new Set(
        batch
          .filter(n => n.type === 'code_block' && (n.language || n.context.codeLanguage))
          .map(n => (n.language || n.context.codeLanguage)!.toLowerCase())
      )
    );

    const outgoingLinks = Array.from(
      new Set(
        batch.flatMap(n => (n.context.outgoingLinks || []).map((l: MarkdownLinkRef) => l.url))
      )
    );

    const imageUrls = Array.from(
      new Set(
        batch.flatMap(n => (n.context.images || []).map((img: MarkdownImageRef) => img.url))
      )
    );

    // Determine primary chunk structural type
    let chunkType: 'composite' | 'code' | 'table' | 'math' | 'mermaid' | 'frontmatter' = 'composite';
    if (batch.length === 1) {
      if (firstNode.type === 'code_block') chunkType = 'code';
      else if (firstNode.type === 'table') chunkType = 'table';
      else if (firstNode.type === 'math_block') chunkType = 'math';
      else if (firstNode.type === 'mermaid_diagram') chunkType = 'mermaid';
      else if (firstNode.type === 'yaml_frontmatter') chunkType = 'frontmatter';
    }

    const chunkId = `${this.chunkIdPrefix}_${chunkIndex + 1}`;

    return {
      id: chunkId,
      embeddingText,
      markdownContent,
      metadata: {
        documentTitle: docTitle,
        breadcrumb,
        breadcrumbList,
        sectionHeading,
        sectionHeadingLevel,
        chunkType,
        hasCodeBlock,
        codeLanguages,
        hasTable,
        hasMath,
        hasMermaid,
        outgoingLinks,
        imageUrls,
        charCount: markdownContent.length,
        estimatedTokens: Math.ceil(markdownContent.length / 4),
        chunkIndex,
        totalChunks: 0, // Assigned in the parent loop
        customAttributes: {
          ...this.extraMetadata,
          ...(firstNode.context.frontmatterAttributes || {}),
        },
      },
    };
  }
}

/**
 * Convenience utility to chunk Markdown into vector DB payloads
 */
export function chunkMarkdownForVectorDB(
  markdown: string,
  options: VectorChunkOptions = {}
): VectorChunkPayload[] {
  const chunker = new MetaASTVectorChunker(options);
  return chunker.chunk(markdown);
}
