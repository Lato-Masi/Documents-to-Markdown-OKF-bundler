/**
 * @okf/cli Unified Command-Line Interface Engine
 * Provides CLI command implementations for zero-dependency execution:
 * - okf init: Scaffolds standard .okf/ directory structure
 * - okf check [--strict]: Validates knowledge bundles, detects broken links & cycles (exits with code 1 in CI)
 * - okf split <file>: Decomposes monolithic markdown into atomic OKF concepts
 * - okf export: Compiles bundle to Obsidian Vault, W3C RDF Turtle, or JSON-LD
 * - okf query: Runs Graph-RAG retrieval directly from terminal
 * - okf skill-slice <file>: Decomposes runbook into an Agent Skill package (SKILL.md, references/, scripts/)
 * - okf skill-audit <file>: Runs 100-point Best Practices audit against agentskills.io & Claude standards
 * - okf github-action: Generates GitHub Actions workflow YAML
 */

import { validateOkfBundle, type OkfValidationReport } from './okfCoreValidator';
import { sliceMonolithicMarkdown, type OkfSlicerResult } from './okfMarkdownSlicer';
import { buildOkfKnowledgeGraph, executeGraphRagQuery } from './okfCoreGraphRag';
import { exportOkfBundle } from './okfMultiFormatExporter';
import { sliceMonolithToAgentSkill } from './skillProceduralSlicer';
import { auditAgentSkillBestPractices } from './agentSkillBestPracticesEngine';
import { validateAgentSkill } from './skillValidator';
import type { OkfBundle } from 'okf-ts';

export interface CliCommandResult {
  command: string;
  args: string[];
  exitCode: number; // 0 for success, 1 for error
  stdout: string[];
  stderr: string[];
  filesCreated?: Array<{ path: string; content: string }>;
  executionTimeMs: number;
}

export interface CliContext {
  cwd: string;
  files: Map<string, string>; // path -> content
  bundle?: OkfBundle;
}

/**
 * Executes a simulated or real CLI command line string.
 */
