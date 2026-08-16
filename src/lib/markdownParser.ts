/**
 * Zero-dependency Semantic Markdown AST Parser & Renderer
 *
 * Supports standard Markdown, YAML Frontmatter, Embedded YAML blocks,
 * Mermaid diagrams, KaTeX/LaTeX academic math environments, and AST query/export utilities.
 */

export type ASTNodeType =
  | 'Document'
  | 'YAMLFrontmatter'
  | 'YAMLBlock'
  | 'MermaidBlock'
  | 'Heading'
  | 'Paragraph'
  | 'Blockquote'
  | 'CodeBlock'
  | 'List'
  | 'ListItem'
  | 'Table'
  | 'TableRow'
  | 'TableCell'
  | 'ThematicBreak'
  | 'MathBlock'
  | 'Text'
  | 'Emphasis'
  | 'Strong'
  | 'Strikethrough'
  | 'InlineCode'
  | 'Link'
  | 'Image'
  | 'InlineMath'
  | 'LineBreak';

export interface BaseASTNode {
  type: ASTNodeType;
  id?: string;
}

export interface ASTDocumentNode extends BaseASTNode {
  type: 'Document';
  children: ASTBlockNode[];
  meta: {
    totalNodes: number;
    wordCount: number;
    headingCount: number;
    codeBlockCount: number;
    linkCount: number;
    imageCount: number;
    tableCount: number;
    mathBlockCount: number;
    mermaidCount: number;
    yamlBlockCount: number;
    frontmatter?: Record<string, unknown>;
    laTeXSymbolsUsed: string[];
  };
}

export interface ASTYAMLFrontmatterNode extends BaseASTNode {
  type: 'YAMLFrontmatter';
  raw: string;
  data: Record<string, unknown>;
}

export interface ASTYAMLBlockNode extends BaseASTNode {
  type: 'YAMLBlock';
  raw: string;
  data: Record<string, unknown>;
}

export interface ASTMermaidBlockNode extends BaseASTNode {
  type: 'MermaidBlock';
  diagramType: string;
  code: string;
  nodeCount: number;
}

export interface ASTHeadingNode extends BaseASTNode {
  type: 'Heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  slug: string;
  children: ASTInlineNode[];
}

export interface ASTParagraphNode extends BaseASTNode {
  type: 'Paragraph';
  children: ASTInlineNode[];
}

export interface ASTBlockquoteNode extends BaseASTNode {
  type: 'Blockquote';
  children: ASTBlockNode[];
}

export interface ASTCodeBlockNode extends BaseASTNode {
  type: 'CodeBlock';
  language: string;
  code: string;
}

export interface ASTListNode extends BaseASTNode {
  type: 'List';
  ordered: boolean;
  start?: number;
  items: ASTListItemNode[];
}

export interface ASTListItemNode extends BaseASTNode {
  type: 'ListItem';
  checked: boolean | null; // null for standard list, true/false for task list
  children: (ASTBlockNode | ASTInlineNode)[];
}

export interface ASTTableNode extends BaseASTNode {
  type: 'Table';
  headers: ASTInlineNode[][];
  alignments: ('left' | 'center' | 'right' | 'none')[];
  rows: ASTInlineNode[][][];
}

export interface ASTThematicBreakNode extends BaseASTNode {
  type: 'ThematicBreak';
}

export interface ASTMathBlockNode extends BaseASTNode {
  type: 'MathBlock';
  code: string;
  environment?: string; // e.g. equation, align, matrix, cases, etc.
  symbolsUsed: string[];
}

export interface ASTTextNode extends BaseASTNode {
  type: 'Text';
  value: string;
}

export interface ASTEmphasisNode extends BaseASTNode {
  type: 'Emphasis';
  children: ASTInlineNode[];
}

export interface ASTStrongNode extends BaseASTNode {
  type: 'Strong';
  children: ASTInlineNode[];
}

export interface ASTStrikethroughNode extends BaseASTNode {
  type: 'Strikethrough';
  children: ASTInlineNode[];
}

export interface ASTInlineCodeNode extends BaseASTNode {
  type: 'InlineCode';
  value: string;
}

export interface ASTLinkNode extends BaseASTNode {
  type: 'Link';
  url: string;
  title?: string;
  children: ASTInlineNode[];
}

export interface ASTImageNode extends BaseASTNode {
  type: 'Image';
  url: string;
  alt: string;
  title?: string;
}

export interface ASTInlineMathNode extends BaseASTNode {
  type: 'InlineMath';
  value: string;
  symbolsUsed: string[];
}

export interface ASTLineBreakNode extends BaseASTNode {
  type: 'LineBreak';
}

export type ASTInlineNode =
  | ASTTextNode
  | ASTEmphasisNode
  | ASTStrongNode
  | ASTStrikethroughNode
  | ASTInlineCodeNode
  | ASTLinkNode
  | ASTImageNode
  | ASTInlineMathNode
  | ASTLineBreakNode;

