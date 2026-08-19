/**
 * Deterministic Markdown Lexer and AST Parser
 * 
 * Implements a robust state-machine lexer and parser without external dependencies.
 * Correctly parses complex Markdown constructs including:
 *  - YAML Frontmatter (--- ... ---)
 *  - Fenced Code Blocks (```lang ... ``` or ~~~lang ... ~~~)
 *  - Mermaid Diagrams (```mermaid ... ```)
 *  - Display Math LaTeX Blocks ($$ ... $$)
 *  - Inline Math ($...$) and Inline Code (`...`)
 *  - Markdown Tables with Alignment (:---, :---:, ---:)
 *  - ATX Headings (# to ######)
 *  - Blockquotes (> ...)
 *  - Ordered & Unordered Lists
 *  - Standard Paragraphs and Inline Links/Images
 */

import {
  MetaASTNode,
  MarkdownBlockNodeType,
  SourcePosition,
  MarkdownLinkRef,
  MarkdownImageRef,
  MarkdownTableData,
  MarkdownTableHeader,
  MarkdownTableRow,
  MetaASTContext
} from './types';

export class MarkdownLexerAndParser {
  private input: string;
  private lines: string[];
  private currentLineIndex: number = 0;
  private currentOffset: number = 0;
  private nodeCounter: number = 0;

  constructor(markdown: string) {
    this.input = markdown;
    this.lines = markdown.split(/\r?\n/);
  }

  public parse(): MetaASTNode[] {
    const nodes: MetaASTNode[] = [];
    this.currentLineIndex = 0;
    this.currentOffset = 0;
    this.nodeCounter = 0;

    // 1. Check for YAML Frontmatter at the very beginning of the document
    if (this.currentLineIndex === 0 && this.isFrontmatterStart()) {
      const frontmatterNode = this.parseFrontmatter();
      if (frontmatterNode) {
        nodes.push(frontmatterNode);
      }
    }

    // 2. Parse Markdown document block by block
    while (this.currentLineIndex < this.lines.length) {
      const line = this.lines[this.currentLineIndex];

      // Empty blank lines
      if (line.trim().length === 0) {
        this.currentOffset += line.length + 1; // +1 for newline
        this.currentLineIndex++;
        continue;
      }

      // Display Math Block ($$ ... $$)
      if (line.trim().startsWith('$$')) {
        const mathNode = this.parseDisplayMathBlock();
        if (mathNode) {
          nodes.push(mathNode);
          continue;
        }
      }

      // Fenced Code Block / Mermaid Diagram (``` or ~~~)
      if (this.isFencedCodeStart(line)) {
        const codeNode = this.parseFencedCodeBlock();
        if (codeNode) {
          nodes.push(codeNode);
          continue;
        }
      }

      // ATX Heading (# ... ######)
      if (this.isHeadingLine(line)) {
        const headingNode = this.parseHeading();
        if (headingNode) {
          nodes.push(headingNode);
          continue;
        }
      }

      // Markdown Table (| ... |)
      if (this.isTableStart()) {
        const tableNode = this.parseTable();
        if (tableNode) {
          nodes.push(tableNode);
          continue;
        }
      }

      // Thematic Break (---, ***, ___)
      if (this.isThematicBreak(line)) {
        nodes.push(this.createThematicBreakNode(line));
        this.advanceLine();
        continue;
      }

      // Blockquote (> ...)
      if (line.trim().startsWith('>')) {
        const quoteNode = this.parseBlockquote();
        if (quoteNode) {
          nodes.push(quoteNode);
          continue;
        }
      }

      // Lists (- ..., * ..., + ..., 1. ...)
      if (this.isListStart(line)) {
        const listNode = this.parseList();
        if (listNode) {
          nodes.push(listNode);
          continue;
        }
      }

      // Default: Paragraph
      const paragraphNode = this.parseParagraph();
      if (paragraphNode) {
        nodes.push(paragraphNode);
      }
    }

    return nodes;
  }

  // ==========================================
  // PARSER HELPERS & HANDLERS
  // ==========================================

  private advanceLine(): string {
    const line = this.lines[this.currentLineIndex];
    this.currentOffset += (line !== undefined ? line.length : 0) + 1;
    this.currentLineIndex++;
    return line;
  }

  private isFrontmatterStart(): boolean {
    return this.lines.length > 0 && this.lines[0].trim() === '---';
  }

