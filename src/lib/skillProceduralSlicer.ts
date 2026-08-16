/**
 * @file src/lib/skillProceduralSlicer.ts
 * @description Procedural Markdown Slicer conforming to the Agent Skills open standard (agentskills.io).
 *
 * Decomposes monolithic Runbooks, SOPs, and manuals into:
 * 1. Root SKILL.md (Progressive Disclosure Router with < 5,000 tokens)
 * 2. JIT Reference Files (references/*.md)
 * 3. Standalone Scripts (scripts/*)
 * 4. Configuration Templates / Assets (assets/*)
 */

import {
  AgentSkillFrontmatter,
  AgentSkillPackage,
  SkillAssetFile,
  SkillReferenceFile,
  SkillScriptFile,
} from '../types/agentSkill';
import { computeProgressiveDisclosureMetrics, estimateTokens } from '../utils/tokenEstimator';
export { computeProgressiveDisclosureMetrics, estimateTokens };
import { classifyTextLogic } from './logicClassifier';
import { extractLegalMetadata } from './temporalLegalParser';
import { extractBinaryAssetsAndScripts } from './binaryAssetExtractor';

export interface SkillSlicerOptions {
  /** Override skill name (must be kebab-case, 1-64 chars) */
  customSkillName?: string;
  /** Custom description (1-1024 chars) */
  customDescription?: string;
  /** License (default: 'MIT') */
  license?: string;
  /** Compatibility notes */
  compatibility?: string;
  /** Allowed tools override */
  allowedTools?: string[];
  /** Maximum token target for root SKILL.md body (default: 4000) */
  maxActivationTokens?: number;
}

interface RawSection {
  level: number;
  title: string;
  slug: string;
  rawText: string;
  isProcedural: boolean;
  isReferenceHeavy: boolean;
  codeBlocks: Array<{
    language: string;
    code: string;
    filenameHint?: string;
  }>;
}

const ACTION_VERBS = [
  'deploy', 'install', 'configure', 'setup', 'initialize', 'migrate',
  'build', 'run', 'execute', 'verify', 'validate', 'test', 'audit',
  'troubleshoot', 'rollback', 'restore', 'backup', 'monitor', 'scale',
  'provision', 'connect', 'authenticate', 'authorize', 'clean', 'format'
];

/**
 * Creates a valid kebab-case name compliant with agentskills.io:
 * 1-64 characters, lowercase alphanumeric and hyphens, no starting/trailing hyphen.
 */
export function sanitizeSkillName(rawName: string): string {
  let slug = rawName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!slug || slug.length === 0) {
    slug = 'agent-workflow-skill';
  }

  // Ensure maximum 64 characters
  if (slug.length > 64) {
    slug = slug.substring(0, 64).replace(/-+$/, '');
  }

  return slug;
}

/**
 * Detects if a heading or section is procedural / workflow-oriented based on action verbs, step markers, and formal logic.
 */
function isProceduralSection(title: string, rawText: string = ''): boolean {
  const lower = title.toLowerCase();
  if (/^(step\s*\d+|phase\s*\d+|part\s*\d+|workflow|procedure|runbook|checklist|instructions|actions)/i.test(lower)) {
    return true;
  }
  if (ACTION_VERBS.some(verb => lower.includes(verb))) {
    return true;
  }

  // If text is provided, perform formal logic classification
  if (rawText && rawText.length > 20) {
    const classification = classifyTextLogic(rawText);
    if (classification.proceduralScore >= 45) {
      return true;
    }
  }

  return false;
}

/**
 * Detects if a section is reference-heavy (e.g. extensive tables, error code dictionaries, raw specifications).
 */
function isReferenceHeavySection(text: string): boolean {
  const tableRowCount = (text.match(/\|.*\|/g) || []).length;
  const wordCount = text.split(/\s+/).length;
  const isLarge = wordCount > 400;
  const hasManyTables = tableRowCount > 10;
  const hasErrorCodes = /error\s*code|status\s*code|http\s*\d{3}|err_|exception/i.test(text);

  return (hasManyTables || hasErrorCodes) && isLarge;
}

/**
 * Extracts fenced code blocks from markdown text.
 */
function extractCodeBlocks(text: string): Array<{ language: string; code: string; filenameHint?: string }> {
  const blocks: Array<{ language: string; code: string; filenameHint?: string }> = [];
  const regex = /```([a-zA-Z0-9_-]+)?(?:\s+(?:file|name|path)=["']?([^\s"']+)["']?)?\n([\s\S]*?)```/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const language = (match[1] || 'text').toLowerCase();
    const filenameHint = match[2];
    const code = match[3].trim();
    if (code.length > 0) {
      blocks.push({ language, code, filenameHint });
    }
  }

  return blocks;
}

/**
 * Slices a monolithic Markdown text into structured procedural sections.
 */
