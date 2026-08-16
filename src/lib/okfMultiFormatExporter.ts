/**
 * OKF Multi-Format Exporter & Semantic Serialization Engine
 * Generates JSON-LD (Schema.org / W3C Linked Data), RDF Turtle (.ttl),
 * Model Context Protocol (MCP) Knowledge Server Manifest, and Obsidian Vault packages.
 */

import type { OkfBundle, OkfConcept, OkfMetadata } from 'okf-ts';
import JSZip from 'jszip';
import type { SemanticGraphResult, SemanticEdge } from './okfSemanticGraphEngine';
import type { NLPConceptAnalysis } from './okfNlpEngine';
import { deriveTrustTier, exportConceptToMarkdown, type OKFConversionResult } from './okfKnowledgeEngine';
import { generateConformanceCertificate } from './okfCertificationEngine';
import { generateStandaloneOKFVisualizerHTML } from './okfVisualizerGenerator';
import { generateMCPConfiguration } from './okfMcpGenerator';
import { exportToEnterpriseJsonLd } from './okfEnterpriseJsonLdEngine';

export { generateStandaloneOKFVisualizerHTML } from './okfVisualizerGenerator';

export interface MultiFormatExportResult {
  jsonLd: string;
  turtleRdf: string;
  mcpServerSchema: string;
  obsidianIndexMarkdown: string;
  summary: {
    totalEntities: number;
    totalTriples: number;
    mcpResourcesCount: number;
  };
}

/**
 * Converts an OKF bundle into W3C JSON-LD (Schema.org) Linked Data representation.
 */
export function exportToJSONLD(
  bundle: OkfBundle,
  semanticGraph?: SemanticGraphResult,
  nlpAnalyses?: Record<string, NLPConceptAnalysis>
): object {
  const rootId = bundle.root || 'okf-knowledge-base';

  const graphItems: any[] = [
    {
      '@type': 'DataCatalog',
      '@id': `urn:okf:bundle:${rootId}`,
      name: bundle.root,
      description: 'Open Knowledge Format (OKF v0.2) Knowledge Base Bundle',
      version: bundle.version || '0.2.0',
      datePublished: new Date().toISOString(),
      creator: {
        '@type': 'Organization',
        name: 'OKF Knowledge Engine',
      },
      hasPart: bundle.concepts.map((c) => ({
        '@id': `urn:okf:concept:${c.path || c.id}`,
      })),
    },
  ];

  // Map each concept to appropriate Schema.org type
  for (const c of bundle.concepts) {
    const key = c.path || c.id || 'concept.md';
    const typeStr = (c.metadata?.type as string) || 'concept';
    const tags = Array.isArray(c.metadata?.tags) ? (c.metadata.tags as string[]) : [];
    const nlp = nlpAnalyses?.[key];

    let schemaType = 'TechArticle';
    if (typeStr === 'procedure') schemaType = 'HowTo';
    else if (typeStr === 'table') schemaType = 'Table';
    else if (typeStr === 'metric') schemaType = 'QuantitativeValue';
    else if (typeStr === 'guideline') schemaType = 'Policy';

    const item: any = {
      '@type': schemaType,
      '@id': `urn:okf:concept:${key}`,
      headline: (c.metadata?.title as string) || key,
      name: (c.metadata?.title as string) || key,
      description: (c.metadata?.description as string) || '',
      articleBody: c.body,
      inLanguage: 'en',
      keywords: tags.join(', '),
      okfMetadata: {
        type: typeStr,
        status: (c.metadata?.status as string) || 'stable',
        trustTier: deriveTrustTier(c),
        stale_after: c.metadata?.stale_after || null,
        sources: c.metadata?.sources || [],
        generated: c.metadata?.generated || null,
        verified: c.metadata?.verified || null,
        computation: c.metadata?.computation || null,
        runtime: c.metadata?.runtime || null,
        attester: c.metadata?.attester || null,
        qualityScore: nlp?.qualitySignals.completenessScore || 100,
        readabilityEase: nlp?.readability.fleschReadingEase || 60,
      },
    };

    // Add semantic relationships
    if (semanticGraph) {
      const outEdges = semanticGraph.edges.filter((e) => e.from === key);
      if (outEdges.length > 0) {
        item.dependencies = outEdges
          .filter((e) => e.kind === 'depends_on')
          .map((e) => `urn:okf:concept:${e.to}`);
        item.citation = outEdges
          .filter((e) => e.kind === 'references')
          .map((e) => `urn:okf:concept:${e.to}`);
        item.isImplementationOf = outEdges
          .filter((e) => e.kind === 'implements')
          .map((e) => `urn:okf:concept:${e.to}`);
        item.mentions = outEdges
          .filter((e) => e.kind === 'related_to')
          .map((e) => `urn:okf:concept:${e.to}`);
      }
    }

    graphItems.push(item);
  }

  return {
    '@context': {
      '@vocab': 'https://schema.org/',
      okf: 'https://okf.md/spec/v0.2/',
      dependencies: { '@id': 'okf:dependsOn', '@type': '@id' },
      isImplementationOf: { '@id': 'okf:implements', '@type': '@id' },
      okfMetadata: 'okf:metadata',
      trustTier: 'okf:trustTier',
    },
    '@graph': graphItems,
  };
}