export type ASTBlockNode =
  | ASTYAMLFrontmatterNode
  | ASTYAMLBlockNode
  | ASTMermaidBlockNode
  | ASTHeadingNode
  | ASTParagraphNode
  | ASTBlockquoteNode
  | ASTCodeBlockNode
  | ASTListNode
  | ASTTableNode
  | ASTThematicBreakNode
  | ASTMathBlockNode;

export type ASTNode = ASTDocumentNode | ASTBlockNode | ASTListItemNode | ASTInlineNode;

/**
 * Generate a URL-friendly slug from text
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'heading';
}

/**
 * Zero-dependency YAML Key-Value Parser
 * Handles key: value, simple strings, arrays, booleans, and numbers.
 */
export function parseYAML(yamlString: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!yamlString) return result;

  const lines = yamlString.split('\n');
  let currentKey = '';
  let currentArray: unknown[] | null = null;

  for (let line of lines) {
    // strip comments
    const commentIdx = line.indexOf('#');
    if (commentIdx !== -1) {
      line = line.slice(0, commentIdx);
    }
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check array item under key
    if (trimmed.startsWith('- ') && currentKey) {
      const itemVal = parseYAMLValue(trimmed.slice(2).trim());
      if (!currentArray) {
        currentArray = [];
        result[currentKey] = currentArray;
      }
      currentArray.push(itemVal);
      continue;
    }

    // Key-value pair
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx !== -1) {
      const key = trimmed.slice(0, colonIdx).trim();
      const rawVal = trimmed.slice(colonIdx + 1).trim();

      currentKey = key;
      currentArray = null;

      if (rawVal) {
        result[key] = parseYAMLValue(rawVal);
      } else {
        result[key] = null;
      }
    }
  }

  return result;
}

