/**
 * @file src/lib/temporalLegalParser.ts
 * @description Specialized parser for Temporal Horizons, Deadlines, and Precedence Hierarchies
 * in Legal Contracts, Regulatory Policies (GDPR, HIPAA, SOC2), and Operational Runbooks.
 */

export interface TemporalHorizon {
  id: string;
  rawText: string;
  type: 'relative_deadline' | 'absolute_interval' | 'periodic_schedule' | 'contingent_timeout';
  durationAmount?: number;
  durationUnit?: 'hours' | 'days' | 'business_days' | 'weeks' | 'months' | 'years';
  triggerEvent?: string;
  enforceability: 'mandatory_breach' | 'statutory_limit' | 'operational_sla';
  contextSnippet: string;
}

export interface PrecedenceHierarchy {
  id: string;
  rawClause: string;
  higherPrecedenceDoc: string;
  lowerPrecedenceDoc: string;
  scope: 'all_clauses' | 'pricing_only' | 'security_only' | 'dispute_resolution' | 'custom';
  conflictResolutionRule: string;
}

export interface LegalPolicyMetadata {
  temporalHorizons: TemporalHorizon[];
  precedenceRules: PrecedenceHierarchy[];
  jurisdictionCitations: string[];
  governingLaw?: string;
  complianceFrameworks: string[];
}

// 1. Temporal Horizon Regex Extraction
const RELATIVE_DEADLINE_REGEX = /\b(?:within|no\s+later\s+than|prior\s+to\s+the\s+expiration\s+of|inside\s+of)\s+(\d+|one|two|three|four|five|six|seven|ten|fourteen|thirty|sixty|ninety|one\s+hundred(?:\s+and\s+twenty)?)\s+(calendar\s+days?|business\s+days?|working\s+days?|hours?|weeks?|months?|years?)\s+(?:of|following|after|from)\s+([^.;,\n]+)/gi;

const PERIODIC_SCHEDULE_REGEX = /\b(?:annually|semi-annually|quarterly|monthly|bi-weekly|on\s+a\s+(?:weekly|monthly|quarterly|annual)\s+basis|at\s+least\s+once\s+per\s+(?:year|quarter|month))\b/gi;

const STATUTORY_FRAMEWORK_PATTERNS = [
  /\b(?:GDPR|General\s+Data\s+Protection\s+Regulation|Article\s+\d+\s+GDPR)\b/gi,
  /\b(?:HIPAA|Health\s+Insurance\s+Portability\s+and\s+Accountability\s+Act)\b/gi,
  /\b(?:SOC\s*2(?:\s+Type\s+(?:I|II))?|ISO\s*27001|PCI-DSS|CCPA|California\s+Consumer\s+Privacy\s+Act|NIST\s+(?:800-53|CSF))\b/gi,
  /\b(?:FERPA|GLBA|FedRAMP|EU\s+AI\s+Act|DORA|Digital\s+Operational\s+Resilience\s+Act)\b/gi,
];

// 2. Precedence Hierarchy Patterns
const PRECEDENCE_PATTERNS = [
  /\b(?:in\s+the\s+event\s+of\s+(?:any\s+)?(?:conflict|inconsistency|discrepancy)\s+between\s+(.+?)\s+and\s+(.+?),\s*(.+?)\s+shall\s+(?:govern|prevail|supersede|control))\b/gi,
  /\b(?:(.+?)\s+shall\s+(?:supersede|prevail\s+over|take\s+precedence\s+over|control\s+over)\s+(.+?)(?:\s+with\s+respect\s+to\s+(.+?))?)\b/gi,
  /\b(?:order\s+of\s+precedence\s*:\s*([^.\n]+))\b/gi,
];

// Word number mapper
const WORD_NUMBER_MAP: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  ten: 10,
  fourteen: 14,
  thirty: 30,
  sixty: 60,
  ninety: 90,
  'one hundred and twenty': 120,
  'one hundred': 100,
};

function parseNumber(raw: string): number {
  const parsed = parseInt(raw, 10);
  if (!isNaN(parsed)) return parsed;
  return WORD_NUMBER_MAP[raw.toLowerCase().trim()] || 1;
}

function parseUnit(raw: string): 'hours' | 'days' | 'business_days' | 'weeks' | 'months' | 'years' {
  const lower = raw.toLowerCase().trim();
  if (lower.includes('hour')) return 'hours';
  if (lower.includes('business') || lower.includes('working')) return 'business_days';
  if (lower.includes('week')) return 'weeks';
  if (lower.includes('month')) return 'months';
  if (lower.includes('year')) return 'years';
  return 'days';
}

/**
 * Extracts all temporal deadlines, horizons, and statutory SLA periods from a document.
 */
