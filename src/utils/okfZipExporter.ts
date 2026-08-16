/**
 * @file okfZipExporter.ts
 * @description Unified Exporter Entrypoint & Backward-Compatible Facade for the Open Knowledge Format.
 *
 * Exposes core bundling algorithms, multi-format serializers (W3C Turtle RDF, JSON-LD, MCP Server schemas,
 * Obsidian Vault configurations), and in-memory JSZip packaging routines.
 */

export {
  exportOKFBundleAsZip,
  downloadZipBlob,
  type OKFExportZipOptions as OKFExportOptions,
  exportToJSONLD,
  exportToTurtleRDF,
  exportToMCPServerSchema,
  generateObsidianVaultConfig,
  generateAllMultiFormatExports,
  exportOkfBundle,
  generateStandaloneOKFVisualizerHTML,
} from "../lib/okfMultiFormatExporter";

import {
  compileOKFBundle,
  partitionMarkdownToOKFConcepts,
  type OKFConversionResult,
} from "../lib/okfKnowledgeEngine";
import type { OkfConcept, OkfMetadata } from "okf-ts";

/**
 * Converts a collection of raw Markdown documents into a unified, cross-linked OKF Knowledge Base bundle.
 *
 * Processes each document through heading-based AST partitioning, generates atomic concept files,
 * builds bidirectional semantic wikilinks (`[[concept-id]]`), and generates global graph dependency metadata.
 *
 * @param documents Array of document objects containing the source filename and raw Markdown content.
 * @param bundleName The base name and directory prefix for the compiled bundle (defaults to "knowledge-base").
 * @returns OKFConversionResult containing compiled concepts, graph relations, validation metrics, and manifest.
 */
export function convertMultipleMarkdownsToOKFBundle(
  documents: { fileName: string; markdown: string }[],
  bundleName: string = "knowledge-base"
): OKFConversionResult {
  const allConcepts: OkfConcept<OkfMetadata>[] = [];

  // Iterate over each document and extract discrete atomic concept blocks
  for (const doc of documents) {
    if (!doc.markdown || !doc.markdown.trim()) continue;

    const conceptsFromDoc = partitionMarkdownToOKFConcepts(doc.markdown, {
      sourceFileName: doc.fileName,
      defaultStatus: "stable",
      enableCrossLinking: true,
    });

    allConcepts.push(...conceptsFromDoc);
  }

  // If no concepts were generated (e.g. empty or whitespace-only inputs), provide a fallback placeholder
  if (allConcepts.length === 0) {
    const emptyDoc = partitionMarkdownToOKFConcepts("# Overview\n\nEmpty Knowledge Base.", {
      sourceFileName: "overview.md",
    });
    allConcepts.push(...emptyDoc);
  }

  // Compile individual concepts into an integrated OKF bundle with adjacency matrix and directory structure
  return compileOKFBundle(allConcepts, bundleName);
}

