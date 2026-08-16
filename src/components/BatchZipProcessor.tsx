import React, { useState, useRef, useEffect, useMemo } from 'react';
import JSZip from 'jszip';
import {
  convertMarkdownToOKF,
  OKFDocument,
  OKFOptions,
} from '../lib/okfConverter';
import {
  convertMultipleMarkdownsToOKFBundle,
  exportOKFBundleAsZip,
  downloadZipBlob,
} from '../utils/okfZipExporter';
import { processOKFBundleInWorker } from '../utils/okfWorkerBridge';
import { cleanMarkdownOutput } from '../utils/markdownCleaner';
import {
  UploadCloud,
  FileArchive,
  Play,
  Pause,
  Square,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Search,
  Filter,
  Download,
  FileText,
  FileCode,
  Image,
  Tag,
  Sparkles,
  ChevronRight,
  Eye,
  Trash2,
  Database,
  Layers,
  ShieldCheck,
  Check,
  Copy,
  ExternalLink,
  BookOpen,
  Archive,
} from 'lucide-react';

export interface BatchQueueItem {
  id: string;
  path: string; // File path within ZIP
  filename: string;
  extension: string;
  size: number;
  fileBlob: Blob;
  status:
    | 'pending'
    | 'converting_markdown'
    | 'formatting_okf'
    | 'success'
    | 'error'
    | 'skipped';
  progressPercent: number;
  statusMessage?: string;
  error?: string;
  rawMarkdown?: string;
  okfDoc?: OKFDocument;
  convertedAt?: string;
}

interface BatchZipProcessorProps {
  onSelectDocumentForView?: (okfMarkdown: string, filename: string) => void;
  okfOptions?: Partial<OKFOptions>;
}

