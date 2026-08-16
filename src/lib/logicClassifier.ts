/**
 * @file src/lib/logicClassifier.ts
 * @description Advanced NLP Classifier utilizing First-Order Logic (FOL), Higher-Order Logic (HOL),
 * Modal Deontic Logic, and Temporal Control-Flow heuristics to distinguish between
 * Declarative Knowledge (OKF Concept) and Procedural Workflows (Agent Skill SKILL.md).
 */

import { extractLegalMetadata, LegalPolicyMetadata } from './temporalLegalParser';

export interface LogicSignalBreakdown {
  /** Modal Deontic: Obligation (must, shall), Permission (may, can), Prohibition (must not, never) */
  modalDeonticCount: number;
  modalDeonticSamples: string[];

  /** First-Order Quantifiers & Search: For each (∀), Search/Find/Exists (∃) */
  firstOrderQuantifiersCount: number;
  firstOrderSamples: string[];

  /** Control Flow & Conditionals: If/Then/Else (p → q), Unless, In the event that */
  conditionalControlFlowCount: number;
  conditionalSamples: string[];

  /** Temporal & Iteration Loops: While, Until (U), Poll, Retry, Next (X) */
  temporalLoopCount: number;
  temporalSamples: string[];

  /** Higher-Order Logic & Assertions: Evaluate, Verify, Validate, Assert, Filter, Map */
  higherOrderEvaluationCount: number;
  evaluationSamples: string[];

  /** Declarative Signals: Definitional copula ("is a", "refers to"), conceptual taxonomies */
  declarativeConceptCount: number;
  declarativeSamples: string[];

  /** Legal & Policy Temporal Horizons and Precedence Rules */
  legalPolicyMetadata?: LegalPolicyMetadata;
}

export interface LogicClassificationResult {
  /** Procedural Workflow Confidence score (0 to 100%) */
  proceduralScore: number;
  /** Declarative Knowledge Confidence score (0 to 100%) */
  declarativeScore: number;
  /** Primary recommended pipeline destination */
  recommendedTarget: 'skill' | 'okf_concept';
  /** Recommended destination label */
  recommendedLabel: string;
  /** Key detected logical constructs */
  signals: LogicSignalBreakdown;
  /** Summary explanation for why this recommendation was made */
  explanation: string;
}

// 1. Modal Deontic Patterns
const MODAL_DEONTIC_PATTERNS = [
  /\b(?:must\s+not|never\s+execute|strictly\s+prohibit(?:ed)?|do\s+not\s+(?:run|execute|modify))\b/gi,
  /\b(?:must|shall|is\s+required\s+to|ensure\s+that|mandatory\s+to|always\s+execute|strictly\s+require)\b/gi,
  /\b(?:may\s+optionally|can\s+optionally|is\s+permitted\s+to|eligible\s+to|at\s+operator'?s\s+discretion)\b/gi,
];

// 2. First-Order Logic & Search Patterns
const FOL_SEARCH_PATTERNS = [
  /\b(?:search\s+(?:for|within)|locate\s+(?:the|any)|find\s+(?:the\s+first|matching|all)|scan\s+until|lookup|grep\s+for|query\s+for)\b/gi,
  /\b(?:for\s+each|for\s+every\s+(?:item|node|element|file|record)|iterate\s+(?:through|over)|across\s+each\s+instance|repeat\s+across)\b/gi,
  /\b(?:given\s+a\s+list\s+of|where\s+target\s+matches|for\s+any\s+given)\b/gi,
];

// 3. Conditional & Decision Patterns
const CONDITIONAL_PATTERNS = [
  /\b(?:if\s+.+?\s+then|in\s+the\s+event\s+(?:that|of)|provided\s+that|unless\s+otherwise|else\s+if|otherwise\s+(?:abort|fallback|retry))\b/gi,
  /\b(?:on\s+failure|on\s+exception|when\s+status\s+is|if\s+verification\s+fails)\b/gi,
];

// 4. Temporal & Iteration Patterns
const TEMPORAL_LOOP_PATTERNS = [
  /\b(?:while\s+(?:running|status\s+is|true)|until\s+(?:the\s+status|healthy|resolved)|poll\s+every|retry\s+until|keep\s+retrying)\b/gi,
  /\b(?:first\s*,.*?next\s*,|subsequently|prior\s+to\s+(?:running|executing)|step\s+\d+|phase\s+\d+)\b/gi,
];

// 5. Higher-Order Evaluation & Assertions
const HOL_EVALUATION_PATTERNS = [
  /\b(?:evaluate\s+(?:whether|if)|verify\s+(?:that|the)|validate\s+(?:the|output)|assert\s+(?:that|equality)|check\s+if\s+the\s+checksum)\b/gi,
  /\b(?:filter\s+(?:out|invalid)|transform\s+each|aggregate\s+the\s+results|rollback\s+to|fallback\s+strategy)\b/gi,
];

// 6. Declarative Conceptual Patterns
const DECLARATIVE_PATTERNS = [
  /\b(?:is\s+defined\s+as|refers\s+to\s+a|is\s+an?\s+(?:framework|architecture|protocol|concept|paradigm|model|abstraction|component))\b/gi,
  /\b(?:characterized\s+by|the\s+purpose\s+of\s+.+?\s+is|historically|in\s+theory|mathematically|consists\s+of\s+(?:the\s+following\s+concepts)?)\b/gi,
  /\b(?:represents\s+the|conceptually|stands\s+for|has\s+the\s+property\s+of)\b/gi,
];

function extractMatches(text: string, patterns: RegExp[]): string[] {
  const matches: string[] = [];
  for (const regex of patterns) {
    // Reset lastIndex for global regexes
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.push(match[0]);
      if (matches.length >= 10) break; // Limit sample size per pattern
    }
  }
  return matches;
}

