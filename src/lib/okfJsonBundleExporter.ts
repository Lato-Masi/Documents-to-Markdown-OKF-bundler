/**
 * @file okfJsonBundleExporter.ts
 * @description OKF v0.2 Compliant JSON Bundle Compiler & Structural Metadata Exporter.
 *
 * Exports generated Markdown documents alongside user/automated annotations,
 * identified entities (with entity types, salience, occurrences, and section provenance),
 * nested AST section hierarchies, and internal/external/semantic graph links into a
 * strictly validated OKF v0.2 JSON bundle (`okf-ts` v0.2.0).
 */

import {
  validateBundle,
  isConformant,
  deriveTrustTier,
  type OkfBundle,
  type OkfConcept,
  type OkfMetadata,
  type OkfGraphNode,
  type OkfGraphEdge,
  type OkfIssue,
  type TrustTier,
} from "okf-ts";
import {
  partitionMarkdownToOKFConcepts,
  compileOKFBundle,
  slugifyTitle,
  type OKFConversionResult,
} from "./okfKnowledgeEngine";
import { extractEntities as extractTechnicalEntities } from "./okfNlpEngine";
import {
  NlpEntityExtractor,
  normalizeEntityToTag,
  type EntityCategory,
} from "./nlpEntityExtractor";
import type { CustomLexiconEntry } from "./lexiconStorage";
import type { SemanticEdge } from "./okfSemanticGraphEngine";
import { parseMarkdownToAST } from "./metaAst/lexerAndParser";
import { enrichMetaAST } from "./metaAst/enricher";
import type { MetaASTNode } from "./metaAst/types";

export type OKFAnnotationKind =
  | "note"
  | "highlight"
  | "claim-check"
  | "citation"
  | "entity-note"
  | "callout-quote"
  | "table-structure"
  | "code-artifact";

export interface OKFDocumentAnnotation {
  id: string;
  kind: OKFAnnotationKind;
  source: "user" | "automated";
  targetSection: string;
  conceptPath?: string;
  anchorText?: string;
  comment: string;
  speakerAttribution?: string;
  author: string;
  createdAt: string;
  lineRange?: { start: number; end: number };
  tags?: string[];
}

export type BundleEntityType =
  | EntityCategory
  | "code"
  | "technical";

export interface IdentifiedBundleEntity {
  id: string;
  name: string;
  entityType: BundleEntityType;
  salience: number;
  confidence: number;
  occurrences: number;
  conceptPaths: string[];
  sectionHeadings: string[];
}

export interface OKFHierarchySectionStats {
  paragraphs: number;
  tables: number;
  blockquotes: number;
  lists: number;
  codeBlocks: number;
  mathBlocks: number;
}

export interface OKFHierarchyNode {
  id: string;
  title: string;
  depth: number;
  breadcrumb: string[];
  breadcrumbPath: string;
  conceptPath?: string;
  parentSectionId?: string;
  lineRange?: { start: number; end: number };
  charCount: number;
  estimatedTokens: number;
  blockCounts: OKFHierarchySectionStats;
  entityIds: string[];
  annotationIds: string[];
  outgoingLinkUrls: string[];
  children: OKFHierarchyNode[];
}

export interface OKFExtractedLink {
  id: string;
  text: string;
  url: string;
  title?: string;
  isExternal: boolean;
  kind: "external_url" | "internal_anchor" | "relative_concept" | "citation_ref";
  sourceSection: string;
  conceptPath?: string;
  line?: number;
}

export interface OKFConceptStructuralMetadata {
  headingLevel: number;
  breadcrumb: string[];
  breadcrumbPath: string;
  parentConceptPath?: string;
  childConceptPaths: string[];
  entities: Array<{
    id: string;
    name: string;
    entityType: BundleEntityType;
    salience: number;
    occurrences: number;
  }>;
  annotations: OKFDocumentAnnotation[];
  outgoingLinks: Array<{
    target: string;
    kind: string;
    text?: string;
    confidence?: number;
  }>;
  incomingLinks: Array<{
    source: string;
    kind: string;
    confidence?: number;
  }>;
}