function parseYAMLValue(val: string): unknown {
  if (!val) return null;
  if (val === 'true' || val === 'true') return true;
  if (val === 'false' || val === 'false') return false;
  if (!isNaN(Number(val))) return Number(val);

  // inline array [a, b, c]
  if (val.startsWith('[') && val.endsWith(']')) {
    return val
      .slice(1, -1)
      .split(',')
      .map((s) => s.trim().replace(/^["']|["']$/g, ''));
  }

  // strip quotes
  return val.replace(/^["']|["']$/g, '');
}

/**
 * Detect Mermaid diagram type from raw diagram code
 */
export function detectMermaidDiagramType(code: string): string {
  const trimmed = code.trim().toLowerCase();
  if (trimmed.startsWith('flowchart') || trimmed.startsWith('graph')) return 'flowchart';
  if (trimmed.startsWith('sequencediagram')) return 'sequenceDiagram';
  if (trimmed.startsWith('gantt')) return 'gantt';
  if (trimmed.startsWith('classdiagram')) return 'classDiagram';
  if (trimmed.startsWith('erdiagram')) return 'erDiagram';
  if (trimmed.startsWith('pie')) return 'pie';
  if (trimmed.startsWith('mindmap')) return 'mindmap';
  if (trimmed.startsWith('gitgraph')) return 'gitGraph';
  if (trimmed.startsWith('stateDiagram')) return 'stateDiagram';
  if (trimmed.startsWith('requirementdiagram')) return 'requirementDiagram';
  if (trimmed.startsWith('c4context') || trimmed.startsWith('architecture')) return 'architecture';
  return 'diagram';
}

/**
 * Extract KaTeX / LaTeX macros and symbols from formula string
 */
export function extractLaTeXSymbols(mathString: string): string[] {
  if (!mathString) return [];
  const matches = mathString.match(/\\[a-zA-Z]+/g);
  if (!matches) return [];

  const unique = Array.from(new Set(matches));
  return unique.filter((s) => s !== '\\begin' && s !== '\\end');
}

/**
 * Parse inline Markdown including KaTeX math formulas ($...$ and \(...\))
 */
export function parseInlineMarkdown(text: string): ASTInlineNode[] {
  if (!text) return [];

  const nodes: ASTInlineNode[] = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    // 1. Image: ![alt](url "title")
    if (text[i] === '!' && i + 1 < len && text[i + 1] === '[') {
      const altEnd = text.indexOf(']', i + 2);
      if (altEnd !== -1 && altEnd + 1 < len && text[altEnd + 1] === '(') {
        const urlEnd = text.indexOf(')', altEnd + 2);
        if (urlEnd !== -1) {
          const alt = text.slice(i + 2, altEnd);
          const rawUrl = text.slice(altEnd + 2, urlEnd).trim();
          let url = rawUrl;
          let title: string | undefined = undefined;
          const spaceIdx = rawUrl.indexOf(' ');
          if (spaceIdx !== -1) {
            url = rawUrl.slice(0, spaceIdx);
            title = rawUrl.slice(spaceIdx + 1).replace(/^["']|["']$/g, '');
          }
          nodes.push({ type: 'Image', url, alt, title });
          i = urlEnd + 1;
          continue;
        }
      }
    }

    // 2. Link: [label](url "title")
    if (text[i] === '[') {
      const labelEnd = text.indexOf(']', i + 1);
      if (labelEnd !== -1 && labelEnd + 1 < len && text[labelEnd + 1] === '(') {
        const urlEnd = text.indexOf(')', labelEnd + 2);
        if (urlEnd !== -1) {
          const labelText = text.slice(i + 1, labelEnd);
          const rawUrl = text.slice(labelEnd + 2, urlEnd).trim();
          let url = rawUrl;
          let title: string | undefined = undefined;
          const spaceIdx = rawUrl.indexOf(' ');
          if (spaceIdx !== -1) {
            url = rawUrl.slice(0, spaceIdx);
            title = rawUrl.slice(spaceIdx + 1).replace(/^["']|["']$/g, '');
          }
          nodes.push({
            type: 'Link',
            url,
            title,
            children: parseInlineMarkdown(labelText),
          });
          i = urlEnd + 1;
          continue;
        }
      }
    }

    // 3. Inline Math \( ... \) or $ ... $
    if (text[i] === '\\' && i + 1 < len && text[i + 1] === '(') {
      const mathEnd = text.indexOf('\\)', i + 2);
      if (mathEnd !== -1) {
        const val = text.slice(i + 2, mathEnd);
        nodes.push({
          type: 'InlineMath',
          value: val,
          symbolsUsed: extractLaTeXSymbols(val),
        });
        i = mathEnd + 2;
        continue;
      }
    }

    if (text[i] === '$' && (i === 0 || text[i - 1] !== '\\')) {
      const mathEnd = text.indexOf('$', i + 1);
      if (mathEnd !== -1 && mathEnd > i + 1) {
        const val = text.slice(i + 1, mathEnd);
        nodes.push({
          type: 'InlineMath',
          value: val,
          symbolsUsed: extractLaTeXSymbols(val),
        });
        i = mathEnd + 1;
        continue;
      }
    }

    // 4. Inline Code: `code`
    if (text[i] === '`') {
      const codeEnd = text.indexOf('`', i + 1);
      if (codeEnd !== -1) {
        const value = text.slice(i + 1, codeEnd);
        if (!value.includes('\n')) {
          nodes.push({ type: 'InlineCode', value });
          i = codeEnd + 1;
          continue;
        }
      }
    }

    // 5. Strikethrough: ~~text~~
    if (text[i] === '~' && i + 1 < len && text[i + 1] === '~') {
      const end = text.indexOf('~~', i + 2);
      if (end !== -1) {
        const content = text.slice(i + 2, end);
        if (!content.includes('\n')) {
          nodes.push({
            type: 'Strikethrough',
            children: parseInlineMarkdown(content),
          });
          i = end + 2;
          continue;
        }
      }
    }

    // 6. Strong: **text** or __text__
    if (
      (text[i] === '*' && i + 1 < len && text[i + 1] === '*') ||
      (text[i] === '_' && i + 1 < len && text[i + 1] === '_')
    ) {
      const delim = text.slice(i, i + 2);
      const end = text.indexOf(delim, i + 2);
      if (end !== -1) {
        const content = text.slice(i + 2, end);
        if (!content.includes('\n')) {
          nodes.push({
            type: 'Strong',
            children: parseInlineMarkdown(content),
          });
          i = end + 2;
          continue;
        }
      }
    }

    // 7. Emphasis: *text* or _text_
    if (text[i] === '*' || text[i] === '_') {
      const delim = text[i];
      const end = text.indexOf(delim, i + 1);
      if (end !== -1 && end > i + 1) {
        const content = text.slice(i + 1, end);
        if (!content.includes('\n')) {
          nodes.push({
            type: 'Emphasis',
            children: parseInlineMarkdown(content),
          });
          i = end + 1;
          continue;
        }
      }
    }

    // 8. Line break
    if (text[i] === '\n') {
      nodes.push({ type: 'LineBreak' });
      i++;
      continue;
    }

    // 9. Plain text
    let nextSpecial = text.length;
    const specials = ['!', '[', '\\', '`', '$', '~', '*', '_', '\n'];
    for (const spec of specials) {
      const idx = text.indexOf(spec, i + 1);
      if (idx !== -1 && idx < nextSpecial) {
        nextSpecial = idx;
      }
    }

    const plainText = text.slice(i, nextSpecial);
    if (plainText) {
      nodes.push({ type: 'Text', value: plainText });
      i = nextSpecial;
    } else {
      nodes.push({ type: 'Text', value: text[i] });
      i++;
    }
  }

  return mergeTextNodes(nodes);
}

/**
 * Merge adjacent text nodes for clean AST representation
 */
function mergeTextNodes(nodes: ASTInlineNode[]): ASTInlineNode[] {
  const result: ASTInlineNode[] = [];
  for (const node of nodes) {
    const prev = result[result.length - 1];
    if (node.type === 'Text' && prev && prev.type === 'Text') {
      prev.value += node.value;
    } else {
      result.push(node);
    }
  }
  return result;
}

/**
 * Extract plain text string from AST inline nodes
 */
export function inlineASTToText(nodes: ASTInlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'Text':
        case 'InlineCode':
        case 'InlineMath':
          return node.value;
        case 'Emphasis':
        case 'Strong':
        case 'Strikethrough':
        case 'Link':
          return inlineASTToText(node.children);
        case 'Image':
          return node.alt;
        case 'LineBreak':
          return ' ';
        default:
          return '';
      }
    })
    .join('');
}

/**
 * Main AST Parser: converts raw Markdown into ASTDocumentNode
 */
export function parseMarkdownToAST(markdown: string): ASTDocumentNode {
  const cleanInput = (markdown || '').replace(/\r\n/g, '\n');
  const lines = cleanInput.split('\n');
  const blocks: ASTBlockNode[] = [];

  let lineIdx = 0;
  const totalLines = lines.length;
  let docFrontmatter: Record<string, unknown> | undefined = undefined;

  // 0. YAML Frontmatter check (Top of document starting with ---)
  if (totalLines > 0 && lines[0].trim() === '---') {
    lineIdx = 1;
    const fmLines: string[] = [];
    while (lineIdx < totalLines && lines[lineIdx].trim() !== '---' && lines[lineIdx].trim() !== '...') {
      fmLines.push(lines[lineIdx]);
      lineIdx++;
    }
    if (lineIdx < totalLines) {
      lineIdx++; // consume closing --- or ...
      const rawFm = fmLines.join('\n');
      const parsedFm = parseYAML(rawFm);
      docFrontmatter = parsedFm;
      blocks.push({
        type: 'YAMLFrontmatter',
        raw: rawFm,
        data: parsedFm,
      });
    } else {
      // Unclosed frontmatter, reset lineIdx
      lineIdx = 0;
    }
  }

  while (lineIdx < totalLines) {
    const line = lines[lineIdx];
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      lineIdx++;
      continue;
    }

    // 1. Math Block $$ or \[ ... \] or \begin{env} ... \end{env}
    if (trimmed.startsWith('$$') || trimmed.startsWith('\\[') || trimmed.startsWith('\\begin{')) {
      let code = '';
      let envName: string | undefined = undefined;

      if (trimmed.startsWith('\\begin{')) {
        const envMatch = trimmed.match(/^\\begin\{([a-zA-Z0-9*]+)\}/);
        if (envMatch) envName = envMatch[1];
      }

      if (trimmed.startsWith('$$') && trimmed.length > 2 && trimmed.endsWith('$$')) {
        code = trimmed.slice(2, -2).trim();
        lineIdx++;
      } else {
        const startLine = lines[lineIdx];
        lineIdx++;
        const mathLines: string[] = [startLine];

        while (lineIdx < totalLines) {
          const l = lines[lineIdx];
          const lt = l.trim();
          mathLines.push(l);
          lineIdx++;

          if (
            (lt.endsWith('$$') && lt !== '$$') ||
            lt === '$$' ||
            lt.endsWith('\\]') ||
            (envName && lt.includes(`\\end{${envName}}`))
          ) {
            break;
          }
        }
        code = mathLines.join('\n').replace(/^(\$\$|\\\[)|(\$\$|\\\])$/g, '').trim();
      }

      blocks.push({
        type: 'MathBlock',
        code,
        environment: envName,
        symbolsUsed: extractLaTeXSymbols(code),
      });
      continue;
    }

    // 2. Fenced Code Block ```
    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim().toLowerCase();
      lineIdx++;
      const codeLines: string[] = [];
      while (lineIdx < totalLines && !lines[lineIdx].trim().startsWith('```')) {
        codeLines.push(lines[lineIdx]);
        lineIdx++;
      }
      if (lineIdx < totalLines) lineIdx++; // consume closing ```
      const fullCode = codeLines.join('\n');

      // Embedded YAML Block
      if (language === 'yaml' || language === 'yml') {
        blocks.push({
          type: 'YAMLBlock',
          raw: fullCode,
          data: parseYAML(fullCode),
        });
        continue;
      }

      // Embedded Mermaid Diagram
      if (language === 'mermaid') {
        const diagType = detectMermaidDiagramType(fullCode);
        const nodeMatches = fullCode.match(/-->|---|==>|\||\)->/g);
        blocks.push({
          type: 'MermaidBlock',
          diagramType: diagType,
          code: fullCode,
          nodeCount: nodeMatches ? nodeMatches.length + 1 : fullCode.split('\n').length,
        });
        continue;
      }

      blocks.push({
        type: 'CodeBlock',
        language,
        code: fullCode,
      });
      continue;
    }

    // 3. Headings # .. ######
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6;
      const text = headingMatch[2].trim();
      const inlineChildren = parseInlineMarkdown(text);
      blocks.push({
        type: 'Heading',
        level,
        text,
        slug: slugify(text),
        children: inlineChildren,
      });
      lineIdx++;
      continue;
    }

    // 4. Thematic Break (--- or *** or ___)
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: 'ThematicBreak' });
      lineIdx++;
      continue;
    }

    // 5. Blockquote >
    if (trimmed.startsWith('>')) {
      const bqLines: string[] = [];
      while (lineIdx < totalLines && lines[lineIdx].trim().startsWith('>')) {
        bqLines.push(lines[lineIdx].trim().replace(/^>\s?/, ''));
        lineIdx++;
      }
      const innerDoc = parseMarkdownToAST(bqLines.join('\n'));
      blocks.push({
        type: 'Blockquote',
        children: innerDoc.children,
      });
      continue;
    }

    // 6. Tables (| col1 | col2 |)
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && lineIdx + 1 < totalLines) {
      const nextTrimmed = lines[lineIdx + 1].trim();
      if (nextTrimmed.startsWith('|') && nextTrimmed.includes('-')) {
        const headerCells = trimmed
          .split('|')
          .slice(1, -1)
          .map((c) => parseInlineMarkdown(c.trim()));

        const alignCells = nextTrimmed.split('|').slice(1, -1);
        const alignments: ('left' | 'center' | 'right' | 'none')[] = alignCells.map((c) => {
          const t = c.trim();
          if (t.startsWith(':') && t.endsWith(':')) return 'center';
          if (t.endsWith(':')) return 'right';
          if (t.startsWith(':')) return 'left';
          return 'none';
        });

        lineIdx += 2; // skip header and delimiter line
        const rows: ASTInlineNode[][][] = [];

        while (lineIdx < totalLines && lines[lineIdx].trim().startsWith('|')) {
          const rowCells = lines[lineIdx]
            .trim()
            .split('|')
            .slice(1, -1)
            .map((c) => parseInlineMarkdown(c.trim()));
          rows.push(rowCells);
          lineIdx++;
        }

        blocks.push({
          type: 'Table',
          headers: headerCells,
          alignments,
          rows,
        });
        continue;
      }
    }

    // 7. Lists (Ordered or Unordered)
    const listMatch = trimmed.match(/^(\d+\.|[-*+])\s+(.+)$/);
    if (listMatch) {
      const isOrdered = /^\d+\./.test(listMatch[1]);
      const startNum = isOrdered ? parseInt(listMatch[1], 10) : undefined;
      const items: ASTListItemNode[] = [];

      while (lineIdx < totalLines) {
        const curTrimmed = lines[lineIdx].trim();
        const curMatch = curTrimmed.match(/^(\d+\.|[-*+])\s+(.+)$/);
        if (!curMatch) break;

        const itemContent = curMatch[2].trim();
        let checked: boolean | null = null;
        let finalContent = itemContent;

        if (itemContent.startsWith('[ ] ')) {
          checked = false;
          finalContent = itemContent.slice(4);
        } else if (itemContent.startsWith('[x] ') || itemContent.startsWith('[X] ')) {
          checked = true;
          finalContent = itemContent.slice(4);
        }

        items.push({
          type: 'ListItem',
          checked,
          children: parseInlineMarkdown(finalContent),
        });

        lineIdx++;
      }

      blocks.push({
        type: 'List',
        ordered: isOrdered,
        start: startNum,
        items,
      });
      continue;
    }

    // 8. Paragraph (accumulate consecutive text lines)
    const paraLines: string[] = [trimmed];
    lineIdx++;
    while (lineIdx < totalLines) {
      const nextTrimmed = lines[lineIdx].trim();
      if (!nextTrimmed) break;
      if (
        nextTrimmed.startsWith('#') ||
        nextTrimmed.startsWith('```') ||
        nextTrimmed.startsWith('$$') ||
        nextTrimmed.startsWith('\\[') ||
        nextTrimmed.startsWith('\\begin{') ||
        nextTrimmed.startsWith('>') ||
        /^(\d+\.|[-*+])\s+/.test(nextTrimmed) ||
        /^(?:-{3,}|\*{3,}|_{3,})$/.test(nextTrimmed) ||
        (nextTrimmed.startsWith('|') && nextTrimmed.endsWith('|'))
      ) {
        break;
      }
      paraLines.push(nextTrimmed);
      lineIdx++;
    }

    const paraText = paraLines.join(' ');
    blocks.push({
      type: 'Paragraph',
      children: parseInlineMarkdown(paraText),
    });
  }

  const meta = calculateASTMeta(blocks, cleanInput, docFrontmatter);

  return {
    type: 'Document',
    children: blocks,
    meta,
  };
}

