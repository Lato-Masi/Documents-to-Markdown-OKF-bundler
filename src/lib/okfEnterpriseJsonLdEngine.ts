/**
 * @file okfEnterpriseJsonLdEngine.ts
 * @description Enterprise JSON-LD Linked Data Exporter & Enterprise Ontology Transformer for OKF v0.2.
 *
 * Supports direct loading into:
 * - Neo4j (via Neosemantics n10s, APOC, or pure Cypher UNWIND MERGE)
 * - Ontotext GraphDB (RDF4J / W3C Graph Store Protocol)
 * - Apache Jena Fuseki, Stardog, Amazon Neptune
 * - Enterprise Ontologies: W3C SKOS, W3C PROV-O, Schema.org, Dublin Core, and OWL
 */

import type { OkfBundle, OkfConcept } from 'okf-ts';
import type { SemanticGraphResult, SemanticEdge } from './okfSemanticGraphEngine';
import type { NLPConceptAnalysis } from './okfNlpEngine';
import { deriveTrustTier } from './okfKnowledgeEngine';

export type EnterpriseJsonLdProfile =
  | 'enterprise-skos-provo'
  | 'schema-org-expanded'
  | 'neo4j-property-graph'
  | 'w3c-compacted';

export interface EnterpriseJsonLdResult {
  profile: EnterpriseJsonLdProfile;
  profileName: string;
  jsonLdObject: object;
  jsonLdString: string;
  filename: string;
  mimeType: string;
  stats: {
    totalEntities: number;
    totalConcepts: number;
    totalSchemes: number;
    totalProvRecords: number;
    totalRelationships: number;
    namespaces: Record<string, string>;
  };
  neo4jCypherScript: string;
  neo4jn10sScript: string;
  graphDbCurlCommand: string;
  jenaCurlCommand: string;
  stardogCommand: string;
  pythonIngestionScript: string;
}

/**
 * Standard W3C & Enterprise Ontology Namespaces
 */
export const ENTERPRISE_NAMESPACES = {
  skos: 'http://www.w3.org/2004/02/skos/core#',
  prov: 'http://www.w3.org/ns/prov#',
  schema: 'https://schema.org/',
  dc: 'http://purl.org/dc/elements/1.1/',
  dcterms: 'http://purl.org/dc/terms/',
  owl: 'http://www.w3.org/2002/07/owl#',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  okf: 'https://okf.md/spec/v0.2/',
  neo4j: 'urn:neo4j:graph:',
};

/**
 * Exports OKF bundle into Enterprise SKOS + PROV-O + Dublin Core + OWL JSON-LD.
 */
