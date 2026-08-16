/**
 * OKF (Open Knowledge Format v1.0) Converter & Parser
 * Converts Markdown documents into OKF compliant format as specified at https://okf.md/spec/
 */

export interface OKFBlock {
  id: string;
  type: 'summary' | 'concept' | 'procedure' | 'code' | 'table' | 'note' | 'faq' | 'reference' | 'content';
  title?: string;
  content: string;
  language?: string;
  properties?: Record<string, string>;
  entities?: string[];
}

export interface OKFMetadata {
  okfVersion: string;
  id: string;
  title: string;
  description: string;
  type: string;
  tags: string[];
  author: string;
  created: string;
  updated: string;
  properties: Record<string, string>;
}

export interface OKFDocument {
  metadata: OKFMetadata;
  blocks: OKFBlock[];
  entities: string[];
  rawOKF: string;
}

export interface OKFOptions {
  containerStyle: 'container' | 'comment' | 'attribute'; // :::type vs <!-- okf:block --> vs {#id .type}
  autoLinkEntities: boolean;
  extractProperties: boolean;
  includeSummaryBlock: boolean;
  okfVersion: string;
  customType?: string;
}

/**
 * Converts standard Markdown into an OKF (Open Knowledge Format v1.0) document string and object structure.
 */
export function convertMarkdownToOKF(
  markdown: string,
  options: Partial<OKFOptions> = {}
): OKFDocument {
  const opts: OKFOptions = {
    containerStyle: options.containerStyle || 'container',
    autoLinkEntities: options.autoLinkEntities ?? true,
    extractProperties: options.extractProperties ?? true,
    includeSummaryBlock: options.includeSummaryBlock ?? true,
    okfVersion: options.okfVersion || '1.0',
    customType: options.customType || 'knowledge-article',
  };

  const lines = markdown.split('\n');
  let yamlTitle = '';
  let yamlDesc = '';
  let yamlTags: string[] = [];
  let yamlAuthor = 'AI Studio OKF Engine';
  let bodyLines: string[] = [];
  let inYaml = false;

  // 1. Parse existing YAML frontmatter if present
  if (lines.length > 0 && lines[0].trim() === '---') {
    inYaml = true;
    let yamlContent: string[] = [];
    let idx = 1;
    while (idx < lines.length) {
      if (lines[idx].trim() === '---') {
        inYaml = false;
        idx++;
        break;
      }
      yamlContent.push(lines[idx]);
      idx++;
    }
    bodyLines = lines.slice(idx);

    // Simple YAML line parsing
    yamlContent.forEach((line) => {
      const [key, ...valParts] = line.split(':');
      if (key && valParts.length > 0) {
        const val = valParts.join(':').trim().replace(/^['"]|['"]$/g, '');
        const k = key.trim().toLowerCase();
        if (k === 'title') yamlTitle = val;
        else if (k === 'description' || k === 'summary') yamlDesc = val;
        else if (k === 'author') yamlAuthor = val;
        else if (k === 'tags') {
          yamlTags = val.replace(/^\[|\]$/g, '').split(',').map((t) => t.trim()).filter(Boolean);
        }
      }
    });
  } else {
    bodyLines = lines;
  }

  const rawBody = bodyLines.join('\n');

  // 2. Infer Title & Description if missing
  if (!yamlTitle) {
    const titleMatch = rawBody.match(/^#\s+(.+)$/m);
    yamlTitle = titleMatch ? titleMatch[1].trim() : 'Untitled Knowledge Document';
  }

  if (!yamlDesc) {
    // Pick first substantial non-heading paragraph
    const pMatch = rawBody.match(/^(?!#|>|```|-|\*|\d+\.)([A-Z0-9].{20,180}\.)/m);
    yamlDesc = pMatch ? pMatch[1].trim() : `OKF Knowledge representation for ${yamlTitle}`;
  }

  // 3. Extract Tags
  const inlineTags = Array.from(rawBody.matchAll(/(?:^|\s)#([a-zA-Z0-9_-]{3,20})/g)).map((m) => m[1]);
  const allTags = Array.from(new Set([...yamlTags, ...inlineTags]));
  if (allTags.length === 0) {
    allTags.push('knowledge', 'okf', 'markdown');
  }

  // 4. Extract Entities (Key terminology or wiki links [[Concept]])
  const wikiEntities = Array.from(rawBody.matchAll(/\[\[([^\]]+)\]\]/g)).map((m) => m[1].trim());
  const boldEntities = Array.from(rawBody.matchAll(/\*\*([A-[Z][a-zA-Z0-9\s-]{2,30})\*\*/g)).map((m) => m[1].trim());
  const allEntities = Array.from(new Set([...wikiEntities, ...boldEntities])).slice(0, 15);

  // 5. Construct Metadata
  const docId = `okf-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  const metadata: OKFMetadata = {
    okfVersion: opts.okfVersion,
    id: docId,
    title: yamlTitle,
    description: yamlDesc,
    type: opts.customType || 'knowledge-article',
    tags: allTags,
    author: yamlAuthor,
    created: new Date().toISOString().split('T')[0],
    updated: new Date().toISOString().split('T')[0],
    properties: {
      schema: 'https://okf.md/spec/1.0',
      source: 'AI Studio Converter',
      entityCount: String(allEntities.length),
    },
  };

  // 6. Split Content into Sections & Typed Blocks
  const blocks: OKFBlock[] = [];
  let blockCounter = 1;

  // Add Executive Summary Block if enabled
  if (opts.includeSummaryBlock && yamlDesc) {
    blocks.push({
      id: `block-${blockCounter++}`,
      type: 'summary',
      title: 'Executive Summary',
      content: yamlDesc,
      properties: { priority: 'high' },
    });
  }

  // Parse Sections by Heading or Code/Table Blocks
  const sectionRegex = /(^#{1,6}\s+.+$|```[\s\S]*?```|^\|.+\|\n\|[-:\s|]+\|\n(?:\|.+\|\n?)*)/gm;
  const sections = rawBody.split(sectionRegex).filter(Boolean);

  let currentHeading = '';

  sections.forEach((sec) => {
    const trimmed = sec.trim();
    if (!trimmed) return;

    // Is Heading?
    if (/^#{1,6}\s+/.test(trimmed)) {
      currentHeading = trimmed.replace(/^#{1,6}\s+/, '').trim();
      return;
    }

    // Is Code Block?
    if (/^```/.test(trimmed)) {
      const firstLine = trimmed.split('\n')[0];
      const lang = firstLine.replace('```', '').trim() || 'text';
      const codeContent = trimmed.split('\n').slice(1, -1).join('\n');

      blocks.push({
        id: `block-${blockCounter++}`,
        type: 'code',
        title: currentHeading ? `Code: ${currentHeading}` : 'Code Snippet',
        content: codeContent,
        language: lang,
      });
      return;
    }

    // Is Table?
    if (/^\|/.test(trimmed)) {
      blocks.push({
        id: `block-${blockCounter++}`,
        type: 'table',
        title: currentHeading ? `Data: ${currentHeading}` : 'Data Matrix',
        content: trimmed,
      });
      return;
    }

    // Categorize Content Paragraphs
    let blockType: OKFBlock['type'] = 'content';
    const lowerHeading = currentHeading.toLowerCase();

    if (
      lowerHeading.includes('summary') ||
      lowerHeading.includes('overview') ||
      lowerHeading.includes('abstract')
    ) {
      blockType = 'summary';
    } else if (
      lowerHeading.includes('concept') ||
      lowerHeading.includes('definition') ||
      lowerHeading.includes('architecture') ||
      lowerHeading.includes('theory')
    ) {
      blockType = 'concept';
    } else if (
      lowerHeading.includes('step') ||
      lowerHeading.includes('guide') ||
      lowerHeading.includes('usage') ||
      lowerHeading.includes('how to') ||
      lowerHeading.includes('procedure') ||
      lowerHeading.includes('installation')
    ) {
      blockType = 'procedure';
    } else if (
      lowerHeading.includes('note') ||
      lowerHeading.includes('warning') ||
      lowerHeading.includes('tip') ||
      lowerHeading.includes('caution')
    ) {
      blockType = 'note';
    } else if (
      lowerHeading.includes('faq') ||
      lowerHeading.includes('question')
    ) {
      blockType = 'faq';
    } else if (
      lowerHeading.includes('reference') ||
      lowerHeading.includes('link') ||
      lowerHeading.includes('source')
    ) {
      blockType = 'reference';
    }

    blocks.push({
      id: `block-${blockCounter++}`,
      type: blockType,
      title: currentHeading || undefined,
      content: trimmed,
    });
  });

  // 7. Format final OKF Markdown output string
  const rawOKF = formatOKFDocumentString(metadata, blocks, opts);

  return {
    metadata,
    blocks,
    entities: allEntities,
    rawOKF,
  };
}

/**
 * Formats metadata and typed blocks into a standard OKF Markdown string adhering to okf.md/spec
 */
export function formatOKFDocumentString(
  metadata: OKFMetadata,
  blocks: OKFBlock[],
  opts: OKFOptions
): string {
  let output = '';

  // 1. OKF Frontmatter
  output += `---\n`;
  output += `okf: ${metadata.okfVersion}\n`;
  output += `id: ${metadata.id}\n`;
  output += `title: "${metadata.title}"\n`;
  output += `description: "${metadata.description}"\n`;
  output += `type: ${metadata.type}\n`;
  output += `tags:\n`;
  metadata.tags.forEach((tag) => {
    output += `  - ${tag}\n`;
  });
  output += `author: ${metadata.author}\n`;
  output += `created: ${metadata.created}\n`;
  output += `updated: ${metadata.updated}\n`;
  output += `properties:\n`;
  Object.entries(metadata.properties).forEach(([k, v]) => {
    output += `  ${k}: "${v}"\n`;
  });
  output += `---\n\n`;

  // 2. Title Heading
  output += `# ${metadata.title}\n\n`;

  // 3. Blocks formatting based on container style
  blocks.forEach((block) => {
    if (opts.containerStyle === 'container') {
      // :::type [title] {id="block-1"}
      output += `:::${block.type}`;
      if (block.title) output += ` "${block.title}"`;
      output += ` {id="${block.id}"`;
      if (block.language) output += ` lang="${block.language}"`;
      output += `}\n`;

      if (block.type === 'code') {
        output += `\`\`\`${block.language || ''}\n${block.content}\n\`\`\`\n`;
      } else {
        output += `${block.content}\n`;
      }

      output += `:::\n\n`;
    } else if (opts.containerStyle === 'comment') {
      // <!-- okf:block id="block-1" type="concept" title="..." -->
      output += `<!-- okf:block id="${block.id}" type="${block.type}"`;
      if (block.title) output += ` title="${block.title}"`;
      output += ` -->\n`;

      if (block.title) {
        output += `## ${block.title}\n\n`;
      }

      if (block.type === 'code') {
        output += `\`\`\`${block.language || ''}\n${block.content}\n\`\`\`\n\n`;
      } else {
        output += `${block.content}\n\n`;
      }
    } else {
      // Attribute style: ## Title {#block-1 .concept}
      if (block.title) {
        output += `## ${block.title} {#${block.id} .okf-${block.type}}\n\n`;
      } else {
        output += `<!-- okf:${block.type} id="${block.id}" -->\n`;
      }

      if (block.type === 'code') {
        output += `\`\`\`${block.language || ''}\n${block.content}\n\`\`\`\n\n`;
      } else {
        output += `${block.content}\n\n`;
      }
    }
  });

  return output.trim();
}

/**
 * Validates an OKF document against the OKF 1.0 Specification rules
 */
export function validateOKFDocument(okfContent: string): {
  isValid: boolean;
  score: number;
  warnings: string[];
  errors: string[];
  stats: {
    hasFrontmatter: boolean;
    hasOKFVersion: boolean;
    hasID: boolean;
    hasTitle: boolean;
    blockCount: number;
    containerStyle: string;
  };
} {
  const warnings: string[] = [];
  const errors: string[] = [];
  let score = 100;

  const hasFrontmatter = /^---\n[\s\S]+?\n---/.test(okfContent.trim());
  const hasOKFVersion = /^\s*okf:\s*["']?1\.\d+["']?/m.test(okfContent);
  const hasID = /^\s*id:\s*[a-zA-Z0-9_-]+/m.test(okfContent);
  const hasTitle = /^\s*title:\s*.+/m.test(okfContent);

  if (!hasFrontmatter) {
    errors.push('Missing YAML frontmatter block at document root.');
    score -= 40;
  }
  if (!hasOKFVersion) {
    errors.push('Missing or invalid "okf: 1.0" declaration in frontmatter.');
    score -= 30;
  }
  if (!hasID) {
    warnings.push('Frontmatter is missing a unique "id" field.');
    score -= 10;
  }
  if (!hasTitle) {
    warnings.push('Frontmatter is missing a "title" field.');
    score -= 10;
  }

  // Count blocks
  const containerBlocks = (okfContent.match(/^:::[a-z]+/gm) || []).length;
  const commentBlocks = (okfContent.match(/<!-- okf:block/gm) || []).length;
  const attributeBlocks = (okfContent.match(/\{#[a-zA-Z0-9_-]+\s+\.okf-[a-z]+\}/gm) || []).length;

  const blockCount = containerBlocks + commentBlocks + attributeBlocks;
  let containerStyle = 'standard-markdown';
  if (containerBlocks > 0) containerStyle = 'container (:::)';
  else if (commentBlocks > 0) containerStyle = 'comment (<!-- okf:block -->)';
  else if (attributeBlocks > 0) containerStyle = 'attribute ({#id .type})';

  if (blockCount === 0) {
    warnings.push('No typed OKF knowledge blocks detected in document body.');
    score -= 10;
  }

  return {
    isValid: errors.length === 0,
    score: Math.max(0, score),
    warnings,
    errors,
    stats: {
      hasFrontmatter,
      hasOKFVersion,
      hasID,
      hasTitle,
      blockCount,
      containerStyle,
    },
  };
}