/**
 * Calculate document metadata from AST blocks
 */
function calculateASTMeta(
  blocks: ASTBlockNode[],
  rawText: string,
  frontmatter?: Record<string, unknown>
) {
  let totalNodes = 1 + blocks.length;
  let headingCount = 0;
  let codeBlockCount = 0;
  let tableCount = 0;
  let linkCount = 0;
  let imageCount = 0;
  let mathBlockCount = 0;
  let mermaidCount = 0;
  let yamlBlockCount = 0;

  const laTeXSymbolsSet = new Set<string>();

  function countInlines(inlines: ASTInlineNode[]) {
    totalNodes += inlines.length;
    for (const node of inlines) {
      if (node.type === 'Link') {
        linkCount++;
        countInlines(node.children);
      } else if (node.type === 'Image') {
        imageCount++;
      } else if (node.type === 'InlineMath') {
        node.symbolsUsed.forEach((s) => laTeXSymbolsSet.add(s));
      } else if (
        node.type === 'Emphasis' ||
        node.type === 'Strong' ||
        node.type === 'Strikethrough'
      ) {
        countInlines(node.children);
      }
    }
  }

  for (const block of blocks) {
    if (block.type === 'Heading') {
      headingCount++;
      countInlines(block.children);
    } else if (block.type === 'Paragraph') {
      countInlines(block.children);
    } else if (block.type === 'CodeBlock') {
      codeBlockCount++;
    } else if (block.type === 'YAMLBlock') {
      yamlBlockCount++;
    } else if (block.type === 'MermaidBlock') {
      mermaidCount++;
    } else if (block.type === 'MathBlock') {
      mathBlockCount++;
      block.symbolsUsed.forEach((s) => laTeXSymbolsSet.add(s));
    } else if (block.type === 'Table') {
      tableCount++;
      for (const h of block.headers) countInlines(h);
      for (const r of block.rows) {
        for (const cell of r) countInlines(cell);
      }
    } else if (block.type === 'List') {
      for (const item of block.items) {
        totalNodes++;
        countInlines(item.children as ASTInlineNode[]);
      }
    } else if (block.type === 'Blockquote') {
      for (const child of block.children) {
        if (child.type === 'Paragraph') countInlines(child.children);
      }
    }
  }

  const wordCount = rawText.trim().split(/\s+/).filter(Boolean).length;

  return {
    totalNodes,
    wordCount,
    headingCount,
    codeBlockCount,
    linkCount,
    imageCount,
    tableCount,
    mathBlockCount,
    mermaidCount,
    yamlBlockCount,
    frontmatter,
    laTeXSymbolsUsed: Array.from(laTeXSymbolsSet),
  };
}

