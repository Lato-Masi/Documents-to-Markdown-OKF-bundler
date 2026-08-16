/**
 * @file okfBundleWorker.ts
 * @description Web Worker dedicated to asynchronous, non-blocking OKF Knowledge Base compilation,
 * AST graph construction, semantic cross-linking, W3C RDF/JSON-LD serialization, and JSZip archiving.
 *
 * Running these CPU-heavy parsing and compression algorithms in a background worker ensures that
 * the browser UI thread remains completely responsive (60 FPS) during multi-megabyte batch operations.
 */

import { convertMultipleMarkdownsToOKFBundle } from '../utils/okfZipExporter';
import { exportOKFBundleAsZip, type OKFExportZipOptions } from '../lib/okfMultiFormatExporter';

/**
 * Message payload sent from the main thread to initiate background bundle compilation or ZIP export.
 */
export interface WorkerInputMessage {
  /** The execution mode requested by the caller */
  type: 'COMPILE_BUNDLE' | 'COMPILE_AND_EXPORT_ZIP';
  /** Unique task identifier to correlate asynchronous worker replies */
  id: string;
  /** Array of raw markdown documents to partition and cross-link */
  documents: Array<{ fileName: string; markdown: string }>;
  /** Base name for the generated knowledge base bundle archive */
  bundleName: string;
  /** Configuration options for multi-format serializations and metadata generation */
  options?: OKFExportZipOptions;
}

/**
 * Message payload posted back to the main thread containing task progress, results, or error states.
 */
export interface WorkerOutputMessage {
  /** Execution status flag */
  type: 'SUCCESS' | 'ERROR' | 'PROGRESS';
  /** Correlation task identifier matching the original request */
  id: string;
  /** Granular progress updates for UI progress bars and status labels */
  progress?: { percent: number; status: string };
  /** Compiled OKF bundle containing concepts, relations, and dependency graphs */
  bundleResult?: any;
  /** Generated ZIP binary Blob ready for immediate browser download */
  zipBlob?: Blob;
  /** Total count of files packaged inside the resulting ZIP archive */
  totalFiles?: number;
  /** Error message string if compilation or serialization failed */
  error?: string;
}

/**
 * Worker message event handler.
 * Listens for compilation/export commands, executes pipeline stages, and streams progress updates.
 */
self.onmessage = async (e: MessageEvent<WorkerInputMessage>) => {
  const { type, id, documents, bundleName, options } = e.data;

  try {
    if (type === 'COMPILE_BUNDLE' || type === 'COMPILE_AND_EXPORT_ZIP') {
      // Step 1: Notify main thread of partitioning commencement
      self.postMessage({
        type: 'PROGRESS',
        id,
        progress: { percent: 25, status: `Partitioning & linking ${documents.length} documents...` },
      } as WorkerOutputMessage);

      // Perform synchronous CPU-intensive parsing and cross-linking inside the worker thread
      const bundleResult = convertMultipleMarkdownsToOKFBundle(documents, bundleName);

      if (type === 'COMPILE_BUNDLE') {
        self.postMessage({
          type: 'SUCCESS',
          id,
          bundleResult,
        } as WorkerOutputMessage);
        return;
      }

      // Step 2: Notify main thread of serialization and ZIP compression phase
      self.postMessage({
        type: 'PROGRESS',
        id,
        progress: { percent: 65, status: `Serializing RDF, JSON-LD and packaging ZIP...` },
      } as WorkerOutputMessage);

      // Perform multi-format asset generation and JSZip in-memory archiving
      const { zipBlob, totalFiles } = await exportOKFBundleAsZip(bundleResult, options);

      // Step 3: Complete operation and return binary artifact
      self.postMessage({
        type: 'PROGRESS',
        id,
        progress: { percent: 100, status: `Completed packaging ${totalFiles} files.` },
      } as WorkerOutputMessage);

      self.postMessage({
        type: 'SUCCESS',
        id,
        bundleResult,
        zipBlob,
        totalFiles,
      } as WorkerOutputMessage);
    }
  } catch (err: any) {
    self.postMessage({
      type: 'ERROR',
      id,
      error: err.message || String(err),
    } as WorkerOutputMessage);
  }
};

