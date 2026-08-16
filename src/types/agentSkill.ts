/**
 * @file src/types/agentSkill.ts
 * @description Type definitions and data models conforming to the Agent Skills open standard (agentskills.io).
 *
 * Provides strict interfaces for:
 * - SKILL.md YAML frontmatter specification (name, description, allowed-tools, metadata)
 * - Progressive disclosure models (Discovery, Activation, Execution layers)
 * - Modular directory hierarchies (references/, scripts/, assets/)
 * - Validation rules & diagnostic reporting
 */

/**
 * Standard YAML frontmatter attributes for a compliant SKILL.md document.
 * Ref: https://agentskills.io/specification
 */
export interface AgentSkillFrontmatter {
  /**
   * Unique skill identifier.
   * Constraints:
   * - 1 to 64 characters
   * - Lowercase letters (a-z), numbers (0-9), and hyphens (-)
   * - Must not start or end with a hyphen
   * - Pattern: ^[a-z0-9]+(-[a-z0-9]+)*$
   */
  name: string;

  /**
   * Concise summary detailing what the skill accomplishes and when an agent should activate it.
   * Maximum length: 1,024 characters.
   */
  description: string;

  /**
   * Optional license identifier (e.g., 'MIT', 'Apache-2.0', 'Proprietary').
   */
  license?: string;

  /**
   * Optional runtime or environment compatibility notes (e.g., 'linux', 'docker', 'nodejs >= 20').
   */
  compatibility?: string;

  /**
   * Optional list or space-delimited string of tool names the agent is permitted to use when executing this skill.
   */
  'allowed-tools'?: string[] | string;
  allowed_tools?: string[] | string;

  /**
   * Arbitrary key-value metadata for telemetry, authoring, or tooling integration.
   */
  metadata?: Record<string, string | number | boolean>;
}

/**
 * A supplementary reference file loaded Just-In-Time (JIT) during deep execution.
 * Resides in `<skill-name>/references/*.md`.
 */
export interface SkillReferenceFile {
  /** Relative path within the skill directory, e.g. 'references/error_handling.md' */
  relativePath: string;
  /** Human-readable title of the reference */
  title: string;
  /** Markdown content */
  content: string;
  /** Estimated token count */
  estimatedTokens: number;
}

/**
 * An executable script or code fixture extracted from procedures.
 * Resides in `<skill-name>/scripts/*`.
 */
export interface SkillScriptFile {
  /** Relative path within the skill directory, e.g. 'scripts/verify_cluster.sh' */
  relativePath: string;
  /** Filename with extension, e.g. 'verify_cluster.sh' */
  filename: string;
  /** Script language */
  language: 'bash' | 'python' | 'javascript' | 'typescript' | 'sql' | 'other';
  /** Script contents */
  content: string;
  /** Whether the script should be marked executable (chmod +x) */
  executable: boolean;
  /** Estimated token count */
  estimatedTokens: number;
}

/**
 * A static asset, template payload, or JSON schema.
 * Resides in `<skill-name>/assets/*`.
 */
export interface SkillAssetFile {
  /** Relative path within the skill directory, e.g. 'assets/config_template.json' */
  relativePath: string;
  /** Filename */
  filename: string;
  /** Text or base64 content */
  content: string;
  /** Optional MIME type */
  mimeType?: string;
  /** Estimated token count */
  estimatedTokens: number;
}

/**
 * Progressive disclosure token metrics illustrating context savings across layers.
 */
export interface ProgressiveDisclosureMetrics {
  /**
   * Layer 1: Discovery Phase (Startup context)
   * The cost of registering the skill name + description (~50 - 100 tokens).
   */
  discoveryTokens: number;

  /**
   * Layer 2: Activation Phase (Triggered task execution)
   * The cost of loading the root SKILL.md router body (Target: < 5,000 tokens).
   */
  activationTokens: number;

  /**
   * Layer 3: Deep Execution Phase (JIT loaded on demand)
   * The sum of tokens in references/, scripts/, and assets/.
   */
  executionTokens: number;

  /** Total cumulative tokens if the entire package were loaded flat */
  totalPackageTokens: number;

  /** Context reduction ratio compared to monolithic prompt loading: (1 - activation / totalPackage) * 100 */
  contextSavingsPercentage: number;
}

/**
 * Complete in-memory bundle representation of an Agent Skill package.
 */
export interface AgentSkillPackage {
  /** Package identifier (must equal frontmatter.name) */
  name: string;
  /** Raw content of the root SKILL.md file */
  rootSkillMd: string;
  /** Parsed YAML frontmatter */
  frontmatter: AgentSkillFrontmatter;
  /** Supplementary reference markdown documents */
  references: SkillReferenceFile[];
  /** Executable scripts */
  scripts: SkillScriptFile[];
  /** Static assets & templates */
  assets: SkillAssetFile[];
  /** Progressive disclosure token metrics */
  metrics: ProgressiveDisclosureMetrics;
  /** Optional title of the original source document that was partitioned */
  sourceDocumentTitle?: string;
  /** ISO timestamp when the package was synthesized */
  createdAt: string;
  /** Formal NLP logic breakdown and confidence score */
  logicClassification?: import('../lib/logicClassifier').LogicClassificationResult;
}

/**
 * Diagnostic validation issue codes matching the 6-point Agent Skill standard.
 */
export type SkillValidationRuleId =
  | 'SKILL-001' // Name constraints (1-64 chars, lowercase kebab-case)
  | 'SKILL-002' // Description constraints (1-1024 chars, trigger clarity)
  | 'SKILL-003' // Root SKILL.md token budget guard (< 5,000 tokens)
  | 'SKILL-004' // Referential link integrity for references/ & scripts/
  | 'SKILL-005' // Tool contract & allowed-tools validity
  | 'SKILL-006'; // Secret scrubbing & credential sanitization

export interface SkillValidationIssue {
  ruleId: SkillValidationRuleId;
  severity: 'error' | 'warning' | 'info';
  message: string;
  location?: string;
  suggestion?: string;
}

export interface SkillValidationReport {
  valid: boolean;
  skillName: string;
  issues: SkillValidationIssue[];
  tokenBudgetSatisfied: boolean;
  timestamp: string;
}
