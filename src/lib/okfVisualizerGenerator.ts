/**
 * @file okfVisualizerGenerator.ts
 * @description Generates a 100% self-contained, zero-dependency standalone `viz.html` file
 * for any Open Knowledge Format (OKF v0.2) bundle.
 *
 * Conforms to the official OKF Visualizer specification (okf.md/tools):
 * - Self-contained offline HTML file with embedded CSS, interactive SVG/Canvas graph physics, and Markdown rendering.
 * - Interactive node exploration with zoom/pan, drag physics, and neighbor highlighting.
 * - Instant fuzzy search, tag filtering, and concept-type pill filters.
 * - Rich concept detail inspector with frontmatter metadata chips, trust tiers, outbound wikilinks, and inbound backlinks.
 * - Bidirectional wikilink traversal (`[[concept-slug]]` navigation).
 */

import type { OkfBundle, OkfConcept, OkfMetadata, OkfGraph } from 'okf-ts';
import type { OKFConversionResult } from './okfKnowledgeEngine';
import type { SemanticGraphResult } from './okfSemanticGraphEngine';
import type { NLPConceptAnalysis } from './okfNlpEngine';
import { deriveTrustTier, exportConceptToMarkdown } from './okfKnowledgeEngine';

export interface VisualizerGenerationOptions {
  bundleTitle?: string;
  defaultTheme?: 'dark' | 'light';
  includeCertificate?: boolean;
}

export interface VisualizerInputData {
  bundle: OkfBundle;
  concepts?: OkfConcept<OkfMetadata>[];
  graph?: OkfGraph | any;
  semanticGraph?: SemanticGraphResult;
  nlpAnalyses?: Record<string, NLPConceptAnalysis>;
  summary?: any;
}

/**
 * Generates the full, self-contained `viz.html` file string from an OKF conversion result or bundle.
 */