export function generateEnterpriseSkosProvoJsonLd(
  bundle: OkfBundle,
  semanticGraph?: SemanticGraphResult,
  nlpAnalyses?: Record<string, NLPConceptAnalysis>
): object {
  const rootId = (bundle.root || 'okf-enterprise').toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '-');
  const bundleTitle = bundle.root || 'OKF Enterprise Knowledge Base';
  const schemeUri = `urn:okf:scheme:${rootId}`;
  const now = new Date().toISOString();

  const context: any = {
    '@version': 1.1,
    skos: ENTERPRISE_NAMESPACES.skos,
    prov: ENTERPRISE_NAMESPACES.prov,
    schema: ENTERPRISE_NAMESPACES.schema,
    dc: ENTERPRISE_NAMESPACES.dc,
    dcterms: ENTERPRISE_NAMESPACES.dcterms,
    owl: ENTERPRISE_NAMESPACES.owl,
    rdfs: ENTERPRISE_NAMESPACES.rdfs,
    xsd: ENTERPRISE_NAMESPACES.xsd,
    okf: ENTERPRISE_NAMESPACES.okf,

    // SKOS Mappings
    ConceptScheme: 'skos:ConceptScheme',
    Concept: 'skos:Concept',
    prefLabel: { '@id': 'skos:prefLabel', '@language': 'en' },
    altLabel: { '@id': 'skos:altLabel', '@container': '@set' },
    definition: { '@id': 'skos:definition', '@language': 'en' },
    scopeNote: { '@id': 'skos:scopeNote', '@language': 'en' },
    broader: { '@id': 'skos:broader', '@type': '@id' },
    narrower: { '@id': 'skos:narrower', '@type': '@id' },
    related: { '@id': 'skos:related', '@type': '@id' },
    inScheme: { '@id': 'skos:inScheme', '@type': '@id' },
    topConceptOf: { '@id': 'skos:topConceptOf', '@type': '@id' },
    hasTopConcept: { '@id': 'skos:hasTopConcept', '@type': '@id' },

    // PROV-O Mappings
    Entity: 'prov:Entity',
    SoftwareAgent: 'prov:SoftwareAgent',
    Activity: 'prov:Activity',
    wasGeneratedBy: { '@id': 'prov:wasGeneratedBy', '@type': '@id' },
    wasAttributedTo: { '@id': 'prov:wasAttributedTo', '@type': '@id' },
    wasDerivedFrom: { '@id': 'prov:wasDerivedFrom', '@type': '@id' },
    generatedAtTime: { '@id': 'prov:generatedAtTime', '@type': 'xsd:dateTime' },

    // OKF Direct Graph Relations
    dependsOn: { '@id': 'okf:dependsOn', '@type': '@id', '@container': '@set' },
    references: { '@id': 'okf:references', '@type': '@id', '@container': '@set' },
    implements: { '@id': 'okf:implements', '@type': '@id', '@container': '@set' },
    trustTier: 'okf:trustTier',
    deterministicHash: 'okf:deterministicHash',
    conceptType: 'okf:conceptType',
    qualityScore: 'okf:qualityScore',
  };

  // Find top concepts (in-degree 0 or marked as fundamental)
  const allConceptKeys = new Set(bundle.concepts.map((c) => c.path || c.id || 'concept'));
  const targetedKeys = new Set(semanticGraph?.edges.map((e) => e.to) || []);
  const topConceptKeys = Array.from(allConceptKeys).filter((k) => !targetedKeys.has(k));
  const effectiveTopKeys = topConceptKeys.length > 0 ? topConceptKeys : [Array.from(allConceptKeys)[0]];

  const graphItems: any[] = [];

  // 1. Enterprise SKOS ConceptScheme & OWL Ontology Declaration
  graphItems.push({
    '@id': schemeUri,
    '@type': ['skos:ConceptScheme', 'owl:Ontology', 'schema:DataCatalog'],
    'dc:title': bundleTitle,
    'dc:description': `Enterprise Knowledge Graph for ${bundleTitle} governed by OKF v0.2 specification.`,
    'dcterms:created': now,
    'dcterms:modified': now,
    'owl:versionInfo': bundle.version || '0.2.0',
    'hasTopConcept': effectiveTopKeys.map((k) => `urn:okf:concept:${k}`),
    'prov:wasAttributedTo': {
      '@id': 'urn:okf:agent:okf-engine',
      '@type': ['prov:SoftwareAgent', 'schema:SoftwareApplication'],
      'schema:name': 'OKF Semantic Knowledge Engine v0.2',
    },
  });

  // 2. Concepts as SKOS Concepts + PROV Entities
  for (const c of bundle.concepts) {
    const key = c.path || c.id || 'concept';
    const slug = key.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const conceptUri = `urn:okf:concept:${key}`;
    const trustTier = deriveTrustTier(c);
    const typeStr = String(c.metadata?.type || 'concept');
    const tags = Array.isArray(c.metadata?.tags) ? (c.metadata.tags as string[]) : [];
    const nlp = nlpAnalyses?.[key];

    // Semantic edges
    const outEdges = semanticGraph?.edges.filter((e) => e.from === key) || [];
    const dependsOn = outEdges.filter((e) => e.kind === 'depends_on').map((e) => `urn:okf:concept:${e.to}`);
    const refs = outEdges.filter((e) => e.kind === 'references').map((e) => `urn:okf:concept:${e.to}`);
    const impls = outEdges.filter((e) => e.kind === 'implements').map((e) => `urn:okf:concept:${e.to}`);
    const rels = outEdges.filter((e) => e.kind === 'related_to').map((e) => `urn:okf:concept:${e.to}`);

    const isTop = effectiveTopKeys.includes(key);

    const item: any = {
      '@id': conceptUri,
      '@type': ['skos:Concept', 'prov:Entity', 'schema:TechArticle', 'okf:Concept'],
      inScheme: schemeUri,
      prefLabel: String(c.metadata?.title || key),
      definition: String(c.metadata?.description || `Concept definition for ${key}`),
      'dc:identifier': key,
      'dc:type': typeStr,
      'dc:format': 'text/markdown',
      'schema:keywords': tags,
      'schema:articleBody': c.body || '',
      conceptType: typeStr,
      trustTier: trustTier,
      qualityScore: nlp?.qualitySignals.completenessScore || 100,
    };

    if (tags.length > 0) {
      item.altLabel = tags;
    }

    if (isTop) {
      item.topConceptOf = schemeUri;
    }

    // SKOS Broader / Narrower mapping
    if (dependsOn.length > 0) {
      item.broader = dependsOn;
      item.dependsOn = dependsOn;
    }
    if (refs.length > 0) {
      item.related = refs;
      item.references = refs;
    }
    if (impls.length > 0) {
      item.implements = impls;
    }
    if (rels.length > 0) {
      item.related = Array.from(new Set([...(item.related || []), ...rels]));
    }

    // PROV-O Attestation mapping
    if (c.metadata?.attester || c.metadata?.sources || c.metadata?.generated || c.metadata?.computation) {
      const activityId = `urn:okf:activity:${slug}:generation`;
      item.wasGeneratedBy = activityId;

      graphItems.push({
        '@id': activityId,
        '@type': 'prov:Activity',
        'rdfs:label': `Generation and verification of ${key}`,
        generatedAtTime: c.metadata?.generated || now,
        'prov:wasAssociatedWith': c.metadata?.attester
          ? {
              '@id': `urn:okf:attester:${encodeURIComponent(String(c.metadata.attester))}`,
              '@type': 'prov:Agent',
              'schema:name': String(c.metadata.attester),
            }
          : {
              '@id': 'urn:okf:agent:okf-engine',
              '@type': 'prov:SoftwareAgent',
              'schema:name': 'OKF Deterministic Validator',
            },
        'prov:used': c.metadata?.sources
          ? (Array.isArray(c.metadata.sources) ? c.metadata.sources : [c.metadata.sources]).map(
              (s: string) => `urn:okf:source:${encodeURIComponent(s)}`
            )
          : undefined,
      });
    }

    graphItems.push(item);
  }

  return {
    '@context': context,
    '@graph': graphItems,
  };
}