/**
 * Converts an OKF bundle into RDF Turtle (.ttl) format.
 */
export function exportToTurtleRDF(
  bundle: OkfBundle,
  semanticGraph?: SemanticGraphResult
): string {
  const rootId = (bundle.root || 'knowledge-base').toLowerCase().replace(/\s+/g, '-');
  const bundleTitle = bundle.root || 'Knowledge Base';
  const lines: string[] = [
    `@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .`,
    `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .`,
    `@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .`,
    `@prefix dc: <http://purl.org/dc/elements/1.1/> .`,
    `@prefix okf: <https://okf.md/spec/v0.2/> .`,
    `@prefix kb: <urn:okf:kb:${rootId}/> .`,
    ``,
    `kb:bundle a okf:Bundle ;`,
    `    dc:title "${bundleTitle.replace(/"/g, '\\"')}" ;`,
    `    dc:description "OKF Knowledge Base Bundle" ;`,
    `    okf:version "${bundle.version || '0.2.0'}" ;`,
    `    dc:date "${new Date().toISOString()}"^^xsd:dateTime .`,
    ``,
  ];

  for (const c of bundle.concepts) {
    const slug = (c.path || c.id || 'concept').replace(/[^a-zA-Z0-9_-]/g, '_');
    const title = String(c.metadata?.title || c.id || slug).replace(/"/g, '\\"');
    const desc = String(c.metadata?.description || '').replace(/"/g, '\\"');
    const typeStr = (c.metadata?.type as string) || 'concept';
    const tags = Array.isArray(c.metadata?.tags) ? (c.metadata.tags as string[]) : [];
    const trust = deriveTrustTier(c);

    lines.push(`kb:${slug} a okf:Concept ;`);
    lines.push(`    rdfs:label "${title}" ;`);
    lines.push(`    okf:conceptType "${typeStr}" ;`);
    lines.push(`    okf:trustTier "${trust}" ;`);
    lines.push(`    okf:status "${(c.metadata?.status as string) || 'stable'}" ;`);
    if (desc) {
      lines.push(`    dc:description "${desc}" ;`);
    }

    if (tags.length > 0) {
      const tagList = tags.map((t) => `"${String(t).replace(/"/g, '\\"')}"`).join(', ');
      lines.push(`    okf:tag ${tagList} ;`);
    }

    // Connect edges
    if (semanticGraph) {
      const outEdges = semanticGraph.edges.filter((e) => e.from === (c.path || c.id));
      for (const e of outEdges) {
        const targetSlug = e.to.replace(/[^a-zA-Z0-9_-]/g, '_');
        if (e.kind === 'depends_on') {
          lines.push(`    okf:dependsOn kb:${targetSlug} ;`);
        } else if (e.kind === 'implements') {
          lines.push(`    okf:implements kb:${targetSlug} ;`);
        } else if (e.kind === 'references') {
          lines.push(`    okf:references kb:${targetSlug} ;`);
        } else {
          lines.push(`    okf:relatedTo kb:${targetSlug} ;`);
        }
      }
    }

    lines.push(`    okf:inBundle kb:bundle .\n`);
  }

  return lines.join('\n');
}

/**
 * Generates an MCP (Model Context Protocol) Knowledge Server Manifest.
 * Enables Claude, Gemini, Windsurf, Cursor, and custom MCP clients to access the OKF bundle as structured resources and search tools.
 */
export function exportToMCPServerSchema(
  bundle: OkfBundle,
  semanticGraph?: SemanticGraphResult
): object {
  const rootId = (bundle.root || 'okf-knowledge-base').toLowerCase().replace(/\s+/g, '-');
  const bundleTitle = bundle.root || 'Knowledge Base';

  const resources = bundle.concepts.map((c) => ({
    uri: `okf://${rootId}/${c.path || c.id}`,
    name: (c.metadata?.title as string) || c.path || c.id,
    description: (c.metadata?.description as string) || `OKF Concept (${c.metadata?.type || 'concept'})`,
    mimeType: 'text/markdown',
    metadata: {
      type: c.metadata?.type || 'concept',
      trustTier: deriveTrustTier(c),
      status: c.metadata?.status || 'stable',
      stale_after: c.metadata?.stale_after || null,
      sourcesCount: Array.isArray(c.metadata?.sources) ? c.metadata.sources.length : 0,
      tags: c.metadata?.tags || [],
    },
  }));

  // Add INDEX resource
  resources.unshift({
    uri: `okf://${rootId}/INDEX.md`,
    name: `${bundleTitle} Master Index`,
    description: 'Complete OKF Bundle Root Manifest and Index',
    mimeType: 'text/markdown',
    metadata: {
      type: 'index',
      trustTier: 'machine-confirmed' as const,
      status: 'stable',
      stale_after: null,
      sourcesCount: 1,
      tags: ['index', 'manifest', 'root'],
    },
  });

  const tools = [
    {
      name: `search_${rootId.replace(/[^a-zA-Z0-9_]/g, '_')}`,
      description: `Search concepts, procedures, tables, and relationship graphs within ${bundleTitle}.`,
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Semantic query or keywords to search across the OKF knowledge base.',
          },
          conceptType: {
            type: 'string',
            enum: ['all', 'concept', 'procedure', 'table', 'metric', 'guideline'],
            description: 'Optional filter by OKF concept type.',
          },
          includeDependencies: {
            type: 'boolean',
            description: 'Whether to traverse directed knowledge graph edges and include prerequisites.',
          },
        },
        required: ['query'],
      },
    },
    {
      name: `read_concept_${rootId.replace(/[^a-zA-Z0-9_]/g, '_')}`,
      description: `Retrieve full markdown text, YAML frontmatter, and verification metadata for a specific concept.`,
      inputSchema: {
        type: 'object',
        properties: {
          conceptPath: {
            type: 'string',
            description: 'Relative path of the concept (e.g. "concepts/authentication.md").',
          },
        },
        required: ['conceptPath'],
      },
    },
  ];

  return {
    mcpVersion: '1.0.0',
    server: {
      name: `okf-server-${rootId}`,
      version: bundle.version || '0.2.0',
      description: `Model Context Protocol server providing structured knowledge from OKF bundle: ${bundleTitle}`,
    },
    capabilities: {
      resources: {
        subscribe: false,
        listChanged: true,
      },
      tools: {
        listChanged: true,
      },
    },
    resources,
    tools,
    graphStats: {
      nodesCount: bundle.concepts.length,
      edgesCount: semanticGraph?.edges.length || 0,
    },
  };
}