export interface OKFv02JsonBundle extends OkfBundle {
  $schema: string;
  okf_spec: "0.2";
  generated_at: string;
  source_document: {
    fileName: string;
    title: string;
    wordCount: number;
    charCount: number;
    estimatedTokens: number;
    rawMarkdown?: string;
  };
  conformance: {
    isConformant: boolean;
    errorCount: number;
    warningCount: number;
    trustTiers: Record<TrustTier, number>;
  };
  structural_metadata: {
    hierarchy: {
      documentTitle: string;
      maxDepth: number;
      totalSections: number;
      tree: OKFHierarchyNode[];
      flatSections: Array<Omit<OKFHierarchyNode, "children">>;
    };
    entities: {
      totalUniqueEntities: number;
      countsByType: Record<string, number>;
      byType: Record<string, IdentifiedBundleEntity[]>;
      items: IdentifiedBundleEntity[];
      coOccurrenceEdges: Array<{
        sourceEntityId: string;
        targetEntityId: string;
        weight: number;
      }>;
    };
    links: {
      totalLinks: number;
      externalLinks: OKFExtractedLink[];
      internalLinks: OKFExtractedLink[];
      conceptGraph: {
        nodes: Array<{ id: string; title: string; type: string }>;
        edges: OkfGraphEdge[];
      };
      semanticEdges: SemanticEdge[];
    };
    annotations: {
      totalCount: number;
      userCount: number;
      automatedCount: number;
      items: OKFDocumentAnnotation[];
    };
  };
}

export interface BuildOKFJsonBundleOptions {
  sourceFileName?: string;
  bundleName?: string;
  annotations?: OKFDocumentAnnotation[];
  includeAutomatedAnnotations?: boolean;
  includeRawMarkdown?: boolean;
  customLexicon?: CustomLexiconEntry[];
  actorName?: string;
  verifiedBy?: string;
  similarityThreshold?: number;
}

const ANNOTATIONS_STORAGE_PREFIX = "okf_doc_annotations_v1:";

function hasBrowserLocalStorage(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
}

export function normalizeAnnotationDocKey(fileName?: string): string {
  const cleaned = (fileName || "default-document").trim().toLowerCase();
  return `${ANNOTATIONS_STORAGE_PREFIX}${cleaned}`;
}

