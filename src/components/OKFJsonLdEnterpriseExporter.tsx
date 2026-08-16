/**
 * @file OKFJsonLdEnterpriseExporter.tsx
 * @description Interactive Enterprise JSON-LD Linked Data & Graph Database Exporter for OKF v0.2.
 *
 * Provides direct export and ingestion scripts for:
 * - Neo4j (Cypher UNWIND MERGE, Neosemantics n10s, APOC)
 * - Ontotext GraphDB (RDF4J REST API & Graph Store)
 * - Apache Jena Fuseki & Stardog Knowledge Graph
 * - Enterprise Ontologies: W3C SKOS, W3C PROV-O, Schema.org, Dublin Core, OWL
 */

import React, { useState, useMemo } from 'react';
import type { OkfBundle } from 'okf-ts';
import type { SemanticGraphResult } from '../lib/okfSemanticGraphEngine';
import type { NLPConceptAnalysis } from '../lib/okfNlpEngine';
import {
  exportToEnterpriseJsonLd,
  type EnterpriseJsonLdProfile,
  type EnterpriseJsonLdResult,
  ENTERPRISE_NAMESPACES,
} from '../lib/okfEnterpriseJsonLdEngine';
import HighlightedCodeBlock from './HighlightedCodeBlock';
import {
  FileJson,
  Database,
  Server,
  Terminal,
  Copy,
  Check,
  Download,
  Layers,
  Network,
  Share2,
  CheckCircle2,
  ExternalLink,
  Code2,
  BookOpen,
  ShieldCheck,
  Cpu,
  Boxes,
  Workflow,
  Sparkles,
} from 'lucide-react';

interface OKFJsonLdEnterpriseExporterProps {
  bundle: OkfBundle;
  semanticGraph?: SemanticGraphResult;
  nlpAnalyses?: Record<string, NLPConceptAnalysis>;
}

type IngestionTab = 'jsonld' | 'neo4j-cypher' | 'neo4j-n10s' | 'graphdb' | 'jena-stardog' | 'python';

