/**
 * @file src/lib/agentSkillBestPracticesEngine.ts
 * @description Best Practices Enforcement & Compliance Engine conforming to agentskills.io and Claude Agent Skills specifications.
 *
 * References:
 * - https://agentskills.io/skill-creation/best-practices
 * - https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
 *
 * Core Standards Enforced:
 * 1. Directory Structure: <skill-name>/SKILL.md, references/*.md, scripts/*, assets/*
 * 2. Frontmatter: name (kebab-case, 1-64 chars), description (1-1024 chars with clear triggers "Use when..."), allowed-tools
 * 3. Progressive Disclosure: Root SKILL.md is a lightweight router (< 5,000 tokens, < 500 lines) with JIT reference loading
 * 4. Actionability: Numbered imperative steps, prerequisites, verification checks, error recovery/rollback
 * 5. Script Robustness: Shebang (#!/usr/bin/env bash), strict error traps (set -euo pipefail), idempotent execution
 * 6. Referential Integrity: All links from SKILL.md to references/ and scripts/ must be valid relative paths
 * 7. Security: Zero hardcoded secrets, API keys, or sensitive credentials
 */

import { AgentSkillPackage, SkillReferenceFile, SkillScriptFile, SkillAssetFile } from '../types/agentSkill';
import { estimateTokens } from '../utils/tokenEstimator';

export interface BestPracticeCheck {
  id: string;
  category: 'naming-frontmatter' | 'progressive-disclosure' | 'actionability' | 'scripts-assets' | 'security-integrity';
  name: string;
  description: string;
  passed: boolean;
  score: number; // 0 to 100 for this check
  severity: 'error' | 'warning' | 'info';
  details?: string;
  recommendation?: string;
  referenceUrl?: string;
}

export interface BestPracticesAuditReport {
  overallScore: number; // 0 to 100
  grade: 'A+' | 'A' | 'B' | 'C' | 'F';
  isCompliant: boolean;
  checks: BestPracticeCheck[];
  tokenEfficiencyScore: number;
  summary: string;
  actionableImprovements: string[];
}

/**
 * Runs a comprehensive Best Practices Audit on an AgentSkillPackage based on agentskills.io and Claude standards.
 */
