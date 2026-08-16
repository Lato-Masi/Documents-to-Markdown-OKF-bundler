/**
 * @okf/core Conformance, Integrity & Dependency Validator
 * Provides comprehensive schema validation, broken wikilink detection,
 * circular dependency resolution, and trust-tier verification.
 */

import { parseOkfDocument, type OkfDocumentAST, type OkfWikilink, type OkfMarkdownLink } from './okfCoreParser';

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface OkfValidationIssue {
  id: string;
  code: string;
  severity: IssueSeverity;
  message: string;
  filePath?: string;
  conceptId?: string;
  line?: number;
  column?: number;
  fixSuggestion?: string;
}

export interface OkfCycleInfo {
  cycle: string[]; // ['a', 'b', 'c', 'a']
  message: string;
}

export interface OkfValidationReport {
  isValid: boolean;
  score: number; // 0 - 100
  totalConcepts: number;
  issues: OkfValidationIssue[];
  errors: OkfValidationIssue[];
  warnings: OkfValidationIssue[];
  infos: OkfValidationIssue[];
  brokenLinks: Array<{
    sourceConcept: string;
    target: string;
    line: number;
    raw: string;
  }>;
  cycles: OkfCycleInfo[];
  trustSummary: {
    humanReviewedCount: number;
    machineConfirmedCount: number;
    unverifiedCount: number;
    ratioHumanReviewed: number;
  };
  executionTimeMs: number;
}

/**
 * Validates a single parsed OKF document AST against the OKF specification.
 */
export function validateSingleDocument(ast: OkfDocumentAST): OkfValidationIssue[] {
  const issues: OkfValidationIssue[] = [];
  const fm = ast.frontmatter;

  // 1. Required "type" field
  if (!fm.type) {
    issues.push({
      id: `${ast.id}-missing-type`,
      code: 'ERR_MISSING_TYPE',
      severity: 'error',
      message: `Concept is missing required frontmatter field 'type'.`,
      filePath: ast.filePath,
      conceptId: ast.id,
      line: 1,
      fixSuggestion: `Add 'type: concept' or 'type: procedure' to frontmatter.`,
    });
  } else {
    const validTypes = ['concept', 'procedure', 'table', 'metric', 'guideline', 'reference', 'architecture', 'model'];
    if (!validTypes.includes(fm.type.toLowerCase())) {
      issues.push({
        id: `${ast.id}-invalid-type`,
        code: 'WARN_UNKNOWN_TYPE',
        severity: 'warning',
        message: `Unknown concept type '${fm.type}'. Recommended standard types: ${validTypes.join(', ')}.`,
        filePath: ast.filePath,
        conceptId: ast.id,
        line: 1,
        fixSuggestion: `Use one of: ${validTypes.join(', ')}`,
      });
    }
  }

  // 2. Title validation
  if (!fm.title || fm.title.trim().length === 0) {
    issues.push({
      id: `${ast.id}-missing-title`,
      code: 'WARN_MISSING_TITLE',
      severity: 'warning',
      message: `Concept frontmatter has no 'title' specified.`,
      filePath: ast.filePath,
      conceptId: ast.id,
      line: 1,
      fixSuggestion: `Add 'title: "${ast.id}"' to YAML frontmatter.`,
    });
  }

  // 3. Description recommendation for RAG indexability
  if (!fm.description || fm.description.trim().length < 10) {
    issues.push({
      id: `${ast.id}-short-description`,
      code: 'INFO_SHORT_DESCRIPTION',
      severity: 'info',
      message: `Description is missing or too short (< 10 chars). Adding a salient description improves Graph-RAG retrieval accuracy.`,
      filePath: ast.filePath,
      conceptId: ast.id,
      line: 1,
      fixSuggestion: `Add a 1-2 sentence description summarizing the core invariant or procedure.`,
    });
  }

  // 4. Check if procedure has numbered steps or action items
  if (fm.type === 'procedure') {
    const hasNumberedList = /^\s*1\.\s+/m.test(ast.rawContent);
    const hasChecklist = /^\s*-\s+\[\s*\]/m.test(ast.rawContent);
    const hasStepsHeading = /##\s*(Steps|Procedure|Workflow|Execution)/i.test(ast.rawContent);

    if (!hasNumberedList && !hasChecklist && !hasStepsHeading) {
      issues.push({
        id: `${ast.id}-procedure-no-steps`,
        code: 'WARN_PROCEDURE_WITHOUT_STEPS',
        severity: 'warning',
        message: `Concept typed as 'procedure' lacks numbered steps or checklist items.`,
        filePath: ast.filePath,
        conceptId: ast.id,
        fixSuggestion: `Structure procedures with sequential numbered steps (1. First step...)`,
      });
    }
  }

  // 5. Trust tier & verification signals validation
  if (fm.trustTier === 'human-reviewed' && !fm.verified_by && !fm.verified_at && (!fm.verified || (Array.isArray(fm.verified) && fm.verified.length === 0))) {
    issues.push({
      id: `${ast.id}-trust-missing-actor`,
      code: 'WARN_UNVERIFIED_HUMAN_CLAIM',
      severity: 'warning',
      message: `Concept claims 'trustTier: human-reviewed' but lacks 'verified' audit block or 'verified_by' stamp.`,
      filePath: ast.filePath,
      conceptId: ast.id,
      fixSuggestion: `Add 'verified: { by: "agent/reviewer", at: "${new Date().toISOString()}" }' to frontmatter.`,
    });
  }

  // 6. Freshness (stale_after) validation (OKF v0.2)
  if (fm.stale_after) {
    const staleDate = new Date(String(fm.stale_after));
    if (isNaN(staleDate.getTime())) {
      issues.push({
        id: `${ast.id}-invalid-stale-after`,
        code: 'ERR_INVALID_DATE_FORMAT',
        severity: 'error',
        message: `Field 'stale_after' (${fm.stale_after}) is not a valid ISO date.`,
        filePath: ast.filePath,
        conceptId: ast.id,
        fixSuggestion: `Format stale_after as ISO date (e.g. 'YYYY-MM-DD').`,
      });
    } else if (staleDate.getTime() < Date.now()) {
      issues.push({
        id: `${ast.id}-stale-concept`,
        code: 'WARN_CONCEPT_STALE',
        severity: 'warning',
        message: `Concept freshness has expired (stale_after: ${fm.stale_after}). Re-verification is recommended.`,
        filePath: ast.filePath,
        conceptId: ast.id,
        fixSuggestion: `Review concept content and update verified date or stale_after date.`,
      });
    }
  }

  // 7. Lifecycle status validation (OKF v0.2)
  if (fm.status) {
    const validStatuses = ['draft', 'stable', 'deprecated'];
    if (!validStatuses.includes(String(fm.status).toLowerCase())) {
      issues.push({
        id: `${ast.id}-invalid-status`,
        code: 'WARN_UNKNOWN_STATUS',
        severity: 'warning',
        message: `Unknown lifecycle status '${fm.status}'. Expected one of: ${validStatuses.join(', ')}.`,
        filePath: ast.filePath,
        conceptId: ast.id,
        fixSuggestion: `Use status: 'stable', 'draft', or 'deprecated'.`,
      });
    }
  }

  // 8. Attested Computation validation (OKF v0.2)
  if (fm.computation || fm.runtime || (Array.isArray(fm.parameters) && fm.parameters.length > 0)) {
    if (fm.computation && !fm.runtime) {
      issues.push({
        id: `${ast.id}-missing-runtime`,
        code: 'WARN_MISSING_COMPUTATION_RUNTIME',
        severity: 'warning',
        message: `Concept includes executable 'computation' but does not specify a 'runtime' environment (e.g., 'mathjs/12.4' or 'node:v20').`,
        filePath: ast.filePath,
        conceptId: ast.id,
        fixSuggestion: `Add 'runtime: "mathjs/12.4"' to frontmatter.`,
      });
    }
  }

  return issues;
}

