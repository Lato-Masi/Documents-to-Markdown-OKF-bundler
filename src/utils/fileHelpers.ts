export const DEFAULT_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

const EXTENSION_MIME_MAP: Record<string, string> = {
  // Documents & Presentations
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
  rtf: "application/rtf",
  odt: "application/vnd.oasis.opendocument.text",
  epub: "application/epub+zip",

  // Spreadsheets & Tabular Data
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  csv: "text/csv",
  tsv: "text/tab-separated-values",

  // Text, Markup & Structured Data
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  json: "application/json",
  jsonl: "application/jsonl",
  html: "text/html",
  htm: "text/html",
  xml: "application/xml",
  yaml: "application/yaml",
  yml: "application/yaml",

  // Images
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
};

export const SUPPORTED_DOCUMENT_EXTENSIONS = new Set<string>(Object.keys(EXTENSION_MIME_MAP));

const SUPPORTED_MIME_TYPES = new Set<string>([
  ...Object.values(EXTENSION_MIME_MAP),
  "text/xml",
  "text/yaml",
  "text/x-yaml",
  "application/x-yaml",
  "text/x-markdown",
]);

/**
 * Extracts a normalized lowercase file extension from a filename or path.
 * Returns "" for extensionless names (e.g. "README") or dotfiles without a secondary extension (e.g. ".env").
 */
export const getFileExtension = (fileName: string): string => {
  if (!fileName || typeof fileName !== "string") return "";
  const trimmed = fileName.trim();
  const baseName = trimmed.split(/[\\/]/).pop() || "";
  const lastDotIndex = baseName.lastIndexOf(".");
  if (lastDotIndex <= 0 || lastDotIndex === baseName.length - 1) {
    return "";
  }
  return baseName.slice(lastDotIndex + 1).toLowerCase();
};

/**
 * Formats byte counts into human-readable units (Bytes, KB, MB, GB, TB).
 */
export const formatBytes = (bytes: number, decimals = 2): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
};

/**
 * Resolves the canonical MIME type from an explicit detected MIME type or filename extension.
 * Automatically upgrades generic browser `application/octet-stream` values when the extension is known.
 */
export const getMimeTypeByExtension = (fileName: string, detectedType = ""): string => {
  const normalizedDetected = typeof detectedType === "string" ? detectedType.trim().toLowerCase() : "";
  if (normalizedDetected && normalizedDetected !== "application/octet-stream") {
    return normalizedDetected;
  }

  const ext = getFileExtension(fileName);
  if (ext && EXTENSION_MIME_MAP[ext]) {
    return EXTENSION_MIME_MAP[ext];
  }

  return normalizedDetected || "application/octet-stream";
};

/**
 * Checks whether a document or image format is supported by the conversion pipeline.
 */
export const isSupportedDocumentFormat = (fileName: string, detectedType = ""): boolean => {
  const ext = getFileExtension(fileName);
  if (ext && SUPPORTED_DOCUMENT_EXTENSIONS.has(ext)) {
    return true;
  }

  const resolvedMime = getMimeTypeByExtension(fileName, detectedType);
  return SUPPORTED_MIME_TYPES.has(resolvedMime);
};

export interface FileValidationResult {
  valid: boolean;
  mimeType: string;
  extension: string;
  error?: string;
}

/**
 * Validates file metadata (presence, non-zero byte size, maximum size limit, and supported format)
 * prior to reading or uploading document payloads.
 */
export const validateDocumentFile = (
  file: { name?: string; size?: number; type?: string } | null | undefined,
  options: { maxSizeBytes?: number } = {}
): FileValidationResult => {
  if (!file || typeof file.name !== "string" || !file.name.trim()) {
    return {
      valid: false,
      mimeType: "application/octet-stream",
      extension: "",
      error: "Invalid file: a non-empty file name is required.",
    };
  }

  const extension = getFileExtension(file.name);
  const mimeType = getMimeTypeByExtension(file.name, file.type || "");
  const size = typeof file.size === "number" ? file.size : NaN;
  const maxSizeBytes = options.maxSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;

  if (!Number.isFinite(size) || size <= 0) {
    return {
      valid: false,
      mimeType,
      extension,
      error: `"${file.name}" is empty (0 Bytes). Please select a non-empty document.`,
    };
  }

  if (size > maxSizeBytes) {
    return {
      valid: false,
      mimeType,
      extension,
      error: `"${file.name}" (${formatBytes(size)}) exceeds the maximum supported file size of ${formatBytes(maxSizeBytes)}.`,
    };
  }

  if (!isSupportedDocumentFormat(file.name, file.type || "")) {
    const extLabel = extension ? `.${extension}` : "unknown format";
    return {
      valid: false,
      mimeType,
      extension,
      error: `Unsupported file format (${extLabel}). Supported formats include PDF, DOCX, DOC, XLSX, XLS, PPTX, CSV, TXT, MD, HTML, JSON, XML, YAML, and Images.`,
    };
  }

  return {
    valid: true,
    mimeType,
    extension,
  };
};