export function generateStandaloneOKFVisualizerHTML(
  result: OKFConversionResult | VisualizerInputData,
  options: VisualizerGenerationOptions = {}
): string {
  const bundleTitle = options.bundleTitle || result.bundle.root || 'OKF Knowledge Base';
  const defaultTheme = options.defaultTheme || 'dark';

  const conceptsList = result.concepts || result.bundle.concepts || [];

  // Prepare clean concept data payload for JSON embedding
  const conceptsData = conceptsList.map((concept, index) => {
    const key = concept.path || concept.id || `concept-${index}`;
    const rawMd = exportConceptToMarkdown(concept);
    const nlp = result.nlpAnalyses?.[key];
    const trustTier = deriveTrustTier(concept);

    // Calculate outbound wikilinks from body
    const wikilinkMatches = Array.from((concept.body || '').matchAll(/\[\[(.*?)\]\]/g)).map((m) => m[1]);

    return {
      id: concept.id || key,
      path: key,
      title: (concept.metadata?.title as string) || concept.id || `Concept ${index + 1}`,
      type: (concept.metadata?.type as string) || 'concept',
      status: (concept.metadata?.status as string) || 'stable',
      description: (concept.metadata?.description as string) || '',
      tags: Array.isArray(concept.metadata?.tags) ? concept.metadata.tags : [],
      trustTier,
      sources: concept.metadata?.sources || [],
      stale_after: concept.metadata?.stale_after || null,
      attester: concept.metadata?.attester || null,
      verified: concept.metadata?.verified || null,
      body: concept.body || '',
      rawMarkdown: rawMd,
      wikilinks: wikilinkMatches,
      wordCount: (concept.body || '').trim().split(/\s+/).filter(Boolean).length,
      qualityScore: nlp?.qualitySignals?.completenessScore || 90,
      readabilityScore: nlp?.readability?.fleschReadingEase || 65,
    };
  });

  // Build Graph Nodes & Edges
  const rawNodes = result.semanticGraph?.nodes || result.graph?.nodes || [];
  const graphNodes = rawNodes.map((node: any) => {
    const concept = conceptsList.find((c) => (c.path || c.id) === node.id);
    const label = node.label || (concept?.metadata as any)?.title || node.id;
    const type = node.type || (concept?.metadata as any)?.type || 'concept';
    return {
      id: node.id,
      label,
      type,
      trustTier: concept ? deriveTrustTier(concept) : 'unverified',
    };
  });

  const rawEdges = result.semanticGraph?.edges || result.graph?.edges || [];
  const graphEdges = rawEdges.map((edge: any) => ({
    source: edge.from || edge.source,
    target: edge.to || edge.target,
    kind: edge.kind || 'references',
    label: edge.label || edge.kind || 'references',
  }));

  // Build Adjacency & Backlinks Map
  const backlinksMap: Record<string, string[]> = {};
  conceptsData.forEach((c) => {
    backlinksMap[c.id] = [];
    backlinksMap[c.path] = [];
  });

  graphEdges.forEach((edge) => {
    if (!backlinksMap[edge.target]) backlinksMap[edge.target] = [];
    if (!backlinksMap[edge.target].includes(edge.source)) {
      backlinksMap[edge.target].push(edge.source);
    }
  });

  const embeddedPayload = {
    bundleTitle,
    generatedAt: new Date().toISOString(),
    version: result.bundle.version || '0.2.0',
    summary: result.summary,
    concepts: conceptsData,
    graph: {
      nodes: graphNodes,
      edges: graphEdges,
    },
    backlinks: backlinksMap,
  };

  const payloadJson = JSON.stringify(embeddedPayload).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en" class="${defaultTheme}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(bundleTitle)} — OKF Interactive Knowledge Visualizer (viz.html)</title>
  <style>
    :root {
      --bg-primary: #090d16;
      --bg-secondary: #111827;
      --bg-tertiary: #1f2937;
      --bg-card: #141d2e;
      --border-color: #2e384d;
      --text-primary: #f3f4f6;
      --text-secondary: #9ca3af;
      --text-muted: #6b7280;
      --accent-indigo: #6366f1;
      --accent-emerald: #10b981;
      --accent-amber: #f59e0b;
      --accent-rose: #ef4444;
      --accent-cyan: #06b6d4;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }

    html.light {
      --bg-primary: #f8fafc;
      --bg-secondary: #ffffff;
      --bg-tertiary: #f1f5f9;
      --bg-card: #ffffff;
      --border-color: #e2e8f0;
      --text-primary: #0f172a;
      --text-secondary: #475569;
      --text-muted: #94a3b8;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font-sans);
      background-color: var(--bg-primary);
      color: var(--text-primary);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* Top Navigation Header */
    header {
      background-color: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      padding: 12px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      z-index: 20;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .logo-badge {
      background: linear-gradient(135deg, #4f46e5, #06b6d4);
      color: white;
      font-weight: bold;
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 6px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    .bundle-title {
      font-size: 15px;
      font-weight: 700;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .stats-pill {
      font-size: 11px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      padding: 2px 8px;
      border-radius: 12px;
      color: var(--text-secondary);
      font-family: var(--font-mono);
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    button.btn {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }

    button.btn:hover {
      background: var(--border-color);
      border-color: var(--accent-indigo);
    }

    button.btn-primary {
      background: var(--accent-indigo);
      border-color: var(--accent-indigo);
      color: white;
    }

    button.btn-primary:hover {
      background: #4f46e5;
    }

    /* Main Split Layout */
    .app-container {
      display: flex;
      flex: 1;
      overflow: hidden;
      position: relative;
    }

    /* Sidebar - Concept Explorer */
    .sidebar {
      width: 320px;
      background: var(--bg-secondary);
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      flex-shrink: 0;
    }

    .search-box {
      padding: 12px;
      border-bottom: 1px solid var(--border-color);
    }

    .search-input {
      width: 100%;
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 12px;
      color: var(--text-primary);
      outline: none;
    }

    .search-input:focus {
      border-color: var(--accent-indigo);
    }

    .type-filters {
      padding: 8px 12px;
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      border-bottom: 1px solid var(--border-color);
      background: var(--bg-primary);
    }

    .filter-chip {
      font-size: 10px;
      padding: 2px 7px;
      border-radius: 10px;
      border: 1px solid var(--border-color);
      background: var(--bg-secondary);
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 0.1s;
    }

    .filter-chip.active {
      background: var(--accent-indigo);
      border-color: var(--accent-indigo);
      color: white;
      font-weight: 600;
    }

    .concept-list {
      flex: 1;
      overflow-y: auto;
      padding: 6px;
    }

    .concept-item {
      padding: 10px 12px;
      border-radius: 6px;
      cursor: pointer;
      margin-bottom: 4px;
      border: 1px solid transparent;
      transition: all 0.1s ease;
    }

    .concept-item:hover {
      background: var(--bg-tertiary);
    }

    .concept-item.active {
      background: var(--bg-card);
      border-color: var(--accent-indigo);
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }

    .concept-item-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .concept-item-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 10px;
      color: var(--text-secondary);
    }

    .badge {
      padding: 1px 5px;
      border-radius: 4px;
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .badge-procedure { background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); }
    .badge-concept { background: rgba(99, 102, 241, 0.15); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.3); }
    .badge-table { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
    .badge-guideline { background: rgba(6, 182, 212, 0.15); color: #22d3ee; border: 1px solid rgba(6, 182, 212, 0.3); }
    .badge-reference { background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); }

    /* Center/Main - Interactive Canvas */
    .center-stage {
      flex: 1;
      display: flex;
      flex-direction: column;
      position: relative;
      background: var(--bg-primary);
      overflow: hidden;
    }

    #graph-canvas {
      width: 100%;
      height: 100%;
      cursor: grab;
    }

    #graph-canvas:active {
      cursor: grabbing;
    }

    /* Floating Graph Controls */
    .graph-controls {
      position: absolute;
      bottom: 20px;
      left: 20px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 6px;
      display: flex;
      gap: 4px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 10;
    }

    .graph-controls button {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      width: 28px;
      height: 28px;
      border-radius: 4px;
      font-size: 13px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .graph-controls button:hover {
      background: var(--accent-indigo);
      color: white;
    }

    /* Right Inspector / Detail Panel */
    .inspector {
      width: 440px;
      background: var(--bg-secondary);
      border-left: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      flex-shrink: 0;
      padding: 20px;
    }

    .inspector-header {
      margin-bottom: 16px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border-color);
    }

    .inspector-title {
      font-size: 18px;
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 8px;
      line-height: 1.3;
    }

    .frontmatter-box {
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 12px;
      font-size: 11px;
      font-family: var(--font-mono);
      margin-bottom: 16px;
    }

    .meta-row {
      display: flex;
      justify-content: space-between;
      padding: 3px 0;
      border-bottom: 1px dashed rgba(255,255,255,0.05);
    }

    .meta-label { color: var(--text-muted); }
    .meta-val { color: var(--text-primary); font-weight: 500; }

    /* Markdown Body Styling in Standalone Visualizer */
    .markdown-body {
      font-size: 13px;
      line-height: 1.6;
      color: var(--text-primary);
    }

    .markdown-body h1, .markdown-body h2, .markdown-body h3 {
      margin-top: 14px;
      margin-bottom: 8px;
      color: var(--text-primary);
      font-weight: 600;
    }

    .markdown-body h1 { font-size: 16px; border-bottom: 1px solid var(--border-color); padding-bottom: 4px; }
    .markdown-body h2 { font-size: 14px; }
    .markdown-body h3 { font-size: 13px; }

    .markdown-body p { margin-bottom: 10px; }
    .markdown-body ul, .markdown-body ol { margin-left: 20px; margin-bottom: 10px; }
    .markdown-body li { margin-bottom: 4px; }
    .markdown-body code {
      font-family: var(--font-mono);
      font-size: 11px;
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      padding: 2px 4px;
      border-radius: 4px;
      color: #38bdf8;
    }
    .markdown-body pre {
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      padding: 10px;
      border-radius: 6px;
      overflow-x: auto;
      margin-bottom: 10px;
    }
    .markdown-body pre code { background: none; border: none; padding: 0; color: #a5f3fc; }
    .markdown-body blockquote {
      border-left: 3px solid var(--accent-indigo);
      padding-left: 10px;
      margin: 10px 0;
      color: var(--text-secondary);
      font-style: italic;
    }
    .markdown-body table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0;
      font-size: 12px;
    }
    .markdown-body th, .markdown-body td {
      border: 1px solid var(--border-color);
      padding: 6px 8px;
      text-align: left;
    }
    .markdown-body th { background: var(--bg-tertiary); font-weight: 600; }

    /* Interactive Wikilink Anchors */
    .wikilink-btn {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.4);
      color: #818cf8;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.1s;
    }
    .wikilink-btn:hover {
      background: var(--accent-indigo);
      color: white;
    }

    .backlinks-section, .links-section {
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid var(--border-color);
    }

    .section-title {
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 700;
      color: var(--text-muted);
      margin-bottom: 8px;
      letter-spacing: 0.5px;
    }

    .link-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    /* Legend Overlay */
    .graph-legend {
      position: absolute;
      top: 20px;
      right: 20px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 10px;
      font-size: 11px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 10;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text-secondary);
    }

    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }

    @media (max-width: 900px) {
      .app-container { flex-direction: column; }
      .sidebar { width: 100%; height: 200px; }
      .inspector { width: 100%; height: 300px; }
    }
  </style>
</head>
<body>
  <!-- Header Bar -->
  <header>
    <div class="brand">
      <span class="logo-badge">OKF v0.2</span>
      <div class="bundle-title">
        <span>${escapeHtml(bundleTitle)}</span>
        <span class="stats-pill">${conceptsData.length} Concepts • ${graphEdges.length} Links</span>
      </div>
    </div>
    <div class="header-actions">
      <button class="btn" id="theme-toggle" title="Toggle Dark/Light Mode">🌓 Theme</button>
      <button class="btn" id="btn-reset-zoom" title="Center graph">🎯 Center</button>
      <button class="btn btn-primary" id="btn-copy-raw">📋 Copy Concept MD</button>
    </div>
  </header>

  <!-- App Body Layout -->
  <div class="app-container">
    <!-- Left: Concept List & Filters -->
    <aside class="sidebar">
      <div class="search-box">
        <input type="text" id="search-input" class="search-input" placeholder="Search concepts, tags, entities...">
      </div>
      <div class="type-filters" id="type-filters">
        <span class="filter-chip active" data-type="all">All (${conceptsData.length})</span>
      </div>
      <div class="concept-list" id="concept-list">
        <!-- Rendered dynamically -->
      </div>
    </aside>

    <!-- Center: Interactive Graph Canvas -->
    <main class="center-stage">
      <canvas id="graph-canvas"></canvas>

      <!-- Graph Floating Controls -->
      <div class="graph-controls">
        <button id="ctrl-zoom-in" title="Zoom In">+</button>
        <button id="ctrl-zoom-out" title="Zoom Out">−</button>
        <button id="ctrl-reset" title="Reset View">⟲</button>
      </div>

      <!-- Type Legend -->
      <div class="graph-legend">
        <div class="legend-item"><span class="legend-dot" style="background:#818cf8;"></span><span>Concept</span></div>
        <div class="legend-item"><span class="legend-dot" style="background:#10b981;"></span><span>Procedure</span></div>
        <div class="legend-item"><span class="legend-dot" style="background:#f59e0b;"></span><span>Table</span></div>
        <div class="legend-item"><span class="legend-dot" style="background:#06b6d4;"></span><span>Guideline</span></div>
        <div class="legend-item"><span class="legend-dot" style="background:#c084fc;"></span><span>Reference</span></div>
      </div>
    </main>

    <!-- Right: Concept Inspector / Detail Drawer -->
    <section class="inspector" id="inspector">
      <div class="inspector-header">
        <span id="insp-type-badge" class="badge badge-concept">CONCEPT</span>
        <h2 id="insp-title" class="inspector-title">Select a concept</h2>
        <div id="insp-trust-pill" style="font-size: 11px; color: var(--text-secondary);">Trust: Verified</div>
      </div>

      <div class="frontmatter-box" id="insp-frontmatter">
        <div class="meta-row"><span class="meta-label">path</span><span class="meta-val" id="insp-path">-</span></div>
        <div class="meta-row"><span class="meta-label">status</span><span class="meta-val" id="insp-status">-</span></div>
        <div class="meta-row"><span class="meta-label">tags</span><span class="meta-val" id="insp-tags">-</span></div>
        <div class="meta-row"><span class="meta-label">quality</span><span class="meta-val" id="insp-quality">-</span></div>
      </div>

      <div class="markdown-body" id="insp-body">
        Select a node from the interactive knowledge graph or concept list to view its contents.
      </div>

      <div class="links-section">
        <div class="section-title">Outbound Wikilinks</div>
        <div class="link-pills" id="insp-outbound-links">
          <span style="color: var(--text-muted); font-size:11px;">No outbound links</span>
        </div>
      </div>

      <div class="backlinks-section">
        <div class="section-title">Inbound Backlinks (Referenced By)</div>
        <div class="link-pills" id="insp-backlinks">
          <span style="color: var(--text-muted); font-size:11px;">No backlinks</span>
        </div>
      </div>
    </section>
  </div>

  <!-- Embedded OKF Data Payload -->
  <script id="okf-data" type="application/json">
${payloadJson}
  </script>

  <!-- Interactive Visualizer Logic & Graph Physics -->
  <script>
    (function() {
      const okfData = JSON.parse(document.getElementById('okf-data').textContent);
      const concepts = okfData.concepts;
      const graph = okfData.graph;
      const backlinks = okfData.backlinks;

      let activeConceptId = concepts[0] ? concepts[0].id : null;
      let activeFilterType = 'all';
      let searchQuery = '';

      // Type Color Palette
      const TYPE_COLORS = {
        concept: '#818cf8',
        procedure: '#10b981',
        table: '#f59e0b',
        guideline: '#06b6d4',
        reference: '#c084fc',
        metric: '#ec4899',
        default: '#94a3b8'
      };

      function getTypeColor(type) {
        return TYPE_COLORS[(type || '').toLowerCase()] || TYPE_COLORS.default;
      }

      // Initialize Type Filters
      const typesCount = {};
      concepts.forEach(c => {
        const t = (c.type || 'concept').toLowerCase();
        typesCount[t] = (typesCount[t] || 0) + 1;
      });

      const filterContainer = document.getElementById('type-filters');
      Object.keys(typesCount).forEach(t => {
        const chip = document.createElement('span');
        chip.className = 'filter-chip';
        chip.setAttribute('data-type', t);
        chip.textContent = t.toUpperCase() + ' (' + typesCount[t] + ')';
        chip.addEventListener('click', () => {
          document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          activeFilterType = t;
          renderConceptList();
          renderGraph();
        });
        filterContainer.appendChild(chip);
      });

      document.querySelector('.filter-chip[data-type="all"]').addEventListener('click', function() {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        this.classList.add('active');
        activeFilterType = 'all';
        renderConceptList();
        renderGraph();
      });

      // Search Handler
      const searchInput = document.getElementById('search-input');
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        renderConceptList();
        renderGraph();
      });

      // Render Concept List
      function renderConceptList() {
        const listContainer = document.getElementById('concept-list');
        listContainer.innerHTML = '';

        const filtered = concepts.filter(c => {
          const matchType = activeFilterType === 'all' || (c.type || '').toLowerCase() === activeFilterType;
          const matchSearch = !searchQuery ||
            c.title.toLowerCase().includes(searchQuery) ||
            c.path.toLowerCase().includes(searchQuery) ||
            c.tags.some(t => t.toLowerCase().includes(searchQuery)) ||
            c.body.toLowerCase().includes(searchQuery);
          return matchType && matchSearch;
        });

        if (filtered.length === 0) {
          listContainer.innerHTML = '<div style="padding:16px; font-size:12px; color:var(--text-muted); text-align:center;">No matching concepts</div>';
          return;
        }

        filtered.forEach(c => {
          const item = document.createElement('div');
          item.className = 'concept-item' + (c.id === activeConceptId ? ' active' : '');
          item.innerHTML =
            '<div class="concept-item-title">' +
              '<span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + escapeHtml(c.title) + '</span>' +
              '<span class="badge badge-' + escapeHtml(c.type || 'concept') + '">' + escapeHtml(c.type || 'concept') + '</span>' +
            '</div>' +
            '<div class="concept-item-meta">' +
              '<span>' + c.wordCount + ' words</span> • ' +
              '<span>' + (c.tags.length > 0 ? c.tags.slice(0, 2).join(', ') : 'no tags') + '</span>' +
            '</div>';

          item.addEventListener('click', () => {
            selectConcept(c.id);
          });
          listContainer.appendChild(item);
        });
      }

      // Concept Selection & Detail Inspector
      function selectConcept(id) {
        activeConceptId = id;
        const concept = concepts.find(c => c.id === id || c.path === id);
        if (!concept) return;

        // Update list active states
        document.querySelectorAll('.concept-item').forEach(el => el.classList.remove('active'));
        renderConceptList();

        // Update Inspector UI
        document.getElementById('insp-title').textContent = concept.title;
        const badge = document.getElementById('insp-type-badge');
        badge.textContent = (concept.type || 'concept').toUpperCase();
        badge.className = 'badge badge-' + (concept.type || 'concept');

        document.getElementById('insp-trust-pill').textContent =
          'Trust Tier: ' + concept.trustTier.toUpperCase() + ' • Status: ' + concept.status;

        document.getElementById('insp-path').textContent = concept.path;
        document.getElementById('insp-status').textContent = concept.status;
        document.getElementById('insp-tags').textContent = concept.tags.length > 0 ? concept.tags.join(', ') : 'none';
        document.getElementById('insp-quality').textContent = concept.qualityScore + '% completeness';

        // Render Markdown Body with Wikilinks
        document.getElementById('insp-body').innerHTML = renderSimpleMarkdown(concept.body);

        // Render Outbound Links
        const outboundContainer = document.getElementById('insp-outbound-links');
        outboundContainer.innerHTML = '';
        if (concept.wikilinks && concept.wikilinks.length > 0) {
          concept.wikilinks.forEach(link => {
            const btn = document.createElement('a');
            btn.className = 'wikilink-btn';
            btn.textContent = '[[' + link + ']]';
            btn.addEventListener('click', (e) => {
              e.preventDefault();
              selectConcept(link);
            });
            outboundContainer.appendChild(btn);
          });
        } else {
          outboundContainer.innerHTML = '<span style="color:var(--text-muted); font-size:11px;">No outbound links</span>';
        }

        // Render Inbound Backlinks
        const backlinksContainer = document.getElementById('insp-backlinks');
        backlinksContainer.innerHTML = '';
        const inbound = backlinks[concept.id] || backlinks[concept.path] || [];
        if (inbound.length > 0) {
          inbound.forEach(link => {
            const targetConcept = concepts.find(c => c.id === link || c.path === link);
            const label = targetConcept ? targetConcept.title : link;
            const btn = document.createElement('a');
            btn.className = 'wikilink-btn';
            btn.textContent = '← ' + label;
            btn.addEventListener('click', (e) => {
              e.preventDefault();
              selectConcept(link);
            });
            backlinksContainer.appendChild(btn);
          });
        } else {
          backlinksContainer.innerHTML = '<span style="color:var(--text-muted); font-size:11px;">No backlinks</span>';
        }

        // Re-render Graph Highlighting
        renderGraph();
      }

      // Copy Active Concept Markdown Button
      document.getElementById('btn-copy-raw').addEventListener('click', () => {
        const concept = concepts.find(c => c.id === activeConceptId);
        if (concept) {
          navigator.clipboard.writeText(concept.rawMarkdown).then(() => {
            const btn = document.getElementById('btn-copy-raw');
            const orig = btn.textContent;
            btn.textContent = '✓ Copied!';
            setTimeout(() => btn.textContent = orig, 1500);
          });
        }
      });

      // Theme Switcher
      document.getElementById('theme-toggle').addEventListener('click', () => {
        document.documentElement.classList.toggle('light');
        renderGraph();
      });

      // Simple Fast Markdown Parser with Wikilink Replacement
      function renderSimpleMarkdown(md) {
        if (!md) return '';
        let html = md
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          // Wikilinks [[target]]
          .replace(/\\[\\[(.*?)\\]\\]/g, (match, p1) => {
            return '<a href="#" class="wikilink-btn" onclick="window.okfSelectConcept(\\'' + p1.replace(/'/g, "\\\\'") + '\\'); return false;">[[' + p1 + ']]</a>';
          })
          // Headers
          .replace(/^### (.*$)/gim, '<h3>$1</h3>')
          .replace(/^## (.*$)/gim, '<h2>$1</h2>')
          .replace(/^# (.*$)/gim, '<h1>$1</h1>')
          // Bold & Italic
          .replace(/\\*\\*(.*?)\\*\\*/gim, '<strong>$1</strong>')
          .replace(/\\*(.*?)\\*/gim, '<em>$1</em>')
          // Code block
          .replace(/\`\`\`([\\s\\S]*?)\`\`\`/gim, '<pre><code>$1</code></pre>')
          .replace(/\`([^\`]+)\`/gim, '<code>$1</code>')
          // Lists
          .replace(/^\\s*-\\s+(.*$)/gim, '<li>$1</li>')
          // Line breaks
          .replace(/\\n\\n/gim, '</p><p>')
          .replace(/\\n/gim, '<br>');

        return '<p>' + html + '</p>';
      }

      window.okfSelectConcept = selectConcept;

      // ==========================================
      // Interactive 2D Canvas Force-Directed Graph Engine
      // ==========================================
      const canvas = document.getElementById('graph-canvas');
      const ctx = canvas.getContext('2d');

      let width = 0;
      let height = 0;
      let transform = { x: 0, y: 0, scale: 1 };
      let isDragging = false;
      let dragStart = { x: 0, y: 0 };
      let draggedNode = null;

      // Build simulation nodes & links
      const simNodes = graph.nodes.map((n, i) => {
        const angle = (i / graph.nodes.length) * 2 * Math.PI;
        const radius = 180 + Math.random() * 80;
        return {
          id: n.id,
          label: n.label,
          type: n.type,
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          vx: 0,
          vy: 0,
          radius: 12 + Math.min(10, (backlinks[n.id] || []).length * 2),
        };
      });

      const simLinks = graph.edges.map(e => ({
        source: simNodes.find(n => n.id === e.source) || e.source,
        target: simNodes.find(n => n.id === e.target) || e.target,
        kind: e.kind
      })).filter(l => typeof l.source === 'object' && typeof l.target === 'object');

      function resizeCanvas() {
        const rect = canvas.getBoundingClientRect();
        width = rect.width;
        height = rect.height;
        canvas.width = width * window.devicePixelRatio;
        canvas.height = height * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        if (transform.x === 0 && transform.y === 0) {
          transform.x = width / 2;
          transform.y = height / 2;
        }
        renderGraph();
      }

      window.addEventListener('resize', resizeCanvas);

      // Force Layout Physics Step
      function updatePhysics() {
        const repulsion = 2400;
        const springLength = 110;
        const springStrength = 0.04;
        const centerGravity = 0.015;

        // Node-Node Repulsion
        for (let i = 0; i < simNodes.length; i++) {
          const n1 = simNodes[i];
          for (let j = i + 1; j < simNodes.length; j++) {
            const n2 = simNodes[j];
            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            if (dist < 400) {
              const force = repulsion / (dist * dist);
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;
              n1.vx -= fx;
              n1.vy -= fy;
              n2.vx += fx;
              n2.vy += fy;
            }
          }
        }

        // Link Springs
        simLinks.forEach(link => {
          const dx = link.target.x - link.source.x;
          const dy = link.target.y - link.source.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (dist - springLength) * springStrength;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          link.source.vx += fx;
          link.source.vy += fy;
          link.target.vx -= fx;
          link.target.vy -= fy;
        });

        // Center Gravity & Velocity Damping
        simNodes.forEach(n => {
          if (n === draggedNode) return;
          n.vx -= n.x * centerGravity;
          n.vy -= n.y * centerGravity;
          n.vx *= 0.85;
          n.vy *= 0.85;
          n.x += n.vx;
          n.y += n.vy;
        });
      }

      // Draw Graph
      function renderGraph() {
        ctx.clearRect(0, 0, width, height);
        ctx.save();
        ctx.translate(transform.x, transform.y);
        ctx.scale(transform.scale, transform.scale);

        const isLight = document.documentElement.classList.contains('light');

        // Draw Links
        simLinks.forEach(link => {
          const isRelated = link.source.id === activeConceptId || link.target.id === activeConceptId;
          ctx.beginPath();
          ctx.moveTo(link.source.x, link.source.y);
          ctx.lineTo(link.target.x, link.target.y);
          ctx.strokeStyle = isRelated
            ? '#818cf8'
            : (isLight ? 'rgba(148, 163, 184, 0.4)' : 'rgba(71, 85, 105, 0.4)');
          ctx.lineWidth = isRelated ? 2.5 : 1;
          ctx.stroke();

          // Arrowhead
          if (isRelated) {
            const angle = Math.atan2(link.target.y - link.source.y, link.target.x - link.source.x);
            const arrowX = link.target.x - Math.cos(angle) * (link.target.radius + 6);
            const arrowY = link.target.y - Math.sin(angle) * (link.target.radius + 6);
            ctx.fillStyle = '#818cf8';
            ctx.beginPath();
            ctx.arc(arrowX, arrowY, 3, 0, 2 * Math.PI);
            ctx.fill();
          }
        });

        // Draw Nodes
        simNodes.forEach(node => {
          const isActive = node.id === activeConceptId;
          const color = getTypeColor(node.type);

          // Glow for active node
          if (isActive) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius + 6, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(99, 102, 241, 0.3)';
            ctx.fill();
          }

          // Node Circle
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.strokeStyle = isActive ? '#ffffff' : (isLight ? '#cbd5e1' : '#1e293b');
          ctx.lineWidth = isActive ? 2.5 : 1.5;
          ctx.stroke();

          // Node Label
          ctx.font = (isActive ? 'bold 11px' : '10px') + ' var(--font-sans)';
          ctx.fillStyle = isLight ? '#0f172a' : '#f8fafc';
          ctx.textAlign = 'center';
          ctx.fillText(node.label || node.id, node.x, node.y + node.radius + 14);
        });

        ctx.restore();
      }

      // Animation Physics Loop
      function animate() {
        updatePhysics();
        renderGraph();
        requestAnimationFrame(animate);
      }

      // Canvas Interaction Handlers (Pan, Zoom, Node Drag & Click)
      function getNodeAt(x, y) {
        const worldX = (x - transform.x) / transform.scale;
        const worldY = (y - transform.y) / transform.scale;
        for (let i = simNodes.length - 1; i >= 0; i--) {
          const n = simNodes[i];
          const dx = worldX - n.x;
          const dy = worldY - n.y;
          if (dx * dx + dy * dy <= n.radius * n.radius) {
            return n;
          }
        }
        return null;
      }

      canvas.addEventListener('mousedown', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const clickedNode = getNodeAt(mouseX, mouseY);

        if (clickedNode) {
          draggedNode = clickedNode;
          selectConcept(clickedNode.id);
        } else {
          isDragging = true;
          dragStart = { x: e.clientX - transform.x, y: e.clientY - transform.y };
        }
      });

      window.addEventListener('mousemove', (e) => {
        if (draggedNode) {
          const rect = canvas.getBoundingClientRect();
          draggedNode.x = (e.clientX - rect.left - transform.x) / transform.scale;
          draggedNode.y = (e.clientY - rect.top - transform.y) / transform.scale;
          draggedNode.vx = 0;
          draggedNode.vy = 0;
        } else if (isDragging) {
          transform.x = e.clientX - dragStart.x;
          transform.y = e.clientY - dragStart.y;
        }
      });

      window.addEventListener('mouseup', () => {
        isDragging = false;
        draggedNode = null;
      });

      canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        transform.x = mouseX - (mouseX - transform.x) * zoomFactor;
        transform.y = mouseY - (mouseY - transform.y) * zoomFactor;
        transform.scale *= zoomFactor;
        transform.scale = Math.max(0.2, Math.min(3.5, transform.scale));
      });

      // Controls
      document.getElementById('ctrl-zoom-in').addEventListener('click', () => {
        transform.scale = Math.min(3.5, transform.scale * 1.2);
      });
      document.getElementById('ctrl-zoom-out').addEventListener('click', () => {
        transform.scale = Math.max(0.2, transform.scale / 1.2);
      });
      document.getElementById('ctrl-reset').addEventListener('click', () => {
        transform = { x: width / 2, y: height / 2, scale: 1 };
      });
      document.getElementById('btn-reset-zoom').addEventListener('click', () => {
        transform = { x: width / 2, y: height / 2, scale: 1 };
      });

      function escapeHtml(str) {
        return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      }

      // Initial Bootstrap
      setTimeout(() => {
        resizeCanvas();
        renderConceptList();
        if (concepts.length > 0) {
          selectConcept(concepts[0].id);
        }
        animate();
      }, 50);
    })();
  </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
