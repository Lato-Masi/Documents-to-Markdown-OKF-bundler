/**
 * In-Memory W3C SPARQL 1.1 & RDF Triplestore Engine for OKF Bundles
 * Converts OKF concepts, metadata, and graph edges into RDF triples
 * and evaluates SELECT, CONSTRUCT, ASK, and DESCRIBE SPARQL queries.
 */

import type { OkfBundle, OkfConcept, OkfMetadata } from 'okf-ts';
import type { SemanticGraphResult } from './okfSemanticGraphEngine';
import { deriveTrustTier } from './okfKnowledgeEngine';

export interface RDFTriple {
  subject: string;
  predicate: string;
  object: string;
  isUri?: boolean;
}

export interface SparqlBindingValue {
  type: 'uri' | 'literal' | 'bnode';
  value: string;
  datatype?: string;
}

export type SparqlBinding = Record<string, SparqlBindingValue>;

export interface SparqlSelectResult {
  head: { vars: string[] };
  results: { bindings: SparqlBinding[] };
}

export interface SparqlAskResult {
  head: Record<string, never>;
  boolean: boolean;
}

export interface SparqlConstructResult {
  format: 'turtle' | 'ntriples';
  triples: RDFTriple[];
  output: string;
}

export type SparqlQueryResult =
  | { queryType: 'SELECT'; data: SparqlSelectResult; count: number; executionTimeMs: number }
  | { queryType: 'ASK'; data: SparqlAskResult; executionTimeMs: number }
  | { queryType: 'CONSTRUCT'; data: SparqlConstructResult; count: number; executionTimeMs: number }
  | { queryType: 'DESCRIBE'; data: SparqlSelectResult; count: number; executionTimeMs: number };

// Standard SPARQL Prefixes
export const DEFAULT_PREFIXES: Record<string, string> = {
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  dc: 'http://purl.org/dc/elements/1.1/',
  okf: 'urn:okf:ontology#',
  concept: 'urn:okf:concept:',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
};

/**
 * Builds an in-memory RDF Triplestore from an OKF Bundle and Semantic Graph.
 */