/**
 * Generates an Obsidian Vault compatible Index document and wikilink configuration.
 */
export function generateObsidianVaultConfig(bundle: OkfBundle): {
  indexMarkdown: string;
  graphSettingsJson: string;
} {
  const title = bundle.root || 'Knowledge Base';
  const lines: string[] = [
    `---`,
    `title: "${title} Obsidian Index"`,
    `tags: [obsidian, vault, okf, index]`,
    `---`,
    ``,
    `# 🗺️ ${title} (Obsidian Vault)`,
    ``,
    `Welcome to the **${title}** knowledge base, exported from Open Knowledge Format (OKF v0.2).`,
    ``,
    `## 📑 Concepts & Notes`,
    ``,
  ];

  for (const c of bundle.concepts) {
    const cleanPath = String(c.path || c.id || 'concept').replace(/\.md$/, '');
    const cTitle = String(c.metadata?.title || cleanPath);
    const typeBadge = `\`${c.metadata?.type || 'concept'}\``;
    lines.push(`- [[${cleanPath}|${cTitle}]] — ${typeBadge} *${String(c.metadata?.description || '')}*`);
  }

  lines.push(``);
  lines.push(`## 🔍 Graph View Tip`);
  lines.push(`Open **Graph View** in Obsidian (\`Cmd/Ctrl + G\`) to explore the interactive visual relationship graph.`);

  const graphSettings = {
    'collapse-filter': false,
    search: '',
    'local-search': '',
    'local-jumps': 2,
    'local-forelinks': true,
    'local-backlinks': true,
    'color-groups': [
      { query: 'tag:#procedure', color: { a: 1, rgb: 1090333 } },
      { query: 'tag:#guideline', color: { a: 1, rgb: 9132278 } },
      { query: 'tag:#concept', color: { a: 1, rgb: 6514417 } },
    ],
  };

  return {
    indexMarkdown: lines.join('\n'),
    graphSettingsJson: JSON.stringify(graphSettings, null, 2),
  };
}

