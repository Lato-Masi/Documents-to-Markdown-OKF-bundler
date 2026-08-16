/**
 * @okf/core Markdown Slicer & Decomposer
 * Decomposes monolithic documentation (e.g. CLAUDE.md, AGENTS.md, README.md)
 * into atomic OKF concept documents with synthesized YAML frontmatter,
 * categorized directories, and cross-referenced wikilinks.
 */

import { classifySectionType } from './okfKnowledgeEngine';
import { extractLegalMetadata } from './temporalLegalParser';
import { extractBinaryAssetsAndScripts, ExtractedAsset, ExtractedScriptAsset } from './binaryAssetExtractor';

export interface SlicedConceptFile {
  path: string;
  filename: string;
  type: 'concept' | 'procedure' | 'table' | 'architecture' | 'guideline' | 'metric';
  title: string;
  description: string;
  tags: string[];
  depends_on: string[];
  precedence_weight?: number;
  content: string;
  frontmatterYaml: string;
  rawBody: string;
  linesCount: number;
}

export interface OkfSlicerResult {
  sourceTitle: string;
  totalFiles: number;
  files: SlicedConceptFile[];
  assets: ExtractedAsset[];
  scripts: ExtractedScriptAsset[];
  totalBytesExtracted: number;
  totalTokensSaved: number;
  indexFile: {
    path: string;
    content: string;
  };
  typesCount: Record<string, number>;
  generatedWikilinksCount: number;
  executionTimeMs: number;
}

/**
 * Creates a clean URL/file-safe slug from a title.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unnamed';
}

/**
 * Generates valid YAML frontmatter block for a concept.
 */
function buildFrontmatter(meta: {
  type: string;
  title: string;
  description: string;
  tags: string[];
  depends_on?: string[];
  precedence_weight?: number;
  trustTier?: string;
  verified_by?: string;
  verified_at?: string;
}): string {
  const lines: string[] = ['---'];
  lines.push(`type: ${meta.type}`);
  lines.push(`title: "${meta.title.replace(/"/g, '\\"')}"`);
  lines.push(`description: "${meta.description.replace(/"/g, '\\"')}"`);
  lines.push(`status: stable`);
  lines.push(`trust-tier: ${meta.trustTier || 'machine-confirmed'}`);
  if (meta.precedence_weight !== undefined) {
    lines.push(`precedence-weight: ${meta.precedence_weight}`);
  }

  if (meta.tags && meta.tags.length > 0) {
    lines.push(`tags:`);
    for (const t of meta.tags) {
      lines.push(`  - ${t}`);
    }
  }

  if (meta.depends_on && meta.depends_on.length > 0) {
    lines.push(`depends-on:`);
    for (const d of meta.depends_on) {
      lines.push(`  - ${d}`);
    }
  }

  lines.push('---');
  return lines.join('\n');
}

/**
 * Extracts salient tags from title and content.
 */
function extractTags(title: string, body: string): string[] {
  const tags = new Set<string>();
  const combined = `${title} ${body}`.toLowerCase();

  const candidateTags = [
    'architecture', 'security', 'auth', 'database', 'storage',
    'rag', 'graph', 'sparql', 'agent', 'mcp', 'cli',
    'validation', 'protocol', 'api', 'procedure', 'consensus',
    'testing', 'deployment', 'workflow', 'llm', 'configuration'
  ];

  for (const c of candidateTags) {
    if (combined.includes(c)) {
      tags.add(c);
    }
  }

  return Array.from(tags).slice(0, 5);
}

/**
 * Generates a salient description summarizing the body.
 */