/**
 * HTML Sanitization helper
 */
function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sanitize URL to prevent JavaScript execution (XSS via javascript: or unsafe URI schemes)
 */
function sanitizeHrefUrl(url: string): string {
  const trimmed = url.trim();
  // Allow safe protocols, relative paths, mailto, tel, and anchor fragments
  if (
    /^(https?:\/\/|\/|#|mailto:|tel:)/i.test(trimmed) ||
    !/^[a-z0-9+.-]+:/i.test(trimmed) // relative url without scheme
  ) {
    return escapeHTML(trimmed);
  }
  // Block javascript:, data:, vbscript:, etc.
  return '#blocked-unsafe-url';
}

function sanitizeImageUrl(url: string): string {
  const trimmed = url.trim();
  if (
    /^(https?:\/\/|\/|data:image\/(png|jpeg|webp|gif|svg\+xml);base64,)/i.test(trimmed) ||
    !/^[a-z0-9+.-]+:/i.test(trimmed)
  ) {
    return escapeHTML(trimmed);
  }
  return '';
}

/**
 * Render ASTInlineNode[] into HTML string
 */
export function inlineASTToHTML(nodes: ASTInlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'Text':
          return escapeHTML(node.value);
        case 'Emphasis':
          return `<em>${inlineASTToHTML(node.children)}</em>`;
        case 'Strong':
          return `<strong>${inlineASTToHTML(node.children)}</strong>`;
        case 'Strikethrough':
          return `<del>${inlineASTToHTML(node.children)}</del>`;
        case 'InlineCode':
          return `<code>${escapeHTML(node.value)}</code>`;
        case 'InlineMath':
          return `<span class="math-inline font-mono bg-amber-50 text-amber-900 border border-amber-200/60 rounded px-1 text-[13px]">\\(${escapeHTML(
            node.value
          )}\\)</span>`;
        case 'Link': {
          const titleAttr = node.title ? ` title="${escapeHTML(node.title)}"` : '';
          const safeUrl = sanitizeHrefUrl(node.url);
          return `<a href="${safeUrl}"${titleAttr} target="_blank" rel="noopener noreferrer">${inlineASTToHTML(
            node.children
          )}</a>`;
        }
        case 'Image': {
          const imgTitle = node.title ? ` title="${escapeHTML(node.title)}"` : '';
          const safeSrc = sanitizeImageUrl(node.url);
          return `<img src="${safeSrc}" alt="${escapeHTML(
            node.alt
          )}"${imgTitle} class="max-w-full h-auto rounded" />`;
        }
        case 'LineBreak':
          return '<br />';
        default:
          return '';
      }
    })
    .join('');
}