/**
 * Generates Property Graph-friendly JSON-LD optimized for Neo4j with explicit nodes, labels, and relationships.
 */
export function generateNeo4jPropertyGraphJsonLd(
  bundle: OkfBundle,
  semanticGraph?: SemanticGraphResult,
  nlpAnalyses?: Record<string, NLPConceptAnalysis>
): object {
  const rootId = (bundle.root || 'okf-neo4j').toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '-');
  const bundleTitle = bundle.root || 'OKF Knowledge Base';

  const nodes: any[] = [];
  const relationships: any[] = [];

  // Root Catalog Node
  nodes.push({
    '@id': `urn:okf:bundle:${rootId}`,
    '@type': ['KnowledgeBase', 'Resource'],
    name: bundleTitle,
    version: bundle.version || '0.2.0',
    totalConcepts: bundle.concepts.length,
  });

  // Concept Nodes
  for (const c of bundle.concepts) {
    const key = c.path || c.id || 'concept';
    const trust = deriveTrustTier(c);
    const nlp = nlpAnalyses?.[key];

    nodes.push({
      '@id': `urn:okf:concept:${key}`,
      '@type': ['OKFConcept', 'Resource', c.metadata?.type ? `Type_${c.metadata.type}` : 'Type_Concept'],
      key: key,
      title: String(c.metadata?.title || key),
      description: String(c.metadata?.description || ''),
      trustTier: trust,
      type: String(c.metadata?.type || 'concept'),
      status: String(c.metadata?.status || 'stable'),
      tags: c.metadata?.tags || [],
      completenessScore: nlp?.qualitySignals.completenessScore || 100,
      readingEase: nlp?.readability.fleschReadingEase || 60,
      bodyExcerpt: (c.body || '').slice(0, 300),
    });

    relationships.push({
      '@type': 'CONTAINS',
      from: `urn:okf:bundle:${rootId}`,
      to: `urn:okf:concept:${key}`,
    });
  }

  // Directed Semantic Graph Relationships
  if (semanticGraph) {
    for (const e of semanticGraph.edges) {
      const relType =
        e.kind === 'depends_on'
          ? 'DEPENDS_ON'
          : e.kind === 'references'
          ? 'REFERENCES'
          : e.kind === 'implements'
          ? 'IMPLEMENTS'
          : 'RELATED_TO';

      relationships.push({
        '@type': relType,
        from: `urn:okf:concept:${e.from}`,
        to: `urn:okf:concept:${e.to}`,
        kind: e.kind,
        weight: e.kind === 'depends_on' ? 1.0 : 0.6,
      });
    }
  }

  return {
    '@context': {
      '@vocab': 'urn:neo4j:graph:',
      nodes: '@graph',
      relationships: 'neo4j:relationships',
      from: { '@type': '@id', '@id': 'neo4j:from' },
      to: { '@type': '@id', '@id': 'neo4j:to' },
    },
    '@graph': nodes,
    relationships: relationships,
  };
}

