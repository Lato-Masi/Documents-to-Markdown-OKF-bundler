import React, { useState } from 'react';
import {
  Database,
  Layers,
  Code,
  Table as TableIcon,
  Link as LinkIcon,
  Copy,
  Check,
  Download,
  Terminal,
  Cpu,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Info
} from 'lucide-react';
import { chunkMarkdownForVectorDB, VectorChunkPayload } from '../lib/metaAst';

interface VectorPrepModalProps {
  isOpen: boolean;
  onClose: () => void;
  markdownContent: string;
  documentTitle?: string;
}

export default function VectorPrepModal({
  isOpen,
  onClose,
  markdownContent,
  documentTitle = 'Current Document',
}: VectorPrepModalProps) {
  const [maxTokens, setMaxTokens] = useState<number>(600);
  const [minFlushTokens, setMinFlushTokens] = useState<number>(150);
  const [activeChunkIndex, setActiveChunkIndex] = useState<number>(0);
  const [viewFormat, setViewFormat] = useState<'embedding' | 'markdown' | 'metadata' | 'full_json'>('embedding');
  const [targetDb, setTargetDb] = useState<'pinecone' | 'qdrant' | 'pgvector' | 'chroma'>('pinecone');
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen) return null;

  const chunks: VectorChunkPayload[] = chunkMarkdownForVectorDB(markdownContent, {
    maxTokensPerChunk: maxTokens,
    minHeadingFlushTokens: minFlushTokens,
    defaultDocumentTitle: documentTitle,
  });

  const activeChunk = chunks[activeChunkIndex] || chunks[0];

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadJson = () => {
    const jsonStr = JSON.stringify(chunks, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${documentTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_vector_payloads.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Generate target DB specific upsert snippet
  const getDbUpsertSnippet = () => {
    if (!activeChunk) return '';
    if (targetDb === 'pinecone') {
      return `// Pinecone Node.js / TypeScript Upsert
await index.namespace('docs').upsert([
  {
    id: "${activeChunk.id}",
    values: await getEmbeddings("${activeChunk.embeddingText.replace(/\n/g, '\\n').slice(0, 80)}..."),
    metadata: ${JSON.stringify(
      {
        text: activeChunk.markdownContent,
        ...activeChunk.metadata,
      },
      null,
      2
    )}
  }
]);`;
    } else if (targetDb === 'qdrant') {
      return `// Qdrant Node.js Upsert
await qdrantClient.upsert('documentation_collection', {
  points: [
    {
      id: "${activeChunk.id}",
      vector: await getEmbeddings(chunk.embeddingText),
      payload: ${JSON.stringify(
        {
          markdown: activeChunk.markdownContent,
          ...activeChunk.metadata,
        },
        null,
        2
      )}
    }
  ]
});`;
    } else if (targetDb === 'pgvector') {
      return `-- PostgreSQL / pgvector Insert
INSERT INTO document_embeddings (
  chunk_id,
  embedding_text,
  markdown_content,
  embedding,
  metadata
) VALUES (
  '${activeChunk.id}',
  $1, -- Enriched text with breadcrumbs
  $2, -- Raw markdown for LLM
  $3::vector,
  '${JSON.stringify(activeChunk.metadata)}'::jsonb
);`;
    } else {
      return `// ChromaDB Add
await collection.add({
  ids: ["${activeChunk.id}"],
  embeddings: [await getEmbeddings("${activeChunk.embeddingText.slice(0, 60)}...")],
  metadatas: [${JSON.stringify(activeChunk.metadata, null, 2)}],
  documents: [${JSON.stringify(activeChunk.markdownContent)}]
});`;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700/80 rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-zinc-100">MetaAST Vector DB Chunk Preparer</h2>
                <span className="px-2 py-0.5 text-[10px] uppercase font-mono bg-emerald-950 text-emerald-300 border border-emerald-800 rounded-full">
                  Zero Dependency
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                AST-aware rule enforcement: Breadcrumb injection, table row slicing & code block atomicity
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadJson}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 border border-zinc-700 transition"
              title="Download all chunk payloads as JSON"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Payloads</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-sm transition"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Top Control Bar: Token Budget Sliders & Stats */}
        <div className="px-6 py-3 bg-zinc-950/60 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-4 text-xs shrink-0">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-zinc-400 font-medium">Max Tokens/Chunk:</span>
              <input
                type="range"
                min="200"
                max="1500"
                step="50"
                value={maxTokens}
                onChange={(e) => setMaxTokens(Number(e.target.value))}
                className="w-24 sm:w-32 accent-emerald-500"
              />
              <span className="font-mono text-emerald-400 font-bold">{maxTokens}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-zinc-400 font-medium">Flush on H1/H2 min tokens:</span>
              <input
                type="range"
                min="50"
                max="400"
                step="25"
                value={minFlushTokens}
                onChange={(e) => setMinFlushTokens(Number(e.target.value))}
                className="w-20 sm:w-28 accent-emerald-500"
              />
              <span className="font-mono text-emerald-400 font-bold">{minFlushTokens}</span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-zinc-300 font-mono text-[11px]">
            <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
              Total Chunks: <strong className="text-emerald-400">{chunks.length}</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
              Doc Length: <strong className="text-zinc-100">{markdownContent.length.toLocaleString()} chars</strong>
            </span>
          </div>
        </div>

        {/* Modal Main Body: 2 Columns (Chunk Explorer & Inspector) */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden min-h-0">
          {/* Left Column: Chunk List */}
          <div className="md:col-span-4 border-r border-zinc-800 flex flex-col bg-zinc-950/40 overflow-hidden">
            <div className="p-3 border-b border-zinc-800/80 bg-zinc-900/50 flex items-center justify-between text-xs font-semibold text-zinc-400">
              <span>GENERATED CHUNKS</span>
              <span className="text-[10px] font-mono text-zinc-500">AST Hierarchy</span>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 no-scrollbar">
              {chunks.map((chunk, idx) => {
                const isSelected = idx === activeChunkIndex;
                return (
                  <button
                    key={chunk.id}
                    onClick={() => setActiveChunkIndex(idx)}
                    className={`w-full text-left p-2.5 rounded-xl border transition flex flex-col gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-950/40 border-emerald-600/60 text-zinc-100 shadow-sm'
                        : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-mono text-xs font-bold text-emerald-400">
                        #{idx + 1} • {chunk.id}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400 bg-zinc-800/80 px-1.5 py-0.5 rounded">
                        ~{chunk.metadata.estimatedTokens} tokens
                      </span>
                    </div>

                    <div className="text-xs font-medium text-zinc-200 line-clamp-1 flex items-center gap-1">
                      <ChevronRight className="w-3 h-3 text-emerald-400 shrink-0" />
                      <span>{chunk.metadata.breadcrumb || chunk.metadata.documentTitle}</span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                      {chunk.metadata.hasCodeBlock && (
                        <span className="px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 flex items-center gap-1">
                          <Code className="w-2.5 h-2.5" />
                          <span>{chunk.metadata.codeLanguages.join(',') || 'code'}</span>
                        </span>
                      )}
                      {chunk.metadata.hasTable && (
                        <span className="px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800 flex items-center gap-1">
                          <TableIcon className="w-2.5 h-2.5" />
                          <span>table</span>
                        </span>
                      )}
                      {chunk.metadata.outgoingLinks.length > 0 && (
                        <span className="px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 flex items-center gap-1">
                          <LinkIcon className="w-2.5 h-2.5" />
                          <span>{chunk.metadata.outgoingLinks.length} links</span>
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Chunk Inspector & DB Upsert Code */}
          <div className="md:col-span-8 flex flex-col bg-zinc-900/30 overflow-hidden">
            {/* View Selector Tabs */}
            <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-900/80 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                <button
                  onClick={() => setViewFormat('embedding')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                    viewFormat === 'embedding'
                      ? 'bg-zinc-800 text-emerald-400 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  title="Context-enriched text sent to the Vector Embedding model"
                >
                  Embedding Text (Enriched)
                </button>
                <button
                  onClick={() => setViewFormat('markdown')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                    viewFormat === 'markdown'
                      ? 'bg-zinc-800 text-emerald-400 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  title="Raw pristine Markdown payload returned to LLM on retrieval"
                >
                  Raw Markdown Payload
                </button>
                <button
                  onClick={() => setViewFormat('metadata')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                    viewFormat === 'metadata'
                      ? 'bg-zinc-800 text-emerald-400 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  title="Faceted metadata payload for hybrid search"
                >
                  Faceted Metadata
                </button>
                <button
                  onClick={() => setViewFormat('full_json')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                    viewFormat === 'full_json'
                      ? 'bg-zinc-800 text-emerald-400 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  title="Vector DB Upsert Code Snippet"
                >
                  DB Code Snippet
                </button>
              </div>

              {activeChunk && (
                <button
                  onClick={() => {
                    const textToCopy =
                      viewFormat === 'embedding'
                        ? activeChunk.embeddingText
                        : viewFormat === 'markdown'
                        ? activeChunk.markdownContent
                        : viewFormat === 'metadata'
                        ? JSON.stringify(activeChunk.metadata, null, 2)
                        : getDbUpsertSnippet();
                    handleCopy(textToCopy);
                  }}
                  className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium flex items-center gap-1.5 border border-zinc-700 transition"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
              )}
            </div>

            {/* Chunk Content View Area */}
            <div className="flex-1 p-4 overflow-y-auto">
              {activeChunk ? (
                viewFormat === 'embedding' ? (
                  <div className="space-y-3 font-mono text-xs">
                    <div className="p-3 bg-emerald-950/20 border border-emerald-800/40 rounded-xl text-emerald-300">
                      <div className="flex items-center gap-2 font-bold mb-1">
                        <Sparkles className="w-4 h-4 text-emerald-400" />
                        <span>Vector Embedding Model Input</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 font-sans">
                        Notice how the AST has automatically injected the hierarchical breadcrumb header above the
                        content. When passed to models like `text-embedding-004`, this guarantees semantic indexing
                        retains the exact structural ancestry without ambiguity.
                      </p>
                    </div>
                    <pre className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-200 whitespace-pre-wrap leading-relaxed">
                      {activeChunk.embeddingText}
                    </pre>
                  </div>
                ) : viewFormat === 'markdown' ? (
                  <div className="space-y-3 font-mono text-xs">
                    <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-300 text-[11px] font-sans">
                      Pristine raw markdown snippet stored in vector database payload. Returned directly to LLMs during
                      RAG synthesis.
                    </div>
                    <pre className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-200 whitespace-pre-wrap leading-relaxed">
                      {activeChunk.markdownContent}
                    </pre>
                  </div>
                ) : viewFormat === 'metadata' ? (
                  <div className="space-y-3 font-mono text-xs">
                    <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-300 text-[11px] font-sans">
                      Structured metadata attributes attached to this vector ID for faceted filtering (e.g.
                      `hasCodeBlock == true`, `breadcrumb contains 'Page'`).
                    </div>
                    <pre className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl text-emerald-300 whitespace-pre-wrap leading-relaxed">
                      {JSON.stringify(activeChunk.metadata, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div className="space-y-3 font-mono text-xs">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-zinc-400 font-sans text-xs">Target Vector DB:</span>
                      {(['pinecone', 'qdrant', 'pgvector', 'chroma'] as const).map((db) => (
                        <button
                          key={db}
                          onClick={() => setTargetDb(db)}
                          className={`px-2 py-0.5 rounded text-xs uppercase font-mono ${
                            targetDb === db
                              ? 'bg-emerald-600 text-white font-bold'
                              : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {db}
                        </button>
                      ))}
                    </div>
                    <pre className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-200 whitespace-pre-wrap leading-relaxed">
                      {getDbUpsertSnippet()}
                    </pre>
                  </div>
                )
              ) : (
                <div className="h-full flex items-center justify-center text-zinc-500 text-xs">
                  No chunk selected or document is empty.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