function parseMarkdownToSections(markdown: string): RawSection[] {
  const lines = markdown.split('\n');
  const sections: RawSection[] = [];
  let currentSection: RawSection | null = null;
  let currentLines: string[] = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      currentLines.push(line);
      continue;
    }

    const headingMatch = !inCodeBlock ? line.match(/^(#{1,3})\s+(.+)$/) : null;

    if (headingMatch) {
      if (currentSection) {
        currentSection.rawText = currentLines.join('\n').trim();
        currentSection.codeBlocks = extractCodeBlocks(currentSection.rawText);
        currentSection.isProcedural = isProceduralSection(currentSection.title, currentSection.rawText);
        currentSection.isReferenceHeavy = isReferenceHeavySection(currentSection.rawText);
        sections.push(currentSection);
      }

      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();
      const slug = sanitizeSkillName(title);

      currentSection = {
        level,
        title,
        slug,
        rawText: '',
        isProcedural: isProceduralSection(title),
        isReferenceHeavy: false,
        codeBlocks: [],
      };
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentSection) {
    currentSection.rawText = currentLines.join('\n').trim();
    currentSection.codeBlocks = extractCodeBlocks(currentSection.rawText);
    currentSection.isProcedural = isProceduralSection(currentSection.title, currentSection.rawText);
    currentSection.isReferenceHeavy = isReferenceHeavySection(currentSection.rawText);
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Infers required agent tools based on detected commands and languages.
 */
function inferAllowedTools(markdown: string): string[] {
  const tools = new Set<string>();
  const lower = markdown.toLowerCase();

  if (/curl|wget|fetch|http|api/i.test(lower)) tools.add('web_fetch');
  if (/bash|sh\s|npm\s|docker\s|git\s|chmod|mkdir|kubectl/i.test(lower)) tools.add('run_command');
  if (/edit|write|file|modify|append|create\s*file/i.test(lower)) tools.add('edit_file');
  if (/search|grep|find|lookup/i.test(lower)) tools.add('search');

  if (tools.size === 0) {
    tools.add('run_command');
    tools.add('view_file');
  }

  return Array.from(tools);
}

/**
 * Main procedural slicer entry point.
 * Decomposes a monolithic markdown file into an AgentSkillPackage.
 */
export function sliceMonolithToAgentSkill(
  markdown: string,
  options: SkillSlicerOptions = {}
): AgentSkillPackage {
  const startTime = new Date().toISOString();
  const rawSections = parseMarkdownToSections(markdown);

  // Determine main skill title
  const h1Section = rawSections.find(s => s.level === 1);
  const primaryTitle = options.customSkillName || h1Section?.title || 'Operational Runbook Skill';
  const skillName = sanitizeSkillName(primaryTitle);

  // Decouple embedded base64/binary images and standalone scripts
  const decoupled = extractBinaryAssetsAndScripts(markdown, skillName);
  const effectiveMarkdown = decoupled.cleanedMarkdown;
  const processedSections = parseMarkdownToSections(effectiveMarkdown);

  // Synthesize concise Description (<= 1024 characters) conforming to best practices
  let description = options.customDescription;
  if (!description) {
    const proceduralCount = processedSections.filter(s => s.isProcedural).length;
    const refCount = processedSections.filter(s => s.isReferenceHeavy).length;
    description = `Use when instructed to perform, verify, troubleshoot, or orchestrate workflows for ${primaryTitle}. Covers operational steps (${proceduralCount} procedures), architectural specifications (${refCount} reference modules), and automation routines.`;
    if (description.length > 1020) {
      description = description.substring(0, 1015) + '...';
    }
  }

  const allowedTools = options.allowedTools || inferAllowedTools(effectiveMarkdown);

  const frontmatter: AgentSkillFrontmatter = {
    name: skillName,
    description,
    license: options.license || 'MIT',
    compatibility: options.compatibility || 'nodejs >= 18, bash, linux',
    'allowed-tools': allowedTools,
    metadata: {
      slicer: 'agentskills-procedural-v1.0',
      section_count: processedSections.length,
      extracted_binary_assets: decoupled.assets.length,
      extracted_binary_bytes: decoupled.totalBytesExtracted,
    },
  };

  const references: SkillReferenceFile[] = [];
  const scripts: SkillScriptFile[] = [];
  const assets: SkillAssetFile[] = [];

  // Register decoupled binary assets into assets/
  for (const asset of decoupled.assets) {
    assets.push({
      relativePath: asset.relativePath,
      filename: asset.filename,
      content: asset.dataBase64 || '',
      mimeType: asset.mimeType,
      estimatedTokens: 10, // External file reference is nominal in root context
    });
  }

  // Register decoupled scripts into scripts/
  for (const scr of decoupled.scripts) {
    let lang: SkillScriptFile['language'] = 'other';
    if (['bash', 'sh', 'shell'].includes(scr.language)) lang = 'bash';
    else if (['python', 'py'].includes(scr.language)) lang = 'python';
    else if (['javascript', 'js'].includes(scr.language)) lang = 'javascript';
    else if (['typescript', 'ts'].includes(scr.language)) lang = 'typescript';
    else if (scr.language === 'sql') lang = 'sql';

    scripts.push({
      relativePath: scr.relativePath,
      filename: scr.filename,
      language: lang,
      content: scr.content,
      executable: true,
      estimatedTokens: estimateTokens(scr.content),
    });
  }

  const activationProcedures: string[] = [];

  // Partition sections into Progressive Disclosure Tiers
  for (const section of processedSections) {
    if (section.level === 1 && !section.isProcedural) {
      continue; // H1 is integrated into overview
    }

    // Extract executable scripts if bash/python/sql
    section.codeBlocks.forEach((block, idx) => {
      if (['bash', 'sh', 'shell'].includes(block.language) && block.code.length > 80) {
        const filename = block.filenameHint || `${section.slug}_step_${idx + 1}.sh`;
        scripts.push({
          relativePath: `scripts/${filename}`,
          filename,
          language: 'bash',
          content: `#!/usr/bin/env bash\nset -euo pipefail\n\n# Auto-extracted from ${section.title}\n${block.code}\n`,
          executable: true,
          estimatedTokens: estimateTokens(block.code),
        });
      } else if (['python', 'py'].includes(block.language) && block.code.length > 80) {
        const filename = block.filenameHint || `${section.slug}_step_${idx + 1}.py`;
        scripts.push({
          relativePath: `scripts/${filename}`,
          filename,
          language: 'python',
          content: `# Auto-extracted from ${section.title}\n${block.code}\n`,
          executable: true,
          estimatedTokens: estimateTokens(block.code),
        });
      } else if (['json', 'yaml', 'yml'].includes(block.language) && block.code.length > 100) {
        const ext = block.language === 'json' ? 'json' : 'yaml';
        const filename = block.filenameHint || `${section.slug}_template.${ext}`;
        assets.push({
          relativePath: `assets/${filename}`,
          filename,
          content: block.code,
          mimeType: ext === 'json' ? 'application/json' : 'text/yaml',
          estimatedTokens: estimateTokens(block.code),
        });
      }
    });

    // Check if section should be offloaded to references/
    if (section.isReferenceHeavy || (!section.isProcedural && estimateTokens(section.rawText) > 250)) {
      const refPath = `references/${section.slug}.md`;
      const refContent = `# ${section.title}\n\n${section.rawText}\n`;
      references.push({
        relativePath: refPath,
        title: section.title,
        content: refContent,
        estimatedTokens: estimateTokens(refContent),
      });

      activationProcedures.push(
        `### Step ${activationProcedures.length + 1}: ${section.title}\n- **Action**: Consult the partitioned reference guide.\n- **Reference**: Detailed specifications and tables are documented in [\`${refPath}\`](./${refPath}).\n`
      );
    } else {
      // Core activation step retained in SKILL.md with numbered heading and verification cues
      const stepNum = activationProcedures.length + 1;
      const cleanTitle = section.title.replace(/^(?:step\s*\d+|#+)\s*/i, '');
      activationProcedures.push(
        `### Step ${stepNum}: ${cleanTitle}\n\n${section.rawText}\n\n- **Verification**: Ensure step outcomes match expected criteria before proceeding.\n`
      );
    }
  }

  // Legal & Policy metadata extraction (Temporal Horizons & Precedence Rules)
  const legalMetadata = extractLegalMetadata(markdown);
  if (legalMetadata.temporalHorizons.length > 0) {
    const temporalRefContent = `# Temporal Horizons & Compliance Deadlines\n\n` +
      `This reference documents all enforceable deadlines, statutory SLA periods, and periodic intervals extracted from the source document.\n\n` +
      `| ID | Type | Horizon / Duration | Enforceability | Trigger Event / Context |\n` +
      `| :--- | :--- | :--- | :--- | :--- |\n` +
      legalMetadata.temporalHorizons.map(t =>
        `| \`${t.id}\` | ${t.type} | **${t.durationAmount ? `${t.durationAmount} ${t.durationUnit}` : t.rawText}** | \`${t.enforceability}\` | ${t.triggerEvent || t.rawText} |`
      ).join('\n') +
      `\n\n## Contextual Traces\n` +
      legalMetadata.temporalHorizons.map(t => `### ${t.id} (${t.rawText})\n> "${t.contextSnippet}"\n`).join('\n');

    const refPath = 'references/temporal-deadlines.md';
    references.push({
      relativePath: refPath,
      title: 'Temporal Horizons & Compliance Deadlines',
      content: temporalRefContent,
      estimatedTokens: estimateTokens(temporalRefContent),
    });
  }

  if (legalMetadata.precedenceRules.length > 0) {
    const precedenceRefContent = `# Clause Precedence & Conflict Resolution Matrix\n\n` +
      `This reference documents the governing order of precedence and conflict resolution rules when inter-document clauses or schedules disagree.\n\n` +
      `| ID | Governing / Higher Doc | Subordinate Doc | Scope | Conflict Rule |\n` +
      `| :--- | :--- | :--- | :--- | :--- |\n` +
      legalMetadata.precedenceRules.map(p =>
        `| \`${p.id}\` | **${p.higherPrecedenceDoc}** | ${p.lowerPrecedenceDoc} | \`${p.scope}\` | ${p.conflictResolutionRule} |`
      ).join('\n') +
      `\n\n## Raw Clause Extracts\n` +
      legalMetadata.precedenceRules.map(p => `### ${p.id}\n> "${p.rawClause}"\n`).join('\n');

    const refPath = 'references/clause-precedence.md';
    references.push({
      relativePath: refPath,
      title: 'Clause Precedence & Hierarchy Matrix',
      content: precedenceRefContent,
      estimatedTokens: estimateTokens(precedenceRefContent),
    });
  }

  // Assemble the root SKILL.md Router
  const frontmatterYaml = [
    '---',
    `name: "${frontmatter.name}"`,
    `description: "${frontmatter.description.replace(/"/g, '\\"')}"`,
    `license: "${frontmatter.license}"`,
    `compatibility: "${frontmatter.compatibility}"`,
    `allowed-tools:`,
    ...allowedTools.map(t => `  - "${t}"`),
    'metadata:',
    `  slicer: "agentskills-procedural-v1.0"`,
    `  extracted_at: "${startTime}"`,
    '---',
  ].join('\n');

  const rootBody = [
    `# ${primaryTitle}`,
    '',
    `> **Agent Skill Router**: Conforms to the open [agentskills.io](https://agentskills.io/skill-creation/best-practices) specification. Follow the sequential workflow steps below. Consult \`references/\` just-in-time for deep architectural or domain background.`,
    '',
    '## When to Activate This Skill',
    `- **Trigger Criteria**: ${description}`,
    '- **Pre-requisites**: Verify environment runtime, permissions, and tool availability before executing.',
    '',
    '## Permitted Agent Tools & Capabilities',
    allowedTools.map(t => `- \`${t}\``).join('\n'),
    '',
    '## Execution Workflow',
    activationProcedures.length > 0
      ? activationProcedures.join('\n')
      : '1. Review prerequisites.\n2. Execute primary operational tasks sequentially.\n3. Validate operational state.',
    '',
    '## Verification & Success Criteria',
    '- [ ] Confirm all steps completed without unhandled exceptions or error codes.',
    '- [ ] Validate system outputs and telemetry against baseline operational state.',
    '- [ ] Verify no secrets or credentials leaked into output logs or workspace artifacts.',
    '',
    '## Troubleshooting & Rollback Protocols',
    '- **Execution Failure**: If any step encounters an error, halt subsequent steps immediately.',
    '- **Diagnostic Inspection**: Inspect error logs and consult related reference guides in `references/`.',
    '- **Rollback**: Revert any intermediate state changes and restore verified configuration.',
    '',
    references.length > 0
      ? [
          '## Progressive References (JIT Loaded)',
          '| Reference Guide | When to Read / Purpose | Token Estimate |',
          '| :--- | :--- | :--- |',
          ...references.map(r => `| [\`${r.title}\`](./${r.relativePath}) | Deep domain reference and specifications for ${r.title} | ~${r.estimatedTokens} tokens |`),
        ].join('\n')
      : '',
    scripts.length > 0
      ? [
          '',
          '## Extracted Automation Scripts',
          '| Script File | Language | Execution Command |',
          '| :--- | :--- | :--- |',
          ...scripts.map(s => `| \`./${s.relativePath}\` | \`${s.language}\` | \`${s.language === 'bash' ? 'bash ' : s.language === 'python' ? 'python3 ' : 'node '}.${s.relativePath}\` |`),
        ].join('\n')
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const rootSkillMd = `${frontmatterYaml}\n\n${rootBody}\n`;

  const metrics = computeProgressiveDisclosureMetrics(
    frontmatter,
    rootSkillMd,
    references,
    scripts,
    assets
  );

  const logicClassification = classifyTextLogic(markdown);

  return {
    name: skillName,
    rootSkillMd,
    frontmatter,
    references,
    scripts,
    assets,
    metrics,
    sourceDocumentTitle: primaryTitle,
    createdAt: startTime,
    logicClassification,
  };
}