/**
 * Generates all multi-format representations in one unified bundle.
 */
export function generateAllMultiFormatExports(
  bundle: OkfBundle,
  semanticGraph?: SemanticGraphResult,
  nlpAnalyses?: Record<string, NLPConceptAnalysis>
): MultiFormatExportResult {
  const jsonLdObj = exportToJSONLD(bundle, semanticGraph, nlpAnalyses);
  const jsonLd = JSON.stringify(jsonLdObj, null, 2);

  const turtleRdf = exportToTurtleRDF(bundle, semanticGraph);

  const mcpSchemaObj = exportToMCPServerSchema(bundle, semanticGraph);
  const mcpServerSchema = JSON.stringify(mcpSchemaObj, null, 2);

  const obsidianConfig = generateObsidianVaultConfig(bundle);

  return {
    jsonLd,
    turtleRdf,
    mcpServerSchema,
    obsidianIndexMarkdown: obsidianConfig.indexMarkdown,
    summary: {
      totalEntities: bundle.concepts.length,
      totalTriples: turtleRdf.split('\n').filter((l) => l.includes(';')).length,
      mcpResourcesCount: bundle.concepts.length + 1,
    },
  };
}

/**
 * Universal export function used by CLI and UI.
 */
export function exportOkfBundle(
  bundle: OkfBundle,
  format: 'obsidian' | 'turtle' | 'jsonld' | 'mcp' | 'csv' | 'ttl'
): { filename: string; mimeType: string; content: string } {
  const exports = generateAllMultiFormatExports(bundle);
  switch (format) {
    case 'turtle':
    case 'ttl':
      return {
        filename: `${bundle.root || 'knowledge-base'}.ttl`,
        mimeType: 'text/turtle',
        content: exports.turtleRdf,
      };
    case 'jsonld':
      return {
        filename: `${bundle.root || 'knowledge-base'}.jsonld`,
        mimeType: 'application/ld+json',
        content: exports.jsonLd,
      };
    case 'mcp':
      return {
        filename: 'mcp-server-schema.json',
        mimeType: 'application/json',
        content: exports.mcpServerSchema,
      };
    case 'obsidian':
    default:
      return {
        filename: 'index.md',
        mimeType: 'text/markdown',
        content: exports.obsidianIndexMarkdown,
      };
  }
}

export interface OKFExportZipOptions {
  bundleName?: string;
  includeRawSources?: boolean;
  includeGraphJson?: boolean;
  includeReportMarkdown?: boolean;
  includeMultiFormatExports?: boolean;
  includeObsidianVaultConfig?: boolean;
}