/**
 * Convert ASTDocumentNode to clean Semantic HTML
 */
export function astToHTML(
  doc: ASTDocumentNode,
  options: { pretty?: boolean; wrapDocument?: boolean } = {}
): string {
  const { pretty = true, wrapDocument = false } = options;
  const indent = pretty ? '  ' : '';
  const newline = pretty ? '\n' : '';

  function renderBlock(block: ASTBlockNode): string {
    switch (block.type) {
      case 'YAMLFrontmatter': {
        const rows = Object.entries(block.data)
          .map(
            ([k, v]) =>
              `<tr><th style="text-align:left;padding:4px 8px;font-size:12px;color:#64748b;">${escapeHTML(
                k
              )}</th><td style="padding:4px 8px;font-size:12px;font-family:monospace;">${escapeHTML(
                String(v)
              )}</td></tr>`
          )
          .join(newline);
        return `<section class="markdown-frontmatter" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:16px;">\n<div style="font-size:11px;font-weight:bold;text-transform:uppercase;color:#94a3b8;margin-bottom:8px;">YAML Metadata</div>\n<table style="width:100%;border-collapse:collapse;"><tbody>${rows}</tbody></table>\n</section>`;
      }
      case 'YAMLBlock': {
        const jsonStr = JSON.stringify(block.data, null, 2);
        return `<div class="yaml-block" style="background:#0f172a;color:#f8fafc;padding:12px;border-radius:8px;font-family:monospace;font-size:12px;margin:16px 0;">\n<div style="color:#38bdf8;font-size:10px;text-transform:uppercase;margin-bottom:6px;">Embedded YAML Data</div>\n<pre><code>${escapeHTML(
          jsonStr
        )}</code></pre>\n</div>`;
      }
      case 'MermaidBlock': {
        return `<div class="mermaid" data-diagram-type="${escapeHTML(
          block.diagramType
        )}">${escapeHTML(block.code)}</div>`;
      }
      case 'MathBlock': {
        return `<div class="math-block" style="background:#0f172a;color:#fde047;padding:16px;border-radius:8px;font-family:monospace;font-size:14px;overflow-x:auto;margin:16px 0;text-align:center;">\\[${escapeHTML(
          block.code
        )}\\]</div>`;
      }
      case 'Heading': {
        const tag = `h${block.level}`;
        const inner = inlineASTToHTML(block.children);
        return `<${tag} id="${block.slug}">${inner}</${tag}>`;
      }
      case 'Paragraph': {
        return `<p>${inlineASTToHTML(block.children)}</p>`;
      }
      case 'CodeBlock': {
        const langClass = block.language ? ` class="language-${escapeHTML(block.language)}"` : '';
        return `<pre><code${langClass}>${escapeHTML(block.code)}</code></pre>`;
      }
      case 'Blockquote': {
        const innerHtml = block.children.map(renderBlock).join(newline);
        return `<blockquote>${newline}${innerHtml}${newline}</blockquote>`;
      }
      case 'ThematicBreak': {
        return '<hr />';
      }
      case 'List': {
        const tag = block.ordered ? 'ol' : 'ul';
        const startAttr = block.ordered && block.start ? ` start="${block.start}"` : '';
        const itemsHtml = block.items
          .map((item) => {
            const checkbox =
              item.checked !== null
                ? `<input type="checkbox" disabled${item.checked ? ' checked' : ''} /> `
                : '';
            const itemInner = inlineASTToHTML(item.children as ASTInlineNode[]);
            return `${indent}<li>${checkbox}${itemInner}</li>`;
          })
          .join(newline);
        return `<${tag}${startAttr}>${newline}${itemsHtml}${newline}</${tag}>`;
      }
      case 'Table': {
        const headersHtml = block.headers
          .map((cell, idx) => {
            const align = block.alignments[idx];
            const alignAttr = align && align !== 'none' ? ` style="text-align:${align}"` : '';
            return `<th${alignAttr}>${inlineASTToHTML(cell)}</th>`;
          })
          .join('');

        const rowsHtml = block.rows
          .map((row) => {
            const cellsHtml = row
              .map((cell, idx) => {
                const align = block.alignments[idx];
                const alignAttr = align && align !== 'none' ? ` style="text-align:${align}"` : '';
                return `<td${alignAttr}>${inlineASTToHTML(cell)}</td>`;
              })
              .join('');
            return `${indent}<tr>${cellsHtml}</tr>`;
          })
          .join(newline);

        return `<table>${newline}${indent}<thead><tr>${headersHtml}</tr></thead>${newline}${indent}<tbody>${newline}${rowsHtml}${newline}${indent}</tbody>${newline}</table>`;
      }
      default:
        return '';
    }
  }

  const htmlContent = doc.children.map(renderBlock).join(newline + newline);

  if (wrapDocument) {
    return `<!DOCTYPE html>${newline}<html lang="en">${newline}<head>${newline}${indent}<meta charset="UTF-8">${newline}${indent}<title>Rendered Document</title>${newline}</head>${newline}<body>${newline}${htmlContent}${newline}</body>${newline}</html>`;
  }

  return htmlContent;
}

