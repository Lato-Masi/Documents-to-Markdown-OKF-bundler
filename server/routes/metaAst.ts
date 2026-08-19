import { Router } from "express";
import {
  parseMarkdownToAST,
  enrichMetaAST,
  chunkMarkdownForVectorDB,
  VectorChunkOptions,
} from "../../src/lib/metaAst";

const router = Router();

/**
 * POST /api/meta-ast/parse
 * Lexes and parses raw Markdown into the MetaAST block tree with context enrichment.
 */
router.post("/meta-ast/parse", (req, res) => {
  try {
    const { markdown, documentTitle } = req.body;
    if (!markdown || typeof markdown !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'markdown' string in request body." });
    }

    const rawNodes = parseMarkdownToAST(markdown);
    const enrichedNodes = enrichMetaAST(rawNodes, {
      defaultDocumentTitle: documentTitle || "Document",
    });

    let totalTokens = 0;
    const typeDistribution: Record<string, number> = {};
    for (const node of enrichedNodes) {
      totalTokens += node.context.estimatedTokens || 0;
      typeDistribution[node.type] = (typeDistribution[node.type] || 0) + 1;
    }

    res.json({
      success: true,
      documentTitle: documentTitle || "Document",
      totalNodes: enrichedNodes.length,
      estimatedTokens: totalTokens,
      typeDistribution,
      nodes: enrichedNodes,
    });
  } catch (error: any) {
    console.error("MetaAST Parse API Error:", error);
    res.status(500).json({ error: error.message || "Failed to parse Markdown to MetaAST." });
  }
});

/**
 * POST /api/meta-ast/vector-prep
 * Chunks Markdown using MetaAST rules for Vector DB indexing (Pinecone, Qdrant, pgvector, ChromaDB).
 */
router.post("/meta-ast/vector-prep", (req, res) => {
  try {
    const { markdown, options } = req.body;
    if (!markdown || typeof markdown !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'markdown' string in request body." });
    }

    const chunkOptions: VectorChunkOptions = {
      maxTokensPerChunk: options?.maxTokensPerChunk ?? 512,
      minHeadingFlushTokens: options?.minHeadingFlushTokens ?? 150,
      defaultDocumentTitle: options?.defaultDocumentTitle || options?.documentTitle || "Knowledge Document",
      extraMetadata: options?.extraMetadata || options?.customMetadata,
    };

    const chunks = chunkMarkdownForVectorDB(markdown, chunkOptions);

    let totalTokens = 0;
    const chunkTypeCounts: Record<string, number> = {};
    for (const chunk of chunks) {
      totalTokens += chunk.metadata.estimatedTokens || 0;
      chunkTypeCounts[chunk.metadata.chunkType] =
        (chunkTypeCounts[chunk.metadata.chunkType] || 0) + 1;
    }

    res.json({
      success: true,
      documentTitle: chunkOptions.defaultDocumentTitle,
      totalChunks: chunks.length,
      totalEstimatedTokens: totalTokens,
      chunkTypeDistribution: chunkTypeCounts,
      options: chunkOptions,
      chunks,
    });
  } catch (error: any) {
    console.error("MetaAST Vector Prep API Error:", error);
    res.status(500).json({ error: error.message || "Failed to chunk Markdown for Vector DB." });
  }
});

export default router;