/**
 * Builds direct copyable Cypher & loader scripts for Neo4j, GraphDB, Jena, and Stardog.
 */
export function generateEnterpriseIngestionScripts(
  bundle: OkfBundle,
  jsonLdString: string,
  jsonLdFilename: string
) {
  const rootId = (bundle.root || 'okf-kb').toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '-');
  const bundleTitle = bundle.root || 'OKF Knowledge Base';

  // 1. Pure Cypher Script (No plugins needed, loads JSON payload directly)
  const neo4jCypherScript = `// ============================================================================
// OKF v0.2 to Neo4j Property Graph Direct Ingestion Script
// Bundle: ${bundleTitle}
// ============================================================================

// 1. Create Schema Constraints & Indexes
CREATE CONSTRAINT unique_concept_id IF NOT EXISTS FOR (c:OKFConcept) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT unique_kb_id IF NOT EXISTS FOR (kb:OKFKnowledgeBase) REQUIRE kb.id IS UNIQUE;
CREATE INDEX concept_trust_tier IF NOT EXISTS FOR (c:OKFConcept) ON (c.trustTier);

// 2. Ingest Knowledge Base Root Node
MERGE (kb:OKFKnowledgeBase {id: "urn:okf:bundle:${rootId}"})
SET kb.name = "${bundleTitle.replace(/"/g, '\\"')}",
    kb.version = "${bundle.version || '0.2.0'}",
    kb.updatedAt = datetime();

// 3. Batch Merge Concept Nodes from JSON-LD Graph
WITH $jsonLdPayload AS payload
UNWIND payload['@graph'] AS item
WHERE 'skos:Concept' IN item['@type'] OR 'OKFConcept' IN item['@type'] OR item['@type'] = 'TechArticle'
MERGE (c:OKFConcept {id: item['@id']})
SET c.name = coalesce(item.prefLabel, item.headline, item.title, item['dc:title']),
    c.description = coalesce(item.definition, item.description, ''),
    c.trustTier = coalesce(item.trustTier, 'L1_Deterministic'),
    c.type = coalesce(item.conceptType, item['dc:type'], 'concept'),
    c.qualityScore = coalesce(item.qualityScore, 100),
    c.articleBody = coalesce(item['schema:articleBody'], item.bodyExcerpt, ''),
    c.tags = coalesce(item['schema:keywords'], item.tags, [])
MERGE (kb:OKFKnowledgeBase {id: "urn:okf:bundle:${rootId}"})
MERGE (kb)-[:CONTAINS]->(c);

// 4. Create Directed Graph Relationships
WITH $jsonLdPayload AS payload
UNWIND payload['@graph'] AS item
UNWIND coalesce(item.dependsOn, item.broader, []) AS targetId
MATCH (src:OKFConcept {id: item['@id']})
MATCH (tgt:OKFConcept {id: targetId})
MERGE (src)-[:DEPENDS_ON {type: 'strict'}]->(tgt);

WITH $jsonLdPayload AS payload
UNWIND payload['@graph'] AS item
UNWIND coalesce(item.references, item.related, []) AS targetId
MATCH (src:OKFConcept {id: item['@id']})
MATCH (tgt:OKFConcept {id: targetId})
MERGE (src)-[:REFERENCES]->(tgt);

WITH $jsonLdPayload AS payload
UNWIND payload['@graph'] AS item
UNWIND coalesce(item.implements, []) AS targetId
MATCH (src:OKFConcept {id: item['@id']})
MATCH (tgt:OKFConcept {id: targetId})
MERGE (src)-[:IMPLEMENTS]->(tgt);

// Ingestion Complete! Query your graph:
// MATCH p=(c:OKFConcept)-[:DEPENDS_ON]->(d:OKFConcept) RETURN p LIMIT 50;`;

  // 2. Neo4j Neosemantics (n10s) RDF Ingestion
  const neo4jn10sScript = `// ============================================================================
// Neo4j Neosemantics (n10s) Direct RDF JSON-LD Ingestion
// ============================================================================

// 1. Initialize n10s Config
CREATE CONSTRAINT n10s_unique_uri IF NOT EXISTS FOR (r:Resource) REQUIRE r.uri IS UNIQUE;
CALL n10s.graphconfig.init({
  handleVocabUris: 'SHORTEN',
  handleMultival: 'ARRAY',
  multivalPropList: [
    'http://www.w3.org/2004/02/skos/core#altLabel',
    'https://schema.org/keywords'
  ]
});

// 2. Import JSON-LD from local file or inline payload
CALL n10s.rdf.import.inline($jsonLdString, "JSON-LD");

// 3. Inspect Ingested Triples & Concepts
MATCH (n:skos__Concept)
RETURN n.uri AS uri, n.skos__prefLabel AS label, n.okf__trustTier AS trustTier;`;

  // 3. GraphDB curl command
  const graphDbCurlCommand = `# Ontotext GraphDB / RDF4J REST API Direct Upload
# Replace 'http://localhost:7200' and 'okf-repository' with your GraphDB endpoint and repo ID
curl -X POST \\
  -H "Content-Type: application/ld+json" \\
  --data-binary @${jsonLdFilename} \\
  "http://localhost:7200/repositories/okf-repository/statements"`;

  // 4. Apache Jena Fuseki command
  const jenaCurlCommand = `# Apache Jena Fuseki Graph Store HTTP Protocol Upload
# Replace 'http://localhost:3030/okf-dataset' with your Fuseki dataset URL
curl -X POST \\
  -H "Content-Type: application/ld+json" \\
  --data-binary @${jsonLdFilename} \\
  "http://localhost:3030/okf-dataset/data?default"`;

  // 5. Stardog CLI command
  const stardogCommand = `# Stardog Knowledge Graph CLI Import
# Replace 'okf-db' with your target database name
stardog data add --format JSON-LD okf-db ${jsonLdFilename}`;

  // 6. Python ingestion script
  const pythonIngestionScript = `"""
OKF v0.2 Enterprise JSON-LD Ingestion Pipeline
Loads '${jsonLdFilename}' into Neo4j (via neo4j driver) or GraphDB / RDFLib
"""

import json
import os
from neo4j import GraphDatabase

JSON_LD_FILE = "${jsonLdFilename}"
NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "password")

def ingest_to_neo4j():
    with open(JSON_LD_FILE, "r", encoding="utf-8") as f:
        payload = json.load(f)

    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    with driver.session() as session:
        print(f"Connected to Neo4j at {NEO4J_URI}. Ingesting OKF JSON-LD graph...")

        # Ingest Concepts
        session.run("""
            UNWIND $graph AS item
            WHERE 'skos:Concept' IN item['@type'] OR 'OKFConcept' IN item['@type'] OR item['@type'] = 'TechArticle'
            MERGE (c:OKFConcept {id: item['@id']})
            SET c.name = coalesce(item.prefLabel, item.headline, item.title, item['dc:title']),
                c.description = coalesce(item.definition, item.description, ''),
                c.trustTier = coalesce(item.trustTier, 'L1_Deterministic'),
                c.type = coalesce(item.conceptType, item['dc:type'], 'concept'),
                c.qualityScore = coalesce(item.qualityScore, 100)
        """, graph=payload.get("@graph", []))

        # Ingest Dependencies
        session.run("""
            UNWIND $graph AS item
            UNWIND coalesce(item.dependsOn, item.broader, []) AS targetId
            MATCH (src:OKFConcept {id: item['@id']})
            MATCH (tgt:OKFConcept {id: targetId})
            MERGE (src)-[:DEPENDS_ON]->(tgt)
        """, graph=payload.get("@graph", []))

        print("Successfully ingested OKF graph into Neo4j!")

if __name__ == "__main__":
    ingest_to_neo4j()
`;

  return {
    neo4jCypherScript,
    neo4jn10sScript,
    graphDbCurlCommand,
    jenaCurlCommand,
    stardogCommand,
    pythonIngestionScript,
  };
}