export function auditAgentSkillBestPractices(pkg: AgentSkillPackage): BestPracticesAuditReport {
  const checks: BestPracticeCheck[] = [];

  // ============================================================================
  // 1. Naming & Frontmatter Standard
  // ============================================================================
  const name = pkg.frontmatter.name || pkg.name;
  const isKebabCase = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name);
  const isNameLengthValid = name.length >= 1 && name.length <= 64;

  checks.push({
    id: 'BP-NAME-FORMAT',
    category: 'naming-frontmatter',
    name: 'Kebab-Case Skill Naming',
    description: 'Skill name must be 1-64 characters in lowercase kebab-case (^[a-z0-9]+(-[a-z0-9]+)*$).',
    passed: isKebabCase && isNameLengthValid,
    score: isKebabCase && isNameLengthValid ? 100 : 0,
    severity: 'error',
    details: `Name: "${name}" (${name.length} chars)`,
    recommendation: !isKebabCase ? 'Format name to lowercase words separated by single hyphens, e.g. "deploy-kubernetes-cluster".' : undefined,
    referenceUrl: 'https://agentskills.io/specification',
  });

  const desc = pkg.frontmatter.description || '';
  const isDescLengthValid = desc.length >= 10 && desc.length <= 1024;
  const hasTriggerKeywords = /use\s+when|when\s+instructed|when\s+handling|triggers:|trigger:|activate\s+when|applicable\s+when/i.test(desc);

  checks.push({
    id: 'BP-DESC-TRIGGERS',
    category: 'naming-frontmatter',
    name: 'Discovery Triggers in Description',
    description: 'Description must be under 1024 characters and explicitly state "Use when..." trigger conditions so agents discover the skill accurately.',
    passed: isDescLengthValid && hasTriggerKeywords,
    score: isDescLengthValid ? (hasTriggerKeywords ? 100 : 65) : 30,
    severity: hasTriggerKeywords ? 'info' : 'warning',
    details: `Length: ${desc.length}/1024 chars. Contains trigger phrasing: ${hasTriggerKeywords ? 'Yes' : 'No'}.`,
    recommendation: !hasTriggerKeywords ? 'Add explicit activation triggers, e.g., "Use when instructed to deploy, verify, or rollback PostgreSQL database migrations."' : undefined,
    referenceUrl: 'https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices',
  });

  // ============================================================================
  // 2. Progressive Disclosure & Token Budget
  // ============================================================================
  const activationTokens = pkg.metrics?.activationTokens || estimateTokens(pkg.rootSkillMd);
  const totalTokens = pkg.metrics?.totalPackageTokens || activationTokens;
  const lineCount = pkg.rootSkillMd.split('\n').length;
  const isTokenBudgetOptimal = activationTokens <= 3500;
  const isTokenBudgetAcceptable = activationTokens <= 5000;

  checks.push({
    id: 'BP-PROGRESSIVE-DISCLOSURE',
    category: 'progressive-disclosure',
    name: 'Progressive Disclosure Token Budget',
    description: 'Root SKILL.md must remain a lean instruction router (< 5,000 tokens, ideally < 3,500 tokens / < 500 lines) with deep materials offloaded to references/.',
    passed: isTokenBudgetAcceptable,
    score: isTokenBudgetOptimal ? 100 : isTokenBudgetAcceptable ? 75 : 20,
    severity: isTokenBudgetAcceptable ? 'info' : 'error',
    details: `Root SKILL.md: ${activationTokens} tokens (${lineCount} lines). Total Package: ${totalTokens} tokens.`,
    recommendation: activationTokens > 3500 ? 'Move large lookup tables, API endpoint dictionaries, or secondary manuals into references/*.md.' : undefined,
    referenceUrl: 'https://agentskills.io/skill-creation/best-practices',
  });

  const hasModularReferences = pkg.references.length > 0;
  checks.push({
    id: 'BP-JIT-REFERENCES',
    category: 'progressive-disclosure',
    name: 'JIT Reference Partitioning',
    description: 'Complex procedures and detailed reference manuals should be modularized in references/*.md and linked on-demand.',
    passed: hasModularReferences || totalTokens < 1500,
    score: hasModularReferences ? 100 : totalTokens < 1500 ? 90 : 60,
    severity: 'info',
    details: `${pkg.references.length} modular reference files partitioned in references/.`,
    recommendation: !hasModularReferences && totalTokens > 2000 ? 'Extract background theory and large code samples into references/.' : undefined,
  });

  // ============================================================================
  // 3. Procedural Actionability & Structure
  // ============================================================================
  const body = pkg.rootSkillMd;
  const hasStepNumbering = /(?:###?\s*(?:Step\s*\d+|\d+\.|\d+\))\s+[A-Z]|(?:^|\n)\s*1\.\s+)/i.test(body);
  const hasVerificationSteps = /(?:verification|verify|validation|validate|check|confirm|expected\s+output)/i.test(body);
  const hasErrorHandling = /(?:troubleshooting|error\s+recovery|rollback|fallback|failure|diagnostics)/i.test(body);

  checks.push({
    id: 'BP-ACTIONABLE-STEPS',
    category: 'actionability',
    name: 'Imperative Step-by-Step Instructions',
    description: 'Instructions must use clear numbered steps with imperative verbs (e.g. "1. Configure the database", "2. Run verification").',
    passed: hasStepNumbering,
    score: hasStepNumbering ? 100 : 50,
    severity: hasStepNumbering ? 'info' : 'warning',
    details: `Numbered steps detected: ${hasStepNumbering ? 'Yes' : 'No'}.`,
    recommendation: !hasStepNumbering ? 'Structure instructions into clearly numbered steps starting with action verbs.' : undefined,
  });

  checks.push({
    id: 'BP-VERIFICATION-CHECKS',
    category: 'actionability',
    name: 'Verification & Post-Conditions',
    description: 'Skills should provide explicit verification commands or checklists so agents can independently confirm task success.',
    passed: hasVerificationSteps,
    score: hasVerificationSteps ? 100 : 40,
    severity: hasVerificationSteps ? 'info' : 'warning',
    details: `Verification guidance present: ${hasVerificationSteps ? 'Yes' : 'No'}.`,
    recommendation: !hasVerificationSteps ? 'Add a "Verification" step with commands and expected outputs to confirm success.' : undefined,
  });

  checks.push({
    id: 'BP-ERROR-ROLLBACK',
    category: 'actionability',
    name: 'Error Recovery & Rollback Protocols',
    description: 'Procedures must include troubleshooting steps or rollback guidance for automated error recovery.',
    passed: hasErrorHandling,
    score: hasErrorHandling ? 100 : 50,
    severity: hasErrorHandling ? 'info' : 'warning',
    details: `Troubleshooting/Rollback guidance present: ${hasErrorHandling ? 'Yes' : 'No'}.`,
    recommendation: !hasErrorHandling ? 'Add a "Troubleshooting & Rollback" section detailing how to recover from failed operations.' : undefined,
  });

  // ============================================================================
  // 4. Automation Scripts & Assets
  // ============================================================================
  const bashScripts = pkg.scripts.filter(s => s.language === 'bash');
  const scriptsWithShebang = bashScripts.filter(s => s.content.includes('#!/usr/bin/env bash') || s.content.includes('#!/bin/bash'));
  const scriptsWithStrictMode = bashScripts.filter(s => s.content.includes('set -e') || s.content.includes('set -euo pipefail'));

  const scriptScore = bashScripts.length === 0 ? 100 : (scriptsWithShebang.length === bashScripts.length && scriptsWithStrictMode.length === bashScripts.length ? 100 : 70);

  checks.push({
    id: 'BP-SCRIPT-STANDARDS',
    category: 'scripts-assets',
    name: 'Robust Script Headers & Strict Mode',
    description: 'Extracted shell scripts in scripts/ must include shebangs (#!/usr/bin/env bash) and strict error flags (set -euo pipefail).',
    passed: scriptScore >= 90,
    score: scriptScore,
    severity: scriptScore >= 90 ? 'info' : 'warning',
    details: `${pkg.scripts.length} scripts in scripts/. (${bashScripts.length} bash scripts, ${scriptsWithStrictMode.length} with strict flags).`,
    recommendation: scriptScore < 90 ? 'Ensure all scripts in scripts/ start with #!/usr/bin/env bash and set -euo pipefail.' : undefined,
  });

  // ============================================================================
  // 5. Security & Referential Link Integrity
  // ============================================================================
  const secretRegex = /(?:api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*['"][a-zA-Z0-9_\-]{20,}['"]/i;
  const allContent = [pkg.rootSkillMd, ...pkg.references.map(r => r.content), ...pkg.scripts.map(s => s.content)].join('\n');
  const hasSecrets = secretRegex.test(allContent);

  checks.push({
    id: 'BP-SECURITY-SECRETS',
    category: 'security-integrity',
    name: 'Zero Hardcoded Secrets',
    description: 'Agent Skills must not contain plain-text passwords, tokens, or private API keys.',
    passed: !hasSecrets,
    score: !hasSecrets ? 100 : 0,
    severity: 'error',
    details: `Credential leakage detected: ${hasSecrets ? 'Yes (Violates Security Rule)' : 'None (Safe)'}.`,
    recommendation: hasSecrets ? 'Replace secrets with environment variable references (e.g. $DATABASE_URL).' : undefined,
  });

  // Link integrity
  const refLinks = pkg.rootSkillMd.match(/\[.*?\]\(\.\/(references\/[a-zA-Z0-9_\-./]+\.md)\)/g) || [];
  const knownRefPaths = new Set(pkg.references.map(r => r.relativePath));
  let brokenLinks = 0;
  for (const link of refLinks) {
    const m = link.match(/\(\.\/(references\/[a-zA-Z0-9_\-./]+\.md)\)/);
    if (m && !knownRefPaths.has(m[1])) {
      brokenLinks++;
    }
  }

  checks.push({
    id: 'BP-LINK-INTEGRITY',
    category: 'security-integrity',
    name: 'Referential Link Integrity',
    description: 'All relative links from SKILL.md to references/*.md must resolve to existing files.',
    passed: brokenLinks === 0,
    score: brokenLinks === 0 ? 100 : 0,
    severity: 'error',
    details: `${refLinks.length} reference links checked, ${brokenLinks} broken links.`,
    recommendation: brokenLinks > 0 ? 'Fix dangling relative links in SKILL.md.' : undefined,
  });

  // Calculate overall weighted score
  const totalScore = Math.round(checks.reduce((acc, c) => acc + c.score, 0) / checks.length);
  const grade: 'A+' | 'A' | 'B' | 'C' | 'F' =
    totalScore >= 95 ? 'A+' : totalScore >= 85 ? 'A' : totalScore >= 70 ? 'B' : totalScore >= 55 ? 'C' : 'F';

  const actionableImprovements = checks
    .filter(c => !c.passed || c.score < 90)
    .map(c => c.recommendation || `Improve ${c.name}: ${c.description}`)
    .filter(Boolean);

  const tokenEfficiency = pkg.metrics?.contextSavingsPercentage || 0;

  let summary = `Agent Skill "${name}" scored ${totalScore}/100 (Grade ${grade}). `;
  if (totalScore >= 90) {
    summary += `Fully compliant with agentskills.io and Claude best practices with ${Math.round(tokenEfficiency)}% progressive context reduction.`;
  } else {
    summary += `Ready for execution, with ${actionableImprovements.length} recommended optimizations for maximum agent compliance.`;
  }

  return {
    overallScore: totalScore,
    grade,
    isCompliant: totalScore >= 80 && !checks.some(c => c.severity === 'error' && !c.passed),
    checks,
    tokenEfficiencyScore: Math.round(tokenEfficiency),
    summary,
    actionableImprovements,
  };
}

/**
 * Builds the canonical agentskills.io / Claude layout file tree representation.
 */
export function generateCanonicalSkillTree(pkg: AgentSkillPackage): Array<{
  path: string;
  type: 'router' | 'reference' | 'script' | 'asset';
  tokens: number;
  lines: number;
  description: string;
}> {
  const items: Array<{
    path: string;
    type: 'router' | 'reference' | 'script' | 'asset';
    tokens: number;
    lines: number;
    description: string;
  }> = [];

  // 1. Root SKILL.md
  items.push({
    path: `${pkg.name}/SKILL.md`,
    type: 'router',
    tokens: pkg.metrics?.activationTokens || estimateTokens(pkg.rootSkillMd),
    lines: pkg.rootSkillMd.split('\n').length,
    description: 'Primary router: YAML frontmatter, execution workflow, verification, JIT links',
  });

  // 2. references/
  for (const ref of pkg.references) {
    items.push({
      path: `${pkg.name}/${ref.relativePath}`,
      type: 'reference',
      tokens: ref.estimatedTokens,
      lines: ref.content.split('\n').length,
      description: `JIT Reference: ${ref.title}`,
    });
  }

  // 3. scripts/
  for (const script of pkg.scripts) {
    items.push({
      path: `${pkg.name}/${script.relativePath}`,
      type: 'script',
      tokens: script.estimatedTokens,
      lines: script.content.split('\n').length,
      description: `Automation Script: ${script.language} (${script.executable ? 'executable' : 'utility'})`,
    });
  }

  // 4. assets/
  for (const asset of pkg.assets) {
    items.push({
      path: `${pkg.name}/${asset.relativePath}`,
      type: 'asset',
      tokens: asset.estimatedTokens,
      lines: asset.content.split('\n').length,
      description: `Asset / Template: ${asset.mimeType || 'static payload'}`,
    });
  }

  return items;
}