/**
 * Extract Table of Contents / Heading Outline from AST
 */
export interface HeadingOutlineItem {
  level: number;
  text: string;
  slug: string;
}

export function astToOutline(doc: ASTDocumentNode): HeadingOutlineItem[] {
  const outline: HeadingOutlineItem[] = [];
  for (const child of doc.children) {
    if (child.type === 'Heading') {
      outline.push({
        level: child.level,
        text: child.text,
        slug: child.slug,
      });
    }
  }
  return outline;
}

/**
 * Filter AST nodes by predicate function
 */
export function filterASTNodes(
  doc: ASTDocumentNode,
  predicate: (node: ASTNode) => boolean
): ASTNode[] {
  const matches: ASTNode[] = [];

  function traverseInline(nodes: ASTInlineNode[]) {
    for (const node of nodes) {
      if (predicate(node)) matches.push(node);
      if ('children' in node && Array.isArray(node.children)) {
        traverseInline(node.children);
      }
    }
  }

  function traverseBlock(block: ASTBlockNode) {
    if (predicate(block)) matches.push(block);

    if (block.type === 'Heading' || block.type === 'Paragraph') {
      traverseInline(block.children);
    } else if (block.type === 'Blockquote') {
      block.children.forEach(traverseBlock);
    } else if (block.type === 'List') {
      for (const item of block.items) {
        if (predicate(item)) matches.push(item);
        traverseInline(item.children as ASTInlineNode[]);
      }
    } else if (block.type === 'Table') {
      for (const h of block.headers) traverseInline(h);
      for (const r of block.rows) {
        for (const cell of r) traverseInline(cell);
      }
    }
  }

  if (predicate(doc)) matches.push(doc);
  doc.children.forEach(traverseBlock);

  return matches;
}