export default function BatchZipProcessor({
  onSelectDocumentForView,
  okfOptions = {},
}: BatchZipProcessorProps) {
  // Maximum ZIP file size limit enforced in browser (10 Megabytes)
  const MAX_ZIP_SIZE_BYTES = 10 * 1024 * 1024;

  // ZIP Extraction & Queue State
  const [zipName, setZipName] = useState<string | null>(null);
  const [zipError, setZipError] = useState<string | null>(null);
  const [queue, setQueue] = useState<BatchQueueItem[]>([]);
  const [queueState, setQueueState] = useState<
    'idle' | 'running' | 'paused' | 'stopped' | 'completed'
  >('idle');
  const [currentlyProcessingId, setCurrentlyProcessingId] = useState<string | null>(
    null
  );

  // Drag & drop state for zip
  const [dragActive, setDragActive] = useState(false);
  const [isExtractingZip, setIsExtractingZip] = useState(false);
  const zipInputRef = useRef<HTMLInputElement>(null);

  // Control Refs for Async Loop management
  const isPausedRef = useRef(false);
  const isStoppedRef = useRef(false);
  const queueRef = useRef<BatchQueueItem[]>([]);
  queueRef.current = queue;

  // Search & Filter State for Knowledge Base
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('all');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'all' | 'success' | 'error'>('all');

  // Copy indicator
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Supported file extensions for conversion
  const SUPPORTED_EXTS = [
    'pdf',
    'docx',
    'doc',
    'html',
    'htm',
    'txt',
    'md',
    'markdown',
    'csv',
    'json',
    'xml',
    'png',
    'jpg',
    'jpeg',
    'webp',
  ];

  // Format bytes helper
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Process a single file Blob -> Markdown -> OKF
  const processSingleItem = async (item: BatchQueueItem): Promise<{
    rawMarkdown: string;
    okfDoc: OKFDocument;
  }> => {
    const ext = item.extension.toLowerCase();

    let rawMarkdown = '';

    // 1. If it's already a Markdown file, read raw text directly
    if (ext === 'md' || ext === 'markdown') {
      rawMarkdown = await item.fileBlob.text();
    } else {
      // 2. Otherwise, convert via server API endpoint
      const arrayBuffer = await item.fileBlob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Data = btoa(binary);

      const mimeType = item.fileBlob.type || 'application/octet-stream';
      const customKey = localStorage.getItem('byok_gemini_api_key') || '';

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (customKey) {
        headers['x-gemini-api-key'] = customKey.trim();
      }

      const response = await fetch('/api/convert', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          fileName: item.filename,
          fileType: mimeType,
          base64Data,
          conversionMode: 'standard',
          targetStyle: 'standard',
          customApiKey: customKey ? customKey.trim() : undefined,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(
          errJson.error || `Server conversion error (HTTP ${response.status})`
        );
      }

      // Read chunked response text
      const reader = response.body?.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;

      if (!reader) {
        throw new Error('Streaming response reader unavailable');
      }

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          rawMarkdown += decoder.decode(value, { stream: !done });
        }
      }
    }

    // Clean internal server stage telemetry and trailers
    rawMarkdown = cleanMarkdownOutput(rawMarkdown);

    if (!rawMarkdown || !rawMarkdown.trim()) {
      throw new Error('Extracted content was empty or invalid.');
    }

    // 3. Convert raw Markdown to OKF document structure with frontmatter
    const okfDoc = convertMarkdownToOKF(rawMarkdown, okfOptions);

    return { rawMarkdown, okfDoc };
  };

  // Queue Processing Controller Loop
  const startProcessingQueue = async (
    itemsToProcess?: BatchQueueItem[],
    restartFromBeginning = false
  ) => {
    isPausedRef.current = false;
    isStoppedRef.current = false;
    setQueueState('running');

    const currentItems = queueRef.current;
    const targetQueue = itemsToProcess || currentItems;

    for (let i = 0; i < targetQueue.length; i++) {
      const item = targetQueue[i];

      // Check pause / stop flags before starting item
      if (isStoppedRef.current) {
        setQueueState('stopped');
        setCurrentlyProcessingId(null);
        return;
      }

      if (isPausedRef.current) {
        setQueueState('paused');
        setCurrentlyProcessingId(null);
        return;
      }

      // Only process pending or error items (unless force restarting)
      if (!restartFromBeginning && item.status === 'success') {
        continue;
      }

      setCurrentlyProcessingId(item.id);

      // Update item state to 'converting_markdown'
      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? {
                ...q,
                status: 'converting_markdown',
                progressPercent: 25,
                statusMessage:
                  item.extension === 'md'
                    ? 'Reading Markdown...'
                    : 'Converting to Markdown via Gemini API...',
              }
            : q
        )
      );

      try {
        // Small delay for smooth UI transition
        await new Promise((r) => setTimeout(r, 150));

        // Update progress to formatting
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: 'formatting_okf',
                  progressPercent: 70,
                  statusMessage: 'Generating OKF v1.0 Frontmatter & Blocks...',
                }
              : q
          )
        );

        const { rawMarkdown, okfDoc } = await processSingleItem(item);

        // Mark item as Succeeded
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: 'success',
                  progressPercent: 100,
                  statusMessage: 'OKF Document Ready',
                  rawMarkdown,
                  okfDoc,
                  convertedAt: new Date().toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                }
              : q
          )
        );
      } catch (err: any) {
        console.error(`Failed item ${item.filename}:`, err);
        // Resiliently catch error, log it, and continue queue
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: 'error',
                  progressPercent: 100,
                  statusMessage: 'Conversion Failed',
                  error: err.message || 'Processing error occurred.',
                }
              : q
          )
        );
      }

      // Check again if paused/stopped after completing item
      if (isStoppedRef.current) {
        setQueueState('stopped');
        setCurrentlyProcessingId(null);
        return;
      }

      if (isPausedRef.current) {
        setQueueState('paused');
        setCurrentlyProcessingId(null);
        return;
      }
    }

    setCurrentlyProcessingId(null);
    setQueueState('completed');
  };

  // Queue Controls
  const handlePauseQueue = () => {
    isPausedRef.current = true;
    setQueueState('paused');
  };

  const handleResumeQueue = () => {
    isPausedRef.current = false;
    startProcessingQueue();
  };

  const handleStopQueue = () => {
    isStoppedRef.current = true;
    setQueueState('stopped');
    setCurrentlyProcessingId(null);
  };

  const handleRetryFailed = () => {
    setQueue((prev) =>
      prev.map((item) =>
        item.status === 'error'
          ? { ...item, status: 'pending', error: undefined, progressPercent: 0 }
          : item
      )
    );
    setTimeout(() => {
      startProcessingQueue();
    }, 100);
  };

  const handleRetrySingle = (id: string) => {
    setQueue((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, status: 'pending', error: undefined, progressPercent: 0 }
          : item
      )
    );
    if (queueState !== 'running') {
      setTimeout(() => {
        startProcessingQueue();
      }, 100);
    }
  };

  // Handle ZIP File or Multiple Document Ingestion
  const handleFilesSelected = async (fileList: FileList | File[]) => {
    setZipError(null);
    const files = Array.from(fileList);
    if (files.length === 0) return;

    // If a single zip file is uploaded
    if (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) {
      const file = files[0];
      // 10 MB Size Limit Guard
      if (file.size > MAX_ZIP_SIZE_BYTES) {
        const mbSize = (file.size / (1024 * 1024)).toFixed(2);
        setZipError(
          `ZIP archive size limit exceeded (${mbSize} MB). Maximum allowed ZIP size is 10 MB. Please compress or split your ZIP archive before processing.`
        );
        if (zipInputRef.current) zipInputRef.current.value = '';
        return;
      }

      setIsExtractingZip(true);
      setZipName(file.name);
      setQueue([]);
      setQueueState('idle');

      try {
        const zip = new JSZip();
        const zipContent = await zip.loadAsync(file);

        const extractedItems: BatchQueueItem[] = [];
        let counter = 1;

        for (const [relativePath, zipObject] of Object.entries(zipContent.files)) {
          // Skip directories and hidden system files
          if (zipObject.dir) continue;
          if (
            relativePath.includes('__MACOSX') ||
            relativePath.startsWith('.') ||
            relativePath.includes('/.')
          ) {
            continue;
          }

          const filename = relativePath.split('/').pop() || relativePath;
          const ext = filename.split('.').pop()?.toLowerCase() || '';

          // Check if extension is supported
          if (SUPPORTED_EXTS.includes(ext)) {
            const blob = await zipObject.async('blob');

            extractedItems.push({
              id: `zip-item-${counter++}-${Date.now()}`,
              path: relativePath,
              filename,
              extension: ext,
              size: blob.size,
              fileBlob: blob,
              status: 'pending',
              progressPercent: 0,
              statusMessage: 'Queued for OKF conversion',
            });
          }
        }

        setQueue(extractedItems);

        if (extractedItems.length === 0) {
          setZipError(
            'No supported document files found inside this ZIP archive. Supported formats: PDF, DOCX, HTML, TXT, CSV, JSON, PNG, JPG, MD.'
          );
        }
      } catch (err: any) {
        console.error('Failed to read ZIP file:', err);
        setZipError(`Error unzipping file: ${err.message || 'Corrupted ZIP archive'}`);
      } finally {
        setIsExtractingZip(false);
        if (zipInputRef.current) zipInputRef.current.value = '';
      }
      return;
    }

    // Multiple direct files uploaded (e.g. multi-select Markdown / document files)
    const directItems: BatchQueueItem[] = [];
    let counter = 1;

    for (const f of files) {
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      if (SUPPORTED_EXTS.includes(ext)) {
        directItems.push({
          id: `file-item-${counter++}-${Date.now()}`,
          path: f.name,
          filename: f.name,
          extension: ext,
          size: f.size,
          fileBlob: f,
          status: 'pending',
          progressPercent: 0,
          statusMessage: 'Queued for OKF conversion',
        });
      }
    }

    if (directItems.length === 0) {
      setZipError('No supported document files selected. Supported formats: PDF, DOCX, HTML, TXT, CSV, JSON, PNG, JPG, MD.');
      return;
    }

    setZipName(`Batch Collection (${directItems.length} documents)`);
    setQueue(directItems);
    setQueueState('idle');
    if (zipInputRef.current) zipInputRef.current.value = '';
  };

  // Drag & drop handlers for file/ZIP upload
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  // Calculated Queue Statistics
  const totalCount = queue.length;
  const successCount = queue.filter((i) => i.status === 'success').length;
  const errorCount = queue.filter((i) => i.status === 'error').length;
  const pendingCount = queue.filter((i) => i.status === 'pending').length;
  const processingCount = queue.filter(
    (i) => i.status === 'converting_markdown' || i.status === 'formatting_okf'
  ).length;
  const processedCount = successCount + errorCount;
  const overallProgressPercent =
    totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0;

  // Extract all unique tags across converted OKF documents for filtering
  const allUniqueTags = useMemo(() => {
    const tagSet = new Set<string>();
    queue.forEach((item) => {
      item.okfDoc?.metadata.tags.forEach((t) => tagSet.add(t));
    });
    return Array.from(tagSet);
  }, [queue]);

  // Extract all unique file types in queue
  const allUniqueTypes = useMemo(() => {
    const typeSet = new Set<string>();
    queue.forEach((item) => typeSet.add(item.extension.toUpperCase()));
    return Array.from(typeSet);
  }, [queue]);

  // Filtered Queue / Knowledge-Base Documents
  const filteredQueue = useMemo(() => {
    return queue.filter((item) => {
      // Status filter
      if (selectedStatusFilter === 'success' && item.status !== 'success')
        return false;
      if (selectedStatusFilter === 'error' && item.status !== 'error')
        return false;

      // Type filter
      if (
        selectedTypeFilter !== 'all' &&
        item.extension.toUpperCase() !== selectedTypeFilter
      ) {
        return false;
      }

      // Tag filter
      if (selectedTagFilter !== 'all') {
        const hasTag = item.okfDoc?.metadata.tags.includes(selectedTagFilter);
        if (!hasTag) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = item.filename.toLowerCase().includes(q);
        const matchesTitle = item.okfDoc?.metadata.title
          .toLowerCase()
          .includes(q);
        const matchesDesc = item.okfDoc?.metadata.description
          .toLowerCase()
          .includes(q);
        const matchesTags = item.okfDoc?.metadata.tags.some((t) =>
          t.toLowerCase().includes(q)
        );
        const matchesEntities = item.okfDoc?.entities.some((e) =>
          e.toLowerCase().includes(q)
        );
        const matchesRaw = item.okfDoc?.rawOKF.toLowerCase().includes(q);

        return (
          matchesName ||
          matchesTitle ||
          matchesDesc ||
          matchesTags ||
          matchesEntities ||
          matchesRaw
        );
      }

      return true;
    });
  }, [
    queue,
    selectedStatusFilter,
    selectedTypeFilter,
    selectedTagFilter,
    searchQuery,
  ]);

  // Batch Export: Download All Processed OKF files as a standardized OKF v0.2 Knowledge Base ZIP archive
  const [isExportingBundle, setIsExportingBundle] = useState(false);
  const [exportProgressText, setExportProgressText] = useState<string>('');

  const handleDownloadAllOKFZip = async () => {
    const successfulItems = queue.filter(
      (i) => i.status === 'success' && (i.rawMarkdown || i.okfDoc)
    );
    if (successfulItems.length === 0) {
      alert('No successfully converted documents available for OKF Knowledge Base export.');
      return;
    }

    setIsExportingBundle(true);
    setExportProgressText('Preparing worker thread...');
    try {
      const documents = successfulItems.map((item) => ({
        fileName: item.filename,
        markdown: item.rawMarkdown || item.okfDoc?.rawOKF || '',
      }));

      const baseName = zipName
        ? zipName.replace(/\.[^/.]+$/, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')
        : 'knowledge-base';

      // Run computationally heavy bundle partitioning, RDF serialization & ZIP packing in background worker
      const { zipBlob } = await processOKFBundleInWorker(
        documents,
        baseName || 'knowledge-base',
        {
          bundleName: `${baseName}-okf-knowledge-base`,
          includeGraphJson: true,
          includeReportMarkdown: true,
          includeMultiFormatExports: true,
        },
        (progress) => {
          setExportProgressText(progress.status);
        }
      );

      downloadZipBlob(zipBlob, `${baseName}-okf-knowledge-base.zip`);
    } catch (err: any) {
      console.error('Failed to export OKF bundle:', err);
      alert(`Error exporting OKF Bundle: ${err.message || 'Unknown error'}`);
    } finally {
      setIsExportingBundle(false);
      setExportProgressText('');
    }
  };

  // Export Search Index JSON for RAG pipelines
  const handleExportKnowledgeIndexJSON = () => {
    const successfulItems = queue.filter(
      (i) => i.status === 'success' && i.okfDoc
    );
    const indexData = {
      generatedAt: new Date().toISOString(),
      totalDocuments: successfulItems.length,
      knowledgeBase: successfulItems.map((item) => ({
        id: item.okfDoc?.metadata.id,
        filename: item.filename,
        originalPath: item.path,
        title: item.okfDoc?.metadata.title,
        description: item.okfDoc?.metadata.description,
        tags: item.okfDoc?.metadata.tags,
        author: item.okfDoc?.metadata.author,
        blocksCount: item.okfDoc?.blocks.length,
        entities: item.okfDoc?.entities,
        okfMarkdown: item.okfDoc?.rawOKF,
      })),
    };

    const blob = new Blob([JSON.stringify(indexData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `okf_knowledge_index_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Copy single document OKF content
  const copyDocOKF = (id: string, okfText: string) => {
    navigator.clipboard.writeText(okfText);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Top Banner & ZIP Upload Dropzone */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-6 shadow-2xs flex flex-col gap-5">
        <div className="flex items-center justify-between flex-wrap gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
              <FileArchive className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                ZIP Batch Document Converter & Knowledge Base Builder
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-600 text-white font-bold uppercase">
                  OKF v1.0
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Upload a ZIP archive containing PDFs, Word docs, HTML, or Markdown files. Unzips, processes files sequentially, and indexes them into an OKF Knowledge Base.
              </p>
            </div>
          </div>

          {zipName && (
            <button
              type="button"
              onClick={() => {
                if (queueState === 'running') {
                  if (
                    !confirm(
                      'Batch job is currently running. Stop queue and reset?'
                    )
                  )
                    return;
                  handleStopQueue();
                }
                setZipName(null);
                setQueue([]);
                setQueueState('idle');
              }}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-600 flex items-center gap-1.5 transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-slate-400" />
              <span>Clear ZIP Archive</span>
            </button>
          )}
        </div>

        {/* Zip Error Alert Banner */}
        {zipError && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center justify-between gap-3 font-medium">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{zipError}</span>
            </div>
            <button
              type="button"
              onClick={() => setZipError(null)}
              className="text-rose-600 hover:text-rose-900 font-bold px-2 py-0.5 text-xs cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ZIP File Upload Zone */}
        {!zipName ? (
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => zipInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
              dragActive
                ? 'border-indigo-600 bg-indigo-50/50'
                : 'border-slate-200 hover:border-indigo-400 hover:bg-slate-50/50'
            }`}
          >
            <input
              ref={zipInputRef}
              type="file"
              multiple
              className="hidden"
              accept=".zip,.pdf,.docx,.doc,.txt,.md,.csv,.json,.html,.xml,.xlsx,.xls,.png,.jpg,.jpeg,.webp"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFilesSelected(e.target.files);
                }
              }}
            />

            <div className="p-4 rounded-full bg-indigo-50 text-indigo-600 mb-3 border border-indigo-100/80">
              <UploadCloud className="w-8 h-8 text-indigo-600" />
            </div>
            <h4 className="text-sm font-bold text-slate-800">
              Upload ZIP Document Collection
            </h4>
            <p className="text-xs text-slate-500 mt-1 max-w-md leading-relaxed">
              Drag & drop a <code className="font-mono text-indigo-600 font-bold">.zip</code> archive here or click to browse files. Accepts PDF, DOCX, HTML, TXT, CSV, JSON, PNG, JPG, and MD.
            </p>
            <div className="mt-3.5 flex items-center justify-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 font-mono text-[11px] border border-amber-200/80 font-bold">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                Max Size: 10 MB
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-600 font-mono text-[11px]">
                <Sparkles className="w-3 h-3 text-indigo-500" />
                Fault-Tolerant Queue & Resilient Fallback
              </span>
            </div>
          </div>
        ) : (
          /* Active Archive Info Header */
          <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="p-2 rounded-lg bg-indigo-600 text-white font-mono text-xs font-bold shrink-0">
                ZIP
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900 truncate">
                  {zipName}
                </p>
                <p className="text-xs text-slate-500 flex items-center gap-1.5 sm:gap-2 flex-wrap mt-0.5">
                  <span>{totalCount} total files extracted</span>
                  <span>•</span>
                  <span className="text-emerald-600 font-semibold">
                    {successCount} converted
                  </span>
                  {errorCount > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-rose-600 font-semibold">
                        {errorCount} errors
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Batch Controls Toolbar */}
            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto justify-end">
              {queueState === 'idle' && (
                <button
                  type="button"
                  onClick={() => startProcessingQueue()}
                  disabled={totalCount === 0}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs disabled:bg-slate-300"
                >
                  <Play className="w-3.5 h-3.5 shrink-0" />
                  <span>Start Batch Queue</span>
                </button>
              )}

              {queueState === 'running' && (
                <>
                  <button
                    type="button"
                    onClick={handlePauseQueue}
                    className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                  >
                    <Pause className="w-3.5 h-3.5 shrink-0" />
                    <span>Pause Queue</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleStopQueue}
                    className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                  >
                    <Square className="w-3.5 h-3.5 shrink-0" />
                    <span>Cancel Job</span>
                  </button>
                </>
              )}

              {queueState === 'paused' && (
                <>
                  <button
                    type="button"
                    onClick={handleResumeQueue}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                  >
                    <Play className="w-3.5 h-3.5 shrink-0" />
                    <span>Resume Queue</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleStopQueue}
                    className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                  >
                    <Square className="w-3.5 h-3.5 shrink-0" />
                    <span>Stop Queue</span>
                  </button>
                </>
              )}

              {(queueState === 'completed' || queueState === 'stopped') && (
                <>
                  {errorCount > 0 && (
                    <button
                      type="button"
                      onClick={handleRetryFailed}
                      className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                    >
                      <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                      <span>Retry Failed ({errorCount})</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => startProcessingQueue(undefined, true)}
                    className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                  >
                    <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                    <span>Restart Entire Batch</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Progress Monitor Bar */}
      {queue.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 text-white shadow-sm flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold flex items-center gap-1.5 text-slate-200">
                <Database className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>Batch Progress Monitor:</span>
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-indigo-300 border border-slate-700">
                {queueState.toUpperCase()}
              </span>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 font-mono text-slate-300 flex-wrap text-[11px] sm:text-xs">
              <span>
                Processed: <strong>{processedCount}</strong> / {totalCount}
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-emerald-400">Success: {successCount}</span>
              {errorCount > 0 && (
                <>
                  <span className="text-slate-600">•</span>
                  <span className="text-rose-400">Errors: {errorCount}</span>
                </>
              )}
              <span className="text-slate-600">•</span>
              <span className="font-bold text-indigo-400">
                {overallProgressPercent}%
              </span>
            </div>
          </div>

          {/* Progress Bar Container */}
          <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden border border-slate-700 relative">
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                queueState === 'running'
                  ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-400 animate-pulse'
                  : queueState === 'completed'
                  ? 'bg-emerald-500'
                  : queueState === 'paused'
                  ? 'bg-amber-500'
                  : 'bg-indigo-600'
              }`}
              style={{ width: `${overallProgressPercent}%` }}
            />
          </div>

          {/* Currently Processing Status Details */}
          {currentlyProcessingId && (
            <div className="flex items-center gap-2 text-xs text-indigo-300 font-mono pt-1">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400 shrink-0" />
              <span className="truncate">
                Processing:{' '}
                <strong>
                  {
                    queue.find((q) => q.id === currentlyProcessingId)?.filename
                  }
                </strong>
                {' — '}
                <span className="text-slate-300">
                  {
                    queue.find((q) => q.id === currentlyProcessingId)
                      ?.statusMessage
                  }
                </span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Searchable Knowledge-Base Section */}
      {queue.length > 0 && (
        <div className="bg-white border border-slate-200/80 rounded-xl p-6 shadow-2xs flex flex-col gap-5">
          {/* Header & Batch Export Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-600" />
                OKF Searchable Knowledge Base
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Indexed OKF v1.0 knowledge documents extracted from the ZIP package.
              </p>
            </div>

            {/* Batch Export Buttons */}
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <button
                type="button"
                onClick={handleExportKnowledgeIndexJSON}
                disabled={successCount === 0}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:bg-slate-200 disabled:text-slate-400"
              >
                <Download className="w-3.5 h-3.5 text-indigo-400" />
                <span>Export Index JSON</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadAllOKFZip}
                disabled={successCount === 0 || isExportingBundle}
                className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs disabled:bg-slate-300"
                title="Export official OKF v0.2 Knowledge Base Bundle (.zip) with concept folders, directory manifest, and graph metadata."
              >
                {isExportingBundle ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Archive className="w-3.5 h-3.5" />
                )}
                <span>{isExportingBundle ? (exportProgressText || 'Packaging Bundle...') : 'Export OKF Knowledge Base (.zip)'}</span>
              </button>
            </div>
          </div>

          {/* Search Bar & Filters */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row items-stretch gap-2">
              {/* Search input */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search knowledge documents by title, tags, description, entities, or content..."
                  className="w-full pl-9 pr-8 py-2 rounded-lg border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2.5 text-xs text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Status Filter buttons */}
              <div className="flex items-center bg-slate-100 p-1 rounded-lg text-xs shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedStatusFilter('all')}
                  className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
                    selectedStatusFilter === 'all'
                      ? 'bg-white text-slate-900 font-bold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({queue.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedStatusFilter('success')}
                  className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
                    selectedStatusFilter === 'success'
                      ? 'bg-white text-emerald-700 font-bold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Succeeded ({successCount})
                </button>
                {errorCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedStatusFilter('error')}
                    className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
                      selectedStatusFilter === 'error'
                        ? 'bg-white text-rose-700 font-bold shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Errors ({errorCount})
                  </button>
                )}
              </div>
            </div>

            {/* Sub-Filters: Type and Tag pills */}
            <div className="flex items-center justify-between flex-wrap gap-2 text-xs pt-1 border-t border-slate-100">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-slate-400 font-medium text-[11px] flex items-center gap-1">
                  <Filter className="w-3 h-3" />
                  Format:
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedTypeFilter('all')}
                  className={`px-2 py-0.5 rounded text-[11px] transition cursor-pointer ${
                    selectedTypeFilter === 'all'
                      ? 'bg-indigo-600 text-white font-bold'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  All
                </button>
                {allUniqueTypes.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSelectedTypeFilter(t)}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono transition cursor-pointer ${
                      selectedTypeFilter === t
                        ? 'bg-indigo-600 text-white font-bold'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    .{t.toLowerCase()}
                  </button>
                ))}
              </div>

              {allUniqueTags.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-slate-400 font-medium text-[11px] flex items-center gap-1">
                    <Tag className="w-3 h-3" />
                    Tag:
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedTagFilter('all')}
                    className={`px-2 py-0.5 rounded text-[11px] transition cursor-pointer ${
                      selectedTagFilter === 'all'
                        ? 'bg-indigo-600 text-white font-bold'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    All
                  </button>
                  {allUniqueTags.slice(0, 8).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setSelectedTagFilter(tag)}
                      className={`px-2 py-0.5 rounded text-[11px] transition cursor-pointer ${
                        selectedTagFilter === tag
                          ? 'bg-indigo-600 text-white font-bold'
                          : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700'
                      }`}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Document List Matrix */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs text-slate-500 px-1">
              <span>
                Showing <strong>{filteredQueue.length}</strong> of{' '}
                {queue.length} documents
              </span>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedStatusFilter('all');
                    setSelectedTagFilter('all');
                    setSelectedTypeFilter('all');
                  }}
                  className="text-indigo-600 hover:underline cursor-pointer"
                >
                  Clear search filters
                </button>
              )}
            </div>

            {filteredQueue.length === 0 ? (
              <div className="p-8 border border-dashed border-slate-200 rounded-xl text-center flex flex-col items-center justify-center gap-2 text-slate-400">
                <Search className="w-8 h-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-600">
                  No matching documents found
                </p>
                <p className="text-xs text-slate-400">
                  Try adjusting your search query or filter chips above.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredQueue.map((item) => (
                  <div
                    key={item.id}
                    className={`p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                      item.status === 'success'
                        ? 'bg-white border-slate-200/90 hover:border-indigo-300 hover:shadow-xs'
                        : item.status === 'error'
                        ? 'bg-rose-50/40 border-rose-200'
                        : item.status === 'converting_markdown' ||
                          item.status === 'formatting_okf'
                        ? 'bg-indigo-50/40 border-indigo-200'
                        : 'bg-slate-50/50 border-slate-200'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        {/* File extension badge */}
                        <div className="px-2 py-1 rounded bg-slate-900 text-white font-mono text-[10px] uppercase font-bold shrink-0 mt-0.5">
                          {item.extension}
                        </div>

                        <div className="min-w-0">
                          <h4
                            className="text-xs font-bold text-slate-900 truncate"
                            title={item.okfDoc?.metadata.title || item.filename}
                          >
                            {item.okfDoc?.metadata.title || item.filename}
                          </h4>
                          <p className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
                            {item.path} ({formatBytes(item.size)})
                          </p>
                        </div>
                      </div>

                      {/* Status indicator */}
                      <div className="shrink-0">
                        {item.status === 'success' && (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>OKF Ready</span>
                          </span>
                        )}
                        {item.status === 'error' && (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            <AlertCircle className="w-3 h-3 text-rose-600" />
                            <span>Failed</span>
                          </span>
                        )}
                        {(item.status === 'converting_markdown' ||
                          item.status === 'formatting_okf') && (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 animate-pulse">
                            <RefreshCw className="w-3 h-3 animate-spin text-indigo-600" />
                            <span>Processing...</span>
                          </span>
                        )}
                        {item.status === 'pending' && (
                          <span className="flex items-center gap-1 text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>Queued</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Summary / Error message */}
                    {item.status === 'error' ? (
                      <div className="p-2.5 bg-rose-100/60 text-rose-900 text-[11px] rounded font-mono border border-rose-200">
                        ⚠️ {item.error}
                      </div>
                    ) : item.okfDoc ? (
                      <div className="flex flex-col gap-2">
                        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                          {item.okfDoc.metadata.description}
                        </p>

                        {/* Tags */}
                        {item.okfDoc.metadata.tags.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap">
                            {item.okfDoc.metadata.tags.map((tag) => (
                              <span
                                key={tag}
                                className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-medium"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Entities */}
                        {item.okfDoc.entities.length > 0 && (
                          <div className="text-[10px] text-slate-400 flex items-center gap-1 truncate font-mono">
                            <span className="text-slate-500 font-sans">
                              Graph Entities:
                            </span>
                            <span className="text-slate-700 truncate">
                              {item.okfDoc.entities.slice(0, 4).join(', ')}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : null}

                    {/* Card Actions Footer */}
                    <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
                      <span className="text-[10px] font-mono text-slate-400">
                        {item.okfDoc
                          ? `${item.okfDoc.blocks.length} OKF blocks`
                          : item.convertedAt || '—'}
                      </span>

                      <div className="flex items-center gap-1.5">
                        {item.status === 'error' && (
                          <button
                            type="button"
                            onClick={() => handleRetrySingle(item.id)}
                            className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-medium flex items-center gap-1 transition cursor-pointer"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Retry</span>
                          </button>
                        )}

                        {item.okfDoc && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                copyDocOKF(item.id, item.okfDoc!.rawOKF)
                              }
                              className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition cursor-pointer"
                            >
                              {copiedId === item.id ? (
                                <span className="text-emerald-600 font-bold">
                                  Copied
                                </span>
                              ) : (
                                <span>Copy OKF</span>
                              )}
                            </button>

                            {onSelectDocumentForView && (
                              <button
                                type="button"
                                onClick={() =>
                                  onSelectDocumentForView(
                                    item.okfDoc!.rawOKF,
                                    item.filename
                                  )
                                }
                                className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold flex items-center gap-1 transition cursor-pointer shadow-2xs"
                              >
                                <Eye className="w-3 h-3" />
                                <span>Inspect in Explorer</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