function generateDescription(title: string, body: string): string {
  const cleanBody = body
    .replace(/^#+\s+.+$/gm, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`#]/g, '')
    .trim();

  const firstSentence = cleanBody.split(/(?<=[.?!])\s+/)[0];
  if (firstSentence && firstSentence.length >= 15 && firstSentence.length <= 160) {
    return firstSentence.replace(/\n/g, ' ').trim();
  }

  return `Specifications and directives regarding ${title.toLowerCase()} in the system.`;
}

/**
 * Slices a monolithic Markdown file into modular OKF concept documents.
 */
export function sliceMonolithicMarkdown(
  markdownContent: string,
  options?: {
    defaultTrustTier?: 'human-reviewed' | 'machine-confirmed';
    verifiedBy?: string;
  }
): OkfSlicerResult {
  const startTime = performance.now();

  // Decouple embedded base64/binary images and standalone scripts
  const decoupled = extractBinaryAssetsAndScripts(markdownContent, 'doc');
  const cleanMarkdown = decoupled.cleanedMarkdown;
  const lines = cleanMarkdown.split('\n');

  let docTitle = 'Project Knowledge Base';
  const rawSections: Array<{ title: string; level: number; lines: string[] }> = [];
  let currentSection: { title: string; level: number; lines: string[] } | null = null;
  let inCodeFence = false;

  // 1. Partition by H1 / H2 headings (strictly ignoring any # inside code blocks)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      inCodeFence = !inCodeFence;
      if (currentSection) {
        currentSection.lines.push(line);
      }
      continue;
    }

    const h1Match = !inCodeFence ? line.match(/^#\s+(.+)$/) : null;
    const h2Match = !inCodeFence ? line.match(/^##\s+(.+)$/) : null;

    if (h1Match && rawSections.length === 0) {
      docTitle = h1Match[1].trim();
      currentSection = { title: docTitle, level: 1, lines: [] };
      continue;
    }

    if (h2Match || (h1Match && rawSections.length > 0)) {
      if (currentSection && currentSection.lines.join('\n').trim().length > 0) {
        rawSections.push(currentSection);
      }
      const title = (h2Match ? h2Match[1] : h1Match![1]).trim();
      currentSection = { title, level: h2Match ? 2 : 1, lines: [] };
    } else if (currentSection) {
      currentSection.lines.push(line);
    } else {
      // Intro before any heading
      currentSection = { title: 'Overview', level: 1, lines: [line] };
    }
  }

  if (currentSection && currentSection.lines.join('\n').trim().length > 0) {
    rawSections.push(currentSection);
  }

  // If document had no H1/H2 headers, fallback to H3 or paragraph blocks
  if (rawSections.length <= 1 && lines.length > 30) {
    const h3Sections: Array<{ title: string; level: number; lines: string[] }> = [];
    let curH3: { title: string; level: number; lines: string[] } | null = null;
    let inH3CodeFence = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('```')) {
        inH3CodeFence = !inH3CodeFence;
        if (curH3) curH3.lines.push(line);
        continue;
      }

      const h3Match = !inH3CodeFence ? line.match(/^###\s+(.+)$/) : null;
      if (h3Match) {
        if (curH3) h3Sections.push(curH3);
        curH3 = { title: h3Match[1].trim(), level: 3, lines: [] };
      } else if (curH3) {
        curH3.lines.push(line);
      }
    }
    if (curH3) h3Sections.push(curH3);
    if (h3Sections.length > 1) {
      rawSections.splice(0, rawSections.length, ...h3Sections);
    }
  }

  // 2. Build SlicedConceptFiles
  const files: SlicedConceptFile[] = [];
  const typesCount: Record<string, number> = {};
  const conceptTitles: Array<{ title: string; slug: string; path: string }> = [];

  for (const sec of rawSections) {
    const title = sec.title.replace(/^[\d.]+\s*/, '').trim();
    const rawBody = sec.lines.join('\n').trim();
    const slug = slugify(title);

    const detectedType = classifySectionType(title, rawBody) as SlicedConceptFile['type'];
    const type = detectedType || 'concept';
    typesCount[type] = (typesCount[type] || 0) + 1;

    let dir = 'concepts';
    if (type === 'procedure') dir = 'procedures';
    else if (type === 'table' || type === 'metric') dir = 'tables';
    else if (type === 'architecture') dir = 'architecture';

    const path = `.okf/${dir}/${slug}.md`;
    const filename = `${slug}.md`;

    conceptTitles.push({ title, slug, path });

    const description = generateDescription(title, rawBody);
    const tags = extractTags(title, rawBody);

    files.push({
      path,
      filename,
      type,
      title,
      description,
      tags,
      depends_on: [],
      content: '', // will be populated after wikilink weaving
      frontmatterYaml: '',
      rawBody,
      linesCount: sec.lines.length,
    });
  }

  // 3. Weave Bidirectional Wikilinks and Build Dependencies (skipping code blocks)
  let generatedWikilinksCount = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const dependencies = new Set<string>();

    // Split into lines and weave wikilinks only in non-code lines and non-inline-code segments
    const bodyLines = file.rawBody.split('\n');
    let inBodyCode = false;

    const enrichedLines = bodyLines.map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('```')) {
        inBodyCode = !inBodyCode;
        return line;
      }
      if (inBodyCode) return line;

      let processedLine = line;
      for (let j = 0; j < files.length; j++) {
        if (i === j) continue;
        const other = files[j];
        if (!other.title || other.title.length < 3) continue;

        // Escape regex special chars in title
        const escapedTitle = other.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match only if outside [[...]] and not inside backticks
        const regex = new RegExp('(?<!\\[\\[|`)\\b(' + escapedTitle + ')\\b(?!\\]\\]|`)', 'gi');
        if (regex.test(processedLine)) {
          processedLine = processedLine.replace(regex, '[[$1]]');
          dependencies.add(other.filename.replace(/\.md$/, ''));
          generatedWikilinksCount++;
        }
      }
      return processedLine;
    });

    const enrichedBody = enrichedLines.join('\n');
    file.depends_on = Array.from(dependencies).slice(0, 4);

    // Compute legal precedence weight if present
    let precedence_weight: number | undefined;
    const lowerTitle = file.title.toLowerCase();
    if (lowerTitle.includes('order form') || lowerTitle.includes('schedule') || lowerTitle.includes('statement of work') || lowerTitle.includes('sow')) {
      precedence_weight = 100;
    } else if (lowerTitle.includes('dpa') || lowerTitle.includes('data protection') || lowerTitle.includes('security rider')) {
      precedence_weight = 80;
    } else if (lowerTitle.includes('master') || lowerTitle.includes('msa') || lowerTitle.includes('agreement') || lowerTitle.includes('terms')) {
      precedence_weight = 50;
    } else if (lowerTitle.includes('appendix') || lowerTitle.includes('exhibit')) {
      precedence_weight = 30;
    }
    file.precedence_weight = precedence_weight;

    const frontmatterYaml = buildFrontmatter({
      type: file.type,
      title: file.title,
      description: file.description,
      tags: file.tags,
      depends_on: file.depends_on,
      precedence_weight: file.precedence_weight,
      trustTier: options?.defaultTrustTier || 'machine-confirmed',
      verified_by: options?.verifiedBy,
      verified_at: options?.verifiedBy ? new Date().toISOString().split('T')[0] : undefined,
    });

    file.frontmatterYaml = frontmatterYaml;
    file.content = `${frontmatterYaml}\n\n# ${file.title}\n\n${enrichedBody}\n`;
  }

  // 4. Generate Master Index / TOC file (.okf/index.md)
  const indexLines: string[] = [
    '---',
    'type: index',
    `title: "${docTitle} - OKF Bundle"`,
    `description: "Open Knowledge Format concept index and navigation hierarchy."`,
    'status: stable',
    `trust-tier: ${options?.defaultTrustTier || 'machine-confirmed'}`,
    '---',
    '',
    `# ${docTitle} Knowledge Index`,
    '',
    `This bundle contains **${files.length} modular concepts** structured according to the Open Knowledge Format (OKF) specification.`,
    '',
    '## 📚 Concepts & Specifications',
  ];

  const groupedByType: Record<string, SlicedConceptFile[]> = {};
  for (const f of files) {
    if (!groupedByType[f.type]) groupedByType[f.type] = [];
    groupedByType[f.type].push(f);
  }

  for (const [t, items] of Object.entries(groupedByType)) {
    indexLines.push(`\n### ${t.toUpperCase()}S (${items.length})\n`);
    for (const item of items) {
      indexLines.push(`- **[[${item.filename.replace(/\.md$/, '')}|${item.title}]]** — *${item.description}*`);
    }
  }

  const indexContent = indexLines.join('\n');
  const executionTimeMs = Math.round((performance.now() - startTime) * 100) / 100;

  return {
    sourceTitle: docTitle,
    totalFiles: files.length,
    files,
    assets: decoupled.assets,
    scripts: decoupled.scripts,
    totalBytesExtracted: decoupled.totalBytesExtracted,
    totalTokensSaved: decoupled.totalTokensSaved,
    indexFile: {
      path: '.okf/index.md',
      content: indexContent,
    },
    typesCount,
    generatedWikilinksCount,
    executionTimeMs,
  };
}