export function extractTemporalHorizons(markdown: string): TemporalHorizon[] {
  const results: TemporalHorizon[] = [];
  let match: RegExpExecArray | null;

  RELATIVE_DEADLINE_REGEX.lastIndex = 0;
  while ((match = RELATIVE_DEADLINE_REGEX.exec(markdown)) !== null) {
    const rawMatch = match[0];
    const amountStr = match[1];
    const unitStr = match[2];
    const triggerStr = match[3];

    const amount = parseNumber(amountStr);
    const unit = parseUnit(unitStr);

    let enforceability: TemporalHorizon['enforceability'] = 'operational_sla';
    if (/\b(?:breach|default|termination|indemnity|gdpr|breach\s+notification)\b/i.test(rawMatch + ' ' + triggerStr)) {
      enforceability = 'mandatory_breach';
    } else if (/\b(?:statute|statutory|law|regulation|jurisdiction)\b/i.test(rawMatch + ' ' + triggerStr)) {
      enforceability = 'statutory_limit';
    }

    const startIndex = Math.max(0, match.index - 50);
    const endIndex = Math.min(markdown.length, match.index + rawMatch.length + 50);
    const contextSnippet = markdown.slice(startIndex, endIndex).replace(/\s+/g, ' ').trim();

    results.push({
      id: `temporal-${results.length + 1}`,
      rawText: rawMatch.trim(),
      type: 'relative_deadline',
      durationAmount: amount,
      durationUnit: unit,
      triggerEvent: triggerStr.trim(),
      enforceability,
      contextSnippet,
    });
  }

  // Periodic schedules
  PERIODIC_SCHEDULE_REGEX.lastIndex = 0;
  while ((match = PERIODIC_SCHEDULE_REGEX.exec(markdown)) !== null) {
    const rawMatch = match[0];
    const startIndex = Math.max(0, match.index - 40);
    const endIndex = Math.min(markdown.length, match.index + rawMatch.length + 40);

    results.push({
      id: `temporal-sched-${results.length + 1}`,
      rawText: rawMatch.trim(),
      type: 'periodic_schedule',
      enforceability: 'operational_sla',
      contextSnippet: markdown.slice(startIndex, endIndex).replace(/\s+/g, ' ').trim(),
    });
    if (results.length > 25) break;
  }

  return results;
}

/**
 * Extracts clause precedence rules, conflict resolution orders, and hierarchy overrides.
 */
export function extractPrecedenceRules(markdown: string): PrecedenceHierarchy[] {
  const rules: PrecedenceHierarchy[] = [];
  let match: RegExpExecArray | null;

  for (const pattern of PRECEDENCE_PATTERNS) {
    pattern.lastIndex = 0;
    while ((match = pattern.exec(markdown)) !== null) {
      const rawClause = match[0].trim();
      let higher = 'Schedule / Order Form';
      let lower = 'Master Services Agreement';
      let scope: PrecedenceHierarchy['scope'] = 'all_clauses';

      if (match[3]) {
        if (/price|pricing|fee|rate/i.test(match[3])) scope = 'pricing_only';
        else if (/security|privacy|data\s+protection/i.test(match[3])) scope = 'security_only';
        else if (/dispute|arbitration|governing/i.test(match[3])) scope = 'dispute_resolution';
      }

      if (match[1] && match[2]) {
        higher = match[3] ? match[3].trim() : match[1].trim();
        lower = match[2].trim();
      }

      rules.push({
        id: `precedence-${rules.length + 1}`,
        rawClause,
        higherPrecedenceDoc: higher,
        lowerPrecedenceDoc: lower,
        scope,
        conflictResolutionRule: `Higher priority assigned to ${higher}; overrides ${lower} for scope '${scope}'.`,
      });

      if (rules.length >= 10) break;
    }
  }

  return rules;
}

/**
 * Identifies statutory compliance frameworks and governing law citations.
 */
export function extractLegalMetadata(markdown: string): LegalPolicyMetadata {
  const temporalHorizons = extractTemporalHorizons(markdown);
  const precedenceRules = extractPrecedenceRules(markdown);

  const complianceFrameworks: string[] = [];
  for (const pattern of STATUTORY_FRAMEWORK_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(markdown)) !== null) {
      complianceFrameworks.push(match[0].trim());
    }
  }

  // Governing Law extraction
  let governingLaw: string | undefined;
  const govLawMatch = markdown.match(/\b(?:governed\s+by|construed\s+in\s+accordance\s+with\s+the\s+laws\s+of)\s+([A-Z][a-zA-Z\s,]+?)(?:\.|;|\n)/i);
  if (govLawMatch) {
    governingLaw = govLawMatch[1].trim();
  }

  return {
    temporalHorizons,
    precedenceRules,
    jurisdictionCitations: Array.from(new Set(complianceFrameworks)),
    governingLaw,
    complianceFrameworks: Array.from(new Set(complianceFrameworks)),
  };
}