/**
 * Master Enterprise JSON-LD Export Orchestrator
 */
export function exportToEnterpriseJsonLd(
  bundle: OkfBundle,
  semanticGraph?: SemanticGraphResult,
  nlpAnalyses?: Record<string, NLPConceptAnalysis>,
  profile: EnterpriseJsonLdProfile = 'enterprise-skos-provo'
): EnterpriseJsonLdResult {
  const rootId = (bundle.root || 'bundle').toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '-');
  const filename = `${rootId}-${profile}.jsonld`;

  let jsonLdObj: object;
  let profileName = 'Enterprise SKOS + PROV-O Ontology';

  if (profile === 'enterprise-skos-provo') {
    jsonLdObj = generateEnterpriseSkosProvoJsonLd(bundle, semanticGraph, nlpAnalyses);
    profileName = 'Enterprise SKOS + PROV-O + Dublin Core';
  } else if (profile === 'neo4j-property-graph') {
    jsonLdObj = generateNeo4jPropertyGraphJsonLd(bundle, semanticGraph, nlpAnalyses);
    profileName = 'Neo4j Property Graph JSON-LD';
  } else {
    // schema-org-expanded or w3c-compacted
    const raw: any = generateEnterpriseSkosProvoJsonLd(bundle, semanticGraph, nlpAnalyses);
    jsonLdObj = raw;
    profileName = 'Schema.org & W3C Linked Data';
  }

  const jsonLdString = JSON.stringify(jsonLdObj, null, 2);

  // Compute stats
  const graphArr = (jsonLdObj as any)['@graph'] || [];
  const totalConcepts = graphArr.filter(
    (item: any) =>
      (Array.isArray(item['@type']) && item['@type'].some((t: string) => t.includes('Concept'))) ||
      item['@type'] === 'TechArticle'
  ).length;

  const totalSchemes = graphArr.filter(
    (item: any) =>
      (Array.isArray(item['@type']) && item['@type'].some((t: string) => t.includes('ConceptScheme') || t.includes('Ontology'))) ||
      item['@type'] === 'DataCatalog'
  ).length;

  const totalProvRecords = graphArr.filter(
    (item: any) =>
      item['@type'] === 'prov:Activity' ||
      (Array.isArray(item['@type']) && item['@type'].includes('prov:Entity'))
  ).length;

  const totalRelationships = semanticGraph?.edges.length || 0;

  const scripts = generateEnterpriseIngestionScripts(bundle, jsonLdString, filename);

  return {
    profile,
    profileName,
    jsonLdObject: jsonLdObj,
    jsonLdString,
    filename,
    mimeType: 'application/ld+json',
    stats: {
      totalEntities: graphArr.length,
      totalConcepts: totalConcepts || bundle.concepts.length,
      totalSchemes: totalSchemes || 1,
      totalProvRecords,
      totalRelationships,
      namespaces: ENTERPRISE_NAMESPACES,
    },
    ...scripts,
  };
}
