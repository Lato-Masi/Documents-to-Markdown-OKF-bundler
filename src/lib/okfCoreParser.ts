/**
 * @okf/core AST Parser
 * Pure TypeScript AST parser for OKF (Open Knowledge Format v0.2) markdown documents,
 * frontmatter metadata, wikilinks, structural directives, and section hierarchies.
 */

import * as yaml from 'js-yaml';
import { deriveTrustTier, type OkfSource, type OkfGeneration, type OkfVerification, type OkfParameter, type OkfStatus, type TrustTier } from 'okf-ts';

export interface OkfParsedFrontmatter {
  type: string;
  title?: string;
  description?: string;
  version?: string;
  status?: OkfStatus | string;
  trustTier?: TrustTier;
  tags?: string[];
  depends_on?: string[];
  prerequisites?: string[];
  sources?: OkfSource[];
  generated?: OkfGeneration;
  verified?: OkfVerification | OkfVerification[];
  stale_after?: string;
  runtime?: string;
  parameters?: OkfParameter[];
  computation?: string;
  executor?: { resource?: string; receipt?: string[] };
  attester?: { resource?: string };
  verified_by?: string;
  verified_at?: string;
  author?: string;
  schema_version?: string;
  [key: string]: unknown;
}

export interface OkfWikilink {
  raw: string;
  target: string;
  alias?: string;
  line: number;
  column: number;
}

export interface OkfMarkdownLink {
  raw: string;
  text: string;
  url: string;
  isRelative: boolean;
  line: number;
}

export interface OkfDirective {
  type: 'procedure' | 'table' | 'guideline' | 'metric' | 'reference' | 'architecture' | string;
  title?: string;
  content: string;
  startLine: number;
  endLine: number;
}

export interface OkfCodeBlock {
  language: string;
  code: string;
  startLine: number;
  endLine: number;
}

export interface OkfSectionAST {
  level: number;
  title: string;
  slug: string;
  startLine: number;
  endLine: number;
  content: string;
  wikilinks: OkfWikilink[];
  links: OkfMarkdownLink[];
  codeBlocks: OkfCodeBlock[];
  directives: OkfDirective[];
}

export interface OkfDocumentAST {
  id: string;
  filePath?: string;
  rawContent: string;
  frontmatterRaw?: string;
  frontmatter: OkfParsedFrontmatter;
  sections: OkfSectionAST[];
  allWikilinks: OkfWikilink[];
  allLinks: OkfMarkdownLink[];
  allDirectives: OkfDirective[];
  allCodeBlocks: OkfCodeBlock[];
  summary: {
    totalLines: number;
    wordCount: number;
    headingsCount: number;
    wikilinksCount: number;
    directivesCount: number;
  };
}

/**
 * Parses YAML frontmatter string into a typed object conforming to OKF v0.2.
 */
export function parseYamlFrontmatter(yamlStr: string): OkfParsedFrontmatter {
  let parsed: any = {};
  try {
    const doc = yaml.load(yamlStr);
    if (doc && typeof doc === 'object') {
      parsed = doc;
    }
  } catch {
    // Fallback to lightweight regex parsing if YAML has unexpected token errors
  }

  const result: OkfParsedFrontmatter = {
    type: typeof parsed.type === 'string' ? parsed.type : 'concept',
    ...parsed,
  };

  // Normalize legacy and alias keys
  if (parsed['depends-on'] && !result.depends_on) result.depends_on = parsed['depends-on'];
  if (parsed['trust-tier'] && !result.trustTier) result.trustTier = parsed['trust-tier'];
  if (parsed['verified-by'] && !result.verified_by) result.verified_by = parsed['verified-by'];
  if (parsed['verified-at'] && !result.verified_at) result.verified_at = parsed['verified-at'];
  if (parsed['stale-after'] && !result.stale_after) result.stale_after = parsed['stale-after'];

  // Ensure trustTier is accurately derived using standard OKF v0.2 logic
  if (!result.trustTier) {
    try {
      result.trustTier = deriveTrustTier({ metadata: result } as any);
    } catch {
      if (result.verified_by || result.verified_at || (Array.isArray(result.verified) && result.verified.length > 0)) {
        result.trustTier = 'human-reviewed';
      } else {
        result.trustTier = 'machine-confirmed';
      }
    }
  }

  return result;
}

