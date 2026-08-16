export interface HistoryItem {
  id: string;
  fileName: string;
  fileSize: number;
  timestamp: string;
  markdownContent: string;
  wordCount?: number;
  sourceType?: "file" | "url" | "manual";
  sourceUrl?: string;
}

export type ConversionMode = "standard" | "rich" | "text-only";
export type TargetStyle = "standard" | "gfm" | "academic";
export type ViewMode = "single" | "multi_doc" | "batch_zip";
export type SourceType = "file" | "url";
export type TabType = "preview" | "raw" | "ast" | "okf" | "skills" | "spatial" | "stats";
export type ConversionPhase = "idle" | "converting" | "converted" | "analyzing" | "analyzed";
export type AnalysisStatus = "idle" | "analyzing" | "completed" | "error";

export interface SpatialWord {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SpatialTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName?: string;
  fontSize?: number;
  rotation?: number;
  words?: SpatialWord[];
}

export interface SpatialPage {
  pageNum: number;
  width: number;
  height: number;
  contentBounds?: { x: number; y: number; width: number; height: number };
  text: string;
  markdown?: string;
  textItems: SpatialTextItem[];
  detectedColumns: number;
  densityScore: number;
}

export interface SpatialQualityMetrics {
  qualityScore: number; // 0 - 100
  isSatisfactory: boolean;
  threshold: number;
  decision: "FAST_LOCAL_DETERMINISTIC" | "ESCALATED_TO_GEMINI_MULTIMODAL";
  wordCount: number;
  avgWordsPerPage: number;
  garbledGlyphRatio: number;
  lexicalWordRatio: number;
  detectedColumns: number;
  mathSymbolCount: number;
  tableMarkerCount: number;
  reasons: string[];
}

export interface SpatialDocumentResult {
  success: boolean;
  totalPages: number;
  pages: SpatialPage[];
  markdown: string;
  rawText: string;
  quality: SpatialQualityMetrics;
  executionTimeMs: number;
  error?: string;
}

export interface BatchItem {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  status: "pending" | "processing" | "success" | "error";
  markdown?: string;
  errorMsg?: string;
  base64Data: string;
}
