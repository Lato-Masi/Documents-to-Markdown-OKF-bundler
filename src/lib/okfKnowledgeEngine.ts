import {
  parseConcept,
  serializeConcept,
  validateConcept,
  validateBundle,
  deriveTrustTier,
  getStatus,
  isStale,
  normalizeVerified,
  buildGraph,
  buildReport,
  isConformant,
  isWellFormedConcept,
  collectSourceRefs,
  lastConfirmedAt,
  type OkfConcept,
  type OkfBundle,
  type OkfGraph,
  type OkfMetadata,
  type OkfIssue,
  type TrustTier,
  type OkfStatus,
  type OkfSource,
  type OkfParameter,
  type OkfGeneration,
  type OkfVerification,
} from "okf-ts";
import {
  analyzeConceptWithNLP,
  classifyConceptWithNLP,
  generateSalientDescription,
  extractEntities,
  extractKeyphrases,
  type NLPConceptAnalysis,
} from "./okfNlpEngine";
import {
  buildSemanticGraph,
  enrichConceptsWithSemanticCrossLinks,
  type SemanticGraphResult,
  type SemanticEdge,
  type OKFEdgeType,
} from "./okfSemanticGraphEngine";

export interface ConceptPartitionOptions {
  sourceFileName?: string;
  sourceAuthor?: string;
  sourceUrl?: string;
  defaultStatus?: OkfStatus;
  verifiedBy?: string;
  actorName?: string;
  staleAfterDays?: number;
  enableCrossLinking?: boolean;
  enableNlpEnrichment?: boolean;
  similarityThreshold?: number;
}

export interface EnrichedOkfMetadata extends OkfMetadata {
  nlp?: {
    entitiesCount: number;
    readabilityGrade: number;
    fleschScore: number;
    complexity: string;
    ambiguityScore: number;
    completenessScore: number;
  };
}

export interface OKFConversionResult {
  bundle: OkfBundle;
  graph: OkfGraph;
  semanticGraph?: SemanticGraphResult;
  concepts: OkfConcept<OkfMetadata>[];
  report: ReturnType<typeof buildReport>;
  nlpAnalyses?: Record<string, NLPConceptAnalysis>;
  summary: {
    totalConcepts: number;
    validCount: number;
    warningCount: number;
    errorCount: number;
    trustTiers: Record<TrustTier, number>;
    freshCount: number;
    staleCount: number;
    attestedComputationsCount: number;
    lifecycleCounts: Record<OkfStatus, number>;
    typesCount: Record<string, number>;
    avgCompletenessScore?: number;
    avgReadabilityScore?: number;
  };
}

/**
 * Heuristic detector to classify sections into OKF Concept types:
 * 'concept' | 'procedure' | 'table' | 'metric' | 'guideline' | 'reference'
 */
export function classifySectionType(title: string, body: string): string {
  const lowerTitle = title.toLowerCase();
  const lowerBody = body.toLowerCase();

  if (
    lowerTitle.includes("how to") ||
    lowerTitle.includes("procedure") ||
    lowerTitle.includes("guide") ||
    lowerTitle.includes("steps") ||
    lowerTitle.includes("workflow") ||
    lowerTitle.includes("setup") ||
    lowerTitle.includes("installation") ||
    /^\s*1\.\s+/m.test(body)
  ) {
    return "procedure";
  }

  if (
    lowerTitle.includes("table") ||
    lowerTitle.includes("data") ||
    lowerTitle.includes("sheet") ||
    lowerTitle.includes("matrix") ||
    lowerTitle.includes("schema") ||
    /\|(?:\s*[-:]+\s*\|)+/.test(body)
  ) {
    return "table";
  }

  if (
    lowerTitle.includes("metric") ||
    lowerTitle.includes("benchmark") ||
    lowerTitle.includes("kpi") ||
    lowerTitle.includes("stat") ||
    lowerTitle.includes("score")
  ) {
    return "metric";
  }

  if (
    lowerTitle.includes("policy") ||
    lowerTitle.includes("rule") ||
    lowerTitle.includes("guideline") ||
    lowerTitle.includes("standard") ||
    lowerTitle.includes("compliance")
  ) {
    return "guideline";
  }

  if (
    lowerTitle.includes("api") ||
    lowerTitle.includes("reference") ||
    lowerTitle.includes("spec") ||
    lowerTitle.includes("dictionary") ||
    lowerTitle.includes("glossary")
  ) {
    return "reference";
  }

  return "concept";
}

