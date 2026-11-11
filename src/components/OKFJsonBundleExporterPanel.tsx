import React, { useState, useMemo, useEffect } from "react";
import {
  FileJson,
  Copy,
  Check,
  Download,
  Plus,
  Trash2,
  Search,
  CheckCircle2,
  AlertTriangle,
  FolderTree,
  Link2,
  Tag,
  MessageSquarePlus,
} from "lucide-react";
import {
  buildOKFv02JsonBundle,
  serializeOKFv02JsonBundle,
  downloadOKFv02JsonBundle,
  loadDocumentAnnotations,
  saveDocumentAnnotations,
  type OKFDocumentAnnotation,
  type OKFAnnotationKind,
  type OKFHierarchyNode,
} from "../lib/okfJsonBundleExporter";

interface OKFJsonBundleExporterPanelProps {
  markdown: string;
  sourceFileName?: string;
  bundleName?: string;
}

type InspectorView = "json" | "annotations" | "entities" | "hierarchy-links";

const USER_ANNOTATION_KINDS: Array<{ id: OKFAnnotationKind; label: string }> = [
  { id: "note", label: "Note" },
  { id: "highlight", label: "Highlight" },
  { id: "claim-check", label: "Claim Check" },
  { id: "citation", label: "Citation" },
  { id: "entity-note", label: "Entity Note" },
];

const INDENT_CLASSES = ["ml-0", "ml-4", "ml-8", "ml-12", "ml-16", "ml-20"];