export function loadDocumentAnnotations(fileName?: string): OKFDocumentAnnotation[] {
  if (!hasBrowserLocalStorage()) return [];
  try {
    const raw = window.localStorage.getItem(normalizeAnnotationDocKey(fileName));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveDocumentAnnotations(
  fileName: string | undefined,
  annotations: OKFDocumentAnnotation[]
): void {
  if (!hasBrowserLocalStorage()) return;
  try {
    window.localStorage.setItem(
      normalizeAnnotationDocKey(fileName),
      JSON.stringify(annotations)
    );
  } catch {
    // Ignore storage quota errors in restricted sandboxes
  }
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countOccurrencesInText(haystack: string, needle: string): number {
  if (!haystack || !needle) return 0;
  const trimmed = needle.trim();
  if (!trimmed) return 0;
  try {
    const pattern = /^\w[\w\s.-]*\w$|^\w+$/.test(trimmed)
      ? new RegExp(`\\b${escapeRegExp(trimmed)}\\b`, "gi")
      : new RegExp(escapeRegExp(trimmed), "gi");
    const matches = haystack.match(pattern);
    return matches ? matches.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Extracts domain-agnostic institutional organizations, named initiatives, and clinical/policy terms
 * that complement the technical NLP dictionary (e.g. Ministries, WHO, Foundations, Surveys).
 */
function extractContextualProperEntities(markdown: string): Array<{
  name: string;
  entityType: BundleEntityType;
  salience: number;
  occurrences: number;
}> {
  const results = new Map<
    string,
    { name: string; entityType: BundleEntityType; salience: number; occurrences: number }
  >();

  // 1. Named Organizations & Institutions (Ministry of ..., World Health Organization, ... Foundation, ... Bank, ... Bureau ...)
  const orgRegex =
    /\b((?:Ministry|Department|Bureau|Institute|Foundation|Organization|Association|University|Bank|Commission|Directorate)\s+(?:of|for|on)\s+[A-Z][A-Za-z&,/-]+(?:\s+(?:and|of|for|the|[A-Z][A-Za-z&,/-]+)){0,5}|[A-Z][A-Za-z0-9&]+\s+(?:Foundation|Organization|University|Development\s+Bank|Health\s+Organization|Bureau\s+of\s+Statistics))\b/g;

  let match: RegExpExecArray | null;
  while ((match = orgRegex.exec(markdown)) !== null) {
    const rawName = match[1].trim().replace(/[.,;:]+$/, "");
    if (rawName.length < 5 || rawName.length > 90) continue;
    const prev = results.get(rawName);
    results.set(rawName, {
      name: rawName,
      entityType: "organization",
      salience: Math.min(0.96, 0.8 + ((prev?.occurrences || 0) + 1) * 0.04),
      occurrences: (prev?.occurrences || 0) + 1,
    });
  }

  // 2. Defined Acronym Expansions: "Full Term Name (ACRONYM)"
  const acronymDefRegex =
    /\b([A-Z][A-Za-z-]+(?:\s+(?:and|of|for|in|on|to|[A-Z][A-Za-z-]+)){1,6})\s*\(([A-Z]{2,8}s?)\)/g;
  while ((match = acronymDefRegex.exec(markdown)) !== null) {
    const fullName = match[1].trim();
    const acronym = match[2].trim();
    if (/^(Figure|Table|Section|Chapter|Page|Source)\b/i.test(fullName)) continue;
    const isOrg = /\b(Ministry|Organization|Bank|Foundation|Bureau|Committee|Agency|Division)\b/i.test(
      fullName
    );
    const label = `${fullName} (${acronym})`;
    const occ = Math.max(
      1,
      countOccurrencesInText(markdown, fullName) + countOccurrencesInText(markdown, acronym)
    );
    if (!results.has(label)) {
      results.set(label, {
        name: label,
        entityType: isOrg ? "organization" : "concept",
        salience: Math.min(0.98, 0.82 + occ * 0.02),
        occurrences: occ,
      });
    }
  }

  return Array.from(results.values());
}

/**
 * Extracts automated structural annotations (attributed quotes, callouts, GFM data tables, code/math artifacts)
 * from enriched MetaAST nodes so structural semantics are preserved in the bundle's annotations manifest.
 */
function extractAutomatedStructuralAnnotations(
  enrichedNodes: MetaASTNode[],
  sectionToConceptPath: Map<string, string>,
  isoTimestamp: string
): OKFDocumentAnnotation[] {
  const autoAnnotations: OKFDocumentAnnotation[] = [];
  let counter = 1;

  for (const node of enrichedNodes) {
    const activeHeading = node.context.activeHeading || node.context.documentTitle || "Document Root";
    const conceptPath = sectionToConceptPath.get(activeHeading.toLowerCase());
    const lineRange = node.position
      ? { start: node.position.start.line, end: node.position.end.line }
      : undefined;

    if (node.type === "blockquote") {
      const cleanQuote = node.rawText
        .replace(/^>\s?/gm, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!cleanQuote) continue;

      // Detect speaker attribution e.g. — **[Policy Maker, MoLGRDC]** or [Speaker]
      const speakerMatch =
        cleanQuote.match(/(?:—|--|-)\s*\*\*\[?([^\]*]+)\]?\*\*\s*$/) ||
        cleanQuote.match(/\[([^\]]{3,60})\]\*\*\s*$/) ||
        cleanQuote.match(/\[([^\]]{3,60})\]\s*$/);

      const speaker = speakerMatch ? speakerMatch[1].trim() : undefined;
      autoAnnotations.push({
        id: `auto_ann_${counter++}`,
        kind: "callout-quote",
        source: "automated",
        targetSection: activeHeading,
        conceptPath,
        anchorText: cleanQuote.slice(0, 240),
        comment: speaker
          ? `Attributed verbatim quote (${speaker}) in section "${activeHeading}".`
          : `Callout / blockquote emphasis in section "${activeHeading}".`,
        speakerAttribution: speaker,
        author: "process:okf-ast-annotator",
        createdAt: isoTimestamp,
        lineRange,
        tags: speaker ? ["verbatim-quote", "attributed"] : ["callout"],
      });
    } else if (node.type === "table" && node.tableData) {
      const headers = node.tableData.headers.map((h) => h.name).filter(Boolean);
      const rowCount = node.tableData.rows.length;
      autoAnnotations.push({
        id: `auto_ann_${counter++}`,
        kind: "table-structure",
        source: "automated",
        targetSection: activeHeading,
        conceptPath,
        anchorText: headers.join(" | "),
        comment: `Structured GFM table (${headers.length} columns × ${rowCount} rows) under "${activeHeading}".`,
        author: "process:okf-ast-annotator",
        createdAt: isoTimestamp,
        lineRange,
        tags: ["gfm-table", "structured-data"],
      });
    } else if (node.type === "code_block" || node.type === "mermaid_diagram") {
      const lang = node.language || (node.type === "mermaid_diagram" ? "mermaid" : "text");
      autoAnnotations.push({
        id: `auto_ann_${counter++}`,
        kind: "code-artifact",
        source: "automated",
        targetSection: activeHeading,
        conceptPath,
        anchorText: (node.content || node.rawText).slice(0, 140).trim(),
        comment: `Embedded ${lang} block in section "${activeHeading}".`,
        author: "process:okf-ast-annotator",
        createdAt: isoTimestamp,
        lineRange,
        tags: ["code-block", lang],
      });
    }
  }

  return autoAnnotations;
}

/**
 * Compiles generated Markdown, user/automated annotations, identified entities, nested section hierarchy,
 * and cross-concept/external links into an OKF v0.2 compliant JSON bundle.
 */
export function buildOKFv02JsonBundle(
  markdown: string,
  options: BuildOKFJsonBundleOptions = {}
): OKFv02JsonBundle {
  const safeMarkdown = (markdown || "").trim() || "# Untitled Document\n\nEmpty content.";
  const sourceFileName = options.sourceFileName || "converted-document.md";
  const baseSlug = slugifyTitle(
    options.bundleName || sourceFileName.replace(/\.[^/.]+$/, "") || "knowledge-base"
  );
  const actorName = options.actorName || "process:okf-nlp-engine";
  const isoNow = new Date().toISOString();
  const includeRawMarkdown = options.includeRawMarkdown !== false;
  const includeAutomatedAnnotations = options.includeAutomatedAnnotations !== false;

  // 1. Compile core OKF v0.2 Concepts, Graph & Semantic Graph
  const partitionedConcepts = partitionMarkdownToOKFConcepts(safeMarkdown, {
    sourceFileName,
    defaultStatus: "stable",
    actorName,
    verifiedBy: options.verifiedBy || (options.annotations && options.annotations.length > 0 ? "human:annotator" : "process:okf-validator"),
    enableCrossLinking: true,
    enableNlpEnrichment: true,
    similarityThreshold: options.similarityThreshold ?? 0.22,
  });

  const okfCompiled: OKFConversionResult = compileOKFBundle(partitionedConcepts, baseSlug, {
    similarityThreshold: options.similarityThreshold ?? 0.22,
  });

  // Map normalized section titles -> concept paths
  const sectionToConceptPath = new Map<string, string>();
  for (const concept of okfCompiled.concepts) {
    const cPath = concept.path || concept.id || "";
    const cTitle = String(concept.metadata.title || "").trim().toLowerCase();
    if (cTitle && cPath) {
      sectionToConceptPath.set(cTitle, cPath);
    }
  }

  // 2. Parse & Enrich MetaAST for full H1..H6 hierarchy, block counts, line coordinates & inline links
  const rawAst = parseMarkdownToAST(safeMarkdown);
  const defaultTitle =
    sourceFileName.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " ").trim() || "Document";
  const enrichedAst = enrichMetaAST(rawAst, { defaultDocumentTitle: defaultTitle });
  const documentTitle =
    enrichedAst[0]?.context?.documentTitle ||
    String(okfCompiled.concepts[0]?.metadata?.title || defaultTitle);

  // 3. Extract & Unify Identified Entities (Lexicon + Named Orgs/People/Concepts/Protocols + Technical/Metrics)
  const nlpExtractor = new NlpEntityExtractor({
    customEntries: options.customLexicon,
    useStoredLexicon: !options.customLexicon,
  });
  const docEntityResult = nlpExtractor.processMarkdown(
    safeMarkdown,
    documentTitle,
    options.customLexicon
  );
  const technicalEntities = extractTechnicalEntities(safeMarkdown);
  const contextualEntities = extractContextualProperEntities(safeMarkdown);

  const unifiedEntityMap = new Map<string, IdentifiedBundleEntity>();

  const upsertEntity = (
    name: string,
    entityType: BundleEntityType,
    salience: number,
    confidence: number,
    occurrences: number
  ) => {
    const id = normalizeEntityToTag(name);
    if (!id || id.length < 2) return;
    const existing = unifiedEntityMap.get(id);
    if (existing) {
      existing.salience = Math.max(existing.salience, Number(salience.toFixed(3)));
      existing.confidence = Math.max(existing.confidence, Number(confidence.toFixed(3)));
      existing.occurrences = Math.max(existing.occurrences, occurrences);
      // Prefer more specific entityType over generic concept/technical
      if (
        (existing.entityType === "technical" || existing.entityType === "concept") &&
        entityType !== "technical" &&
        entityType !== "concept"
      ) {
        existing.entityType = entityType;
      }
      return;
    }

    unifiedEntityMap.set(id, {
      id,
      name,
      entityType,
      salience: Number(Math.min(1, Math.max(0.1, salience)).toFixed(3)),
      confidence: Number(Math.min(1, Math.max(0.5, confidence)).toFixed(3)),
      occurrences: Math.max(1, occurrences),
      conceptPaths: [],
      sectionHeadings: [],
    });
  };

  for (const ent of docEntityResult.entities) {
    upsertEntity(ent.name, ent.category, ent.salience, 0.92, ent.occurrences);
  }
  for (const ctxEnt of contextualEntities) {
    upsertEntity(ctxEnt.name, ctxEnt.entityType, ctxEnt.salience, 0.9, ctxEnt.occurrences);
  }
  for (const techEnt of technicalEntities) {
    const mappedType: BundleEntityType =
      techEnt.category === "general" ? "concept" : techEnt.category;
    const occ = Math.max(1, countOccurrencesInText(safeMarkdown, techEnt.text));
    upsertEntity(techEnt.text, mappedType, Math.min(0.95, 0.65 + occ * 0.04), techEnt.confidence, occ);
  }

  // Attribute each entity to matching OKF concepts
  for (const concept of okfCompiled.concepts) {
    const cPath = concept.path || concept.id || "";
    const cTitle = String(concept.metadata.title || "");
    const cHaystack = `${cTitle}\n${concept.body}`;

    for (const entity of unifiedEntityMap.values()) {
      const rawLabel = entity.name.replace(/\s*\([A-Z0-9]{2,8}s?\)\s*$/, "");
      if (
        countOccurrencesInText(cHaystack, entity.name) > 0 ||
        (rawLabel !== entity.name && countOccurrencesInText(cHaystack, rawLabel) > 0)
      ) {
        if (cPath && !entity.conceptPaths.includes(cPath)) {
          entity.conceptPaths.push(cPath);
        }
        if (cTitle && !entity.sectionHeadings.includes(cTitle)) {
          entity.sectionHeadings.push(cTitle);
        }
      }
    }
  }

  // 4. Assemble User + Automated Annotations
  const normalizedUserAnnotations: OKFDocumentAnnotation[] = (options.annotations || []).map(
    (ann, idx) => {
      const targetSec = ann.targetSection || documentTitle;
      const resolvedConceptPath =
        ann.conceptPath ||
        sectionToConceptPath.get(targetSec.toLowerCase()) ||
        okfCompiled.concepts[0]?.path;
      return {
        ...ann,
        id: ann.id || `user_ann_${idx + 1}`,
        source: "user",
        targetSection: targetSec,
        conceptPath: resolvedConceptPath,
        author: ann.author || "human:reviewer",
        createdAt: ann.createdAt || isoNow,
      };
    }
  );

  const automatedAnnotations = includeAutomatedAnnotations
    ? extractAutomatedStructuralAnnotations(enrichedAst, sectionToConceptPath, isoNow)
    : [];

  const allAnnotations: OKFDocumentAnnotation[] = [
    ...normalizedUserAnnotations,
    ...automatedAnnotations,
  ];

  // 5. Build Nested Section Hierarchy Tree (H1 -> H2 -> H3 -> H4...) & Extract Inline/External Links
  const hierarchyRoots: OKFHierarchyNode[] = [];
  const flatHierarchyNodes: OKFHierarchyNode[] = [];
  const sectionStack: OKFHierarchyNode[] = [];
  const extractedLinks: OKFExtractedLink[] = [];
  const seenLinkKeys = new Set<string>();
  let linkCounter = 1;
  let maxDepth = 0;

  const ensureRootSection = (): OKFHierarchyNode => {
    if (flatHierarchyNodes.length > 0) {
      return sectionStack[sectionStack.length - 1] || flatHierarchyNodes[0];
    }
    const fallbackRoot: OKFHierarchyNode = {
      id: "sec_root_1",
      title: documentTitle,
      depth: 1,
      breadcrumb: [documentTitle],
      breadcrumbPath: documentTitle,
      conceptPath: okfCompiled.concepts[0]?.path,
      charCount: 0,
      estimatedTokens: 0,
      blockCounts: {
        paragraphs: 0,
        tables: 0,
        blockquotes: 0,
        lists: 0,
        codeBlocks: 0,
        mathBlocks: 0,
      },
      entityIds: [],
      annotationIds: [],
      outgoingLinkUrls: [],
      children: [],
    };
    hierarchyRoots.push(fallbackRoot);
    flatHierarchyNodes.push(fallbackRoot);
    sectionStack.push(fallbackRoot);
    maxDepth = Math.max(maxDepth, 1);
    return fallbackRoot;
  };

  const resolveNearestConceptPath = (breadcrumb: string[], headingTitle: string): string | undefined => {
    const direct = sectionToConceptPath.get(headingTitle.toLowerCase());
    if (direct) return direct;
    for (let i = breadcrumb.length - 1; i >= 0; i--) {
      const candidate = sectionToConceptPath.get(breadcrumb[i].toLowerCase());
      if (candidate) return candidate;
    }
    return okfCompiled.concepts[0]?.path;
  };

  for (const node of enrichedAst) {
    if (node.type === "heading") {
      const depth = node.depth || 1;
      maxDepth = Math.max(maxDepth, depth);
      const headingTitle =
        (node.content || node.rawText.replace(/^#{1,6}\s+/, "").replace(/\s+#+$/, "")).trim() ||
        "Untitled Section";

      while (sectionStack.length > 0 && sectionStack[sectionStack.length - 1].depth >= depth) {
        sectionStack.pop();
      }

      const parentNode = sectionStack[sectionStack.length - 1];
      const breadcrumb =
        node.context.breadcrumb && node.context.breadcrumb.length > 0
          ? node.context.breadcrumb
          : parentNode
          ? [...parentNode.breadcrumb, headingTitle]
          : [headingTitle];

      const conceptPath = resolveNearestConceptPath(breadcrumb, headingTitle);
      const secNode: OKFHierarchyNode = {
        id: `sec_${flatHierarchyNodes.length + 1}_${slugifyTitle(headingTitle).slice(0, 32)}`,
        title: headingTitle,
        depth,
        breadcrumb,
        breadcrumbPath: breadcrumb.join(" > "),
        conceptPath,
        parentSectionId: parentNode?.id,
        lineRange: node.position
          ? { start: node.position.start.line, end: node.position.end.line }
          : undefined,
        charCount: node.context.charCount || node.rawText.length,
        estimatedTokens: node.context.estimatedTokens || Math.ceil(node.rawText.length / 4),
        blockCounts: {
          paragraphs: 0,
          tables: 0,
          blockquotes: 0,
          lists: 0,
          codeBlocks: 0,
          mathBlocks: 0,
        },
        entityIds: [],
        annotationIds: [],
        outgoingLinkUrls: [],
        children: [],
      };

      if (parentNode) {
        parentNode.children.push(secNode);
      } else {
        hierarchyRoots.push(secNode);
      }
      flatHierarchyNodes.push(secNode);
      sectionStack.push(secNode);
    } else {
      const activeSec = ensureRootSection();
      activeSec.charCount += node.context.charCount || node.rawText.length;
      activeSec.estimatedTokens +=
        node.context.estimatedTokens || Math.ceil(node.rawText.length / 4);
      if (node.position) {
        activeSec.lineRange = {
          start: activeSec.lineRange
            ? Math.min(activeSec.lineRange.start, node.position.start.line)
            : node.position.start.line,
          end: Math.max(activeSec.lineRange?.end || 0, node.position.end.line),
        };
      }

      if (node.type === "paragraph") activeSec.blockCounts.paragraphs++;
      else if (node.type === "table") activeSec.blockCounts.tables++;
      else if (node.type === "blockquote") activeSec.blockCounts.blockquotes++;
      else if (node.type === "list") activeSec.blockCounts.lists++;
      else if (node.type === "code_block" || node.type === "mermaid_diagram")
        activeSec.blockCounts.codeBlocks++;
      else if (node.type === "math_block") activeSec.blockCounts.mathBlocks++;

      // Match entities appearing in this block to the section
      for (const entity of unifiedEntityMap.values()) {
        const rawLabel = entity.name.replace(/\s*\([A-Z0-9]{2,8}s?\)\s*$/, "");
        if (
          countOccurrencesInText(node.rawText, entity.name) > 0 ||
          (rawLabel !== entity.name && countOccurrencesInText(node.rawText, rawLabel) > 0)
        ) {
          if (!activeSec.entityIds.includes(entity.id)) {
            activeSec.entityIds.push(entity.id);
          }
          if (!entity.sectionHeadings.includes(activeSec.title)) {
            entity.sectionHeadings.push(activeSec.title);
          }
        }
      }
    }

    // Collect Markdown links from node context
    const currentSec = sectionStack[sectionStack.length - 1] || flatHierarchyNodes[0];
    for (const link of node.context.outgoingLinks || []) {
      const normalizedUrl = link.url.trim();
      const dedupeKey = `${currentSec?.conceptPath || currentSec?.title || ""}::${normalizedUrl}`;
      if (seenLinkKeys.has(dedupeKey)) continue;
      seenLinkKeys.add(dedupeKey);

      const kind: OKFExtractedLink["kind"] = link.isExternal
        ? "external_url"
        : normalizedUrl.startsWith("#")
        ? "internal_anchor"
        : normalizedUrl.endsWith(".md")
        ? "relative_concept"
        : "citation_ref";

      extractedLinks.push({
        id: `link_${linkCounter++}`,
        text: link.text,
        url: normalizedUrl,
        title: link.title,
        isExternal: link.isExternal,
        kind,
        sourceSection: currentSec?.title || documentTitle,
        conceptPath: currentSec?.conceptPath,
        line: node.position?.start.line,
      });

      if (currentSec && !currentSec.outgoingLinkUrls.includes(normalizedUrl)) {
        currentSec.outgoingLinkUrls.push(normalizedUrl);
      }
    }
  }

  // Also capture any cross-concept relative links added to OKF concept bodies (e.g. `## Related Concepts`)
  const mdLinkRegex = /(?<!!)\[([^\]]+)\]\(([^)\s]+)\)/g;
  for (const concept of okfCompiled.concepts) {
    const cPath = concept.path || concept.id || "";
    const cTitle = String(concept.metadata.title || documentTitle);
    let m: RegExpExecArray | null;
    while ((m = mdLinkRegex.exec(concept.body)) !== null) {
      const linkText = m[1].trim();
      const linkUrl = m[2].trim();
      const isExt = /^https?:\/\//i.test(linkUrl);
      const dedupeKey = `${cPath || cTitle}::${linkUrl}`;
      if (seenLinkKeys.has(dedupeKey)) continue;
      seenLinkKeys.add(dedupeKey);

      extractedLinks.push({
        id: `link_${linkCounter++}`,
        text: linkText,
        url: linkUrl,
        isExternal: isExt,
        kind: isExt
          ? "external_url"
          : linkUrl.startsWith("#")
          ? "internal_anchor"
          : "relative_concept",
        sourceSection: cTitle,
        conceptPath: cPath,
      });
    }
  }

  // Attach annotation IDs to matching hierarchy sections
  for (const ann of allAnnotations) {
    const matchingSec = flatHierarchyNodes.find(
      (s) => s.title.toLowerCase() === ann.targetSection.toLowerCase()
    );
    if (matchingSec && !matchingSec.annotationIds.includes(ann.id)) {
      matchingSec.annotationIds.push(ann.id);
    }
  }

  // 6. Enrich each OKF Concept's metadata with concept-scoped structural_metadata (hierarchy, entities, annotations, links)
  const sortedEntities = Array.from(unifiedEntityMap.values()).sort(
    (a, b) => b.salience - a.salience || b.occurrences - a.occurrences
  );

  const semanticEdges = okfCompiled.semanticGraph?.edges || [];

  const enrichedConcepts: OkfConcept<OkfMetadata>[] = okfCompiled.concepts.map((concept) => {
    const cPath = concept.path || concept.id || "";
    const cTitle = String(concept.metadata.title || "");

    const matchingHierarchyNode =
      flatHierarchyNodes.find((h) => h.title.toLowerCase() === cTitle.toLowerCase()) ||
      flatHierarchyNodes.find((h) => h.conceptPath === cPath);

    const parentHierarchyNode = matchingHierarchyNode?.parentSectionId
      ? flatHierarchyNodes.find((h) => h.id === matchingHierarchyNode.parentSectionId)
      : undefined;

    const parentConceptPath =
      parentHierarchyNode?.conceptPath && parentHierarchyNode.conceptPath !== cPath
        ? parentHierarchyNode.conceptPath
        : undefined;

    const childConceptPaths = Array.from(
      new Set(
        flatHierarchyNodes
          .filter(
            (h) =>
              h.parentSectionId === matchingHierarchyNode?.id &&
              h.conceptPath &&
              h.conceptPath !== cPath
          )
          .map((h) => h.conceptPath!)
      )
    );

    const conceptEntities = sortedEntities
      .filter((e) => e.conceptPaths.includes(cPath))
      .map((e) => ({
        id: e.id,
        name: e.name,
        entityType: e.entityType,
        salience: e.salience,
        occurrences: e.occurrences,
      }));

    const conceptAnnotations = allAnnotations.filter(
      (a) =>
        a.conceptPath === cPath ||
        a.targetSection.toLowerCase() === cTitle.toLowerCase()
    );

    const outgoingLinks: OKFConceptStructuralMetadata["outgoingLinks"] = [
      ...extractedLinks
        .filter((l) => l.conceptPath === cPath)
        .map((l) => ({
          target: l.url,
          kind: l.kind,
          text: l.text,
        })),
      ...semanticEdges
        .filter((e) => e.from === cPath)
        .map((e) => ({
          target: e.to,
          kind: e.kind,
          confidence: e.confidence,
        })),
    ];

    const incomingLinks: OKFConceptStructuralMetadata["incomingLinks"] = semanticEdges
      .filter((e) => e.to === cPath)
      .map((e) => ({
        source: e.from,
        kind: e.kind,
        confidence: e.confidence,
      }));

    // Merge top entity tags into concept.metadata.tags (preserving valid non-empty strings for okf-ts)
    const mergedTags = Array.from(
      new Set([
        ...(Array.isArray(concept.metadata.tags) ? concept.metadata.tags : []),
        ...conceptEntities.slice(0, 6).map((e) => e.id),
      ])
    ).filter((t) => typeof t === "string" && t.trim().length > 0);

    const structuralMeta: OKFConceptStructuralMetadata = {
      headingLevel: matchingHierarchyNode?.depth || 1,
      breadcrumb: matchingHierarchyNode?.breadcrumb || [cTitle || documentTitle],
      breadcrumbPath: matchingHierarchyNode?.breadcrumbPath || cTitle || documentTitle,
      ...(parentConceptPath ? { parentConceptPath } : {}),
      childConceptPaths,
      entities: conceptEntities,
      annotations: conceptAnnotations,
      outgoingLinks,
      incomingLinks,
    };

    return {
      ...concept,
      metadata: {
        ...concept.metadata,
        tags: mergedTags.length > 0 ? mergedTags : ["concept"],
        structural_metadata: structuralMeta,
      },
    };
  });

  // 7. Group Entities by Type
  const entitiesByType: Record<string, IdentifiedBundleEntity[]> = {};
  const countsByType: Record<string, number> = {};
  for (const entity of sortedEntities) {
    if (!entitiesByType[entity.entityType]) {
      entitiesByType[entity.entityType] = [];
    }
    entitiesByType[entity.entityType].push(entity);
    countsByType[entity.entityType] = (countsByType[entity.entityType] || 0) + 1;
  }

  // 8. Validate the enriched OKF v0.2 Bundle via official `okf-ts` validateBundle
  const candidateBundle: Pick<OkfBundle, "concepts" | "indexes" | "logs"> = {
    concepts: enrichedConcepts,
    indexes: okfCompiled.bundle.indexes,
    logs: okfCompiled.bundle.logs,
  };
  const validationIssues: OkfIssue[] = validateBundle(candidateBundle);
  const bundleIsConformant = isConformant(validationIssues);
  const errorCount = validationIssues.filter((i) => i.severity === "error").length;
  const warningCount = validationIssues.filter((i) => i.severity === "warning").length;

  const trustTiers: Record<TrustTier, number> = {
    unverified: 0,
    "machine-confirmed": 0,
    "human-reviewed": 0,
  };
  for (const c of enrichedConcepts) {
    const tier = deriveTrustTier(c);
    trustTiers[tier] = (trustTiers[tier] || 0) + 1;
  }

  const wordMatches = safeMarkdown.match(/\S+/g);
  const wordCount = wordMatches ? wordMatches.length : 0;

  const flatSections = flatHierarchyNodes.map(({ children: _children, ...rest }) => rest);
  const externalLinks = extractedLinks.filter((l) => l.isExternal);
  const internalLinks = extractedLinks.filter((l) => !l.isExternal);

  return {
    $schema: "https://okf.dev/schemas/v0.2/bundle.json",
    okf_spec: "0.2",
    root: baseSlug,
    version: "0.2.0",
    generated_at: isoNow,
    source_document: {
      fileName: sourceFileName,
      title: documentTitle,
      wordCount,
      charCount: safeMarkdown.length,
      estimatedTokens: Math.ceil(safeMarkdown.length / 4),
      ...(includeRawMarkdown ? { rawMarkdown: safeMarkdown } : {}),
    },
    concepts: enrichedConcepts,
    indexes: okfCompiled.bundle.indexes,
    logs: okfCompiled.bundle.logs,
    issues: validationIssues,
    conformance: {
      isConformant: bundleIsConformant,
      errorCount,
      warningCount,
      trustTiers,
    },
    structural_metadata: {
      hierarchy: {
        documentTitle,
        maxDepth: maxDepth || 1,
        totalSections: flatSections.length,
        tree: hierarchyRoots,
        flatSections,
      },
      entities: {
        totalUniqueEntities: sortedEntities.length,
        countsByType,
        byType: entitiesByType,
        items: sortedEntities,
        coOccurrenceEdges: docEntityResult.summaryGraphConnections.map((c) => ({
          sourceEntityId: c.sourceTag,
          targetEntityId: c.targetTag,
          weight: c.weight,
        })),
      },
      links: {
        totalLinks:
          extractedLinks.length +
          okfCompiled.graph.edges.length +
          semanticEdges.length,
        externalLinks,
        internalLinks,
        conceptGraph: {
          nodes: okfCompiled.graph.nodes.map((n: OkfGraphNode) => ({
            id: n.id,
            title: String(n.concept.metadata?.title || n.id),
            type: String(n.concept.metadata?.type || "concept"),
          })),
          edges: okfCompiled.graph.edges,
        },
        semanticEdges,
      },
      annotations: {
        totalCount: allAnnotations.length,
        userCount: normalizedUserAnnotations.length,
        automatedCount: automatedAnnotations.length,
        items: allAnnotations,
      },
    },
  };
}

/**
 * Serializes an OKF v0.2 JSON Bundle into formatted JSON.
 */
export function serializeOKFv02JsonBundle(bundle: OKFv02JsonBundle, pretty = true): string {
  return JSON.stringify(bundle, null, pretty ? 2 : 0);
}

/**
 * Triggers a browser download of the OKF v0.2 JSON Bundle (`.okf.json`).
 */
export function downloadOKFv02JsonBundle(
  bundle: OKFv02JsonBundle,
  customFileName?: string
): string {
  const jsonString = serializeOKFv02JsonBundle(bundle, true);
  const fileName =
    customFileName || `${bundle.root || "knowledge-base"}.okf.json`;

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    const blob = new Blob([jsonString], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  return jsonString;
}