/**
 * Packs an OKFConversionResult into a fully conformant OKF Knowledge Base ZIP package
 * containing documents, indexes, metadata manifests, graphs, and multi-format exports.
 */
export async function exportOKFBundleAsZip(
  result: OKFConversionResult,
  options: OKFExportZipOptions = {}
): Promise<{ success: boolean; totalFiles: number; zipBlob: Blob }> {
  const zip = new JSZip();
  const bundleName = options.bundleName || result.bundle.root || 'okf-knowledge-base';
  const rootFolder = zip.folder(bundleName) || zip;

  let totalFiles = 0;

  // 1. Add all concept documents into their respective subdirectories
  for (const concept of result.concepts) {
    const rawMarkdownWithFrontmatter = exportConceptToMarkdown(concept);
    const relativePath = concept.path || `concepts/${concept.id || 'concept'}.md`;
    rootFolder.file(relativePath, rawMarkdownWithFrontmatter);
    totalFiles++;
  }

  // 2. Add Reserved Documents (INDEX.md and logs)
  if (result.bundle.indexes && result.bundle.indexes.length > 0) {
    for (const idx of result.bundle.indexes) {
      rootFolder.file(idx.path || 'INDEX.md', idx.body);
      totalFiles++;
    }
  }

  if (result.bundle.logs && result.bundle.logs.length > 0) {
    for (const log of result.bundle.logs) {
      rootFolder.file(log.path || 'logs/CONVERSION.md', log.body);
      totalFiles++;
    }
  }

  // 3. Add .okf/manifest.json (Standard bundle metadata)
  const manifest = {
    format: 'Open Knowledge Format',
    version: result.bundle.version || '0.2.0',
    root: bundleName,
    generated_at: new Date().toISOString(),
    generator: 'okf-ts toolkit & AI Document Converter',
    summary: result.summary,
    concepts: result.concepts.map((c) => ({
      id: c.id,
      path: c.path,
      type: c.metadata.type,
      title: c.metadata.title,
      tags: c.metadata.tags,
      status: c.metadata.status,
    })),
    graph: {
      nodes_count: result.graph.nodes.length,
      edges_count: result.semanticGraph?.edges.length || result.graph.edges.length,
      stats: result.semanticGraph?.stats,
    },
    conformance: {
      is_valid: result.summary.errorCount === 0,
      warnings: result.summary.warningCount,
      errors: result.summary.errorCount,
    },
  };

  rootFolder.file('.okf/manifest.json', JSON.stringify(manifest, null, 2));
  totalFiles++;

  // 4. Optionally include graph JSON and Conformance Report
  if (options.includeGraphJson !== false) {
    const graphData = result.semanticGraph || result.graph;
    rootFolder.file('.okf/graph.json', JSON.stringify(graphData, null, 2));
    totalFiles++;
  }

  if (options.includeReportMarkdown !== false && result.report) {
    const reportMd =
      `# OKF Bundle Conformance Report\n\n` +
      `- **Generated At**: ${new Date().toISOString()}\n` +
      `- **Conformance Status**: ${result.summary.errorCount === 0 ? 'PASSED (Conformant)' : 'FAILED (Issues Found)'}\n` +
      `- **Total Concepts**: ${result.summary.totalConcepts}\n` +
      `- **Errors**: ${result.summary.errorCount}\n` +
      `- **Warnings**: ${result.summary.warningCount}\n\n` +
      `## Trust Breakdown\n` +
      `- **Human Reviewed**: ${result.summary.trustTiers['human-reviewed']}\n` +
      `- **Machine Confirmed**: ${result.summary.trustTiers['machine-confirmed']}\n` +
      `- **Unverified**: ${result.summary.trustTiers['unverified']}\n\n` +
      `## Concepts List\n\n` +
      result.concepts
        .map((c) => `- \`${c.path}\` (${c.metadata.type}) — ${c.metadata.title}`)
        .join('\n');

    rootFolder.file('.okf/CONFORMANCE_REPORT.md', reportMd);
    totalFiles++;
  }

  // 5. Optionally include Multi-Format Exports (JSON-LD, Turtle RDF, MCP Server Schema)
  if (options.includeMultiFormatExports !== false) {
    const jsonLd = exportToJSONLD(result.bundle, result.semanticGraph, result.nlpAnalyses);
    rootFolder.file('.okf/linked-data.jsonld', JSON.stringify(jsonLd, null, 2));
    totalFiles++;

    const turtle = exportToTurtleRDF(result.bundle, result.semanticGraph);
    rootFolder.file('.okf/ontology.ttl', turtle);
    totalFiles++;

    const mcpSchema = exportToMCPServerSchema(result.bundle, result.semanticGraph);
    rootFolder.file('.okf/mcp-server.json', JSON.stringify(mcpSchema, null, 2));
    totalFiles++;

    // Ready-to-run MCP Client Configs & Executable Servers
    const claudeDesktop = generateMCPConfiguration(result.bundle, result.semanticGraph, 'claude-desktop', { serverName: bundleName });
    rootFolder.file('.okf/mcp/claude_desktop_config.json', claudeDesktop.content);

    const cursorMcp = generateMCPConfiguration(result.bundle, result.semanticGraph, 'cursor', { serverName: bundleName });
    rootFolder.file('.okf/mcp/cursor_mcp.json', cursorMcp.content);

    const standaloneNode = generateMCPConfiguration(result.bundle, result.semanticGraph, 'standalone-node', { serverName: bundleName });
    rootFolder.file('.okf/mcp/mcp-server.js', standaloneNode.content);

    const pythonFastMcp = generateMCPConfiguration(result.bundle, result.semanticGraph, 'fastmcp-python', { serverName: bundleName });
    rootFolder.file('.okf/mcp/server.py', pythonFastMcp.content);
    totalFiles += 4;

    // Enterprise Knowledge Graph & Graph Database Loaders (Neo4j, GraphDB, SKOS, PROV-O)
    const enterpriseJsonLd = exportToEnterpriseJsonLd(result.bundle, result.semanticGraph, result.nlpAnalyses, 'enterprise-skos-provo');
    rootFolder.file('.okf/enterprise/knowledge-graph.jsonld', enterpriseJsonLd.jsonLdString);
    rootFolder.file('.okf/enterprise/neo4j-import.cypher', enterpriseJsonLd.neo4jCypherScript);
    rootFolder.file('.okf/enterprise/neo4j-n10s.cypher', enterpriseJsonLd.neo4jn10sScript);
    rootFolder.file('.okf/enterprise/graphdb-upload.sh', enterpriseJsonLd.graphDbCurlCommand);
    rootFolder.file('.okf/enterprise/ingest_graph.py', enterpriseJsonLd.pythonIngestionScript);
    totalFiles += 5;

    // Cryptographic Conformance Certificate
    const cert = generateConformanceCertificate(result.bundle, result.semanticGraph, result.nlpAnalyses);
    rootFolder.file('.okf/CONFORMANCE_CERTIFICATE.md', cert.certificateMarkdown);
    rootFolder.file('.okf/certificate.json', JSON.stringify(cert, null, 2));
    totalFiles += 2;
  }

  // 6. Optionally include Obsidian Vault Configuration
  if (options.includeObsidianVaultConfig !== false) {
    const obs = generateObsidianVaultConfig(result.bundle);
    rootFolder.file('OBSIDIAN_INDEX.md', obs.indexMarkdown);
    rootFolder.file('.obsidian/graph.json', obs.graphSettingsJson);
    totalFiles += 2;
  }

  // 7. Add Standalone Interactive Visualizer (viz.html)
  const vizHtml = generateStandaloneOKFVisualizerHTML(result, {
    bundleTitle: bundleName,
  });
  rootFolder.file('viz.html', vizHtml);
  rootFolder.file('.okf/viz.html', vizHtml);
  totalFiles += 2;

  // 8. Generate ZIP Blob
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return { success: true, totalFiles, zipBlob };
}

/**
 * Helper to download a generated OKF ZIP in the browser.
 */
export function downloadZipBlob(blob: Blob, filename: string = 'okf-knowledge-base.zip') {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.zip') ? filename : `${filename}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