/**
 * Export AST to XML format
 */
export function astToXML(doc: ASTDocumentNode): string {
  function nodeToXML(node: ASTNode, depth = 0): string {
    const pad = '  '.repeat(depth);
    if (node.type === 'Document') {
      const children = node.children.map((c) => nodeToXML(c, depth + 1)).join('\n');
      return `${pad}<Document nodes="${node.meta.totalNodes}" words="${node.meta.wordCount}">\n${children}\n${pad}</Document>`;
    }
    if (node.type === 'YAMLFrontmatter') {
      return `${pad}<YAMLFrontmatter keys="${Object.keys(node.data).join(', ')}" />`;
    }
    if (node.type === 'YAMLBlock') {
      return `${pad}<YAMLBlock keys="${Object.keys(node.data).join(', ')}" />`;
    }
    if (node.type === 'MermaidBlock') {
      return `${pad}<MermaidBlock diagramType="${escapeHTML(node.diagramType)}"><![CDATA[${node.code}]]></MermaidBlock>`;
    }
    if (node.type === 'Heading') {
      return `${pad}<Heading level="${node.level}" slug="${escapeHTML(node.slug)}">${escapeHTML(node.text)}</Heading>`;
    }
    if (node.type === 'Paragraph') {
      return `${pad}<Paragraph>${escapeHTML(inlineASTToText(node.children))}</Paragraph>`;
    }
    if (node.type === 'CodeBlock') {
      return `${pad}<CodeBlock language="${escapeHTML(node.language)}"><![CDATA[${node.code}]]></CodeBlock>`;
    }
    if (node.type === 'Blockquote') {
      const children = node.children.map((c) => nodeToXML(c, depth + 1)).join('\n');
      return `${pad}<Blockquote>\n${children}\n${pad}</Blockquote>`;
    }
    if (node.type === 'List') {
      const items = node.items
        .map((it) => `${pad}  <ListItem>${escapeHTML(inlineASTToText(it.children as ASTInlineNode[]))}</ListItem>`)
        .join('\n');
      return `${pad}<List ordered="${node.ordered}">\n${items}\n${pad}</List>`;
    }
    if (node.type === 'Table') {
      return `${pad}<Table rows="${node.rows.length}" cols="${node.headers.length}" />`;
    }
    if (node.type === 'ThematicBreak') {
      return `${pad}<ThematicBreak />`;
    }
    if (node.type === 'MathBlock') {
      return `${pad}<MathBlock symbols="${node.symbolsUsed.join(', ')}">${escapeHTML(node.code)}</MathBlock>`;
    }
    return `${pad}<${node.type} />`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n${nodeToXML(doc)}`;
}
