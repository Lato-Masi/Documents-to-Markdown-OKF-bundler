import React, { useEffect, useRef, useState, useMemo } from "react";
import * as d3 from "d3";
import type { OkfGraph, OkfGraphNode, OkfConcept, OkfMetadata } from "okf-ts";
import { deriveTrustTier } from "../lib/okfKnowledgeEngine";
import type { SemanticGraphResult, SemanticEdge, OKFEdgeType } from "../lib/okfSemanticGraphEngine";
import type { NLPConceptAnalysis } from "../lib/okfNlpEngine";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Search,
  Layers,
  ChevronRight,
  Sparkles,
  Link as LinkIcon,
  ArrowRight,
  GitBranch,
  ShieldCheck,
  Filter,
} from "lucide-react";

interface OKFGraphVisualizerProps {
  graph?: OkfGraph;
  semanticGraph?: SemanticGraphResult;
  nlpAnalyses?: Record<string, NLPConceptAnalysis>;
  onSelectConcept?: (conceptId: string) => void;
  selectedConceptId?: string | null;
}

interface D3Node extends d3.SimulationNodeDatum {
  id: string;
  title: string;
  type: string;
  path: string;
  trust: string;
  concept: OkfConcept<OkfMetadata>;
  tags: string[];
  nlp?: NLPConceptAnalysis;
}

interface D3Link extends d3.SimulationLinkDatum<D3Node> {
  from: string;
  to: string;
  kind: OKFEdgeType | string;
  confidence: number;
  directed: boolean;
  sharedEntities: string[];
  sharedKeywords: string[];
  cosineSimilarity?: number;
  evidenceSentence?: string;
  exists: boolean;
}

const TYPE_COLORS: Record<string, { fill: string; stroke: string; text: string; bg: string }> = {
  concept: { fill: "#6366f1", stroke: "#4338ca", text: "#4338ca", bg: "bg-indigo-50" },
  procedure: { fill: "#10b981", stroke: "#047857", text: "#047857", bg: "bg-emerald-50" },
  table: { fill: "#0ea5e9", stroke: "#0369a1", text: "#0369a1", bg: "bg-sky-50" },
  metric: { fill: "#f59e0b", stroke: "#b45309", text: "#b45309", bg: "bg-amber-50" },
  guideline: { fill: "#8b5cf6", stroke: "#6d28d9", text: "#6d28d9", bg: "bg-purple-50" },
  reference: { fill: "#ec4899", stroke: "#be185d", text: "#be185d", bg: "bg-pink-50" },
  default: { fill: "#64748b", stroke: "#334155", text: "#334155", bg: "bg-slate-50" },
};

const EDGE_STYLES: Record<string, { stroke: string; dasharray: string; label: string; bg: string; text: string }> = {
  depends_on: { stroke: "#f59e0b", dasharray: "none", label: "Depends On / Prerequisite", bg: "bg-amber-500/20", text: "text-amber-300" },
  implements: { stroke: "#10b981", dasharray: "6 3", label: "Implements / Conforms", bg: "bg-emerald-500/20", text: "text-emerald-300" },
  references: { stroke: "#6366f1", dasharray: "none", label: "Direct Citation", bg: "bg-indigo-500/20", text: "text-indigo-300" },
  related_to: { stroke: "#94a3b8", dasharray: "3 3", label: "Semantic / Entity Overlap", bg: "bg-slate-700/50", text: "text-slate-300" },
  default: { stroke: "#94a3b8", dasharray: "none", label: "Related", bg: "bg-slate-700/50", text: "text-slate-300" },
};

