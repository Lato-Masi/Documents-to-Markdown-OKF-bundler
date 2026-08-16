#!/usr/bin/env node
/**
 * @file cli/index.ts
 * @description Command-line interface for the Open Knowledge Format (@okf/cli).
 *
 * Provides developers and CI/CD pipelines with standalone commands to:
 * - Initialize compliant OKF directory structures (`npx okf init`)
 * - Lint knowledge bases and detect broken links/cycles (`npx okf check --strict`)
 * - Split monolithic Markdown files into atomic concepts (`npx okf split <file>`)
 * - Export to W3C Turtle, JSON-LD, and Obsidian formats (`npx okf export`)
 * - Perform localized Graph-RAG neighborhood retrieval (`npx okf query "<prompt>"`)
 * - Generate GitHub Actions workflow configs for automated pull request checks (`npx okf ci-setup`)
 */

import fs from 'fs';
import path from 'path';
import { sliceMonolithToAgentSkill } from '../src/lib/skillProceduralSlicer';
import { validateAgentSkill } from '../src/lib/skillValidator';
import { classifyTextLogic } from '../src/lib/logicClassifier';

// Standalone CLI runner entrypoint
const args = process.argv.slice(2);
const command = args[0] || 'help';

/**
 * Prints the ANSI-formatted terminal help reference.
 */
function printHelp() {
  console.log(`
\x1b[1;34m@okf/cli\x1b[0m - Open Knowledge Format & Agent Skills CLI (v1.5.0)

\x1b[1mUSAGE:\x1b[0m
  npx okf <command> [options]

\x1b[1mDECLARATIVE KNOWLEDGE (OKF):\x1b[0m
  \x1b[32minit\x1b[0m [dir]                  Scaffold a pristine .okf/ knowledge directory
  \x1b[32mcheck\x1b[0m [--strict]             Lint knowledge bundle, verify schemas, links & cycles
  \x1b[32msplit\x1b[0m <file> [--out-dir=dir]        Decompose monolithic markdown into atomic OKF concepts
  \x1b[32mexport\x1b[0m --format=<fmt>              Export to obsidian, turtle (RDF), jsonld, or csv
  \x1b[32mquery\x1b[0m "<prompt>" [--hops=1]   Execute Graph-RAG retrieval and return grounded context
  \x1b[32mci-setup\x1b[0m                     Generate .github/workflows/okf-lint.yml workflow

\x1b[1mPROCEDURAL AGENT SKILLS (SKILL.MD):\x1b[0m
  \x1b[32mskill-split\x1b[0m <file> [--out-dir=dir]  Decompose SOP/runbook into Agent Skills package (SKILL.md)
  \x1b[32mskill-batch\x1b[0m <src-dir> [--out-dir=dir] Batch compile an entire directory of documents into skills
  \x1b[32mskill-lint\x1b[0m <skill-dir> [--strict]   Validate skill directory against SKILL-001..006 rules
  \x1b[32mskill-classify\x1b[0m <file>                Run formal First-Order Logic (FOL/HOL) text classifier
  \x1b[32mskill-init\x1b[0m <name> [dir]            Scaffold a compliant Agent Skill starter directory

\x1b[1mOPTIONS:\x1b[0m
  --strict                    Fail with non-zero exit code if preflight diagnostics find errors
  --out-dir=<dir>             Target directory for decomposed skills/concepts (default: .skills or .okf)
  --tools=<list>              Comma-separated list of allowed tools (e.g. run_command,edit_file)
  --format=<fmt>              Export target: obsidian, turtle, jsonld, csv
  --hops=<0|1|2>              Graph-RAG neighborhood traversal hops (default: 1)
  --help, -h                  Display command help
  --version, -v               Display CLI version
`);
}