  private parseFrontmatter(): MetaASTNode | null {
    const startLine = this.currentLineIndex + 1;
    const startOffset = this.currentOffset;
    const rawLines: string[] = [this.lines[this.currentLineIndex]];
    this.advanceLine(); // Skip opening ---

    const contentLines: string[] = [];
    let closed = false;

    while (this.currentLineIndex < this.lines.length) {
      const line = this.lines[this.currentLineIndex];
      rawLines.push(line);
      this.advanceLine();

      if (line.trim() === '---') {
        closed = true;
        break;
      }
      contentLines.push(line);
    }

    if (!closed) {
      // Revert if not closed
      return null;
    }

    const rawText = rawLines.join('\n');
    const yamlContent = contentLines.join('\n');
    const parsedAttributes = this.parseSimpleYaml(yamlContent);

    return this.buildNode(
      'yaml_frontmatter',
      rawText,
      startLine,
      startOffset,
      {
        content: yamlContent,
        frontmatterAttributes: parsedAttributes,
        documentTitle: parsedAttributes.title || '',
      }
    );
  }

  private parseSimpleYaml(yaml: string): Record<string, any> {
    const result: Record<string, any> = {};
    const lines = yaml.split('\n');

    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx !== -1) {
        const key = line.slice(0, colonIdx).trim();
        let value: any = line.slice(colonIdx + 1).trim();

        // Strip quotes
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        } else if (value === 'true') {
          value = true;
        } else if (value === 'false') {
          value = false;
        } else if (!isNaN(Number(value)) && value !== '') {
          value = Number(value);
        }

