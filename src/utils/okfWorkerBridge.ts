/**
 * @file okfWorkerBridge.ts
 * @description Client-side interface and lifecycle manager for interacting with the OKF Bundle Web Worker.
 *
 * Provides resilient asynchronous execution: dispatches batch conversion and ZIP archiving jobs
 * to background threads when Web Workers are available, and transparently falls back to main-thread
 * processing in constrained sandboxes (such as restrictive iframe policies or testing environments).
 */

import { convertMultipleMarkdownsToOKFBundle } from '../utils/okfZipExporter';
import { exportOKFBundleAsZip, type OKFExportZipOptions } from '../lib/okfMultiFormatExporter';
import type { OKFConversionResult } from '../lib/okfKnowledgeEngine';

/**
 * Callback function signature for tracking live worker compilation progress.
 * @param progress Object containing numeric percentage (0-100) and human-readable step description.
 */
export interface WorkerProgressCallback {
  (progress: { percent: number; status: string }): void;
}

/**
 * Result returned upon successful compilation and ZIP export.
 */
export interface WorkerBundleExportResult {
  /** The generated ZIP binary Blob ready for immediate browser download */
  zipBlob: Blob;
  /** Total count of files packaged inside the archive */
  totalFiles: number;
  /** The compiled OKF graph and concept definitions */
  bundleResult: OKFConversionResult;
}

/**
 * Asynchronously processes a collection of markdown documents in a background Web Worker.
 *
 * @param documents List of input files with their filename and raw markdown text.
 * @param bundleName Root identifier for the knowledge base archive.
 * @param options Optional configuration flags for format inclusions (RDF, JSON-LD, report, etc.).
 * @param onProgress Optional progress callback to update UI loading indicators.
 * @returns Promise resolving to the resulting ZIP blob, file metrics, and compiled OKF bundle.
 */
export async function processOKFBundleInWorker(
  documents: Array<{ fileName: string; markdown: string }>,
  bundleName: string,
  options?: OKFExportZipOptions,
  onProgress?: WorkerProgressCallback
): Promise<WorkerBundleExportResult> {
  // Check if browser environment supports Web Workers
  if (typeof Worker !== 'undefined') {
    return new Promise((resolve, reject) => {
      try {
        // Instantiate the ES module worker
        const worker = new Worker(new URL('../workers/okfBundleWorker.ts', import.meta.url), {
          type: 'module',
        });

        const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

        worker.onmessage = (e: MessageEvent) => {
          const msg = e.data;
          if (msg.id !== taskId) return;

          if (msg.type === 'PROGRESS' && onProgress && msg.progress) {
            onProgress(msg.progress);
          } else if (msg.type === 'SUCCESS') {
            worker.terminate();
            resolve({
              zipBlob: msg.zipBlob,
              totalFiles: msg.totalFiles,
              bundleResult: msg.bundleResult,
            });
          } else if (msg.type === 'ERROR') {
            worker.terminate();
            reject(new Error(msg.error || 'Worker execution failed'));
          }
        };

        worker.onerror = (err) => {
          worker.terminate();
          // Fallback to main thread execution on worker runtime failure
          console.warn('Worker execution failed, falling back to main-thread compilation', err);
          fallbackToMainThread(documents, bundleName, options, onProgress)
            .then(resolve)
            .catch(reject);
        };

        // Post compilation job to the worker thread
        worker.postMessage({
          type: 'COMPILE_AND_EXPORT_ZIP',
          id: taskId,
          documents,
          bundleName,
          options,
        });
      } catch (workerInitErr) {
        // Fallback if Worker instantiation is blocked by CSP or environment limitations
        console.warn('Could not initialize worker, running on main thread:', workerInitErr);
        fallbackToMainThread(documents, bundleName, options, onProgress)
          .then(resolve)
          .catch(reject);
      }
    });
  }

  return fallbackToMainThread(documents, bundleName, options, onProgress);
}

/**
 * Synchronous main-thread execution fallback when Web Workers are unavailable.
 *
 * @param documents Raw markdown files to process.
 * @param bundleName Knowledge base root name.
 * @param options Export configuration flags.
 * @param onProgress Progress event callback.
 * @returns Result object matching the worker return signature.
 */
async function fallbackToMainThread(
  documents: Array<{ fileName: string; markdown: string }>,
  bundleName: string,
  options?: OKFExportZipOptions,
  onProgress?: WorkerProgressCallback
): Promise<WorkerBundleExportResult> {
  if (onProgress) onProgress({ percent: 30, status: 'Partitioning concepts on main thread...' });
  const bundleResult = convertMultipleMarkdownsToOKFBundle(documents, bundleName);
  
  if (onProgress) onProgress({ percent: 70, status: 'Exporting ZIP package on main thread...' });
  const { zipBlob, totalFiles } = await exportOKFBundleAsZip(bundleResult, options);

  if (onProgress) onProgress({ percent: 100, status: 'Done.' });
  return { zipBlob, totalFiles, bundleResult };
}

