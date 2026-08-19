/**
 * MetaAST Enrichment Engine
 * 
 * Implements Phase 3 of the MetaAST specification:
 * - Propagates hierarchical ancestry & breadcrumbs (H1 > H2 > H3... tree)
 * - Injects document title resolution (from Frontmatter or top-level H1)
 * - Annotates node contexts with active section headings and heading levels
 * - Aggregates document-level metadata (code languages, links, images, tables)
 * - Enables semantic enrichment before the vector chunk generation phase
 */

import { MetaASTNode, MetaASTContext } from './types';

export interface EnrichmentOptions {
  /** Override fallback document title */
  defaultDocumentTitle?: string;
  /** Custom breadcrumb delimiter (default: " > ") */
  breadcrumbDelimiter?: string;
  /** Custom global attributes to attach to all nodes */
  customAttributes?: Record<string, any>;
}

export class MetaASTEnricher {
  private delimiter: string;
  private defaultTitle: string;
  private customAttributes: Record<string, any>;

  constructor(options: EnrichmentOptions = {}) {
    this.delimiter = options.breadcrumbDelimiter || ' > ';
    this.defaultTitle = options.defaultDocumentTitle || 'Untitled Document';
    this.customAttributes = options.customAttributes || {};
  }

  /**
   * Enriches a flat or hierarchical list of MetaAST nodes with full hierarchical context.
   */
  public enrich(nodes: MetaASTNode[]): MetaASTNode[] {
    if (!nodes || nodes.length === 0) {
      return [];
    }

    // 1. Resolve Document Title
    const documentTitle = this.resolveDocumentTitle(nodes);

    // 2. Heading stack tracks the active path: [{ depth: 1, text: "Title" }, { depth: 2, text: "Section" }]
    const headingStack: { depth: number; text: string }[] = [];

    // Extract frontmatter attributes if present
    const frontmatterNode = nodes.find(n => n.type === 'yaml_frontmatter');
    const frontmatterAttributes = frontmatterNode?.context.frontmatterAttributes;

    return nodes.map(node => {
      // If this node is a heading, update the hierarchy stack
      if (node.type === 'heading' && node.depth !== undefined) {
        const headingText = node.content || node.rawText.replace(/^#{1,6}\s+/, '').replace(/\s+#+$/, '').trim();

        // Pop headings with depth >= current heading depth
        while (
          headingStack.length > 0 &&
          headingStack[headingStack.length - 1].depth >= node.depth
        ) {
          headingStack.pop();
        }

        headingStack.push({ depth: node.depth, text: headingText });
      }

      // Compute current breadcrumb path
      const currentBreadcrumbList = headingStack.map(h => h.text);
      const breadcrumbPath = currentBreadcrumbList.length > 0
        ? currentBreadcrumbList.join(this.delimiter)
        : documentTitle;

      // Active governing heading
      const activeHeading = headingStack.length > 0
        ? headingStack[headingStack.length - 1].text
        : documentTitle;

      const activeHeadingLevel = headingStack.length > 0
        ? headingStack[headingStack.length - 1].depth
        : 0;

      // Enriched context
      const enrichedContext: MetaASTContext = {
        ...node.context,
        documentTitle,
        breadcrumb: [...currentBreadcrumbList],
        breadcrumbPath,
        activeHeading,
        activeHeadingLevel,
        frontmatterAttributes: frontmatterAttributes || node.context.frontmatterAttributes,
        customAttributes: {
          ...this.customAttributes,
          ...node.context.customAttributes,
        },
      };

      return {
        ...node,
        context: enrichedContext,
      };
    });
  }

  /**
   * Resolves the primary document title by inspecting:
   * 1. YAML frontmatter `title`
   * 2. First H1 heading (`# Title`)
   * 3. Fallback default title
   */
  private resolveDocumentTitle(nodes: MetaASTNode[]): string {
    // Check YAML frontmatter
    const frontmatterNode = nodes.find(n => n.type === 'yaml_frontmatter');
    if (frontmatterNode?.context.frontmatterAttributes?.title) {
      return String(frontmatterNode.context.frontmatterAttributes.title).trim();
    }

    // Check first H1 heading
    const firstH1 = nodes.find(n => n.type === 'heading' && n.depth === 1);
    if (firstH1) {
      const headingText = firstH1.content || firstH1.rawText.replace(/^#\s+/, '').replace(/\s+#+$/, '').trim();
      if (headingText) {
        return headingText;
      }
    }

    return this.defaultTitle;
  }
}

/**
 * Convenience function to enrich AST nodes
 */
export function enrichMetaAST(
  nodes: MetaASTNode[],
  options: EnrichmentOptions = {}
): MetaASTNode[] {
  const enricher = new MetaASTEnricher(options);
  return enricher.enrich(nodes);
}