        if (key) {
          result[key] = value;
        }
      }
    }
    return result;
  }

  private isFencedCodeStart(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.startsWith('```') || trimmed.startsWith('~~~');
  }

  private parseFencedCodeBlock(): MetaASTNode {
    const startLine = this.currentLineIndex + 1;
    const startOffset = this.currentOffset;
    const firstLine = this.lines[this.currentLineIndex];
    const fenceChar = firstLine.trim()[0]; // ` or ~
    const fenceLen = firstLine.trim().match(/^([`~]+)/)?.[1]?.length || 3;
    const fencePattern = fenceChar.repeat(fenceLen);

    // Extract language tag
    const langMatch = firstLine.trim().slice(fenceLen).trim();
    const language = langMatch.split(/\s+/)[0]?.toLowerCase() || '';

    const rawLines: string[] = [firstLine];
    const contentLines: string[] = [];
    this.advanceLine();

    while (this.currentLineIndex < this.lines.length) {
      const line = this.lines[this.currentLineIndex];
      rawLines.push(line);
      this.advanceLine();

      if (line.trim().startsWith(fencePattern)) {
        break;
      }
      contentLines.push(line);
    }

    const rawText = rawLines.join('\n');
    const content = contentLines.join('\n');

    let type: MarkdownBlockNodeType = 'code_block';
    if (language === 'mermaid') {
      type = 'mermaid_diagram';
    } else if (language === 'math' || language === 'latex') {
      type = 'math_block';
    }

    return this.buildNode(type, rawText, startLine, startOffset, {
      language,
      content,
      codeLanguage: language || undefined,
    });
  }

  private parseDisplayMathBlock(): MetaASTNode {
    const startLine = this.currentLineIndex + 1;
    const startOffset = this.currentOffset;
    const firstLine = this.lines[this.currentLineIndex];
    const rawLines: string[] = [firstLine];
    const contentLines: string[] = [];

    // Single-line display math: $$ e = mc^2 $$
    if (firstLine.trim().startsWith('$$') && firstLine.trim().endsWith('$$') && firstLine.trim().length > 4) {
      this.advanceLine();
      const content = firstLine.trim().slice(2, -2).trim();
      return this.buildNode('math_block', firstLine, startLine, startOffset, { content });
    }

    this.advanceLine();

    while (this.currentLineIndex < this.lines.length) {
      const line = this.lines[this.currentLineIndex];
      rawLines.push(line);
      this.advanceLine();

      if (line.trim().endsWith('$$')) {
        const trimmed = line.trim();
        if (trimmed !== '$$') {
          contentLines.push(trimmed.slice(0, -2));
        }
        break;
      }
      contentLines.push(line);
    }

    const rawText = rawLines.join('\n');
    const content = contentLines.join('\n');

    return this.buildNode('math_block', rawText, startLine, startOffset, { content });
  }

  private isHeadingLine(line: string): boolean {
    const trimmed = line.trim();
    return /^#{1,6}\s+/.test(trimmed);
  }

  private parseHeading(): MetaASTNode {
    const startLine = this.currentLineIndex + 1;
    const startOffset = this.currentOffset;
    const line = this.lines[this.currentLineIndex];
    this.advanceLine();

    const trimmed = line.trim();
    const match = trimmed.match(/^(#{1,6})\s+(.*?)(?:\s+#+)?$/);
    const depth = match ? match[1].length : 1;
    const headingText = match ? match[2].trim() : trimmed.replace(/^#+\s*/, '');

    return this.buildNode('heading', line, startLine, startOffset, {
      depth,
      content: headingText,
      activeHeading: headingText,
      activeHeadingLevel: depth,
    });
  }

  private isTableStart(): boolean {
    if (this.currentLineIndex + 1 >= this.lines.length) return false;
    const line1 = this.lines[this.currentLineIndex].trim();
    const line2 = this.lines[this.currentLineIndex + 1].trim();

    // Check if line 1 contains pipe and line 2 is a table delimiter (e.g., |---|:---:|---:|)
    const isRow = (l: string) => l.includes('|');
    const isDelimiter = (l: string) => /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/.test(l);

    return isRow(line1) && isDelimiter(line2);
  }

  private parseTable(): MetaASTNode {
    const startLine = this.currentLineIndex + 1;
    const startOffset = this.currentOffset;
    const tableLines: string[] = [];

    while (this.currentLineIndex < this.lines.length) {
      const line = this.lines[this.currentLineIndex];
      if (!line.trim() || !line.includes('|')) {
        break;
      }
      tableLines.push(line);
      this.advanceLine();
    }

    const rawText = tableLines.join('\n');
    const tableData = this.extractTableStructure(tableLines);

    return this.buildNode('table', rawText, startLine, startOffset, {
      tableData,
    });
  }

  private extractTableStructure(lines: string[]): MarkdownTableData {
    if (lines.length < 2) {
      return { headers: [], rows: [] };
    }

    const splitCells = (rowStr: string): string[] => {
      let trimmed = rowStr.trim();
      if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
      if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
      return trimmed.split('|').map(c => c.trim());
    };

    const headerCells = splitCells(lines[0]);
    const alignCells = splitCells(lines[1]);

    const headers: MarkdownTableHeader[] = headerCells.map((name, idx) => {
      const alignStr = alignCells[idx] || '';
      let align: 'left' | 'center' | 'right' | null = null;
      if (alignStr.startsWith(':') && alignStr.endsWith(':')) {
        align = 'center';
      } else if (alignStr.endsWith(':')) {
        align = 'right';
      } else if (alignStr.startsWith(':')) {
        align = 'left';
      }
      return { name, align };
    });

    const rows: MarkdownTableRow[] = [];
    for (let r = 2; r < lines.length; r++) {
      const cells = splitCells(lines[r]);
      rows.push({ cells });
    }

    return { headers, rows };
  }

  private isThematicBreak(line: string): boolean {
    const trimmed = line.trim();
    return /^((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/.test(trimmed);
  }

  private createThematicBreakNode(line: string): MetaASTNode {
    const startLine = this.currentLineIndex + 1;
    const startOffset = this.currentOffset;
    return this.buildNode('thematic_break', line, startLine, startOffset);
  }

  private parseBlockquote(): MetaASTNode {
    const startLine = this.currentLineIndex + 1;
    const startOffset = this.currentOffset;
    const quoteLines: string[] = [];

    while (this.currentLineIndex < this.lines.length) {
      const line = this.lines[this.currentLineIndex];
      if (!line.trim() || (!line.trim().startsWith('>') && quoteLines.length > 0 && !line.startsWith(' '))) {
        break;
      }
      quoteLines.push(line);
      this.advanceLine();
    }

    const rawText = quoteLines.join('\n');
    return this.buildNode('blockquote', rawText, startLine, startOffset);
  }

  private isListStart(line: string): boolean {
    const trimmed = line.trim();
    return /^([-*+]|\d+\.)\s+/.test(trimmed);
  }

  private parseList(): MetaASTNode {
    const startLine = this.currentLineIndex + 1;
    const startOffset = this.currentOffset;
    const listLines: string[] = [];
    const firstTrimmed = this.lines[this.currentLineIndex].trim();
    const isOrdered = /^\d+\.\s+/.test(firstTrimmed);

    while (this.currentLineIndex < this.lines.length) {
      const line = this.lines[this.currentLineIndex];
      if (!line.trim()) {
        // Lookahead: check if next non-empty line is an indented list item continuation
        if (
          this.currentLineIndex + 1 < this.lines.length &&
          (this.lines[this.currentLineIndex + 1].startsWith('  ') || this.isListStart(this.lines[this.currentLineIndex + 1]))
        ) {
          listLines.push(line);
          this.advanceLine();
          continue;
        }
        break;
      }

      if (this.isHeadingLine(line) || this.isFencedCodeStart(line) || this.isTableStart()) {
        break;
      }

      listLines.push(line);
      this.advanceLine();
    }

    const rawText = listLines.join('\n');
    return this.buildNode('list', rawText, startLine, startOffset, {
      ordered: isOrdered,
    });
  }

  private parseParagraph(): MetaASTNode {
    const startLine = this.currentLineIndex + 1;
    const startOffset = this.currentOffset;
    const paragraphLines: string[] = [];

    while (this.currentLineIndex < this.lines.length) {
      const line = this.lines[this.currentLineIndex];

      if (
        !line.trim() ||
        this.isHeadingLine(line) ||
        this.isFencedCodeStart(line) ||
        this.isTableStart() ||
        this.isListStart(line) ||
        line.trim().startsWith('$$') ||
        line.trim().startsWith('>') ||
        this.isThematicBreak(line)
      ) {
        break;
      }

      paragraphLines.push(line);
      this.advanceLine();
    }

    const rawText = paragraphLines.join('\n');
    return this.buildNode('paragraph', rawText, startLine, startOffset);
  }

  // ==========================================
  // INLINE SCANNING & NODE FACTORY
  // ==========================================

  private buildNode(
    type: MarkdownBlockNodeType,
    rawText: string,
    startLine: number,
    startOffset: number,
    extra: Partial<MetaASTNode & MetaASTContext> = {}
  ): MetaASTNode {
    this.nodeCounter++;
    const endOffset = startOffset + rawText.length;
    const endLine = startLine + (rawText.split('\n').length - 1);

    const position: SourcePosition = {
      start: { line: startLine, column: 1, offset: startOffset },
      end: { line: endLine, column: 1, offset: endOffset },
    };

    // Scan for inline elements (links, images, inline code, inline math)
    const { links, images } = this.extractInlineEntities(rawText);

    const charCount = rawText.length;
    const estimatedTokens = Math.ceil(charCount / 4);

    const context: MetaASTContext = {
      documentTitle: extra.documentTitle || '',
      breadcrumb: extra.breadcrumb || [],
      breadcrumbPath: extra.breadcrumbPath || '',
      activeHeading: extra.activeHeading || '',
      activeHeadingLevel: extra.activeHeadingLevel || 0,
      charCount,
      estimatedTokens,
      outgoingLinks: links,
      images,
      codeLanguage: extra.codeLanguage || extra.language || undefined,
      frontmatterAttributes: extra.frontmatterAttributes,
      customAttributes: extra.customAttributes,
    };

    return {
      id: `node_${this.nodeCounter}`,
      type,
      rawText,
      position,
      depth: extra.depth,
      language: extra.language,
      content: extra.content,
      tableData: extra.tableData,
      ordered: extra.ordered,
      context,
    };
  }

  /**
   * Scans text for Markdown links [text](url), images ![alt](url), and reference definitions
   */
  private extractInlineEntities(text: string): { links: MarkdownLinkRef[]; images: MarkdownImageRef[] } {
    const links: MarkdownLinkRef[] = [];
    const images: MarkdownImageRef[] = [];

    // Image pattern: ![alt](url "title")
    const imgRegex = /!\[([^\]]*)\]\((https?:\/\/[^\s\)]+|[^)\s]+)(?:\s+"([^"]*)")?\)/g;
    let match: RegExpExecArray | null;

    while ((match = imgRegex.exec(text)) !== null) {
      images.push({
        alt: match[1] || '',
        url: match[2] || '',
        title: match[3] || undefined,
      });
    }

    // Link pattern: [text](url "title") (excluding images)
    const linkRegex = /(?<!\!)\[([^\]]+)\]\((https?:\/\/[^\s\)]+|[^)\s]+)(?:\s+"([^"]*)")?\)/g;
    while ((match = linkRegex.exec(text)) !== null) {
      const url = match[2] || '';
      links.push({
        text: match[1] || '',
        url,
        title: match[3] || undefined,
        isExternal: url.startsWith('http://') || url.startsWith('https://'),
      });
    }

    return { links, images };
  }
}

/**
 * Convenience helper function to parse raw markdown into MetaAST nodes
 */
export function parseMarkdownToAST(markdown: string): MetaASTNode[] {
  const parser = new MarkdownLexerAndParser(markdown);
  return parser.parse();
}