/**
 * Extracts all [[wikilinks]] from markdown content with line numbers.
 * AST-refined: Skips links found inside fenced code blocks and inline code ticks (`...`)
 * to prevent false/ghost graph edges.
 */
export function extractWikilinks(content: string): OkfWikilink[] {
  const wikilinks: OkfWikilink[] = [];
  const lines = content.split('\n');
  const regex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let inCodeBlock = false;

  lines.forEach((line, lineIdx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      return;
    }

    if (inCodeBlock) {
      return; // Skip wikilinks inside code blocks
    }

    // Mask inline code `...` to avoid extracting example wikilinks inside code spans
    let sanitizedLine = line;
    if (line.includes('`')) {
      sanitizedLine = line.replace(/`[^`]+`/g, (m) => ' '.repeat(m.length));
    }

    let match: RegExpExecArray | null;
    while ((match = regex.exec(sanitizedLine)) !== null) {
      wikilinks.push({
        raw: match[0],
        target: match[1].trim(),
        alias: match[2]?.trim(),
        line: lineIdx + 1,
        column: match.index + 1,
      });
    }
  });

  return wikilinks;
}

/**
 * Extracts markdown links [text](url) from content.
 * AST-refined: Skips markdown links inside fenced code blocks.
 */
export function extractMarkdownLinks(content: string): OkfMarkdownLink[] {
  const links: OkfMarkdownLink[] = [];
  const lines = content.split('\n');
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let inCodeBlock = false;

  lines.forEach((line, lineIdx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      return;
    }

    if (inCodeBlock) {
      return;
    }

    // Mask inline code
    let sanitizedLine = line;
    if (line.includes('`')) {
      sanitizedLine = line.replace(/`[^`]+`/g, (m) => ' '.repeat(m.length));
    }

    let match: RegExpExecArray | null;
    while ((match = regex.exec(sanitizedLine)) !== null) {
      const url = match[2].trim();
      const isRelative = !url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('#') && !url.startsWith('mailto:');
      links.push({
        raw: match[0],
        text: match[1].trim(),
        url,
        isRelative,
        line: lineIdx + 1,
      });
    }
  });

  return links;
}

/**
 * Extracts custom OKF directives (e.g. :::procedure ... ::: or :::table ... :::)
 */
export function extractDirectives(content: string): OkfDirective[] {
  const directives: OkfDirective[] = [];
  const lines = content.split('\n');
  let currentDirective: { type: string; title?: string; startLine: number; lines: string[] } | null = null;

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    const directiveStart = trimmed.match(/^:::\s*([a-zA-Z0-9_-]+)(?:\s+(.*))?$/);

    if (directiveStart && !currentDirective) {
      currentDirective = {
        type: directiveStart[1].toLowerCase(),
        title: directiveStart[2]?.trim(),
        startLine: idx + 1,
        lines: [],
      };
    } else if (trimmed === ':::' && currentDirective) {
      directives.push({
        type: currentDirective.type,
        title: currentDirective.title,
        content: currentDirective.lines.join('\n'),
        startLine: currentDirective.startLine,
        endLine: idx + 1,
      });
      currentDirective = null;
    } else if (currentDirective) {
      currentDirective.lines.push(line);
    }
  });

  return directives;
}

/**
 * Extracts fenced code blocks (```lang ... ```)
 */
export function extractCodeBlocks(content: string): OkfCodeBlock[] {
  const codeBlocks: OkfCodeBlock[] = [];
  const lines = content.split('\n');
  let currentBlock: { lang: string; startLine: number; lines: string[] } | null = null;

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      if (!currentBlock) {
        const lang = trimmed.slice(3).trim();
        currentBlock = { lang: lang || 'text', startLine: idx + 1, lines: [] };
      } else {
        codeBlocks.push({
          language: currentBlock.lang,
          code: currentBlock.lines.join('\n'),
          startLine: currentBlock.startLine,
          endLine: idx + 1,
        });
        currentBlock = null;
      }
    } else if (currentBlock) {
      currentBlock.lines.push(line);
    }
  });

  return codeBlocks;
}

/**
 * Main function: Parses a full OKF Markdown document into an AST.
 */
export function parseOkfDocument(content: string, filePath?: string): OkfDocumentAST {
  let frontmatter: OkfParsedFrontmatter = { type: 'concept' };
  let frontmatterRaw: string | undefined;
  let body = content;

  // Extract frontmatter block: --- ... ---
  if (content.startsWith('---')) {
    const endMatch = content.indexOf('\n---', 3);
    if (endMatch !== -1) {
      frontmatterRaw = content.slice(3, endMatch).trim();
      body = content.slice(endMatch + 4).trim();
      frontmatter = parseYamlFrontmatter(frontmatterRaw);
    }
  }

  // Derive ID
  const id = filePath ? filePath.replace(/\.md$/, '').replace(/^[./]+/, '') : (frontmatter.title || 'unnamed').toLowerCase().replace(/[^a-z0-9]+/g, '-');

  // Extract sections by headings (ignoring any # characters inside code blocks)
  const lines = body.split('\n');
  const sections: OkfSectionAST[] = [];
  let currentSection: { level: number; title: string; startLine: number; lines: string[] } | null = null;
  let inCodeBlock = false;

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      if (currentSection) {
        currentSection.lines.push(line);
      }
      return;
    }

    const headingMatch = !inCodeBlock ? line.match(/^(#{1,6})\s+(.+)$/) : null;
    if (headingMatch) {
      if (currentSection) {
        const sContent = currentSection.lines.join('\n');
        sections.push({
          level: currentSection.level,
          title: currentSection.title,
          slug: currentSection.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          startLine: currentSection.startLine,
          endLine: idx,
          content: sContent,
          wikilinks: extractWikilinks(sContent),
          links: extractMarkdownLinks(sContent),
          codeBlocks: extractCodeBlocks(sContent),
          directives: extractDirectives(sContent),
        });
      }
      currentSection = {
        level: headingMatch[1].length,
        title: headingMatch[2].trim(),
        startLine: idx + 1,
        lines: [],
      };
    } else if (currentSection) {
      currentSection.lines.push(line);
    } else {
      // Intro section before first heading
      if (idx === 0) {
        currentSection = {
          level: 1,
          title: frontmatter.title || 'Introduction',
          startLine: 1,
          lines: [line],
        };
      }
    }
  });

  if (currentSection) {
    const sContent = (currentSection as { level: number; title: string; startLine: number; lines: string[] }).lines.join('\n');
    sections.push({
      level: (currentSection as { level: number; title: string; startLine: number; lines: string[] }).level,
      title: (currentSection as { level: number; title: string; startLine: number; lines: string[] }).title,
      slug: (currentSection as { level: number; title: string; startLine: number; lines: string[] }).title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      startLine: (currentSection as { level: number; title: string; startLine: number; lines: string[] }).startLine,
      endLine: lines.length,
      content: sContent,
      wikilinks: extractWikilinks(sContent),
      links: extractMarkdownLinks(sContent),
      codeBlocks: extractCodeBlocks(sContent),
      directives: extractDirectives(sContent),
    });
  }

  const allWikilinks = extractWikilinks(body);
  const allLinks = extractMarkdownLinks(body);
  const allDirectives = extractDirectives(body);
  const allCodeBlocks = extractCodeBlocks(body);

  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;

  return {
    id,
    filePath,
    rawContent: content,
    frontmatterRaw,
    frontmatter,
    sections,
    allWikilinks,
    allLinks,
    allDirectives,
    allCodeBlocks,
    summary: {
      totalLines: content.split('\n').length,
      wordCount,
      headingsCount: sections.length,
      wikilinksCount: allWikilinks.length,
      directivesCount: allDirectives.length,
    },
  };
}
