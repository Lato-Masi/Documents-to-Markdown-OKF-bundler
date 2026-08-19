---
name: "semantic-ontology-export"
description: >
  Exports parsed OKF concepts and MetaAST graphs to semantic web standards (JSON-LD,
  W3C Turtle RDF, SPARQL) and enterprise graph databases (Neo4j Cypher, Memgraph).
  Use when synchronizing knowledge with triplestores or knowledge management platforms.
---

# Semantic Ontology & Graph Export Skill (`semantic-ontology-export`)

This skill defines export serialization schemas for transforming OKF markdown repositories and MetaAST block graphs into W3C Linked Open Data standards and Property Graph databases.

---

## 1. W3C Turtle RDF Serialization (`text/turtle`)

Transform concept frontmatter and relations into RDF triples:

```turtle
@prefix okf: <https://okf.md/schema/> .
@prefix dc: <http://purl.org/dc/elements/1.1/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<okf://kb/concepts/raft.md>
    a okf:Concept ;
    dc:title "Raft Consensus Protocol" ;
    okf:trustTier "human-reviewed" ;
    okf:prerequisite <okf://kb/concepts/distributed-state.md> ;
    okf:relatedConcept <okf://kb/concepts/paxos.md> ;
    okf:tokenEstimate 420 ;
    okf:updatedAt "2026-08-19T10:00:00Z"^^xsd:dateTime .
```

---

## 2. JSON-LD Schema.org Packaging (`application/ld+json`)

Embed structured context compatible with search engines and knowledge crawlers:

```json
{
  "@context": {
    "@vocab": "https://schema.org/",
    "okf": "https://okf.md/schema/",
    "prerequisites": { "@id": "okf:prerequisite", "@type": "@id" },
    "trustTier": "okf:trustTier"
  },
  "@type": "TechArticle",
  "@id": "okf://kb/concepts/raft.md",
  "headline": "Raft Consensus Protocol",
  "description": "Understandable consensus algorithm for replicated logs",
  "trustTier": "human-reviewed",
  "keywords": ["consensus", "distributed-systems", "fault-tolerance"],
  "prerequisites": ["okf://kb/concepts/distributed-state.md"]
}
```

---

## 3. Neo4j Cypher Property Graph Export

Generate Cypher ingestion scripts for enterprise graph databases:

```cypher
// 1. Create or Match Concept Nodes
MERGE (c:Concept {id: "concepts/raft.md"})
SET c.title = "Raft Consensus Protocol",
    c.trustTier = "human-reviewed",
    c.type = "concept",
    c.tokens = 420;

// 2. Establish Directed Dependency Edges
MATCH (from:Concept {id: "concepts/raft.md"}), (to:Concept {id: "concepts/distributed-state.md"})
MERGE (from)-[:REQUIRES_PREREQUISITE]->(to);

MATCH (from:Concept {id: "concepts/raft.md"}), (to:Concept {id: "concepts/paxos.md"})
MERGE (from)-[:RELATED_TO]->(to);
```

---

## 4. MCP Dynamic Resource Mapping

Expose concepts as **Model Context Protocol (MCP)** read-only resources:
- `okf://{bundle-id}/INDEX.md`: Master catalog
- `okf://{bundle-id}/{path}`: Individual atomic concept markdown