/**
 * Classifies a text snippet or full document using formal logical constructs.
 */
export function classifyTextLogic(text: string): LogicClassificationResult {
  if (!text || text.trim().length === 0) {
    return {
      proceduralScore: 50,
      declarativeScore: 50,
      recommendedTarget: 'okf_concept',
      recommendedLabel: 'OKF Concept (Declarative)',
      signals: {
        modalDeonticCount: 0,
        modalDeonticSamples: [],
        firstOrderQuantifiersCount: 0,
        firstOrderSamples: [],
        conditionalControlFlowCount: 0,
        conditionalSamples: [],
        temporalLoopCount: 0,
        temporalSamples: [],
        higherOrderEvaluationCount: 0,
        evaluationSamples: [],
        declarativeConceptCount: 0,
        declarativeSamples: [],
      },
      explanation: 'Empty or insufficient content to classify.',
    };
  }

  const modalMatches = extractMatches(text, MODAL_DEONTIC_PATTERNS);
  const folMatches = extractMatches(text, FOL_SEARCH_PATTERNS);
  const condMatches = extractMatches(text, CONDITIONAL_PATTERNS);
  const temporalMatches = extractMatches(text, TEMPORAL_LOOP_PATTERNS);
  const holMatches = extractMatches(text, HOL_EVALUATION_PATTERNS);
  const declMatches = extractMatches(text, DECLARATIVE_PATTERNS);

  // Check code blocks (bash commands indicate procedural tool execution)
  const bashMatches = text.match(/```(?:bash|sh|shell|zsh)[\s\S]*?```/gi) || [];
  const bashScore = bashMatches.length * 3.5;

  // Weighted scoring
  const proceduralWeight =
    modalMatches.length * 2.5 +
    folMatches.length * 2.8 +
    condMatches.length * 3.0 +
    temporalMatches.length * 3.2 +
    holMatches.length * 2.6 +
    bashScore;

  const declarativeWeight = declMatches.length * 4.0 + (text.includes('# ') ? 1.0 : 0);

  const total = proceduralWeight + declarativeWeight + 0.1;
  let proceduralScore = Math.min(100, Math.max(0, Math.round((proceduralWeight / total) * 100)));
  
  // Baseline boost if action-heavy or code-heavy
  if (bashMatches.length > 0 && proceduralScore < 70) {
    proceduralScore = Math.min(95, proceduralScore + 20);
  }
  if (declMatches.length > 3 && proceduralScore > 60) {
    proceduralScore = Math.max(30, proceduralScore - 20);
  }

  const declarativeScore = 100 - proceduralScore;
  const isProcedural = proceduralScore >= 50;

  const legalPolicyMetadata = extractLegalMetadata(text);

  const signals: LogicSignalBreakdown = {
    modalDeonticCount: modalMatches.length,
    modalDeonticSamples: Array.from(new Set(modalMatches)).slice(0, 4),
    firstOrderQuantifiersCount: folMatches.length,
    firstOrderSamples: Array.from(new Set(folMatches)).slice(0, 4),
    conditionalControlFlowCount: condMatches.length,
    conditionalSamples: Array.from(new Set(condMatches)).slice(0, 4),
    temporalLoopCount: temporalMatches.length + legalPolicyMetadata.temporalHorizons.length,
    temporalSamples: Array.from(new Set([...temporalMatches, ...legalPolicyMetadata.temporalHorizons.map(t => t.rawText)])).slice(0, 4),
    higherOrderEvaluationCount: holMatches.length,
    evaluationSamples: Array.from(new Set(holMatches)).slice(0, 4),
    declarativeConceptCount: declMatches.length,
    declarativeSamples: Array.from(new Set(declMatches)).slice(0, 4),
    legalPolicyMetadata,
  };

  let explanation = '';
  if (isProcedural) {
    const keyDrivers: string[] = [];
    if (signals.modalDeonticCount > 0) keyDrivers.push(`${signals.modalDeonticCount} modal directives (must/shall)`);
    if (signals.conditionalControlFlowCount > 0) keyDrivers.push(`${signals.conditionalControlFlowCount} conditional branches (if/then)`);
    if (signals.firstOrderQuantifiersCount > 0) keyDrivers.push(`${signals.firstOrderQuantifiersCount} search/quantifier operations`);
    if (signals.temporalLoopCount > 0) keyDrivers.push(`${signals.temporalLoopCount} temporal/loop patterns (while/until)`);
    if (signals.higherOrderEvaluationCount > 0) keyDrivers.push(`${signals.higherOrderEvaluationCount} assertions/verifications`);
    if (bashMatches.length > 0) keyDrivers.push(`${bashMatches.length} executable script blocks`);

    explanation = `High procedural density (${keyDrivers.join(', ')}). Recommended for Agent Skill (SKILL.md) synthesis.`;
  } else {
    explanation = `High declarative/definitional density (${signals.declarativeConceptCount} conceptual signatures). Recommended for OKF Knowledge Graph.`;
  }

  return {
    proceduralScore,
    declarativeScore,
    recommendedTarget: isProcedural ? 'skill' : 'okf_concept',
    recommendedLabel: isProcedural ? 'Agent Skill (SKILL.md)' : 'OKF Concept (Declarative)',
    signals,
    explanation,
  };
}