export function buildOkfTriplestore(
  bundle: OkfBundle,
  semanticGraph?: SemanticGraphResult
): RDFTriple[] {
  const triples: RDFTriple[] = [];

  for (const concept of bundle.concepts) {
    const rawId = concept.path?.replace(/\.md$/, '') || concept.id || 'unnamed';
    const cleanId = rawId.replace(/^[./]+/, '').replace(/\//g, '_');
    const conceptUri = `urn:okf:concept:${cleanId}`;

    // Type definition
    triples.push({
      subject: conceptUri,
      predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
      object: 'urn:okf:ontology#Concept',
      isUri: true,
    });

    // Metadata title
    const title = String(concept.metadata?.title || cleanId);
    triples.push({
      subject: conceptUri,
      predicate: 'http://purl.org/dc/elements/1.1/title',
      object: title,
      isUri: false,
    });

    // Concept type (procedure, concept, table, architecture)
    const conceptType = String(concept.metadata?.type || 'concept');
    triples.push({
      subject: conceptUri,
      predicate: 'urn:okf:ontology#conceptType',
      object: conceptType,
      isUri: false,
    });

    // Trust tier
    const trustTier = deriveTrustTier(concept);
    triples.push({
      subject: conceptUri,
      predicate: 'urn:okf:ontology#trustTier',
      object: trustTier,
      isUri: false,
    });

    // Status
    const status = String(concept.metadata?.status || 'stable');
    triples.push({
      subject: conceptUri,
      predicate: 'urn:okf:ontology#status',
      object: status,
      isUri: false,
    });

    // Description
    if (concept.metadata?.description) {
      triples.push({
        subject: conceptUri,
        predicate: 'http://purl.org/dc/elements/1.1/description',
        object: String(concept.metadata.description),
        isUri: false,
      });
    }

    // File path
    if (concept.path) {
      triples.push({
        subject: conceptUri,
        predicate: 'urn:okf:ontology#filePath',
        object: concept.path,
        isUri: false,
      });
    }

    // Tags
    if (Array.isArray(concept.metadata?.tags)) {
      for (const tag of concept.metadata.tags) {
        triples.push({
          subject: conceptUri,
          predicate: 'urn:okf:ontology#tag',
          object: String(tag),
          isUri: false,
        });
      }
    }
  }

  // Cross-reference & dependency edges from semantic graph
  if (semanticGraph && semanticGraph.edges) {
    for (const edge of semanticGraph.edges) {
      const fromClean = edge.from.replace(/\.md$/, '').replace(/^[./]+/, '').replace(/\//g, '_');
      const toClean = edge.to.replace(/\.md$/, '').replace(/^[./]+/, '').replace(/\//g, '_');
      const fromUri = `urn:okf:concept:${fromClean}`;
      const toUri = `urn:okf:concept:${toClean}`;

      if (edge.kind === 'depends_on' || edge.kind === 'prerequisite_of') {
        triples.push({
          subject: fromUri,
          predicate: 'urn:okf:ontology#dependsOn',
          object: toUri,
          isUri: true,
        });
      } else {
        triples.push({
          subject: fromUri,
          predicate: 'urn:okf:ontology#relatedTo',
          object: toUri,
          isUri: true,
        });
      }
    }
  }

  return triples;
}

/**
 * Resolves a prefixed term (e.g. `okf:trustTier` or `dc:title` or `a`) to full URI.
 */
export function expandPrefix(term: string, prefixes: Record<string, string>): string {
  if (term === 'a') return 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
  if (term.startsWith('<') && term.endsWith('>')) return term.slice(1, -1);

  const colonIdx = term.indexOf(':');
  if (colonIdx > 0) {
    const pfx = term.slice(0, colonIdx);
    const rest = term.slice(colonIdx + 1);
    if (prefixes[pfx]) {
      return prefixes[pfx] + rest;
    }
  }
  return term;
}

/**
 * Shortens a full URI using known prefixes for display.
 */
export function compactUri(uri: string, prefixes: Record<string, string>): string {
  for (const [pfx, full] of Object.entries(prefixes)) {
    if (uri.startsWith(full)) {
      return `${pfx}:${uri.slice(full.length)}`;
    }
  }
  return uri;
}

interface TriplePattern {
  subject: string;
  predicate: string;
  object: string;
}

interface ParsedSparql {
  type: 'SELECT' | 'ASK' | 'CONSTRUCT' | 'DESCRIBE';
  prefixes: Record<string, string>;
  selectVars: string[];
  patterns: TriplePattern[];
  filters: Array<{ varName: string; operator: string; value: string }>;
  limit?: number;
  orderBy?: string;
  describeUri?: string;
}

/**
 * Parses a SPARQL 1.1 query string into an executable AST.
 */
export function parseSparqlQuery(queryString: string): ParsedSparql {
  const prefixes = { ...DEFAULT_PREFIXES };
  const lines = queryString.split('\n').map((l) => l.trim());

  // 1. Extract PREFIX definitions
  const bodyLines: string[] = [];
  for (const line of lines) {
    const match = line.match(/^PREFIX\s+([a-zA-Z0-9_-]+):\s*<([^>]+)>/i);
    if (match) {
      prefixes[match[1]] = match[2];
    } else if (line) {
      bodyLines.push(line);
    }
  }

  const cleanBody = bodyLines.join(' ');

  let type: 'SELECT' | 'ASK' | 'CONSTRUCT' | 'DESCRIBE' = 'SELECT';
  let selectVars: string[] = [];
  let describeUri: string | undefined;

  if (/^ASK\b/i.test(cleanBody)) {
    type = 'ASK';
  } else if (/^CONSTRUCT\b/i.test(cleanBody)) {
    type = 'CONSTRUCT';
  } else if (/^DESCRIBE\b/i.test(cleanBody)) {
    type = 'DESCRIBE';
    const descMatch = cleanBody.match(/^DESCRIBE\s+(<[^>]+>|\S+)/i);
    if (descMatch) {
      describeUri = expandPrefix(descMatch[1], prefixes);
    }
  } else {
    type = 'SELECT';
    const selectMatch = cleanBody.match(/^SELECT\s+([\s\S]+?)\s+WHERE\b/i);
    if (selectMatch) {
      const varsRaw = selectMatch[1].trim();
      if (varsRaw === '*') {
        selectVars = ['*'];
      } else {
        selectVars = varsRaw
          .split(/\s+/)
          .filter((v) => v.startsWith('?'))
          .map((v) => v.slice(1));
      }
    }
  }

  // Extract WHERE { ... }
  const whereMatch = cleanBody.match(/WHERE\s*\{([\s\S]*?)\}/i) || cleanBody.match(/\{([\s\S]*?)\}/i);
  const whereContent = whereMatch ? whereMatch[1] : '';

  const patterns: TriplePattern[] = [];
  const filters: Array<{ varName: string; operator: string; value: string }> = [];

  // Parse triple patterns inside { ... }
  const statements = whereContent
    .split(/\.\s+|\.\n|\.$/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    // Check for FILTER
    const filterMatch = stmt.match(/FILTER\s*\(([\s\S]+)\)/i);
    if (filterMatch) {
      const fExpr = filterMatch[1].trim();
      // e.g. regex(?trustTier, "human-reviewed", "i") or ?type = "procedure" or contains(?title, "consensus")
      const regexMatch = fExpr.match(/regex\s*\(\s*\?([a-zA-Z0-9_]+)\s*,\s*["']([^"']+)["']/i);
      if (regexMatch) {
        filters.push({ varName: regexMatch[1], operator: 'regex', value: regexMatch[2] });
        continue;
      }
      const containsMatch = fExpr.match(/contains\s*\(\s*\?([a-zA-Z0-9_]+)\s*,\s*["']([^"']+)["']/i);
      if (containsMatch) {
        filters.push({ varName: containsMatch[1], operator: 'contains', value: containsMatch[2] });
        continue;
      }
      const eqMatch = fExpr.match(/\?([a-zA-Z0-9_]+)\s*=\s*["']?([^"'\s)]+)["']?/i);
      if (eqMatch) {
        filters.push({ varName: eqMatch[1], operator: '=', value: eqMatch[2] });
        continue;
      }
      continue;
    }

    // Tokenize subject predicate object (handling quotes and URIs)
    const tokens: string[] = [];
    const tokenRegex = /(<[^>]+>|"[^"]*"|'[^']*'|\?[a-zA-Z0-9_]+|[a-zA-Z0-9_-]+:[a-zA-Z0-9_#-]+|\ba\b)/g;
    let match: RegExpExecArray | null;
    while ((match = tokenRegex.exec(stmt)) !== null) {
      tokens.push(match[1]);
    }

    if (tokens.length >= 3) {
      patterns.push({
        subject: tokens[0],
        predicate: tokens[1],
        object: tokens.slice(2).join(' '),
      });
    }
  }

  // Extract LIMIT & ORDER BY
  let limit: number | undefined;
  const limitMatch = cleanBody.match(/\bLIMIT\s+(\d+)/i);
  if (limitMatch) {
    limit = parseInt(limitMatch[1], 10);
  }

  let orderBy: string | undefined;
  const orderMatch = cleanBody.match(/\bORDER\s+BY\s+(\?[a-zA-Z0-9_]+)/i);
  if (orderMatch) {
    orderBy = orderMatch[1].replace('?', '');
  }

  return {
    type,
    prefixes,
    selectVars,
    patterns,
    filters,
    limit,
    orderBy,
    describeUri,
  };
}

/**
 * Executes a parsed SPARQL query against an in-memory RDF Triplestore.
 */
export function executeSparqlQuery(
  queryString: string,
  bundle: OkfBundle,
  semanticGraph?: SemanticGraphResult
): SparqlQueryResult {
  const startTime = performance.now();
  const triplestore = buildOkfTriplestore(bundle, semanticGraph);
  const parsed = parseSparqlQuery(queryString);

  if (parsed.type === 'DESCRIBE') {
    const targetUri = parsed.describeUri || (triplestore[0] ? triplestore[0].subject : '');
    const matchingTriples = triplestore.filter(
      (t) => t.subject === targetUri || t.object === targetUri
    );

    const bindings: SparqlBinding[] = matchingTriples.map((t) => ({
      subject: { type: 'uri', value: t.subject },
      predicate: { type: 'uri', value: t.predicate },
      object: { type: t.isUri ? 'uri' : 'literal', value: t.object },
    }));

    const executionTimeMs = Math.round((performance.now() - startTime) * 100) / 100;
    return {
      queryType: 'DESCRIBE',
      data: {
        head: { vars: ['subject', 'predicate', 'object'] },
        results: { bindings },
      },
      count: bindings.length,
      executionTimeMs,
    };
  }

  // Match triple patterns
  let currentBindings: SparqlBinding[] = [{}];

  for (const pattern of parsed.patterns) {
    const nextBindings: SparqlBinding[] = [];

    const subjPat = pattern.subject;
    const predPat = expandPrefix(pattern.predicate, parsed.prefixes);
    const objPat = pattern.object;

    for (const b of currentBindings) {
      for (const triple of triplestore) {
        let match = true;
        const newBinding: SparqlBinding = { ...b };

        // 1. Match Subject
        if (subjPat.startsWith('?')) {
          const varName = subjPat.slice(1);
          if (b[varName]) {
            if (b[varName].value !== triple.subject) match = false;
          } else {
            newBinding[varName] = { type: 'uri', value: triple.subject };
          }
        } else {
          const expectedSubj = expandPrefix(subjPat, parsed.prefixes);
          if (expectedSubj !== triple.subject) match = false;
        }

        if (!match) continue;

        // 2. Match Predicate
        if (predPat.startsWith('?')) {
          const varName = predPat.slice(1);
          if (b[varName]) {
            if (b[varName].value !== triple.predicate) match = false;
          } else {
            newBinding[varName] = { type: 'uri', value: triple.predicate };
          }
        } else {
          if (predPat !== triple.predicate) match = false;
        }

        if (!match) continue;

        // 3. Match Object
        if (objPat.startsWith('?')) {
          const varName = objPat.slice(1);
          if (b[varName]) {
            if (b[varName].value !== triple.object) match = false;
          } else {
            newBinding[varName] = {
              type: triple.isUri ? 'uri' : 'literal',
              value: triple.object,
            };
          }
        } else {
          const cleanObj = objPat.replace(/^["']|["']$/g, '');
          const expectedObj = expandPrefix(cleanObj, parsed.prefixes);
          if (expectedObj !== triple.object && cleanObj !== triple.object) match = false;
        }

        if (match) {
          nextBindings.push(newBinding);
        }
      }
    }

    currentBindings = nextBindings;
  }

  // Apply FILTERS
  for (const filter of parsed.filters) {
    currentBindings = currentBindings.filter((b) => {
      const valObj = b[filter.varName];
      if (!valObj) return false;
      const val = String(valObj.value).toLowerCase();
      const target = filter.value.toLowerCase();

      if (filter.operator === 'regex' || filter.operator === 'contains') {
        return val.includes(target);
      }
      if (filter.operator === '=') {
        return val === target;
      }
      return true;
    });
  }

  // Deduplicate bindings
  const uniqueKeys = new Set<string>();
  const deduplicatedBindings: SparqlBinding[] = [];
  for (const b of currentBindings) {
    const key = JSON.stringify(b);
    if (!uniqueKeys.has(key)) {
      uniqueKeys.add(key);
      deduplicatedBindings.push(b);
    }
  }

  // Order By
  if (parsed.orderBy) {
    const obVar = parsed.orderBy;
    deduplicatedBindings.sort((a, b) => {
      const valA = a[obVar]?.value || '';
      const valB = b[obVar]?.value || '';
      return valA.localeCompare(valB);
    });
  }

  // Apply Limit
  const finalBindings = parsed.limit
    ? deduplicatedBindings.slice(0, parsed.limit)
    : deduplicatedBindings;

  const executionTimeMs = Math.round((performance.now() - startTime) * 100) / 100;

  if (parsed.type === 'ASK') {
    return {
      queryType: 'ASK',
      data: {
        head: {},
        boolean: finalBindings.length > 0,
      },
      executionTimeMs,
    };
  }

  if (parsed.type === 'CONSTRUCT') {
    const constructTriples: RDFTriple[] = [];
    let turtleOutput = `@prefix okf: <urn:okf:ontology#> .\n@prefix dc: <http://purl.org/dc/elements/1.1/> .\n\n`;

    for (const b of finalBindings) {
      const s = b.s?.value || b.concept?.value || 'urn:okf:result';
      const p = b.p?.value || 'urn:okf:ontology#matches';
      const o = b.o?.value || b.title?.value || 'Matched Result';
      constructTriples.push({ subject: s, predicate: p, object: o });
      turtleOutput += `<${s}> <${p}> "${o}" .\n`;
    }

    return {
      queryType: 'CONSTRUCT',
      data: {
        format: 'turtle',
        triples: constructTriples,
        output: turtleOutput,
      },
      count: constructTriples.length,
      executionTimeMs,
    };
  }

  // Determine output vars
  let outputVars: string[] = [];
  if (parsed.selectVars.includes('*')) {
    const allVarNames = new Set<string>();
    for (const b of finalBindings) {
      for (const k of Object.keys(b)) {
        allVarNames.add(k);
      }
    }
    outputVars = Array.from(allVarNames);
  } else {
    outputVars = parsed.selectVars;
  }

  // Filter bindings to requested selectVars
  const projectedBindings = finalBindings.map((b) => {
    const projected: SparqlBinding = {};
    for (const v of outputVars) {
      if (b[v]) {
        projected[v] = b[v];
      }
    }
    return projected;
  });

  return {
    queryType: 'SELECT',
    data: {
      head: { vars: outputVars },
      results: { bindings: projectedBindings },
    },
    count: projectedBindings.length,
    executionTimeMs,
  };
}

/**
 * Sample SPARQL Queries for OKF Bundles
 */
export const SAMPLE_SPARQL_QUERIES = [
  {
    id: 'human-reviewed-procedures',
    title: 'Find Human-Reviewed Procedures & Prerequisites',
    description: 'Retrieves all procedural concepts validated by humans with their upstream dependencies.',
    query: `PREFIX okf: <urn:okf:ontology#>
PREFIX dc:  <http://purl.org/dc/elements/1.1/>

SELECT ?concept ?title ?trustTier ?prerequisite WHERE {
  ?concept a okf:Concept ;
           dc:title ?title ;
           okf:conceptType "procedure" ;
           okf:trustTier "human-reviewed" .
  OPTIONAL { ?concept okf:dependsOn ?prerequisite }
}
ORDER BY ?title
LIMIT 10`,
  },
  {
    id: 'consensus-and-security',
    title: 'Find Concepts Tagged with Security or Architecture',
    description: 'Searches for concepts related to core system safeguards.',
    query: `PREFIX okf: <urn:okf:ontology#>
PREFIX dc:  <http://purl.org/dc/elements/1.1/>

SELECT ?concept ?title ?type ?tag WHERE {
  ?concept a okf:Concept ;
           dc:title ?title ;
           okf:conceptType ?type ;
           okf:tag ?tag .
  FILTER(regex(?tag, "security|architecture|consensus|storage", "i"))
}
LIMIT 15`,
  },
  {
    id: 'dependency-graph-construct',
    title: 'CONSTRUCT Dependency Graph as RDF Turtle',
    description: 'Constructs an RDF subgraph of directed concept dependency relationships.',
    query: `PREFIX okf: <urn:okf:ontology#>
PREFIX dc:  <http://purl.org/dc/elements/1.1/>

CONSTRUCT {
  ?concept okf:dependsOn ?prerequisite .
} WHERE {
  ?concept okf:dependsOn ?prerequisite .
}
LIMIT 20`,
  },
  {
    id: 'ask-critical-procedures',
    title: 'ASK: Are there any Unverified Machine Concepts?',
    description: 'Boolean question asking if any concept node is currently machine-confirmed.',
    query: `PREFIX okf: <urn:okf:ontology#>

ASK WHERE {
  ?concept a okf:Concept ;
           okf:trustTier "machine-confirmed" .
}`,
  },
];