/**
 * Validates a collection of OKF documents (Bundle) for cross-link integrity,
 * topological cycles, broken wikilinks, and global consistency.
 */
export function validateOkfBundle(documents: Array<{ path?: string; content: string }>): OkfValidationReport {
  const startTime = performance.now();
  const allIssues: OkfValidationIssue[] = [];
  const brokenLinks: OkfValidationReport['brokenLinks'] = [];

  // 1. Parse all documents
  const asts: OkfDocumentAST[] = documents.map((doc, idx) => {
    return parseOkfDocument(doc.content, doc.path || `concept-${idx + 1}.md`);
  });

  // Build ID / Slug Lookup Index
  const knownIds = new Set<string>();
  const knownPaths = new Set<string>();
  const knownTitles = new Map<string, string>();

  for (const ast of asts) {
    const cleanId = ast.id.toLowerCase().replace(/^[./]+/, '').replace(/\.md$/, '');
    knownIds.add(cleanId);
    if (ast.filePath) {
      const cleanPath = ast.filePath.toLowerCase().replace(/^[./]+/, '').replace(/\.md$/, '');
      knownPaths.add(cleanPath);
      knownPaths.add(ast.filePath.toLowerCase());
    }
    if (ast.frontmatter.title) {
      knownTitles.set(ast.frontmatter.title.toLowerCase(), ast.id);
    }
  }

  // 2. Validate individual document rules
  let humanReviewedCount = 0;
  let machineConfirmedCount = 0;
  let unverifiedCount = 0;

  for (const ast of asts) {
    const docIssues = validateSingleDocument(ast);
    allIssues.push(...docIssues);

    if (ast.frontmatter.trustTier === 'human-reviewed') humanReviewedCount++;
    else if (ast.frontmatter.trustTier === 'machine-confirmed') machineConfirmedCount++;
    else unverifiedCount++;

    // Check Wikilinks for broken targets
    for (const wl of ast.allWikilinks) {
      const targetClean = wl.target.toLowerCase().replace(/^[./]+/, '').replace(/\.md$/, '');
      const isKnown = knownIds.has(targetClean) || knownPaths.has(targetClean) || knownTitles.has(targetClean);

      if (!isKnown) {
        brokenLinks.push({
          sourceConcept: ast.id,
          target: wl.target,
          line: wl.line,
          raw: wl.raw,
        });

        allIssues.push({
          id: `${ast.id}-broken-wikilink-${wl.line}`,
          code: 'ERR_BROKEN_WIKILINK',
          severity: 'error',
          message: `Broken wikilink: [[${wl.target}]] does not match any known concept in bundle.`,
          filePath: ast.filePath,
          conceptId: ast.id,
          line: wl.line,
          column: wl.column,
          fixSuggestion: `Ensure concept file exists or update wikilink to match valid ID.`,
        });
      }
    }

    // Check explicit dependencies in frontmatter
    const dependsOn = ast.frontmatter.depends_on || ast.frontmatter.prerequisites || [];
    if (Array.isArray(dependsOn)) {
      for (const dep of dependsOn) {
        const depClean = String(dep).toLowerCase().replace(/^[./]+/, '').replace(/\.md$/, '');
        const isKnown = knownIds.has(depClean) || knownPaths.has(depClean) || knownTitles.has(depClean);

        if (!isKnown) {
          allIssues.push({
            id: `${ast.id}-broken-dependency-${depClean}`,
            code: 'ERR_BROKEN_DEPENDENCY',
            severity: 'error',
            message: `Declared dependency '${dep}' does not exist in bundle.`,
            filePath: ast.filePath,
            conceptId: ast.id,
            fixSuggestion: `Verify the target dependency path in frontmatter 'depends_on'.`,
          });
        }
      }
    }
  }

  // 3. Cycle Detection in Directed Dependency Graph
  const cycles: OkfCycleInfo[] = [];
  const adj = new Map<string, string[]>();

  for (const ast of asts) {
    const cleanId = ast.id.toLowerCase().replace(/^[./]+/, '').replace(/\.md$/, '');
    const targets: string[] = [];

    // Add depends_on edges
    const deps = ast.frontmatter.depends_on || ast.frontmatter.prerequisites || [];
    if (Array.isArray(deps)) {
      for (const d of deps) {
        targets.push(String(d).toLowerCase().replace(/^[./]+/, '').replace(/\.md$/, ''));
      }
    }

    // Add wikilinks as directed edges
    for (const wl of ast.allWikilinks) {
      targets.push(wl.target.toLowerCase().replace(/^[./]+/, '').replace(/\.md$/, ''));
    }

    adj.set(cleanId, targets);
  }

  // DFS Cycle Finder
  const visited = new Map<string, 'unvisited' | 'visiting' | 'visited'>();
  const recursionStack: string[] = [];

  function dfs(node: string) {
    visited.set(node, 'visiting');
    recursionStack.push(node);

    const neighbors = adj.get(node) || [];
    for (const neighbor of neighbors) {
      if (!adj.has(neighbor)) continue; // ignore unknown external links

      const state = visited.get(neighbor) || 'unvisited';
      if (state === 'visiting') {
        // Cycle found
        const cycleStartIndex = recursionStack.indexOf(neighbor);
        if (cycleStartIndex !== -1) {
          const cyclePath = [...recursionStack.slice(cycleStartIndex), neighbor];
          cycles.push({
            cycle: cyclePath,
            message: `Cyclic dependency detected: ${cyclePath.join(' -> ')}`,
          });
        }
      } else if (state === 'unvisited') {
        dfs(neighbor);
      }
    }

    recursionStack.pop();
    visited.set(node, 'visited');
  }

  for (const node of adj.keys()) {
    if ((visited.get(node) || 'unvisited') === 'unvisited') {
      dfs(node);
    }
  }

  // Add cycle issues
  for (const cycle of cycles) {
    allIssues.push({
      id: `cycle-${cycle.cycle.join('-')}`,
      code: 'ERR_CYCLIC_DEPENDENCY',
      severity: 'error',
      message: cycle.message,
      fixSuggestion: `Break the circular link loop by refactoring shared dependencies into a separate concept.`,
    });
  }

  // 4. Calculate Conformance Score
  const errors = allIssues.filter((i) => i.severity === 'error');
  const warnings = allIssues.filter((i) => i.severity === 'warning');
  const infos = allIssues.filter((i) => i.severity === 'info');

  const penalty = errors.length * 15 + warnings.length * 5 + infos.length * 1;
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)));
  const isValid = errors.length === 0;

  const executionTimeMs = Math.round((performance.now() - startTime) * 100) / 100;

  return {
    isValid,
    score,
    totalConcepts: asts.length,
    issues: allIssues,
    errors,
    warnings,
    infos,
    brokenLinks,
    cycles,
    trustSummary: {
      humanReviewedCount,
      machineConfirmedCount,
      unverifiedCount,
      ratioHumanReviewed: asts.length > 0 ? Math.round((humanReviewedCount / asts.length) * 100) : 0,
    },
    executionTimeMs,
  };
}
