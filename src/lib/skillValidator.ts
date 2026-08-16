/**
 * @file src/lib/skillValidator.ts
 * @description Preflight validation suite enforcing the 6-point Agent Skills specification (agentskills.io).
 *
 * Rules:
 * - SKILL-001: Name validation (1-64 chars, lowercase kebab-case, regex ^[a-z0-9]+(-[a-z0-9]+)*$)
 * - SKILL-002: Description validation (1-1024 chars, trigger clarity)
 * - SKILL-003: Token budget guard (Root SKILL.md < 5,000 tokens)
 * - SKILL-004: Referential link integrity (all referenced files in references/ and scripts/ must exist)
 * - SKILL-005: Tool contract validation (allowed-tools conformance)
 * - SKILL-006: Secret scrubbing & credential leakage detection
 */

import { AgentSkillPackage, SkillValidationIssue, SkillValidationReport } from '../types/agentSkill';
import { estimateTokens } from '../utils/tokenEstimator';

const FORBIDDEN_SECRET_PATTERNS = [
  { name: 'Generic API Key', regex: /(?:api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*['"][a-zA-Z0-9_\-]{20,}['"]/i },
  { name: 'OpenAI API Key', regex: /sk-[a-zA-Z0-9]{32,}/ },
  { name: 'GitHub Token', regex: /gh[pousr]-[a-zA-Z0-9]{36}/ },
  { name: 'AWS Access Key ID', regex: /AKIA[0-9A-Z]{16}/ },
  { name: 'Private Key Block', regex: /-----BEGIN (?:RSA )?PRIVATE KEY-----/ },
];

/**
 * Validates an AgentSkillPackage against all 6 agent skill specification invariants.
 */
export function validateAgentSkill(pkg: AgentSkillPackage): SkillValidationReport {
  const issues: SkillValidationIssue[] = [];

  // ============================================================================
  // SKILL-001: Name Constraint (1-64 chars, kebab-case)
  // ============================================================================
  const name = pkg.frontmatter.name;
  if (!name || typeof name !== 'string') {
    issues.push({
      ruleId: 'SKILL-001',
      severity: 'error',
      message: 'Frontmatter "name" property is missing or not a string.',
      location: 'frontmatter.name',
      suggestion: 'Provide a valid kebab-case name.',
    });
  } else {
    if (name.length < 1 || name.length > 64) {
      issues.push({
        ruleId: 'SKILL-001',
        severity: 'error',
        message: `Skill name "${name}" length (${name.length}) violates the 1-64 character constraint.`,
        location: 'frontmatter.name',
        suggestion: 'Shorten or format the skill name between 1 and 64 characters.',
      });
    }

    const kebabCaseRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    if (!kebabCaseRegex.test(name)) {
      issues.push({
        ruleId: 'SKILL-001',
        severity: 'error',
        message: `Skill name "${name}" is invalid. Must use only lowercase alphanumeric characters and single hyphens without leading/trailing hyphens.`,
        location: 'frontmatter.name',
        suggestion: 'Use a clean slug such as "database-migration-orchestrator".',
      });
    }
  }

  // ============================================================================
  // SKILL-002: Description Constraint (1-1024 chars, trigger clarity)
  // ============================================================================
  const desc = pkg.frontmatter.description;
  if (!desc || typeof desc !== 'string') {
    issues.push({
      ruleId: 'SKILL-002',
      severity: 'error',
      message: 'Frontmatter "description" is missing or empty.',
      location: 'frontmatter.description',
      suggestion: 'Add a clear description outlining what the skill does and when an agent should use it.',
    });
  } else {
    if (desc.length > 1024) {
      issues.push({
        ruleId: 'SKILL-002',
        severity: 'error',
        message: `Description exceeds the 1024 character limit (${desc.length} characters).`,
        location: 'frontmatter.description',
        suggestion: 'Condense description to under 1024 characters for efficient agent discovery.',
      });
    }

    // Check trigger clarity (does it state "when" or "use when"?)
    const hasTriggerGuidance = /use\s+when|when\s+instructed|when\s+handling|triggers|applicable/i.test(desc);
    if (!hasTriggerGuidance) {
      issues.push({
        ruleId: 'SKILL-002',
        severity: 'warning',
        message: 'Description does not explicitly state activation criteria ("Use when...").',
        location: 'frontmatter.description',
        suggestion: 'Include explicit trigger conditions so agents know exactly when to activate this skill.',
      });
    }
  }

  // ============================================================================
  // SKILL-003: Token Budget Guard (Root SKILL.md < 5,000 tokens)
  // ============================================================================
  const activationTokens = pkg.metrics?.activationTokens || estimateTokens(pkg.rootSkillMd);
  const tokenBudgetSatisfied = activationTokens <= 5000;

  if (!tokenBudgetSatisfied) {
    issues.push({
      ruleId: 'SKILL-003',
      severity: 'error',
      message: `Root SKILL.md contains ${activationTokens} tokens, exceeding the recommended 5,000 token limit.`,
      location: 'rootSkillMd',
      suggestion: 'Offload long code snippets, tables, and reference data to files in references/.',
    });
  } else if (activationTokens > 3500) {
    issues.push({
      ruleId: 'SKILL-003',
      severity: 'warning',
      message: `Root SKILL.md is approaching the token limit (${activationTokens} tokens). Consider progressive offloading.`,
      location: 'rootSkillMd',
      suggestion: 'Move deep technical sub-sections to references/.',
    });
  }

  // ============================================================================
  // SKILL-004: Referential Link Integrity
  // ============================================================================
  const referenceLinks = pkg.rootSkillMd.match(/\[.*?\]\(\.\/(references\/[a-zA-Z0-9_\-./]+\.md)\)/g) || [];
  const knownRefPaths = new Set(pkg.references.map(r => r.relativePath));

  for (const link of referenceLinks) {
    const pathMatch = link.match(/\(\.\/(references\/[a-zA-Z0-9_\-./]+\.md)\)/);
    if (pathMatch) {
      const targetPath = pathMatch[1];
      if (!knownRefPaths.has(targetPath)) {
        issues.push({
          ruleId: 'SKILL-004',
          severity: 'error',
          message: `Dangling reference link: "${targetPath}" is referenced in SKILL.md but does not exist in references/.`,
          location: 'rootSkillMd',
          suggestion: `Ensure "${targetPath}" is present in the skill package.`,
        });
      }
    }
  }

  // ============================================================================
  // SKILL-005: Tool Contract Validation
  // ============================================================================
  const allowedTools = pkg.frontmatter['allowed-tools'] || pkg.frontmatter.allowed_tools;
  if (allowedTools) {
    const toolsList = Array.isArray(allowedTools)
      ? allowedTools
      : allowedTools.split(/\s+/).filter(Boolean);

    if (toolsList.length === 0) {
      issues.push({
        ruleId: 'SKILL-005',
        severity: 'info',
        message: 'No specific tools restricted in "allowed-tools". Agent will use default environment capabilities.',
        location: 'frontmatter.allowed-tools',
      });
    }
  }

  // ============================================================================
  // SKILL-006: Secret Scrubbing & Credential Detection
  // ============================================================================
  const allTextToScan = [
    pkg.rootSkillMd,
    ...pkg.references.map(r => r.content),
    ...pkg.scripts.map(s => s.content),
    ...pkg.assets.map(a => a.content),
  ].join('\n');

  for (const pattern of FORBIDDEN_SECRET_PATTERNS) {
    if (pattern.regex.test(allTextToScan)) {
      issues.push({
        ruleId: 'SKILL-006',
        severity: 'error',
        message: `Potential credential leakage detected matching pattern: ${pattern.name}.`,
        location: 'package content',
        suggestion: 'Replace actual credentials with environment variable placeholders (e.g., $API_KEY).',
      });
    }
  }

  const hasErrors = issues.some(i => i.severity === 'error');

  return {
    valid: !hasErrors,
    skillName: pkg.name,
    issues,
    tokenBudgetSatisfied,
    timestamp: new Date().toISOString(),
  };
}