export default function OKFGraphVisualizer({
  graph,
  semanticGraph,
  nlpAnalyses,
  onSelectConcept,
  selectedConceptId,
}: OKFGraphVisualizerProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterEdgeKind, setFilterEdgeKind] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [hoveredNode, setHoveredNode] = useState<D3Node | null>(null);
  const [activeNode, setActiveNode] = useState<D3Node | null>(null);
  const [activeEdge, setActiveEdge] = useState<D3Link | null>(null);

  // Parse nodes & links from semanticGraph (preferred) or graph
  const { nodes, links, uniqueTypes, uniqueEdgeKinds } = useMemo(() => {
    const rawNodesSource = semanticGraph?.nodes || graph?.nodes || [];
    const rawNodes: D3Node[] = rawNodesSource.map((n) => {
      const c = n.concept as OkfConcept<OkfMetadata>;
      const type = (c.metadata?.type as string) || "concept";
      const title = (c.metadata?.title as string) || c.id || "Untitled";
      const path = c.path || c.id || "";
      const trust = deriveTrustTier(c);
      const tags = (c.metadata?.tags as string[]) || [];
      const nlp = nlpAnalyses?.[path] || nlpAnalyses?.[n.id];

      return {
        id: n.id,
        title,
        type,
        path,
        trust,
        concept: c,
        tags,
        nlp,
      };
    });

    const nodeMap = new Map<string, D3Node>(rawNodes.map((n) => [n.id, n]));

    let rawLinks: D3Link[] = [];

    if (semanticGraph && semanticGraph.edges.length > 0) {
      rawLinks = semanticGraph.edges
        .filter((e) => nodeMap.has(e.from) && nodeMap.has(e.to))
        .map((e) => ({
          source: e.from,
          target: e.to,
          from: e.from,
          to: e.to,
          kind: e.kind,
          confidence: e.confidence,
          directed: e.directed,
          sharedEntities: e.sharedEntities || [],
          sharedKeywords: e.sharedKeywords || [],
          cosineSimilarity: e.cosineSimilarity,
          evidenceSentence: e.evidenceSentence,
          exists: e.exists,
        }));
    } else if (graph && graph.edges.length > 0) {
      rawLinks = graph.edges
        .filter((e) => nodeMap.has(e.from) && nodeMap.has(e.to))
        .map((e) => ({
          source: e.from,
          target: e.to,
          from: e.from,
          to: e.to,
          kind: e.kind || "references",
          confidence: 0.8,
          directed: true,
          sharedEntities: [],
          sharedKeywords: [],
          exists: e.exists,
        }));
    }

    const types = Array.from(new Set(rawNodes.map((n) => n.type)));
    const edgeKinds = Array.from(new Set(rawLinks.map((l) => String(l.kind))));

    return {
      nodes: rawNodes,
      links: rawLinks,
      uniqueTypes: types,
      uniqueEdgeKinds: edgeKinds,
    };
  }, [graph, semanticGraph, nlpAnalyses]);

  // Active node sync with external selectedConceptId
  useEffect(() => {
    if (selectedConceptId) {
      const found = nodes.find((n) => n.id === selectedConceptId || n.path === selectedConceptId);
      if (found) {
        setActiveNode(found);
        setActiveEdge(null);
      }
    }
  }, [selectedConceptId, nodes]);

  // Filtered links for rendering
  const activeLinks = useMemo(() => {
    return links.filter((l) => {
      if (filterEdgeKind !== "all" && l.kind !== filterEdgeKind) return false;
      return true;
    });
  }, [links, filterEdgeKind]);

  // D3 Force Graph Simulation
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || nodes.length === 0) return;

    const width = containerRef.current.clientWidth || 800;
    const height = 480;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Defs: Arrowhead markers for each edge kind
    const defs = svg.append("defs");

    const markerTypes = [
      { id: "arrow-depends_on", color: "#f59e0b" },
      { id: "arrow-implements", color: "#10b981" },
      { id: "arrow-references", color: "#6366f1" },
      { id: "arrow-related_to", color: "#94a3b8" },
      { id: "arrow-default", color: "#94a3b8" },
      { id: "arrow-active", color: "#ec4899" },
    ];

    markerTypes.forEach((m) => {
      defs
        .append("marker")
        .attr("id", m.id)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 26)
        .attr("refY", 0)
        .attr("markerWidth", 6.5)
        .attr("markerHeight", 6.5)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-4.5L9,0L0,4.5")
        .attr("fill", m.color);
    });

    const g = svg.append("g").attr("class", "graph-content");

    // Zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);

    // Deep clones for D3 simulation mutation
    const simNodes: D3Node[] = nodes.map((d) => ({ ...d }));
    const simLinks: D3Link[] = activeLinks.map((d) => ({ ...d }));

    const simulation = d3
      .forceSimulation<D3Node>(simNodes)
      .force(
        "link",
        d3
          .forceLink<D3Node, D3Link>(simLinks)
          .id((d) => d.id)
          .distance(135)
      )
      .force("charge", d3.forceManyBody().strength(-420))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(48));

    // Render Links
    const linkGroup = g.append("g").attr("class", "links");

    const link = linkGroup
      .selectAll("line")
      .data(simLinks)
      .enter()
      .append("line")
      .attr("stroke", (d) => (EDGE_STYLES[d.kind] || EDGE_STYLES.default).stroke)
      .attr("stroke-width", (d) => (d.confidence ? Math.max(1.5, d.confidence * 2.8) : 2))
      .attr("stroke-dasharray", (d) => (EDGE_STYLES[d.kind] || EDGE_STYLES.default).dasharray)
      .attr("marker-end", (d) => `url(#arrow-${d.kind in EDGE_STYLES ? d.kind : 'default'})`)
      .attr("class", "transition-colors duration-150 cursor-pointer")
      .attr("opacity", 0.75)
      .on("mouseenter", function () {
        d3.select(this).attr("stroke-width", 4).attr("opacity", 1);
      })
      .on("mouseleave", function (_, d) {
        d3.select(this)
          .attr("stroke-width", d.confidence ? Math.max(1.5, d.confidence * 2.8) : 2)
          .attr("opacity", 0.75);
      })
      .on("click", (_, d) => {
        setActiveEdge(d);
        setActiveNode(null);
      });

    // Render Nodes Group
    const node = g
      .append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(simNodes)
      .enter()
      .append("g")
      .attr("class", "node cursor-pointer")
      .call(
        d3
          .drag<SVGGElement, D3Node>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    // Node Trust Outer Halo
    node
      .append("circle")
      .attr("r", 25)
      .attr("fill", "none")
      .attr("stroke", (d) => {
        if (d.trust === "human-reviewed") return "#10b981";
        if (d.trust === "machine-confirmed") return "#6366f1";
        return "#cbd5e1";
      })
      .attr("stroke-width", 2.5)
      .attr("stroke-dasharray", (d) => (d.trust === "unverified" ? "3 3" : "none"))
      .attr("opacity", 0.9);

    // Node Core Circle
    node
      .append("circle")
      .attr("r", 19)
      .attr("fill", (d) => (TYPE_COLORS[d.type] || TYPE_COLORS.default).fill)
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 2.5)
      .attr("class", "transition-all duration-200");

    // Node Label
    node
      .append("text")
      .attr("dy", 35)
      .attr("text-anchor", "middle")
      .attr("font-size", "11px")
      .attr("font-family", "ui-sans-serif, system-ui, sans-serif")
      .attr("font-weight", "600")
      .attr("fill", "#f8fafc")
      .attr("class", "select-none pointer-events-none")
      .text((d) => (d.title.length > 18 ? d.title.slice(0, 16) + "…" : d.title));

    // Node Type Subtitle
    node
      .append("text")
      .attr("dy", 47)
      .attr("text-anchor", "middle")
      .attr("font-size", "9px")
      .attr("font-family", "ui-monospace, SFMono-Regular, monospace")
      .attr("fill", "#94a3b8")
      .attr("class", "select-none pointer-events-none uppercase")
      .text((d) => d.type);

    // Interactivity: Hover & Click
    node
      .on("mouseenter", (_, d) => {
        setHoveredNode(d);
      })
      .on("mouseleave", () => {
        setHoveredNode(null);
      })
      .on("click", (_, d) => {
        setActiveNode(d);
        setActiveEdge(null);
        if (onSelectConcept) {
          onSelectConcept(d.id);
        }
      });

    // Tick Handler
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [nodes, activeLinks, onSelectConcept]);

  // Zoom controls helper
  const handleZoom = (factor: number) => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.transition().duration(300).call(d3.zoom<SVGSVGElement, unknown>().scaleBy as any, factor);
  };

  const handleResetZoom = () => {
    if (!svgRef.current || !containerRef.current) return;
    const svg = d3.select(svgRef.current);
    svg
      .transition()
      .duration(400)
      .call(d3.zoom<SVGSVGElement, unknown>().transform as any, d3.zoomIdentity);
  };

  return (
    <div className="flex flex-col gap-4 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden text-slate-100 shadow-sm">
      {/* Top Toolbar */}
      <div className="p-3.5 sm:p-4 bg-slate-950/80 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <GitBranch className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 flex-wrap">
              Directed Semantic Knowledge Graph
              <span className="px-2 py-0.2 rounded-full text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {nodes.length} Nodes • {activeLinks.length} Active Edges
              </span>
              {semanticGraph && (
                <span className="px-2 py-0.2 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Density: {semanticGraph.stats.graphDensity} • Avg Deg: {semanticGraph.stats.averageDegree}
                </span>
              )}
            </h4>
            <p className="text-[11px] text-slate-400">
              Interactive node-link graph mapping concept cross-references, procedures, tables, and trust tiers.
            </p>
          </div>
        </div>

        {/* Filters & Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Edge Kind Filter */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1">
            <Filter className="w-3 h-3 text-slate-400" />
            <select
              value={filterEdgeKind}
              onChange={(e) => setFilterEdgeKind(e.target.value)}
              className="bg-transparent text-slate-200 text-xs font-mono focus:outline-none cursor-pointer"
            >
              <option value="all">All Edges ({links.length})</option>
              <option value="depends_on">Prerequisites (depends_on)</option>
              <option value="implements">Specifications (implements)</option>
              <option value="references">Citations (references)</option>
              <option value="related_to">Semantic Overlap (related_to)</option>
            </select>
          </div>

          {/* Concept Type Filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="all">All Types ({nodes.length})</option>
            {uniqueTypes.map((t) => (
              <option key={t} value={t}>
                {t} ({nodes.filter((n) => n.type === t).length})
              </option>
            ))}
          </select>

          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search graph..."
              className="pl-8 pr-3 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-32 sm:w-40"
            />
          </div>

          {/* Zoom Buttons */}
          <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => handleZoom(1.25)}
              className="p-1.5 hover:bg-slate-800 text-slate-300 transition"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleZoom(0.8)}
              className="p-1.5 hover:bg-slate-800 text-slate-300 transition border-l border-slate-800"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              className="p-1.5 hover:bg-slate-800 text-slate-300 transition border-l border-slate-800"
              title="Reset View"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Canvas & Details Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-0 relative">
        {/* SVG Canvas (3 cols) */}
        <div
          ref={containerRef}
          className="lg:col-span-3 h-[480px] bg-slate-950 relative overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing"
        >
          {nodes.length === 0 ? (
            <div className="text-slate-500 text-xs italic">No OKF graph nodes available.</div>
          ) : (
            <svg
              ref={svgRef}
              className="w-full h-full"
              style={{ background: "radial-gradient(#1e293b 1px, transparent 1px)", backgroundSize: "24px 24px" }}
            />
          )}

          {/* Quick Legend Overlay with Directed Edge Types */}
          <div className="absolute bottom-3 left-3 bg-slate-900/90 backdrop-blur-xs border border-slate-800 rounded-lg p-2.5 flex flex-wrap items-center gap-3 text-[10px] text-slate-300 pointer-events-none shadow-md">
            <span className="font-bold text-slate-400 uppercase tracking-wider">Edges:</span>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-amber-500 inline-block"></span>
              <span>Depends On</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 border-t border-dashed border-emerald-400 inline-block"></span>
              <span>Implements</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-indigo-500 inline-block"></span>
              <span>References</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 border-t border-dotted border-slate-400 inline-block"></span>
              <span>Related</span>
            </div>
          </div>
        </div>

        {/* Selected Node or Edge Details Sidebar (1 col) */}
        <div className="lg:col-span-1 bg-slate-900/95 border-t lg:border-t-0 lg:border-l border-slate-800 p-4 flex flex-col gap-3 h-[480px] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              {activeEdge ? (
                <>
                  <LinkIcon className="w-3.5 h-3.5 text-amber-400" />
                  Edge Inspector
                </>
              ) : (
                <>
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  Concept Inspector
                </>
              )}
            </span>
            {activeNode && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {activeNode.type}
              </span>
            )}
            {activeEdge && (
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${EDGE_STYLES[activeEdge.kind]?.bg || 'bg-slate-800'} ${EDGE_STYLES[activeEdge.kind]?.text || 'text-slate-300'}`}>
                {activeEdge.kind}
              </span>
            )}
          </div>

          {/* Active Edge Card */}
          {activeEdge ? (
            <div className="flex flex-col gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-col gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Relationship Edge
                </span>

                <div className="flex items-center justify-between gap-2 text-slate-200">
                  <span className="font-bold truncate text-indigo-300">
                    {nodes.find((n) => n.id === activeEdge.from)?.title || activeEdge.from}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="font-bold truncate text-emerald-300">
                    {nodes.find((n) => n.id === activeEdge.to)?.title || activeEdge.to}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
                  <span>Confidence:</span>
                  <span className="font-mono font-bold text-slate-200">
                    {Math.round((activeEdge.confidence || 0.8) * 100)}%
                  </span>
                </div>
              </div>

              {/* Rationale / Evidence */}
              {activeEdge.evidenceSentence && (
                <div className="flex flex-col gap-1">
                  <span className="text-slate-400 text-[11px] font-medium">Link Rationale & NLP Evidence:</span>
                  <p className="text-slate-300 text-[11px] leading-relaxed bg-slate-950 p-2.5 rounded-lg border border-slate-800 italic">
                    "{activeEdge.evidenceSentence}"
                  </p>
                </div>
              )}

              {/* Shared Entities */}
              {activeEdge.sharedEntities && activeEdge.sharedEntities.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-slate-400 text-[11px] font-medium">Shared Entities:</span>
                  <div className="flex flex-wrap gap-1">
                    {activeEdge.sharedEntities.map((e, i) => (
                      <span key={i} className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] border border-slate-700">
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Jump to Source or Target Node */}
              <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-800">
                <span className="text-slate-400 text-[11px] font-medium">Navigate Nodes:</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const srcNode = nodes.find((n) => n.id === activeEdge.from);
                      if (srcNode) {
                        setActiveNode(srcNode);
                        setActiveEdge(null);
                        if (onSelectConcept) onSelectConcept(srcNode.id);
                      }
                    }}
                    className="p-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] text-center text-indigo-300 transition truncate"
                  >
                    View Source
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const tgtNode = nodes.find((n) => n.id === activeEdge.to);
                      if (tgtNode) {
                        setActiveNode(tgtNode);
                        setActiveEdge(null);
                        if (onSelectConcept) onSelectConcept(tgtNode.id);
                      }
                    }}
                    className="p-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] text-center text-emerald-300 transition truncate"
                  >
                    View Target
                  </button>
                </div>
              </div>
            </div>
          ) : activeNode ? (
            <div className="flex flex-col gap-3 text-xs">
              <div className="flex flex-col gap-1">
                <h5 className="text-sm font-bold text-white leading-snug">{activeNode.title}</h5>
                <span className="text-[11px] font-mono text-slate-400 truncate">{activeNode.path}</span>
              </div>

              {/* Trust & Quality Badge */}
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-[11px]">Trust Tier:</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      activeNode.trust === "human-reviewed"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : activeNode.trust === "machine-confirmed"
                        ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                        : "bg-slate-700/50 text-slate-300"
                    }`}
                  >
                    {activeNode.trust}
                  </span>
                </div>
                {activeNode.nlp && (
                  <div className="flex items-center justify-between pt-1 border-t border-slate-900 text-[10px] text-slate-400">
                    <span>Completeness: {activeNode.nlp.qualitySignals.completenessScore}%</span>
                    <span>Readability: {activeNode.nlp.readability.complexityLabel}</span>
                  </div>
                )}
              </div>

              {/* Description */}
              {activeNode.concept.metadata.description && (
                <div className="flex flex-col gap-1">
                  <span className="text-slate-400 text-[11px] font-medium">Description:</span>
                  <p className="text-slate-300 text-[11px] leading-relaxed bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    {activeNode.concept.metadata.description}
                  </p>
                </div>
              )}

              {/* Tags */}
              {activeNode.tags.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-slate-400 text-[11px] font-medium">Tags:</span>
                  <div className="flex flex-wrap gap-1">
                    {activeNode.tags.map((t) => (
                      <span
                        key={t}
                        className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] border border-slate-700"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Connected Concepts Grouped by Edge Kind */}
              <div className="flex flex-col gap-2 pt-1 border-t border-slate-800">
                <span className="text-slate-400 text-[11px] font-medium">Connected Concepts:</span>
                <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                  {links
                    .filter((l) => l.from === activeNode.id || l.to === activeNode.id)
                    .map((l, i) => {
                      const otherId = l.from === activeNode.id ? l.to : l.from;
                      const otherNode = nodes.find((n) => n.id === otherId);
                      const isOutbound = l.from === activeNode.id;
                      const style = EDGE_STYLES[l.kind] || EDGE_STYLES.default;

                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            if (otherNode) {
                              setActiveNode(otherNode);
                              if (onSelectConcept) onSelectConcept(otherNode.id);
                            }
                          }}
                          className="p-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800/80 text-left transition flex items-center justify-between gap-1 text-[11px] cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono uppercase ${style.bg} ${style.text}`}>
                              {l.kind}
                            </span>
                            <span className="text-slate-200 font-medium truncate">
                              {otherNode?.title || otherId}
                            </span>
                          </div>
                          <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-500 gap-2">
              <Layers className="w-8 h-8 opacity-40 text-indigo-400" />
              <p className="text-xs">Click on any node or edge in the graph to view properties, relationships, and NLP extraction evidence.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