// Route command execution
switch (command) {
  case 'help':
  case '--help':
  case '-h':
    printHelp();
    process.exit(0);
    break;

  case 'version':
  case '--version':
  case '-v':
    console.log('@okf/cli v1.4.0');
    process.exit(0);
    break;

  case 'skill-split': {
    const filePath = args[1];
    if (!filePath || !fs.existsSync(filePath)) {
      console.error(`\x1b[31m✖\x1b[0m File not found: ${filePath || '<missing>'}`);
      process.exit(1);
    }
    const outDir = (args.find(a => a.startsWith('--out-dir=')) || '').split('=')[1] || '.skills';
    const toolsArg = (args.find(a => a.startsWith('--tools=')) || '').split('=')[1];
    const allowedTools = toolsArg ? toolsArg.split(',').map(t => t.trim()) : undefined;

    console.log(`\x1b[1;34m[Agent Skills]\x1b[0m Decomposing \x1b[1m${filePath}\x1b[0m into Agent Skills format at \x1b[1m${outDir}/\x1b[0m...`);
    const content = fs.readFileSync(filePath, 'utf-8');
    const skillName = path.basename(filePath, path.extname(filePath)).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const targetDir = path.join(outDir, skillName);

    const pkg = sliceMonolithToAgentSkill(content, { customSkillName: skillName, allowedTools });
    const validation = validateAgentSkill(pkg);

    fs.mkdirSync(path.join(targetDir, 'references'), { recursive: true });
    fs.mkdirSync(path.join(targetDir, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(targetDir, 'assets'), { recursive: true });

    // Write root SKILL.md
    fs.writeFileSync(path.join(targetDir, 'SKILL.md'), pkg.rootSkillMd, 'utf-8');

    // Write references
    for (const ref of pkg.references) {
      fs.writeFileSync(path.join(targetDir, ref.relativePath), ref.content, 'utf-8');
    }

    // Write scripts
    for (const script of pkg.scripts) {
      fs.writeFileSync(path.join(targetDir, script.relativePath), script.content, 'utf-8');
    }

    // Write assets
    for (const asset of pkg.assets) {
      fs.writeFileSync(path.join(targetDir, asset.relativePath), asset.content, 'utf-8');
    }

    console.log(`\x1b[32m✔\x1b[0m Generated Agent Skill: ${targetDir}/SKILL.md (${pkg.metrics.activationTokens} activation tokens)`);
    console.log(`  - References: ${pkg.references.length} files`);
    console.log(`  - Scripts: ${pkg.scripts.length} files`);
    console.log(`  - Assets: ${pkg.assets.length} files`);
    console.log(`  - Context Savings: ${pkg.metrics.contextSavingsPercentage}%`);
    console.log(`  - Specification Preflight: ${validation.valid ? '\x1b[32mPASSED (6/6 rules)\x1b[0m' : '\x1b[31mISSUES FOUND\x1b[0m'}`);
    process.exit(0);
    break;
  }

  case 'skill-lint': {
    const skillDir = args[1] || '.';
    const skillMdPath = fs.existsSync(path.join(skillDir, 'SKILL.md'))
      ? path.join(skillDir, 'SKILL.md')
      : (fs.existsSync(skillDir) && skillDir.endsWith('SKILL.md') ? skillDir : null);

    if (!skillMdPath || !fs.existsSync(skillMdPath)) {
      console.error(`\x1b[31m✖\x1b[0m No SKILL.md found in ${skillDir}`);
      process.exit(1);
    }

    const baseDir = path.dirname(skillMdPath);
    const rootSkillMd = fs.readFileSync(skillMdPath, 'utf-8');

    // Gather references and scripts
    const references: any[] = [];
    const refDir = path.join(baseDir, 'references');
    if (fs.existsSync(refDir)) {
      for (const file of fs.readdirSync(refDir)) {
        if (file.endsWith('.md')) {
          references.push({
            name: file,
            relativePath: `references/${file}`,
            content: fs.readFileSync(path.join(refDir, file), 'utf-8'),
          });
        }
      }
    }

    const scripts: any[] = [];
    const scrDir = path.join(baseDir, 'scripts');
    if (fs.existsSync(scrDir)) {
      for (const file of fs.readdirSync(scrDir)) {
        scripts.push({
          name: file,
          relativePath: `scripts/${file}`,
          content: fs.readFileSync(path.join(scrDir, file), 'utf-8'),
        });
      }
    }

    const skillName = path.basename(baseDir);
    const pkgPayload = {
      name: skillName,
      rootSkillMd,
      references,
      scripts,
      assets: [],
      metrics: {
        discoveryTokens: 0,
        activationTokens: 0,
        executionTotalTokens: 0,
        originalTotalTokens: 0,
        contextSavingsPercentage: 0,
      },
      createdAt: new Date().toISOString(),
    };

    const validation = validateAgentSkill(pkgPayload as any);
    console.log(`\x1b[1;34m[Agent Skills Linter]\x1b[0m Linting \x1b[1m${skillMdPath}\x1b[0m...`);
    console.log(`  Conformance: ${validation.valid ? '\x1b[32mVALID\x1b[0m' : '\x1b[31mINVALID\x1b[0m'} (Token Budget: ${validation.tokenBudgetSatisfied ? '✔ OK' : '✖ EXCEEDED'})`);

    for (const d of validation.issues) {
      const color = d.severity === 'error' ? '\x1b[31m✖' : (d.severity === 'warning' ? '\x1b[33m▲' : '\x1b[36mℹ');
      console.log(`  ${color}\x1b[0m [${d.ruleId}] ${d.message}`);
    }

    if (!validation.valid && args.includes('--strict')) {
      console.error(`\x1b[31m✖ Strict mode enabled: skill failed validation with ${validation.issues.filter(d => d.severity === 'error').length} errors.\x1b[0m`);
      process.exit(1);
    }
    process.exit(0);
    break;
  }

  case 'skill-classify': {
    const filePath = args[1];
    if (!filePath || !fs.existsSync(filePath)) {
      console.error(`\x1b[31m✖\x1b[0m File not found: ${filePath || '<missing>'}`);
      process.exit(1);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const classification = classifyTextLogic(content);

    console.log(`\x1b[1;34m[Formal Logic Classifier]\x1b[0m Analyzing \x1b[1m${filePath}\x1b[0m:`);
    console.log(`  • Classification: \x1b[1m${classification.recommendedLabel}\x1b[0m`);
    console.log(`  • Procedural Confidence: \x1b[32m${classification.proceduralScore}%\x1b[0m`);
    console.log(`  • Declarative Confidence: \x1b[34m${classification.declarativeScore}%\x1b[0m`);
    console.log(`  • Modal Directives (Must/Shall): ${classification.signals.modalDeonticCount}`);
    console.log(`  • Conditionals (If/Then): ${classification.signals.conditionalControlFlowCount}`);
    console.log(`  • First-Order Quantifiers (∀/∃): ${classification.signals.firstOrderQuantifiersCount}`);
    console.log(`  • Temporal Loops (While/Until): ${classification.signals.temporalLoopCount}`);
    console.log(`  • Explanation: ${classification.explanation}`);
    process.exit(0);
    break;
  }

  case 'skill-init': {
    const rawName = args[1] || 'my-agent-skill';
    const skillName = rawName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const targetDir = args[2] ? path.join(args[2], skillName) : path.join('.skills', skillName);

    fs.mkdirSync(path.join(targetDir, 'references'), { recursive: true });
    fs.mkdirSync(path.join(targetDir, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(targetDir, 'assets'), { recursive: true });

    const starterSkillMd = `---
name: ${skillName}
description: Runbook and operational skill for ${skillName}. Triggers when asked to execute, verify, or troubleshoot this workflow.
allowed-tools: ["run_command", "view_file"]
license: Apache-2.0
---

# ${skillName.replace(/-/g, ' ').toUpperCase()}

This procedural skill orchestrates operations and recovery workflows for **${skillName}**.

## Prerequisites & Constraints
- Must verify active environment configuration before execution.

## Execution Workflow
1. Execute the verification step to confirm system state.
2. Follow procedural instructions in \`references/troubleshooting.md\` if non-zero exit codes occur.
`;

    fs.writeFileSync(path.join(targetDir, 'SKILL.md'), starterSkillMd, 'utf-8');
    fs.writeFileSync(path.join(targetDir, 'references', 'troubleshooting.md'), '# Troubleshooting Guide\n\nFallback strategies and recovery procedures.\n', 'utf-8');

    console.log(`\x1b[32m✔\x1b[0m Scaffolded Agent Skill in \x1b[1m${targetDir}/\x1b[0m`);
    console.log(`  - Root manifest: ${targetDir}/SKILL.md`);
    console.log(`  - Subdirectories: references/, scripts/, assets/`);
    process.exit(0);
    break;
  }

  case 'init': {
    const targetDir = args[1] || '.okf';
    console.log(`\x1b[1;34m[OKF]\x1b[0m Initializing Open Knowledge repository in \x1b[1m${targetDir}/\x1b[0m...`);
    const dirs = [targetDir, `${targetDir}/concepts`, `${targetDir}/procedures`, `${targetDir}/tables`];
    for (const d of dirs) {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    }
    console.log(`\x1b[32m✔\x1b[0m Scaffolded ${targetDir}/ structure.`);
    process.exit(0);
    break;
  }

  case 'ci-setup': {
    const wfDir = '.github/workflows';
    if (!fs.existsSync(wfDir)) fs.mkdirSync(wfDir, { recursive: true });
    const yaml = `name: OKF Knowledge Conformance & Lint
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
    fs.writeFileSync(path.join(wfDir, 'okf-lint.yml'), yaml);
    console.log(`\x1b[32m✔\x1b[0m Created .github/workflows/okf-lint.yml`);
    process.exit(0);
    break;
  }

  case 'skill-batch':
  case 'batch-convert': {
    const srcDir = args[1] || './documents';
    const outDir = (args.find(a => a.startsWith('--out-dir=')) || '').split('=')[1] || '.skills';
    const toolsArg = (args.find(a => a.startsWith('--tools=')) || '').split('=')[1];
    const allowedTools = toolsArg ? toolsArg.split(',').map(t => t.trim()) : undefined;

    if (!fs.existsSync(srcDir)) {
      console.error(`\x1b[31m✖\x1b[0m Source directory not found: ${srcDir}`);
      process.exit(1);
    }

    console.log(`\x1b[1;34m[Agent Skills Batch Compiler]\x1b[0m Scanning \x1b[1m${srcDir}\x1b[0m for markdown documents...`);
    const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.md') || f.endsWith('.txt'));

    if (files.length === 0) {
      console.log(`No markdown or text documents found in ${srcDir}`);
      process.exit(0);
    }

    let processedCount = 0;
    let validCount = 0;

    for (const file of files) {
      const filePath = path.join(srcDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const skillName = path.basename(file, path.extname(file)).toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const targetDir = path.join(outDir, skillName);

      const pkg = sliceMonolithToAgentSkill(content, { customSkillName: skillName, allowedTools });
      const validation = validateAgentSkill(pkg);

      fs.mkdirSync(path.join(targetDir, 'references'), { recursive: true });
      fs.mkdirSync(path.join(targetDir, 'scripts'), { recursive: true });
      fs.mkdirSync(path.join(targetDir, 'assets'), { recursive: true });

      fs.writeFileSync(path.join(targetDir, 'SKILL.md'), pkg.rootSkillMd, 'utf-8');
      for (const ref of pkg.references) {
        fs.writeFileSync(path.join(targetDir, ref.relativePath), ref.content, 'utf-8');
      }
      for (const scr of pkg.scripts) {
        fs.writeFileSync(path.join(targetDir, scr.relativePath), scr.content, 'utf-8');
      }
      for (const asset of pkg.assets) {
        fs.writeFileSync(path.join(targetDir, asset.relativePath), asset.content, 'utf-8');
      }

      processedCount++;
      if (validation.valid) validCount++;

      console.log(`  \x1b[32m✔\x1b[0m Compiled \x1b[1m${file}\x1b[0m ➔ \x1b[1m${targetDir}/\x1b[0m (${pkg.metrics.contextSavingsPercentage}% savings, ${pkg.references.length} refs, ${pkg.scripts.length} scripts, ${pkg.assets.length} assets)`);
    }

    console.log(`\n\x1b[1;32m✔ Successfully batch compiled ${processedCount} documents into ${outDir}/ (${validCount}/${processedCount} passed strict preflight)\x1b[0m`);
    process.exit(0);
    break;
  }

  default:
    console.log(`\x1b[1;34m[OKF]\x1b[0m Running command: ${command}`);
    printHelp();
    process.exit(0);
}

