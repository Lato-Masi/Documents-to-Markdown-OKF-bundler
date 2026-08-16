/**
 * @file src/utils/tokenEstimator.ts
 * @description Deterministic token counter and progressive disclosure metrics calculator.
 *
 * Utilizes a refined BPE heuristic model calibrated against standard LLM tokenizers (tiktoken / Llama / Gemini)
 * to provide accurate token estimates for Markdown prose, code fences, and YAML frontmatter.
 */

import {
  AgentSkillFrontmatter,
  ProgressiveDisclosureMetrics,
  SkillAssetFile,
  SkillReferenceFile,
  SkillScriptFile,
} from '../types/agentSkill';

/**
 * Accurately estimates token count for arbitrary text or code without external dependencies.
 *
 * Factors in:
 * - Word boundary splitting
 * - Punctuation / symbol tokenization
 * - Code syntax density (which typically has a 1.25x - 1.4x token-to-word expansion ratio)
 * - Numeric sequence splitting
 */
export function estimateTokens(text: string): number {
  if (!text || text.length === 0) {
    return 0;
  }

  // Check code block ratio
  const codeBlockMatches: string[] = text.match(/```[\s\S]*?```/g) || [];
  let codeBlockLength = 0;
  for (const match of codeBlockMatches) {
    codeBlockLength += match.length;
  }
  const isCodeHeavy = codeBlockLength / text.length > 0.4;

  // Base character-to-token ratio (standard English prose averages ~4 characters per token)
  const charRatio = isCodeHeavy ? 3.2 : 3.8;
  const charBasedEstimate = Math.ceil(text.length / charRatio);

  // Word-based heuristic (words + punctuation splitting)
  const words = text.trim().split(/\s+/).filter(Boolean);
  const punctuationMatches = text.match(/[!@#$%^&*()_+={}[\]:;"'<>,.?/\\|`~-]/g) || [];

  // Each word is ~1.25 tokens; each standalone punctuation/symbol is ~0.5 tokens
  const wordBasedEstimate = Math.ceil(words.length * 1.28 + punctuationMatches.length * 0.45);

  // Take the weighted mean of character and word estimates for stable precision
  const estimate = Math.round(charBasedEstimate * 0.4 + wordBasedEstimate * 0.6);
  return Math.max(1, estimate);
}

/**
 * Computes progressive disclosure metrics comparing Discovery, Activation, and Execution tiers.
 */
export function computeProgressiveDisclosureMetrics(
  frontmatter: AgentSkillFrontmatter,
  rootSkillMd: string,
  references: SkillReferenceFile[] = [],
  scripts: SkillScriptFile[] = [],
  assets: SkillAssetFile[] = []
): ProgressiveDisclosureMetrics {
  // 1. Discovery: Only name + description + tools frontmatter (loaded at agent startup)
  const discoverySnippet = `name: ${frontmatter.name}\ndescription: ${frontmatter.description}\nallowed-tools: ${JSON.stringify(frontmatter['allowed-tools'] || [])}`;
  const discoveryTokens = estimateTokens(discoverySnippet);

  // 2. Activation: The full root SKILL.md router file (loaded when task triggers)
  const activationTokens = estimateTokens(rootSkillMd);

  // 3. Execution: Sum of all JIT-loaded references, scripts, and assets
  const refTokens = references.reduce((sum, r) => sum + (r.estimatedTokens || estimateTokens(r.content)), 0);
  const scriptTokens = scripts.reduce((sum, s) => sum + (s.estimatedTokens || estimateTokens(s.content)), 0);
  const assetTokens = assets.reduce((sum, a) => sum + (a.estimatedTokens || estimateTokens(a.content)), 0);
  const executionTokens = refTokens + scriptTokens + assetTokens;

  // Total package tokens
  const totalPackageTokens = activationTokens + executionTokens;

  // Context reduction ratio (savings by loading only SKILL.md instead of all references upfront)
  const contextSavingsPercentage =
    totalPackageTokens > 0
      ? Math.max(0, Math.round(((totalPackageTokens - activationTokens) / totalPackageTokens) * 100))
      : 0;

  return {
    discoveryTokens,
    activationTokens,
    executionTokens,
    totalPackageTokens,
    contextSavingsPercentage,
  };
}

/**
 * Formats a token number for clean UI presentation (e.g., "850 tokens", "4.2k tokens").
 */
export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) {
    return `${tokens} tokens`;
  }
  return `${(tokens / 1000).toFixed(1)}k tokens`;
}