export function executeOkfCliCommand(
  rawCommand: string,
  context: CliContext
): CliCommandResult {
  const startTime = performance.now();
  const trimmed = rawCommand.trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);

  // Normalize command
  let cmdIndex = 0;
  if (parts[0] === 'npx' || parts[0] === 'bunx' || parts[0] === 'pnpm' || parts[0] === 'yarn') {
    cmdIndex++;
  }
  if (parts[cmdIndex] === 'okf' || parts[cmdIndex] === '@okf/cli') {
    cmdIndex++;
  }

  const subCommand = parts[cmdIndex] || 'help';
  const args = parts.slice(cmdIndex + 1);

  const stdout: string[] = [];
  const stderr: string[] = [];
  let exitCode = 0;
  const filesCreated: Array<{ path: string; content: string }> = [];

  switch (subCommand.toLowerCase()) {
    case 'help':
    case '--help':
    case '-h': {
      stdout.push(`\x1b[1;34m@okf/cli\x1b[0m - Open Knowledge Format & Agent Skills CLI Tooling (v1.5.0)`);
      stdout.push(``);
      stdout.push(`\x1b[1mUSAGE:\x1b[0m`);
      stdout.push(`  npx okf <command> [options]`);
      stdout.push(``);
      stdout.push(`\x1b[1mOKF KNOWLEDGE GRAPH COMMANDS:\x1b[0m`);
      stdout.push(`  \x1b[32minit\x1b[0m [dir]                    Scaffold a pristine .okf/ knowledge directory`);
      stdout.push(`  \x1b[32mcheck\x1b[0m [--strict]               Lint knowledge bundle, verify schemas, links & cycles`);
      stdout.push(`  \x1b[32msplit\x1b[0m <file> [--out-dir=dir]    Decompose monolithic markdown into atomic OKF concepts`);
      stdout.push(`  \x1b[32mexport\x1b[0m --format=<fmt>          Export to obsidian, turtle (RDF), jsonld, or csv`);
      stdout.push(`  \x1b[32mquery\x1b[0m "<prompt>" [--hops=1]     Execute Graph-RAG retrieval and return grounded context`);
      stdout.push(`  \x1b[32mci-setup\x1b[0m                       Generate .github/workflows/okf-lint.yml workflow`);
      stdout.push(``);
      stdout.push(`\x1b[1mAGENT SKILLS COMMANDS (agentskills.io & Claude standards):\x1b[0m`);
      stdout.push(`  \x1b[32mskill-slice\x1b[0m <file> [--name=x]  Decompose runbook into canonical Agent Skill package`);
      stdout.push(`  \x1b[32mskill-audit\x1b[0m <file>             Run 100-point best practices audit & compliance check`);
      stdout.push(`  \x1b[32mskill-validate\x1b[0m <file>          Run 6-point preflight validation (SKILL-001 - SKILL-006)`);
      stdout.push(``);
      stdout.push(`\x1b[1mOPTIONS:\x1b[0m`);
      stdout.push(`  --strict                      Fail with non-zero exit code if warnings or unverified nodes exist`);
      stdout.push(`  --format=<fmt>                Export target: obsidian, turtle, jsonld, csv`);
      stdout.push(`  --hops=<0|1|2>                Graph-RAG neighborhood traversal hops (default: 1)`);
      stdout.push(`  --name=<kebab-name>           Target skill name for skill-slice`);
      stdout.push(`  --help, -h                    Display command help`);
      stdout.push(`  --version, -v                 Display CLI version`);
      break;
    }

    case 'version':
    case '--version':
    case '-v': {
      stdout.push(`@okf/cli v1.5.0 (node v20.12.0 darwin-x64)`);
      stdout.push(`@okf/core: 1.5.0 | agentskills.io spec: 0.1.0 | W3C SPARQL: 1.1`);
      break;
    }

    case 'init': {
      const targetDir = args[0] || '.okf';
      stdout.push(`\x1b[1;34m[OKF]\x1b[0m Initializing Open Knowledge repository in \x1b[1m${targetDir}/\x1b[0m...`);

      const indexContent = `# Knowledge Base Index

Welcome to the project knowledge repository formatted in **OKF (Open Knowledge Format)**.

## Categories
- [[concepts/architecture|System Architecture]]
- [[procedures/deployment|Deployment Pipeline]]
- [[tables/api-endpoints|API Reference Endpoints]]
`;

      const conceptContent = `---
type: concept
title: System Architecture
description: Core architectural blueprint and service topology.
status: stable
trustTier: human-reviewed
tags: [architecture, core, backend]
verified_by: "Lead Architect"
verified_at: "2026-08-15"
---

# System Architecture

The core architecture follows modular domain-driven design principles.

## Subsystems
- [[procedures/deployment|CI/CD Pipeline]]
- [[tables/api-endpoints|REST API Endpoints]]
`;

      const procContent = `---
type: procedure
title: Deployment Pipeline
description: Automated deployment and verification procedure.
status: stable
trustTier: human-reviewed
tags: [devops, deploy, ci]
depends_on: [architecture]
verified_by: "DevOps Team"
verified_at: "2026-08-15"
---

# Deployment Pipeline

:::procedure
1. Run \`npx okf check --strict\` in CI.
2. Build container images.
3. Deploy to production environment.
4. Execute smoke tests.
:::
`;

      filesCreated.push(
        { path: `${targetDir}/index.md`, content: indexContent },
        { path: `${targetDir}/concepts/architecture.md`, content: conceptContent },
        { path: `${targetDir}/procedures/deployment.md`, content: procContent }
      );

      stdout.push(`\x1b[32m✔\x1b[0m Created ${targetDir}/index.md`);
      stdout.push(`\x1b[32m✔\x1b[0m Created ${targetDir}/concepts/architecture.md`);
      stdout.push(`\x1b[32m✔\x1b[0m Created ${targetDir}/procedures/deployment.md`);
      stdout.push(`\x1b[32m✔\x1b[0m Created ${targetDir}/tables/`);
      stdout.push(``);
      stdout.push(`\x1b[1;32m[SUCCESS]\x1b[0m OKF workspace initialized with 3 template documents.`);
      stdout.push(`Next step: Run \x1b[1;33mnpx okf check\x1b[0m to verify bundle integrity.`);
      break;
    }

    case 'check':
    case 'lint': {
      const isStrict = args.includes('--strict');
      stdout.push(`\x1b[1;34m[OKF]\x1b[0m Linting knowledge repository (strict: \x1b[1m${isStrict ? 'enabled' : 'disabled'}\x1b[0m)...`);

      // Prepare documents from context
      const docs: Array<{ path?: string; content: string }> = [];
      if (context.files.size > 0) {
        for (const [path, content] of context.files.entries()) {
          docs.push({ path, content });
        }
      } else if (context.bundle) {
        for (const c of context.bundle.concepts) {
          docs.push({
            path: c.path || `${c.id}.md`,
            content: c.body ? `---\n${JSON.stringify(c.metadata, null, 2)}\n---\n\n${c.body}` : c.body || '',
          });
        }
      }

      if (docs.length === 0) {
        stderr.push(`\x1b[31m[ERROR]\x1b[0m No OKF documents found in context to validate.`);
        exitCode = 1;
        break;
      }

      const report: OkfValidationReport = validateOkfBundle(docs);

      stdout.push(`Scanned \x1b[1m${docs.length}\x1b[0m document(s).`);
      stdout.push(``);

      // Issues output
      if (report.issues.length === 0) {
        stdout.push(`\x1b[32m✔\x1b[0m All YAML schemas valid`);
        stdout.push(`\x1b[32m✔\x1b[0m 0 broken [[wikilinks]] detected`);
        stdout.push(`\x1b[32m✔\x1b[0m 0 dependency cycles found`);
        stdout.push(`\x1b[32m✔\x1b[0m Provenance & Trust audits passed (${report.trustSummary.ratioHumanReviewed}% human-reviewed)`);
        stdout.push(``);
        stdout.push(`\x1b[1;32m[PASS]\x1b[0m Knowledge bundle score: \x1b[1m${report.score}/100\x1b[0m. Zero errors detected.`);
      } else {
        for (const issue of report.issues) {
          const prefix =
            issue.severity === 'error'
              ? '\x1b[31m✖ [ERROR]\x1b[0m'
              : issue.severity === 'warning'
              ? '\x1b[33m▲ [WARN]\x1b[0m'
              : '\x1b[36mℹ [INFO]\x1b[0m';

          const loc = issue.filePath ? ` (${issue.filePath}${issue.line ? `:${issue.line}` : ''})` : '';
          stdout.push(`${prefix} \x1b[1m${issue.code}\x1b[0m${loc}: ${issue.message}`);
          if (issue.fixSuggestion) {
            stdout.push(`    \x1b[90mSuggestion: ${issue.fixSuggestion}\x1b[0m`);
          }
        }

        stdout.push(``);
        stdout.push(`Audit Summary: \x1b[31m${report.errors.length} errors\x1b[0m, \x1b[33m${report.warnings.length} warnings\x1b[0m (Score: ${report.score}/100)`);

        if (report.errors.length > 0 || (isStrict && report.warnings.length > 0)) {
          exitCode = 1;
          stderr.push(`\x1b[1;31m[FAILED]\x1b[0m OKF bundle validation failed in ${isStrict ? 'strict' : 'standard'} mode.`);
        } else {
          stdout.push(`\x1b[1;32m[PASS]\x1b[0m OKF bundle is valid with minor warnings.`);
        }
      }
      break;
    }

    case 'split':
    case 'decompose': {
      const targetFile = args.find((a) => !a.startsWith('--')) || 'CLAUDE.md';
      stdout.push(`\x1b[1;34m[OKF]\x1b[0m Slicing monolithic document \x1b[1m${targetFile}\x1b[0m into atomic concepts...`);

      const fileContent = context.files.get(targetFile) || context.files.get('current.md') || '';
      if (!fileContent) {
        stderr.push(`\x1b[31m[ERROR]\x1b[0m File '${targetFile}' not found in workspace.`);
        exitCode = 1;
        break;
      }

      const sliceRes: OkfSlicerResult = sliceMonolithicMarkdown(fileContent);

      stdout.push(`\x1b[32m✔\x1b[0m Extracted \x1b[1m${sliceRes.totalFiles}\x1b[0m atomic concepts across 4 categories`);
      stdout.push(`\x1b[32m✔\x1b[0m Generated \x1b[1m${sliceRes.generatedWikilinksCount}\x1b[0m bidirectional [[wikilinks]]`);
      stdout.push(`\x1b[32m✔\x1b[0m Synthesized master manifest \x1b[1m.okf/index.md\x1b[0m`);
      stdout.push(``);

      for (const f of sliceRes.files) {
        stdout.push(`  + ${f.path} \x1b[90m(${f.type})\x1b[0m`);
        filesCreated.push({ path: f.path, content: f.content });
      }
      for (const asset of sliceRes.assets) {
        stdout.push(`  + .okf/${asset.relativePath} \x1b[90m(asset: ${asset.mimeType})\x1b[0m`);
        filesCreated.push({ path: `.okf/${asset.relativePath}`, content: asset.dataBase64 || '' });
      }
      for (const script of sliceRes.scripts) {
        stdout.push(`  + .okf/${script.relativePath} \x1b[90m(script: ${script.language})\x1b[0m`);
        filesCreated.push({ path: `.okf/${script.relativePath}`, content: script.content });
      }
      filesCreated.push({ path: sliceRes.indexFile.path, content: sliceRes.indexFile.content });

      stdout.push(``);
      stdout.push(`\x1b[1;32m[SUCCESS]\x1b[0m Sliced monolithic file in ${sliceRes.executionTimeMs}ms (extracted ${sliceRes.assets.length} binary assets, ${sliceRes.scripts.length} standalone scripts).`);
      break;
    }

    case 'export': {
      let format = 'turtle';
      const fmtArg = args.find((a) => a.startsWith('--format='));
      if (fmtArg) {
        format = fmtArg.replace('--format=', '');
      }

      stdout.push(`\x1b[1;34m[OKF]\x1b[0m Exporting knowledge bundle to format: \x1b[1m${format}\x1b[0m...`);

      if (!context.bundle) {
        stderr.push(`\x1b[31m[ERROR]\x1b[0m No active OKF bundle found in context.`);
        exitCode = 1;
        break;
      }

      const expRes = exportOkfBundle(context.bundle, format as any);
      stdout.push(`\x1b[32m✔\x1b[0m Compiled \x1b[1m${context.bundle.concepts.length}\x1b[0m concepts to ${expRes.mimeType}`);
      stdout.push(`\x1b[32m✔\x1b[0m Output size: \x1b[1m${expRes.content.length}\x1b[0m bytes`);
      stdout.push(``);
      stdout.push(`\x1b[90m--- Output Preview (${format}) ---\x1b[0m`);
      const previewLines = expRes.content.split('\n').slice(0, 10).join('\n');
      stdout.push(previewLines);
      if (expRes.content.split('\n').length > 10) {
        stdout.push(`\x1b[90m... (${expRes.content.split('\n').length - 10} more lines)\x1b[0m`);
      }
      stdout.push(``);
      stdout.push(`\x1b[1;32m[SUCCESS]\x1b[0m Exported successfully to ${expRes.filename}.`);
      filesCreated.push({ path: expRes.filename, content: expRes.content });
      break;
    }

    case 'query':
    case 'rag': {
      const queryStr = args.filter((a) => !a.startsWith('--')).join(' ').replace(/^["']|["']$/g, '');
      if (!queryStr) {
        stderr.push(`\x1b[31m[ERROR]\x1b[0m Please provide a query string. Example: npx okf query "architecture"`);
        exitCode = 1;
        break;
      }

      stdout.push(`\x1b[1;34m[OKF Graph-RAG]\x1b[0m Querying: "\x1b[1m${queryStr}\x1b[0m"...`);

      const docs: Array<{ path?: string; content: string }> = [];
      if (context.files.size > 0) {
        for (const [path, content] of context.files.entries()) {
          docs.push({ path, content });
        }
      } else if (context.bundle) {
        for (const c of context.bundle.concepts) {
          docs.push({
            path: c.path || `${c.id}.md`,
            content: c.body ? `---\n${JSON.stringify(c.metadata, null, 2)}\n---\n\n${c.body}` : c.body || '',
          });
        }
      }

      const graph = buildOkfKnowledgeGraph(docs);
      const ragRes = executeGraphRagQuery(graph, {
        query: queryStr,
        topK: 2,
        maxHops: 1,
      });

      stdout.push(`\x1b[32m✔\x1b[0m Identified \x1b[1m${ragRes.seeds.length}\x1b[0m primary seed nodes`);
      stdout.push(`\x1b[32m✔\x1b[0m Traversed 1-hop neighborhood: \x1b[1m${ragRes.expandedNodes.length}\x1b[0m dependent/prerequisite nodes`);
      stdout.push(`\x1b[32m✔\x1b[0m Synthesized grounded context (~${ragRes.totalTokensUsed} tokens) in ${ragRes.executionTimeMs}ms`);
      stdout.push(``);
      stdout.push(`\x1b[1mRetrieved Nodes:\x1b[0m`);
      for (const item of ragRes.allRetrievedNodes) {
        stdout.push(`  * [${item.isSeed ? 'SEED' : `${item.hopDistance}-HOP`}] \x1b[1m${item.node.title}\x1b[0m (${item.node.id}) - \x1b[32m[${item.node.trustTier}]\x1b[0m`);
      }
      stdout.push(``);
      stdout.push(`\x1b[1;32m[SUCCESS]\x1b[0m Graph-RAG subgraph context ready for LLM prompt injection.`);
      break;
    }

    case 'ci-setup':
    case 'github-action': {
      stdout.push(`\x1b[1;34m[OKF]\x1b[0m Generating GitHub Actions CI workflow...`);

      const yamlContent = `name: OKF Knowledge Conformance & Lint
on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  okf-lint:
    runs-on: ubuntu-latest
    name: Validate Open Knowledge Format
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Run OKF Conformance Linter
        run: npx @okf/cli check --strict
`;

      filesCreated.push({
        path: '.github/workflows/okf-lint.yml',
        content: yamlContent,
      });

      stdout.push(`\x1b[32m✔\x1b[0m Created \x1b[1m.github/workflows/okf-lint.yml\x1b[0m`);
      stdout.push(``);
      stdout.push(`\x1b[1;32m[SUCCESS]\x1b[0m CI/CD workflow created. Commits to main/PRs will automatically enforce knowledge graph integrity.`);
      break;
    }

    case 'skill-slice':
    case 'skill-decompose': {
      const targetFile = args.find((a) => !a.startsWith('--')) || 'runbook.md';
      const nameArg = args.find((a) => a.startsWith('--name='));
      const customName = nameArg ? nameArg.replace('--name=', '') : targetFile.replace(/\.[^/.]+$/, '');

      stdout.push(`\x1b[1;34m[Agent Skills]\x1b[0m Slicing \x1b[1m${targetFile}\x1b[0m into Agent Skill package (\x1b[1m${customName}\x1b[0m)...`);

      const fileContent = context.files.get(targetFile) || context.files.get('runbook.md') || context.files.get('current.md') || '';
      if (!fileContent) {
        stderr.push(`\x1b[31m[ERROR]\x1b[0m File '${targetFile}' not found in workspace.`);
        exitCode = 1;
        break;
      }

      const skillPkg = sliceMonolithToAgentSkill(fileContent, { customSkillName: customName });

      stdout.push(`\x1b[32m✔\x1b[0m Created canonical router: \x1b[1m${skillPkg.name}/SKILL.md\x1b[0m (${skillPkg.metrics.activationTokens} tokens)`);
      stdout.push(`\x1b[32m✔\x1b[0m Partitioned \x1b[1m${skillPkg.references.length}\x1b[0m JIT references in \x1b[1m${skillPkg.name}/references/\x1b[0m`);
      stdout.push(`\x1b[32m✔\x1b[0m Extracted \x1b[1m${skillPkg.scripts.length}\x1b[0m executable scripts in \x1b[1m${skillPkg.name}/scripts/\x1b[0m`);
      stdout.push(`\x1b[32m✔\x1b[0m Progressive disclosure savings: \x1b[1m${skillPkg.metrics.contextSavingsPercentage}%\x1b[0m vs monolithic injection`);
      stdout.push(``);

      filesCreated.push({ path: `${skillPkg.name}/SKILL.md`, content: skillPkg.rootSkillMd });
      for (const ref of skillPkg.references) {
        stdout.push(`  + ${skillPkg.name}/${ref.relativePath} \x1b[90m(${ref.estimatedTokens} tokens)\x1b[0m`);
        filesCreated.push({ path: `${skillPkg.name}/${ref.relativePath}`, content: ref.content });
      }
      for (const script of skillPkg.scripts) {
        stdout.push(`  + ${skillPkg.name}/${script.relativePath} \x1b[90m(lang: ${script.language})\x1b[0m`);
        filesCreated.push({ path: `${skillPkg.name}/${script.relativePath}`, content: script.content });
      }
      for (const asset of skillPkg.assets) {
        stdout.push(`  + ${skillPkg.name}/${asset.relativePath} \x1b[90m(asset: ${asset.mimeType})\x1b[0m`);
        filesCreated.push({ path: `${skillPkg.name}/${asset.relativePath}`, content: asset.content });
      }

      stdout.push(``);
      stdout.push(`\x1b[1;32m[SUCCESS]\x1b[0m Agent Skill package created adhering to agentskills.io & Claude standards.`);
      break;
    }

    case 'skill-audit': {
      const targetFile = args.find((a) => !a.startsWith('--')) || 'runbook.md';
      stdout.push(`\x1b[1;34m[Agent Skills Audit]\x1b[0m Running 100-point compliance audit on \x1b[1m${targetFile}\x1b[0m...`);

      const fileContent = context.files.get(targetFile) || context.files.get('runbook.md') || context.files.get('current.md') || '';
      if (!fileContent) {
        stderr.push(`\x1b[31m[ERROR]\x1b[0m File '${targetFile}' not found in workspace.`);
        exitCode = 1;
        break;
      }

      const skillPkg = sliceMonolithToAgentSkill(fileContent, { customSkillName: targetFile.replace(/\.[^/.]+$/, '') });
      const audit = auditAgentSkillBestPractices(skillPkg);

      stdout.push(`Audit Target: \x1b[1m${skillPkg.frontmatter.name}\x1b[0m`);
      stdout.push(`Overall Score: \x1b[1m${audit.overallScore}/100\x1b[0m (Grade: \x1b[1m${audit.grade}\x1b[0m)`);
      stdout.push(``);

      for (const check of audit.checks) {
        const icon = check.passed ? '\x1b[32m✔\x1b[0m' : '\x1b[33m▲\x1b[0m';
        stdout.push(`  ${icon} [${check.category}] \x1b[1m${check.name}\x1b[0m: ${check.passed ? 'PASSED' : 'NEEDS ATTENTION'} (${check.score}/100)`);
        if (!check.passed && check.recommendation) {
          stdout.push(`    \x1b[90mSuggestion: ${check.recommendation}\x1b[0m`);
        }
      }

      stdout.push(``);
      if (audit.isCompliant) {
        stdout.push(`\x1b[1;32m[PASS]\x1b[0m Skill conforms to agentskills.io and Anthropic Claude standards.`);
      } else {
        stdout.push(`\x1b[1;33m[WARN]\x1b[0m Skill has optimization recommendations for peak agent trigger accuracy.`);
      }
      break;
    }

    case 'skill-validate': {
      const targetFile = args.find((a) => !a.startsWith('--')) || 'runbook.md';
      stdout.push(`\x1b[1;34m[Agent Skills Preflight]\x1b[0m Validating \x1b[1m${targetFile}\x1b[0m against SKILL-001..SKILL-006...`);

      const fileContent = context.files.get(targetFile) || context.files.get('runbook.md') || context.files.get('current.md') || '';
      if (!fileContent) {
        stderr.push(`\x1b[31m[ERROR]\x1b[0m File '${targetFile}' not found in workspace.`);
        exitCode = 1;
        break;
      }

      const skillPkg = sliceMonolithToAgentSkill(fileContent, { customSkillName: targetFile.replace(/\.[^/.]+$/, '') });
      const validation = validateAgentSkill(skillPkg);
      const errors = validation.issues.filter(i => i.severity === 'error');
      const warnings = validation.issues.filter(i => i.severity === 'warning');
      const score = Math.max(0, 100 - (errors.length * 20 + warnings.length * 5));

      stdout.push(`Validation Score: \x1b[1m${score}/100\x1b[0m (${validation.valid ? 'VALID' : 'INVALID'})`);
      stdout.push(``);

      for (const issue of validation.issues) {
        const icon = issue.severity === 'error' ? '\x1b[31m✖\x1b[0m' : '\x1b[33m⚠\x1b[0m';
        stdout.push(`  ${icon} \x1b[1m${issue.ruleId}\x1b[0m: ${issue.message}`);
        if (issue.suggestion) {
          stdout.push(`    \x1b[90m${issue.suggestion}\x1b[0m`);
        }
      }

      if (!validation.valid) {
        exitCode = 1;
        stderr.push(`\x1b[1;31m[FAILED]\x1b[0m Preflight validation failed with ${errors.length} error(s).`);
      } else {
        stdout.push(``);
        stdout.push(`\x1b[1;32m[PASS]\x1b[0m All preflight validator rules passed.`);
      }
      break;
    }

    default: {
      stderr.push(`\x1b[31m[ERROR]\x1b[0m Unknown command: '${subCommand}'.`);
      stderr.push(`Run \x1b[1mnpx okf --help\x1b[0m to view available commands.`);
      exitCode = 1;
      break;
    }
  }

  const executionTimeMs = Math.round((performance.now() - startTime) * 100) / 100;

  return {
    command: rawCommand,
    args,
    exitCode,
    stdout,
    stderr,
    filesCreated,
    executionTimeMs,
  };
}

/**
 * Returns the GitHub Action workflow file content.
 */
export function getGitHubActionsWorkflowContent(): string {
  return `name: OKF Knowledge Conformance & Lint
on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  okf-lint:
    runs-on: ubuntu-latest
    name: Validate Open Knowledge Format
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Run OKF Conformance Linter
        run: npx @okf/cli check --strict
`;
}