export default function OKFJsonLdEnterpriseExporter({
  bundle,
  semanticGraph,
  nlpAnalyses,
}: OKFJsonLdEnterpriseExporterProps) {
  const [profile, setProfile] = useState<EnterpriseJsonLdProfile>('enterprise-skos-provo');
  const [activeTab, setActiveTab] = useState<IngestionTab>('jsonld');
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedConceptPreview, setSelectedConceptPreview] = useState<string | null>(
    bundle.concepts[0]?.path || bundle.concepts[0]?.id || null
  );

  const exportResult: EnterpriseJsonLdResult = useMemo(() => {
    return exportToEnterpriseJsonLd(bundle, semanticGraph, nlpAnalyses, profile);
  }, [bundle, semanticGraph, nlpAnalyses, profile]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Get active code content based on activeTab
  const activeCodeData = useMemo(() => {
    switch (activeTab) {
      case 'neo4j-cypher':
        return {
          code: exportResult.neo4jCypherScript,
          language: 'sql',
          filename: 'neo4j-import.cypher',
          mime: 'application/x-cypher-query',
          title: 'Neo4j Cypher Direct Batch Ingestion Script',
          badge: 'Pure Cypher (No Plugins)',
          desc: 'Creates constraints, merges OKFConcept & OKFKnowledgeBase nodes, and generates DEPENDS_ON, REFERENCES, and IMPLEMENTS graph edges directly.',
        };
      case 'neo4j-n10s':
        return {
          code: exportResult.neo4jn10sScript,
          language: 'sql',
          filename: 'neo4j-n10s.cypher',
          mime: 'application/x-cypher-query',
          title: 'Neo4j Neosemantics (n10s) RDF Ingestion Script',
          badge: 'Neosemantics Plugin',
          desc: 'Initializes n10s RDF graph configuration and imports the JSON-LD payload into a semantic property graph using n10s.rdf.import.inline().',
        };
      case 'graphdb':
        return {
          code: exportResult.graphDbCurlCommand,
          language: 'bash',
          filename: 'graphdb-upload.sh',
          mime: 'text/x-shellscript',
          title: 'Ontotext GraphDB / RDF4J Direct Ingestion Command',
          badge: 'REST API & Workbench',
          desc: 'Direct HTTP POST command to stream the JSON-LD graph into an Ontotext GraphDB or RDF4J triplestore repository.',
        };
      case 'jena-stardog':
        return {
          code: `${exportResult.jenaCurlCommand}\n\n${exportResult.stardogCommand}`,
          language: 'bash',
          filename: 'triplestore-import.sh',
          mime: 'text/x-shellscript',
          title: 'Apache Jena Fuseki & Stardog CLI Commands',
          badge: 'Enterprise Triplestores',
          desc: 'Standard W3C Graph Store HTTP Protocol upload for Apache Jena Fuseki and native CLI command for Stardog Knowledge Graph.',
        };
      case 'python':
        return {
          code: exportResult.pythonIngestionScript,
          language: 'python',
          filename: 'ingest_okf_graph.py',
          mime: 'text/x-python',
          title: 'Python Neo4j Driver Ingestion Pipeline',
          badge: 'neo4j-python',
          desc: 'Self-contained Python script to load the OKF JSON-LD graph into a local or Neo4j AuraDB instance using the official Neo4j Python driver.',
        };
      case 'jsonld':
      default:
        return {
          code: exportResult.jsonLdString,
          language: 'json',
          filename: exportResult.filename,
          mime: exportResult.mimeType,
          title: exportResult.profileName,
          badge: 'W3C JSON-LD 1.1',
          desc: 'Standard W3C JSON-LD graph featuring SKOS ConceptSchemes, PROV-O provenance activities, Dublin Core metadata, and directed OKF graph edges.',
        };
    }
  }, [activeTab, exportResult]);

  return (
    <div className="flex flex-col gap-6">
      {/* Top Banner */}
      <div className="p-4 sm:p-5 rounded-xl bg-slate-900 text-white border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-start gap-3.5">
          <div className="p-3 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400">
            <Network className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-white tracking-tight">
                Enterprise JSON-LD & Knowledge Graph Exporter
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                Neo4j + GraphDB + SKOS
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                W3C PROV-O Ready
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Export native JSON-LD Linked Data and instant loading scripts for Neo4j, Ontotext GraphDB, Apache Jena,
              Stardog, and enterprise ontology management platforms.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto flex-wrap">
          <button
            type="button"
            onClick={() => copyToClipboard(activeCodeData.code, 'top-copy')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition cursor-pointer"
          >
            {copied === 'top-copy' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Payload</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() =>
              downloadFile(activeCodeData.code, activeCodeData.filename, activeCodeData.mime)
            }
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition cursor-pointer shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download {activeCodeData.filename}</span>
          </button>
        </div>
      </div>

      {/* Ontology Profile Selection Bar */}
      <div className="flex flex-col gap-2.5">
        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
          <Share2 className="w-4 h-4 text-indigo-600" />
          Select JSON-LD Semantic Profile
        </label>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => setProfile('enterprise-skos-provo')}
            className={`p-3 rounded-xl border text-left transition flex items-start justify-between gap-3 cursor-pointer ${
              profile === 'enterprise-skos-provo'
                ? 'bg-indigo-50/80 border-indigo-500 ring-2 ring-indigo-500/20 text-slate-900 shadow-2xs'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold">SKOS + PROV-O Enterprise</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-medium bg-indigo-100 text-indigo-800">
                  Ontotext / Jena
                </span>
              </div>
              <span className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                Full W3C SKOS ConceptScheme taxonomy with broader/narrower/related mappings and PROV-O attestation lineage.
              </span>
            </div>
            <div
              className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                profile === 'enterprise-skos-provo'
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-300 bg-white'
              }`}
            >
              {profile === 'enterprise-skos-provo' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setProfile('neo4j-property-graph')}
            className={`p-3 rounded-xl border text-left transition flex items-start justify-between gap-3 cursor-pointer ${
              profile === 'neo4j-property-graph'
                ? 'bg-emerald-50/80 border-emerald-500 ring-2 ring-emerald-500/20 text-slate-900 shadow-2xs'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold">Neo4j Property Graph</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-medium bg-emerald-100 text-emerald-800">
                  Labels & Edges
                </span>
              </div>
              <span className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                Explicit node labels, edge types (DEPENDS_ON, REFERENCES), and property graphs mapped for high-speed Neo4j loading.
              </span>
            </div>
            <div
              className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                profile === 'neo4j-property-graph'
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-slate-300 bg-white'
              }`}
            >
              {profile === 'neo4j-property-graph' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setProfile('schema-org-expanded')}
            className={`p-3 rounded-xl border text-left transition flex items-start justify-between gap-3 cursor-pointer ${
              profile === 'schema-org-expanded'
                ? 'bg-amber-50/80 border-amber-500 ring-2 ring-amber-500/20 text-slate-900 shadow-2xs'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold">Schema.org Web Graph</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-medium bg-amber-100 text-amber-800">
                  Web Crawlers
                </span>
              </div>
              <span className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                Schema.org TechArticle, HowTo, and DataCatalog vocabulary ideal for search engine indexing and LLM web grounding.
              </span>
            </div>
            <div
              className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                profile === 'schema-org-expanded'
                  ? 'border-amber-600 bg-amber-600 text-white'
                  : 'border-slate-300 bg-white'
              }`}
            >
              {profile === 'schema-org-expanded' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
            </div>
          </button>
        </div>
      </div>

      {/* Metrics Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-3 rounded-xl border border-slate-200 bg-white shadow-2xs flex flex-col">
          <span className="text-[10px] font-bold text-slate-500 uppercase">Entities in Graph</span>
          <span className="text-lg font-bold text-slate-900 mt-0.5">{exportResult.stats.totalEntities}</span>
          <span className="text-[10px] text-slate-400">Nodes in @graph</span>
        </div>

        <div className="p-3 rounded-xl border border-slate-200 bg-white shadow-2xs flex flex-col">
          <span className="text-[10px] font-bold text-slate-500 uppercase">SKOS Concepts</span>
          <span className="text-lg font-bold text-indigo-600 mt-0.5">{exportResult.stats.totalConcepts}</span>
          <span className="text-[10px] text-slate-400">skos:Concept items</span>
        </div>

        <div className="p-3 rounded-xl border border-slate-200 bg-white shadow-2xs flex flex-col">
          <span className="text-[10px] font-bold text-slate-500 uppercase">Directed Edges</span>
          <span className="text-lg font-bold text-emerald-600 mt-0.5">{exportResult.stats.totalRelationships}</span>
          <span className="text-[10px] text-slate-400">Dependency & Ref triples</span>
        </div>

        <div className="p-3 rounded-xl border border-slate-200 bg-white shadow-2xs flex flex-col">
          <span className="text-[10px] font-bold text-slate-500 uppercase">PROV Lineage</span>
          <span className="text-lg font-bold text-purple-600 mt-0.5">{exportResult.stats.totalProvRecords}</span>
          <span className="text-[10px] text-slate-400">prov:Entity & Activity</span>
        </div>

        <div className="p-3 rounded-xl border border-slate-200 bg-white shadow-2xs flex flex-col col-span-2 sm:col-span-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase">Vocabularies</span>
          <span className="text-lg font-bold text-amber-600 mt-0.5">8 Ontologies</span>
          <span className="text-[10px] text-slate-400">SKOS, PROV, DC, OWL, Schema</span>
        </div>
      </div>

      {/* Target Database Ingestion Tabs */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-1.5 border-b border-slate-200 pb-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('jsonld')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'jsonld'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <FileJson className="w-3.5 h-3.5" />
            JSON-LD Payload
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('neo4j-cypher')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'neo4j-cypher'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            Neo4j Cypher Loader
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('neo4j-n10s')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'neo4j-n10s'
                ? 'bg-teal-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Workflow className="w-3.5 h-3.5" />
            Neo4j n10s (RDF)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('graphdb')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'graphdb'
                ? 'bg-purple-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            Ontotext GraphDB
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('jena-stardog')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'jena-stardog'
                ? 'bg-sky-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Boxes className="w-3.5 h-3.5" />
            Apache Jena & Stardog
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('python')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'python'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            Python Pipeline
          </button>
        </div>

        {/* Ingestion Info Box */}
        <div className="p-4 rounded-xl border border-indigo-200/80 bg-indigo-50/40 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div>
            <div className="flex items-center gap-2 font-bold text-indigo-950">
              <CheckCircle2 className="w-4 h-4 text-indigo-600" />
              <span>{activeCodeData.title}</span>
              <span className="px-2 py-0.2 rounded-full text-[9px] font-mono bg-indigo-200/60 text-indigo-900">
                {activeCodeData.badge}
              </span>
            </div>
            <p className="text-slate-600 mt-1">{activeCodeData.desc}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => copyToClipboard(activeCodeData.code, 'tab-code')}
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
            >
              {copied === 'tab-code' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>Copy Code</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Code Block */}
        <div className="rounded-xl overflow-hidden border border-slate-200 shadow-2xs max-h-[500px] overflow-y-auto">
          <HighlightedCodeBlock
            value={activeCodeData.code}
            language={activeCodeData.language}
          />
        </div>
      </div>

      {/* Interactive SKOS & Entity Inspector */}
      <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Workflow className="w-4 h-4 text-indigo-600" />
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
              SKOS Taxonomy & PROV Lineage Inspector
            </h4>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            {bundle.concepts.length} Concept Nodes
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Left: Concept List */}
          <div className="md:col-span-5 max-h-[300px] overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl p-1">
            {bundle.concepts.map((c) => {
              const key = c.path || c.id || '';
              const isSelected = selectedConceptPreview === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedConceptPreview(key)}
                  className={`w-full text-left p-2.5 rounded-lg transition cursor-pointer flex items-start justify-between gap-2 ${
                    isSelected ? 'bg-indigo-50/80 text-indigo-950 font-medium' : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold truncate">{String(c.metadata?.title || key)}</span>
                    <span className="text-[10px] text-slate-400 font-mono truncate">{key}</span>
                  </div>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-slate-100 text-slate-600 shrink-0">
                    {String(c.metadata?.type || 'concept')}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right: Concept JSON-LD Fragment Inspector */}
          <div className="md:col-span-7 bg-slate-950 rounded-xl p-3.5 text-emerald-400 font-mono text-xs overflow-y-auto max-h-[300px]">
            {selectedConceptPreview ? (
              (() => {
                const graphArr = (exportResult.jsonLdObject as any)['@graph'] || [];
                const matchedItem = graphArr.find(
                  (item: any) =>
                    item['@id'] === `urn:okf:concept:${selectedConceptPreview}` ||
                    item['dc:identifier'] === selectedConceptPreview ||
                    item.key === selectedConceptPreview
                );
                return (
                  <pre className="whitespace-pre-wrap">
                    {matchedItem
                      ? JSON.stringify(matchedItem, null, 2)
                      : '// Concept node ready for export'}
                  </pre>
                );
              })()
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 italic">
                Select a concept on the left to inspect its SKOS & PROV-O JSON-LD representation.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