function HierarchyTreeBranch({
  node,
  level = 0,
}: {
  node: OKFHierarchyNode;
  level?: number;
}) {
  const indentClass = INDENT_CLASSES[Math.min(level, INDENT_CLASSES.length - 1)];
  return (
    <div className="space-y-1.5">
      <div
        className={`${indentClass} py-2 px-3 rounded-lg bg-slate-900/70 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono tabular-nums text-[11px] text-emerald-400 shrink-0">
              H{node.depth}
            </span>
            <span className="font-semibold text-slate-100 truncate">
              {node.title}
            </span>
            {node.conceptPath && (
              <>
                <span className="text-slate-600">·</span>
                <span className="font-mono text-[11px] text-indigo-300 truncate">
                  {node.conceptPath}
                </span>
              </>
            )}
          </div>
          <p className="text-[11px] text-slate-400 truncate mt-0.5">
            {node.breadcrumbPath}
          </p>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono tabular-nums whitespace-nowrap shrink-0">
          <span>{node.estimatedTokens} tok</span>
          <span className="text-slate-600">·</span>
          <span>{node.entityIds.length} ent</span>
          {node.blockCounts.tables > 0 && (
            <>
              <span className="text-slate-600">·</span>
              <span className="text-amber-300">{node.blockCounts.tables} tbl</span>
            </>
          )}
          {node.blockCounts.blockquotes > 0 && (
            <>
              <span className="text-slate-600">·</span>
              <span className="text-indigo-300">{node.blockCounts.blockquotes} quote</span>
            </>
          )}
        </div>
      </div>

      {node.children.length > 0 && (
        <div className="space-y-1.5">
          {node.children.map((child) => (
            <HierarchyTreeBranch key={child.id} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OKFJsonBundleExporterPanel({
  markdown,
  sourceFileName = "converted-document.md",
  bundleName,
}: OKFJsonBundleExporterPanelProps) {
  const [activeView, setActiveView] = useState<InspectorView>("annotations");
  const [includeRawMarkdown, setIncludeRawMarkdown] = useState<boolean>(true);
  const [includeAutoAnnotations, setIncludeAutoAnnotations] = useState<boolean>(true);
  const [userAnnotations, setUserAnnotations] = useState<OKFDocumentAnnotation[]>(() =>
    loadDocumentAnnotations(sourceFileName)
  );
  const [copied, setCopied] = useState<boolean>(false);

  // New annotation form state
  const [newKind, setNewKind] = useState<OKFAnnotationKind>("note");
  const [newTargetSection, setNewTargetSection] = useState<string>("");
  const [newAnchorText, setNewAnchorText] = useState<string>("");
  const [newComment, setNewComment] = useState<string>("");
  const [newAuthor, setNewAuthor] = useState<string>("human:reviewer");

  // Entity filter state
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("all");
  const [entitySearch, setEntitySearch] = useState<string>("");

  useEffect(() => {
    setUserAnnotations(loadDocumentAnnotations(sourceFileName));
  }, [sourceFileName]);

  const okfJsonBundle = useMemo(() => {
    return buildOKFv02JsonBundle(markdown, {
      sourceFileName,
      bundleName,
      annotations: userAnnotations,
      includeAutomatedAnnotations: includeAutoAnnotations,
      includeRawMarkdown,
    });
  }, [
    markdown,
    sourceFileName,
    bundleName,
    userAnnotations,
    includeAutoAnnotations,
    includeRawMarkdown,
  ]);

  const jsonOutput = useMemo(
    () => serializeOKFv02JsonBundle(okfJsonBundle, true),
    [okfJsonBundle]
  );

  const sectionOptions = useMemo(() => {
    const titles = okfJsonBundle.structural_metadata.hierarchy.flatSections.map(
      (s) => s.title
    );
    return titles.length > 0 ? titles : [okfJsonBundle.source_document.title];
  }, [okfJsonBundle]);

  useEffect(() => {
    if (!newTargetSection && sectionOptions.length > 0) {
      setNewTargetSection(sectionOptions[0]);
    }
  }, [sectionOptions, newTargetSection]);

  const handleAddAnnotation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    const normalizedAuthor =
      /^(?:human|process):\S+$/.test(newAuthor.trim()) ||
      /^[^/\s]+\/[^/\s]+$/.test(newAuthor.trim())
        ? newAuthor.trim()
        : `human:${newAuthor.trim().replace(/\s+/g, "-") || "reviewer"}`;

    const created: OKFDocumentAnnotation = {
      id: `user_ann_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      kind: newKind,
      source: "user",
      targetSection: newTargetSection || sectionOptions[0] || "Document Root",
      anchorText: newAnchorText.trim() || undefined,
      comment: newComment.trim(),
      author: normalizedAuthor,
      createdAt: new Date().toISOString(),
      tags: [newKind],
    };

    const updated = [created, ...userAnnotations];
    setUserAnnotations(updated);
    saveDocumentAnnotations(sourceFileName, updated);
    setNewComment("");
    setNewAnchorText("");
  };

  const handleDeleteAnnotation = (id: string) => {
    const updated = userAnnotations.filter((a) => a.id !== id);
    setUserAnnotations(updated);
    saveDocumentAnnotations(sourceFileName, updated);
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(jsonOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadJson = () => {
    const targetName = `${okfJsonBundle.root || "knowledge-base"}.okf.json`;
    downloadOKFv02JsonBundle(okfJsonBundle, targetName);
  };

  const entityTypes = useMemo(
    () => Object.keys(okfJsonBundle.structural_metadata.entities.countsByType),
    [okfJsonBundle]
  );

  const filteredEntities = useMemo(() => {
    const q = entitySearch.trim().toLowerCase();
    return okfJsonBundle.structural_metadata.entities.items.filter((ent) => {
      if (entityTypeFilter !== "all" && ent.entityType !== entityTypeFilter) {
        return false;
      }
      if (!q) return true;
      return (
        ent.name.toLowerCase().includes(q) ||
        ent.entityType.toLowerCase().includes(q) ||
        ent.sectionHeadings.some((h) => h.toLowerCase().includes(q))
      );
    });
  }, [okfJsonBundle, entityTypeFilter, entitySearch]);

  const { hierarchy, entities, links, annotations } =
    okfJsonBundle.structural_metadata;

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden text-slate-200">
      {/* Header & Primary Export Actions */}
      <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <FileJson className="w-4 h-4 text-emerald-400 shrink-0" />
            <h4 className="text-sm font-semibold text-white">
              OKF v0.2 Structural JSON Bundle & Annotations
            </h4>
            <span className="text-slate-600">·</span>
            <span className="text-xs font-mono tabular-nums text-emerald-400 inline-flex items-center gap-1">
              {okfJsonBundle.conformance.isConformant ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    OKF v0.2 Conformant ({okfJsonBundle.conformance.errorCount} errors)
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-amber-300">
                    {okfJsonBundle.conformance.errorCount} validation issues
                  </span>
                </>
              )}
            </span>
          </div>
          <p className="text-xs text-slate-400 font-mono tabular-nums">
            {okfJsonBundle.concepts.length} concepts · {hierarchy.totalSections} sections (depth H{hierarchy.maxDepth}) · {entities.totalUniqueEntities} typed entities · {annotations.totalCount} annotations · {links.totalLinks} links
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer mr-1 whitespace-nowrap shrink-0">
            <input
              type="checkbox"
              checked={includeRawMarkdown}
              onChange={(e) => setIncludeRawMarkdown(e.target.checked)}
              className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
            />
            <span>Include Raw Markdown</span>
          </label>

          <button
            type="button"
            onClick={handleCopyJson}
            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium inline-flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Copied JSON</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Copy JSON</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDownloadJson}
            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span>Download OKF (.json)</span>
          </button>
        </div>
      </div>

      {/* Sub-View Segmented Selector */}
      <div className="px-4 py-2.5 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800 overflow-x-auto max-w-full">
          {(
            [
              {
                id: "annotations",
                label: `Annotations (${annotations.totalCount})`,
                icon: <MessageSquarePlus className="w-3.5 h-3.5 shrink-0" />,
              },
              {
                id: "entities",
                label: `Entities (${entities.totalUniqueEntities})`,
                icon: <Tag className="w-3.5 h-3.5 shrink-0" />,
              },
              {
                id: "hierarchy-links",
                label: `Hierarchy & Links (${hierarchy.totalSections} / ${links.totalLinks})`,
                icon: <FolderTree className="w-3.5 h-3.5 shrink-0" />,
              },
              {
                id: "json",
                label: "OKF v0.2 JSON Source",
                icon: <FileJson className="w-3.5 h-3.5 shrink-0" />,
              },
            ] as Array<{ id: InspectorView; label: string; icon: React.ReactNode }>
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveView(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                activeView === tab.id
                  ? "bg-slate-800 text-emerald-400 border border-slate-700 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <label className="inline-flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer whitespace-nowrap shrink-0">
          <input
            type="checkbox"
            checked={includeAutoAnnotations}
            onChange={(e) => setIncludeAutoAnnotations(e.target.checked)}
            className="rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-indigo-500"
          />
          <span>Auto-annotate quotes, tables & code</span>
        </label>
      </div>

      {/* Active Sub-View Content */}
      <div className="p-4 sm:p-5">
        {activeView === "annotations" && (
          <div className="space-y-5">
            {/* Add Annotation Form */}
            <form
              onSubmit={handleAddAnnotation}
              className="p-4 rounded-lg bg-slate-900/70 border border-slate-800 space-y-3"
            >
              <div className="text-xs font-semibold text-slate-200">
                Attach Document or Section Annotation
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Target Section</label>
                  <select
                    value={newTargetSection}
                    onChange={(e) => setNewTargetSection(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    {sectionOptions.map((sec, idx) => (
                      <option key={`${sec}-${idx}`} value={sec}>
                        {sec}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Annotation Type</label>
                  <select
                    value={newKind}
                    onChange={(e) => setNewKind(e.target.value as OKFAnnotationKind)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    {USER_ANNOTATION_KINDS.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">OKF Actor</label>
                  <input
                    type="text"
                    value={newAuthor}
                    onChange={(e) => setNewAuthor(e.target.value)}
                    placeholder="human:reviewer"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">
                    Quoted Anchor Excerpt (Optional)
                  </label>
                  <input
                    type="text"
                    value={newAnchorText}
                    onChange={(e) => setNewAnchorText(e.target.value)}
                    placeholder="Exact phrase or figure metric from section..."
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Annotation Note</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Add clinical, editorial, or verification note..."
                      className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="submit"
                      disabled={!newComment.trim()}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold inline-flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 shrink-0" />
                      <span>Add Annotation</span>
                    </button>
                  </div>
                </div>
              </div>
            </form>

            {/* Annotations List */}
            {annotations.items.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-lg">
                No annotations recorded yet. Add a section note above or enable automated structural annotations.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-800 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3 font-medium">Type</th>
                      <th className="py-2.5 px-3 font-medium">Target Section</th>
                      <th className="py-2.5 px-3 font-medium">Annotation & Anchor</th>
                      <th className="py-2.5 px-3 font-medium">Actor</th>
                      <th className="py-2.5 px-3 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {annotations.items.map((ann) => (
                      <tr key={ann.id} className="hover:bg-slate-900/50">
                        <td className="py-2.5 px-3 font-mono text-[11px] text-emerald-400 whitespace-nowrap">
                          {ann.kind}
                        </td>
                        <td className="py-2.5 px-3 text-slate-200 font-medium max-w-[200px] truncate">
                          {ann.targetSection}
                        </td>
                        <td className="py-2.5 px-3 text-slate-300">
                          <div>{ann.comment}</div>
                          {ann.anchorText && (
                            <div className="text-[11px] text-slate-500 font-mono truncate max-w-md mt-0.5">
                              "{ann.anchorText}"
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                          {ann.author}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          {ann.source === "user" ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteAnnotation(ann.id)}
                              className="p-1 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                              title="Remove annotation"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-500 font-mono">
                              AST
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeView === "entities" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setEntityTypeFilter("all")}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                    entityTypeFilter === "all"
                      ? "bg-slate-800 text-emerald-400 font-semibold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  All ({entities.totalUniqueEntities})
                </button>
                {entityTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setEntityTypeFilter(type)}
                    className={`px-2.5 py-1 rounded text-xs font-medium capitalize transition whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                      entityTypeFilter === type
                        ? "bg-slate-800 text-emerald-400 font-semibold"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {type} ({entities.countsByType[type]})
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={entitySearch}
                  onChange={(e) => setEntitySearch(e.target.value)}
                  placeholder="Filter entities or sections..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {filteredEntities.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-lg">
                No matching entities found for the current filter.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-800 rounded-lg max-h-[420px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3 font-medium">Entity</th>
                      <th className="py-2.5 px-3 font-medium">Entity Type</th>
                      <th className="py-2.5 px-3 font-medium text-right">Salience</th>
                      <th className="py-2.5 px-3 font-medium text-right">Mentions</th>
                      <th className="py-2.5 px-3 font-medium">Sections</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {filteredEntities.map((ent) => (
                      <tr key={ent.id} className="hover:bg-slate-900/50">
                        <td className="py-2 px-3 font-medium text-slate-100">
                          {ent.name}
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-indigo-300 capitalize whitespace-nowrap">
                          {ent.entityType}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-emerald-400">
                          {(ent.salience * 100).toFixed(0)}%
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-300">
                          {ent.occurrences}
                        </td>
                        <td className="py-2 px-3 text-slate-400 truncate max-w-xs">
                          {ent.sectionHeadings.join(" · ") || "Document Root"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeView === "hierarchy-links" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <FolderTree className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Document Section Hierarchy</span>
                </span>
                <span className="font-mono tabular-nums text-slate-400">
                  {hierarchy.totalSections} sections · max depth H{hierarchy.maxDepth}
                </span>
              </div>
              <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
                {hierarchy.tree.map((rootNode) => (
                  <HierarchyTreeBranch key={rootNode.id} node={rootNode} />
                ))}
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span>Structural & Semantic Links</span>
                </span>
                <span className="font-mono tabular-nums text-slate-400">
                  {links.externalLinks.length} external · {links.internalLinks.length} internal · {links.semanticEdges.length} semantic
                </span>
              </div>

              <div className="overflow-x-auto border border-slate-800 rounded-lg max-h-[420px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 sticky top-0">
                    <tr>
                      <th className="py-2 px-3 font-medium">Relation</th>
                      <th className="py-2 px-3 font-medium">Source</th>
                      <th className="py-2 px-3 font-medium">Target</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {links.semanticEdges.map((edge, idx) => (
                      <tr key={`sem-${idx}`} className="hover:bg-slate-900/50">
                        <td className="py-2 px-3 font-mono text-[11px] text-emerald-400 whitespace-nowrap">
                          {edge.kind} ({Math.round(edge.confidence * 100)}%)
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-300 truncate max-w-[140px]">
                          {edge.from}
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-indigo-300 truncate max-w-[160px]">
                          {edge.to}
                        </td>
                      </tr>
                    ))}
                    {[...links.externalLinks, ...links.internalLinks].map((lnk) => (
                      <tr key={lnk.id} className="hover:bg-slate-900/50">
                        <td className="py-2 px-3 font-mono text-[11px] text-amber-300 whitespace-nowrap">
                          {lnk.kind}
                        </td>
                        <td className="py-2 px-3 text-slate-300 truncate max-w-[140px]">
                          {lnk.sourceSection}
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-sky-300 truncate max-w-[180px]">
                          {lnk.url}
                        </td>
                      </tr>
                    ))}
                    {links.semanticEdges.length === 0 &&
                      links.externalLinks.length === 0 &&
                      links.internalLinks.length === 0 && (
                        <tr>
                          <td
                            colSpan={3}
                            className="py-6 text-center text-slate-500"
                          >
                            No cross-concept or external links detected in this document.
                          </td>
                        </tr>
                      )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeView === "json" && (
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 max-h-[480px] overflow-y-auto font-mono text-xs text-slate-200 leading-relaxed">
            <pre className="whitespace-pre-wrap break-words">
              <code>{jsonOutput}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