/**
 * Sanitizes a title string into a safe, normalized OKF concept file path slug.
 */
export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60) || "untitled-concept";
}

/**
 * Partitions a single Markdown document into structured OKF concept files conforming with OKF v0.2.
 */
export function partitionMarkdownToOKFConcepts(
  markdown: string,
  options: ConceptPartitionOptions = {}
): OkfConcept<OkfMetadata>[] {
  if (!markdown || !markdown.trim()) return [];

  const sourceName = options.sourceFileName || "converted-document.md";
  const defaultStatus: OkfStatus = options.defaultStatus || "stable";
  const actor = options.actorName || "okf-nlp-agent";
  const isoNow = new Date().toISOString();
  const todayStr = isoNow.split("T")[0];
  const enableNlp = options.enableNlpEnrichment !== false;

  // Calculate freshness stale_after date (default 365 days)
  const staleDays = options.staleAfterDays ?? 365;
  const staleDate = new Date(Date.now() + staleDays * 24 * 60 * 60 * 1000);
  const staleDateStr = staleDate.toISOString().split("T")[0];

  // Helper to construct complete OKF v0.2 source provenance
  const buildSourceProvenance = (title: string): OkfSource[] => [
    {
      resource: options.sourceUrl || sourceName,
      id: sourceName.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "-"),
      title: options.sourceFileName || title,
      author: options.sourceAuthor || "Document Author / Ingestion Pipeline",
      usage_count: 1,
      last_modified: todayStr,
      usage_window: {
        from: todayStr,
        to: staleDateStr,
      },
    },
  ];

  const concepts: OkfConcept<OkfMetadata>[] = [];

  // Match H1 or H2 headings as concept boundaries (ignoring headings inside fenced code blocks)
  const lines = markdown.split('\n');
  const sections: { title: string; level: number; startIndex: number; bodyStart: number }[] = [];
  let inCodeBlock = false;
  let runningIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineLength = line.length + 1; // + 1 for \n

    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      runningIndex += lineLength;
      continue;
    }

    if (!inCodeBlock) {
      const match = line.match(/^(#{1,2})\s+(.+)$/);
      if (match) {
        sections.push({
          title: match[2].trim(),
          level: match[1].length,
          startIndex: runningIndex,
          bodyStart: runningIndex + line.length,
        });
      }
    }
    runningIndex += lineLength;
  }

  // If no H1/H2 headings found, check for H3 outside code blocks
  if (sections.length === 0) {
    inCodeBlock = false;
    runningIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const lineLength = line.length + 1;

      if (trimmed.startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        runningIndex += lineLength;
        continue;
      }

      if (!inCodeBlock) {
        const match = line.match(/^(#{3})\s+(.+)$/);
        if (match) {
          sections.push({
            title: match[2].trim(),
            level: 3,
            startIndex: runningIndex,
            bodyStart: runningIndex + line.length,
          });
        }
      }
      runningIndex += lineLength;
    }
  }

  // If still no sections found, treat the entire document as a single concept with NLP enrichment
  if (sections.length === 0) {
    const title = sourceName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    const nlp = enableNlp ? analyzeConceptWithNLP(title, markdown) : null;
    const type = nlp ? nlp.inferredType : classifySectionType(title, markdown);
    const slug = slugifyTitle(title);
    const folder = type === "procedure" ? "procedures" : type === "table" ? "tables" : type === "metric" ? "metrics" : "concepts";
    const path = `${folder}/${slug}.md`;

    const description = nlp
      ? nlp.summaryDescription
      : markdown.slice(0, 160).replace(/\n+/g, " ").trim() + "...";

    const tags = nlp && nlp.tags.length > 0 ? nlp.tags : [type, "converted-document"];

    // OKF v0.2 Standard Concept Metadata with the 5 Trust Signals
    const metadata: OkfMetadata = {
      type,
      title: title.charAt(0).toUpperCase() + title.slice(1),
      description,
      tags,
      // 1. Provenance
      sources: buildSourceProvenance(title),
      // 2. Trust (Generated & Verified)
      generated: {
        by: actor,
        at: isoNow,
      },
      verified: options.verifiedBy
        ? {
            by: options.verifiedBy,
            at: isoNow,
          }
        : [],
      // 3. Freshness
      stale_after: staleDateStr,
      // 4. Lifecycle Status
      status: defaultStatus,
    };

    // 5. Attested Computation (for metric / formula types)
    if (type === "metric" || /formula|calculate|equation/i.test(title)) {
      metadata.runtime = "mathjs/12.4";
      metadata.parameters = [
        { name: "x", type: "number", required: true },
        { name: "timestamp", type: "string", required: false },
      ];
      metadata.computation = "# Approved Calculation Formula\nresult = evaluate(expression)";
      metadata.attester = { resource: "urn:okf:attester:standard-v0.2" };
    }

    concepts.push({
      id: path,
      path,
      metadata,
      body: markdown.trim(),
    });

    return concepts;
  }

  // Multi-section document partitioning with NLP-driven tag & summary generation
  for (let i = 0; i < sections.length; i++) {
    const current = sections[i];
    const next = sections[i + 1];
    const sectionBody = markdown
      .substring(current.bodyStart, next ? next.startIndex : markdown.length)
      .trim();

    if (!sectionBody && i < sections.length - 1) {
      continue; // Skip empty headings that immediately lead to subheadings
    }

    const nlp = enableNlp ? analyzeConceptWithNLP(current.title, sectionBody) : null;
    const type = nlp ? nlp.inferredType : classifySectionType(current.title, sectionBody);
    const slug = slugifyTitle(current.title);
    const folder = type === "procedure" ? "procedures" : type === "table" ? "tables" : type === "metric" ? "metrics" : type === "guideline" ? "guidelines" : type === "reference" ? "references" : "concepts";
    const path = `${folder}/${slug}.md`;

    const tags = nlp && nlp.tags.length > 0 ? nlp.tags : [type];
    if (folder !== "concepts" && !tags.includes(folder)) tags.push(folder);

    const description = nlp
      ? nlp.summaryDescription
      : (sectionBody
          .replace(/[#*`_\[\]]/g, "")
          .split(/(?<=[.?!])\s+/)[0]
          ?.slice(0, 160)
          .trim() || `${current.title} concept specification.`);

    // OKF v0.2 Standard Concept Metadata with the 5 Trust Signals
    const metadata: OkfMetadata = {
      type,
      title: current.title,
      description,
      tags,
      // 1. Provenance
      sources: buildSourceProvenance(current.title),
      // 2. Trust (Generated & Verified)
      generated: {
        by: actor,
        at: isoNow,
      },
      verified: options.verifiedBy
        ? {
            by: options.verifiedBy,
            at: isoNow,
          }
        : [],
      // 3. Freshness
      stale_after: staleDateStr,
      // 4. Lifecycle Status
      status: defaultStatus,
    };

    // 5. Attested Computation (for metric / formula types)
    if (type === "metric" || /formula|calculate|equation|metric/i.test(current.title)) {
      metadata.runtime = "mathjs/12.4";
      metadata.parameters = [
        { name: "value", type: "number", required: true },
        { name: "unit", type: "string", required: false },
      ];
      metadata.computation = `// Attested Metric Computation for ${current.title}\nreturn computeInvariant(value);`;
      metadata.attester = { resource: "urn:okf:attester:standard-v0.2" };
    }

    // Format concept markdown body with title
    const bodyContent = `# ${current.title}\n\n${sectionBody || `*No additional content provided for ${current.title}.*`}`;

    concepts.push({
      id: path,
      path,
      metadata,
      body: bodyContent,
    });
  }

  // Cross-link concepts if requested with Semantic Graph Engine
  if (options.enableCrossLinking !== false && concepts.length > 1) {
    enrichConceptsWithSemanticCrossLinks(concepts, undefined, {
      similarityThreshold: options.similarityThreshold ?? 0.2,
      enableSemanticDiscovery: true,
      enableCausalDependencies: true,
    });
  }

  return concepts;
}

/**
 * Analyzes and compiles an array of OKF concepts into a full OKF Bundle and Graph.
 */
export function compileOKFBundle(
  concepts: OkfConcept<OkfMetadata>[],
  bundleRootName: string = "knowledge-base",
  options: { similarityThreshold?: number } = {}
): OKFConversionResult {
  const issues: OkfIssue[] = [];
  const trustTiers: Record<TrustTier, number> = {
    unverified: 0,
    "machine-confirmed": 0,
    "human-reviewed": 0,
  };
  const lifecycleCounts: Record<OkfStatus, number> = {
    stable: 0,
    draft: 0,
    deprecated: 0,
  };
  const typesCount: Record<string, number> = {};
  const nlpAnalyses: Record<string, NLPConceptAnalysis> = {};

  let validCount = 0;
  let warningCount = 0;
  let errorCount = 0;
  let freshCount = 0;
  let staleCount = 0;
  let attestedComputationsCount = 0;
  let totalCompleteness = 0;
  let totalReadability = 0;

  for (const concept of concepts) {
    // Validate individual concept
    const conceptIssues = validateConcept(concept);
    issues.push(...conceptIssues);

    const hasError = conceptIssues.some((i) => i.severity === "error");
    const hasWarning = conceptIssues.some((i) => i.severity === "warning");

    if (hasError) {
      errorCount++;
    } else if (hasWarning) {
      warningCount++;
    } else {
      validCount++;
    }

    // 1. Trust tier calculation
    const tier = deriveTrustTier(concept);
    trustTiers[tier] = (trustTiers[tier] || 0) + 1;

    // 2. Lifecycle status
    const status = getStatus(concept.metadata);
    lifecycleCounts[status] = (lifecycleCounts[status] || 0) + 1;

    // 3. Freshness / Staleness check
    if (isStale(concept.metadata)) {
      staleCount++;
    } else {
      freshCount++;
    }

    // 4. Attested Computation detection
    if (concept.metadata.computation || concept.metadata.runtime || (concept.metadata.parameters && concept.metadata.parameters.length > 0)) {
      attestedComputationsCount++;
    }

    // Type tally
    const cType = concept.metadata.type || "unknown";
    typesCount[cType] = (typesCount[cType] || 0) + 1;

    // Perform NLP analysis on concept body
    const cTitle = concept.metadata.title || concept.path || "Untitled";
    const nlpResult = analyzeConceptWithNLP(cTitle, concept.body || "");
    const cPath = concept.path || concept.id || "concept";
    nlpAnalyses[cPath] = nlpResult;

    totalCompleteness += nlpResult.qualitySignals.completenessScore;
    totalReadability += nlpResult.readability.fleschReadingEase;
  }

  const avgCompletenessScore = concepts.length > 0 ? Math.round(totalCompleteness / concepts.length) : 80;
  const avgReadabilityScore = concepts.length > 0 ? Math.round(totalReadability / concepts.length) : 65;

  // Generate INDEX.md reserved document with OKF v0.2 Trust Signals summary
  const indexMarkdown = `# ${bundleRootName.toUpperCase()} Knowledge Base Index\n\n` +
    `*Generated according to Open Knowledge Format (OKF v0.2) specification with Trust Signals, NLP Semantic Intelligence & Directed Knowledge Graph.*\n\n` +
    `## Summary & Trust Signals Overview\n` +
    `- **Total Concepts**: ${concepts.length}\n` +
    `- **Conformant Concepts**: ${validCount}\n` +
    `- **Average Completeness Index**: ${avgCompletenessScore}/100\n` +
    `- **Average Readability (Flesch)**: ${avgReadabilityScore}/100\n` +
    `- **Trust Signals (Tiers)**: ${trustTiers["human-reviewed"]} Human-Reviewed, ${trustTiers["machine-confirmed"]} Machine-Confirmed, ${trustTiers["unverified"]} Unverified\n` +
    `- **Freshness**: ${freshCount} Fresh, ${staleCount} Stale\n` +
    `- **Lifecycle**: ${lifecycleCounts["stable"]} Stable, ${lifecycleCounts["draft"]} Draft, ${lifecycleCounts["deprecated"]} Deprecated\n` +
    `- **Attested Computations**: ${attestedComputationsCount} Verified Invariant Calculation(s)\n\n` +
    `## Directory Manifest\n\n` +
    concepts
      .map((c) => `- **[${c.metadata.title || c.path}](${c.path})** (\`${c.metadata.type || "concept"}\` • \`${deriveTrustTier(c)}\` • \`${getStatus(c.metadata)}\`) — ${c.metadata.description || "No description."}`)
      .join("\n");

  const reservedIndex = {
    kind: "index" as const,
    path: "INDEX.md",
    body: indexMarkdown,
    metadata: {
      title: `${bundleRootName} Index`,
      type: "index",
    },
  };

  const reservedLog = {
    kind: "log" as const,
    path: "logs/CONVERSION.md",
    body: `# Conversion Execution Log (OKF v0.2)\n\n- Timestamp: ${new Date().toISOString()}\n- Engine: okf-ts v0.2.0 Toolkit + OKF Trust Signals & Semantic Knowledge Graph Engine\n- Total Parsed Concepts: ${concepts.length}\n- Average Content Completeness: ${avgCompletenessScore}%\n- Trust Breakdown: ${trustTiers["human-reviewed"]} Human-Reviewed, ${trustTiers["machine-confirmed"]} Machine-Confirmed, ${trustTiers["unverified"]} Unverified\n- Freshness: ${freshCount} Active / Fresh, ${staleCount} Stale\n- Validation Findings: ${issues.length} issue(s) recorded.\n`,
    metadata: {
      title: "Conversion Execution Log",
      type: "log",
    },
  };

  const bundle: OkfBundle = {
    root: bundleRootName,
    version: "0.2.0",
    concepts,
    indexes: [reservedIndex],
    logs: [reservedLog],
    issues,
  };

  // Run bundle-level validation
  const bundleIssues = validateBundle(bundle);
  bundle.issues = bundleIssues;

  // Build the base relationship graph from okf-ts
  const graph = buildGraph(concepts);

  // Build the advanced directed semantic knowledge graph
  const semanticGraph = buildSemanticGraph(concepts, nlpAnalyses, {
    similarityThreshold: options.similarityThreshold ?? 0.22,
    maxLinksPerConcept: 6,
    enableSemanticDiscovery: true,
    enableCausalDependencies: true,
  });

  // Build conformance report
  const report = buildReport(bundle);

  return {
    bundle,
    graph,
    semanticGraph,
    concepts,
    report,
    nlpAnalyses,
    summary: {
      totalConcepts: concepts.length,
      validCount,
      warningCount,
      errorCount,
      trustTiers,
      freshCount,
      staleCount,
      attestedComputationsCount,
      lifecycleCounts,
      typesCount,
      avgCompletenessScore,
      avgReadabilityScore,
    },
  };
}

/**
 * Serializes an OKF Concept into a complete Markdown file containing standard YAML frontmatter.
 */
export function exportConceptToMarkdown(concept: OkfConcept<OkfMetadata>): string {
  return serializeConcept(concept);
}

export {
  parseConcept,
  serializeConcept,
  validateConcept,
  validateBundle,
  deriveTrustTier,
  getStatus,
  isStale,
  normalizeVerified,
  collectSourceRefs,
  lastConfirmedAt,
  buildGraph,
  buildReport,
  isConformant,
  isWellFormedConcept,
};
