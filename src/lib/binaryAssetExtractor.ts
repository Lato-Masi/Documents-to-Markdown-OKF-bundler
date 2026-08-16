/**
 * @file src/lib/binaryAssetExtractor.ts
 * @description Automated extractor for embedded base64/binary image data, diagrams,
 * and heavy executable code scripts from PDF-converted Markdown.
 * Decouples bloated binary payloads into referenced files in assets/ and scripts/.
 */

export interface ExtractedAsset {
  id: string;
  filename: string;
  relativePath: string;
  mimeType: string;
  extension: string;
  dataBase64?: string;
  dataUtf8?: string;
  isBinary: boolean;
  sizeBytes: number;
  altText: string;
  tokenSavingsEstimate: number;
}

export interface ExtractedScriptAsset {
  id: string;
  filename: string;
  relativePath: string;
  language: string;
  content: string;
  description: string;
  lineCount: number;
  sizeBytes: number;
}

export interface DecoupledMarkdownResult {
  cleanedMarkdown: string;
  assets: ExtractedAsset[];
  scripts: ExtractedScriptAsset[];
  totalBytesExtracted: number;
  totalTokensSaved: number;
}

// Regex to capture Markdown image tags containing base64 data URIs:
// e.g. ![Architecture Diagram](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...)
const BASE64_MD_IMAGE_REGEX = /!\[([^\]]*)\]\(data:image\/([a-zA-Z0-9+\.-]+);base64,([A-Za-z0-9+/=]+)\)/g;

// Regex to capture HTML <img> tags with base64 data URIs:
// e.g. <img src="data:image/png;base64,..." alt="..." />
const BASE64_HTML_IMG_REGEX = /<img\s+[^>]*?src=["']data:image\/([a-zA-Z0-9+\.-]+);base64,([A-Za-z0-9+/=]+)["'][^>]*?(?:alt=["']([^"']*)["'])?[^>]*?\/?>/gi;

// Regex to capture standalone data URI image strings (common in PDF-to-MD artifacts):
const STANDALONE_DATA_URI_REGEX = /(?:^|\n)(data:image\/([a-zA-Z0-9+\.-]+);base64,([A-Za-z0-9+/=]{100,}))(?:\n|$)/g;

/**
 * Deterministic hash-based filename generator or index-based identifier.
 */
function sanitizeDocSlug(prefix: string): string {
  return prefix.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'asset';
}

function resolveImageExtension(subType: string): string {
  const clean = subType.toLowerCase().replace('svg+xml', 'svg').replace('jpeg', 'jpg');
  if (['png', 'jpg', 'webp', 'gif', 'svg', 'bmp', 'ico'].includes(clean)) {
    return clean;
  }
  return 'png';
}

/**
 * Decouples base64 images and embedded binary data from Markdown content,
 * replacing them with clean relative asset references (assets/<filename>.<ext>).
 */
export function decoupleBinaryAssets(
  markdown: string,
  docSlug: string = 'doc'
): { cleanedMarkdown: string; assets: ExtractedAsset[]; totalBytesExtracted: number; totalTokensSaved: number } {
  const assets: ExtractedAsset[] = [];
  let totalBytesExtracted = 0;
  let totalTokensSaved = 0;
  const slug = sanitizeDocSlug(docSlug);
  let assetIndex = 1;

  // 1. Process Markdown image tags ![alt](data:image/...;base64,...)
  let cleaned = markdown.replace(BASE64_MD_IMAGE_REGEX, (match, altText, subType, base64Data) => {
    const ext = resolveImageExtension(subType);
    const filename = `${slug}-fig-${String(assetIndex).padStart(2, '0')}.${ext}`;
    const relativePath = `assets/${filename}`;
    const sizeBytes = Math.floor((base64Data.length * 3) / 4);
    const tokensSaved = Math.ceil(match.length / 4);

    totalBytesExtracted += sizeBytes;
    totalTokensSaved += tokensSaved;

    const alt = altText ? altText.trim() : `Figure ${assetIndex} (${ext.toUpperCase()})`;

    assets.push({
      id: `asset-${assetIndex}`,
      filename,
      relativePath,
      mimeType: `image/${subType}`,
      extension: ext,
      dataBase64: base64Data,
      isBinary: true,
      sizeBytes,
      altText: alt,
      tokenSavingsEstimate: tokensSaved,
    });

    assetIndex++;
    return `![${alt}](${relativePath})`;
  });

  // 2. Process HTML <img> tags with data URIs
  cleaned = cleaned.replace(BASE64_HTML_IMG_REGEX, (match, subType, base64Data, altAttr) => {
    const ext = resolveImageExtension(subType);
    const filename = `${slug}-fig-${String(assetIndex).padStart(2, '0')}.${ext}`;
    const relativePath = `assets/${filename}`;
    const sizeBytes = Math.floor((base64Data.length * 3) / 4);
    const tokensSaved = Math.ceil(match.length / 4);

    totalBytesExtracted += sizeBytes;
    totalTokensSaved += tokensSaved;

    const alt = altAttr ? altAttr.trim() : `Figure ${assetIndex} (${ext.toUpperCase()})`;

    assets.push({
      id: `asset-${assetIndex}`,
      filename,
      relativePath,
      mimeType: `image/${subType}`,
      extension: ext,
      dataBase64: base64Data,
      isBinary: true,
      sizeBytes,
      altText: alt,
      tokenSavingsEstimate: tokensSaved,
    });

    assetIndex++;
    return `![${alt}](${relativePath})`;
  });

  // 3. Process raw standalone data URIs (dangling PDF OCR artifacts)
  cleaned = cleaned.replace(STANDALONE_DATA_URI_REGEX, (match, fullUri, subType, base64Data) => {
    const ext = resolveImageExtension(subType);
    const filename = `${slug}-fig-${String(assetIndex).padStart(2, '0')}.${ext}`;
    const relativePath = `assets/${filename}`;
    const sizeBytes = Math.floor((base64Data.length * 3) / 4);
    const tokensSaved = Math.ceil(fullUri.length / 4);

    totalBytesExtracted += sizeBytes;
    totalTokensSaved += tokensSaved;

    const alt = `Embedded Asset ${assetIndex}`;

    assets.push({
      id: `asset-${assetIndex}`,
      filename,
      relativePath,
      mimeType: `image/${subType}`,
      extension: ext,
      dataBase64: base64Data,
      isBinary: true,
      sizeBytes,
      altText: alt,
      tokenSavingsEstimate: tokensSaved,
    });

    assetIndex++;
    return `\n\n![${alt}](${relativePath})\n\n`;
  });

  return {
    cleanedMarkdown: cleaned,
    assets,
    totalBytesExtracted,
    totalTokensSaved,
  };
}

/**
 * Extracts substantive, executable scripts (> 8 lines or with shebangs/SQL/Python)
 * from Markdown code fences into externalized script files in scripts/.
 */
export function decoupleExecutableScripts(
  markdown: string,
  docSlug: string = 'doc'
): { cleanedMarkdown: string; scripts: ExtractedScriptAsset[] } {
  const scripts: ExtractedScriptAsset[] = [];
  const slug = sanitizeDocSlug(docSlug);
  let scriptIndex = 1;

  // Regex to capture fenced code blocks: ```lang ... ```
  const CODE_BLOCK_REGEX = /```(bash|sh|shell|python|py|sql|powershell|ps1|javascript|js|typescript|ts|ruby|rb)\n([\s\S]*?)```/g;

  const cleanedMarkdown = markdown.replace(CODE_BLOCK_REGEX, (match, lang, codeBody) => {
    const trimmed = codeBody.trim();
    const lines = trimmed.split('\n');
    const hasShebang = lines[0]?.startsWith('#!');
    const isSubstantive = lines.length >= 8 || hasShebang || (lines.length >= 5 && lang === 'sql');

    // Only extract if it represents an actual executable script/procedure,
    // not trivial 1-2 line CLI commands
    if (!isSubstantive) {
      return match;
    }

    let ext = 'sh';
    if (['python', 'py'].includes(lang)) ext = 'py';
    else if (lang === 'sql') ext = 'sql';
    else if (['powershell', 'ps1'].includes(lang)) ext = 'ps1';
    else if (['javascript', 'js'].includes(lang)) ext = 'js';
    else if (['typescript', 'ts'].includes(lang)) ext = 'ts';
    else if (['ruby', 'rb'].includes(lang)) ext = 'rb';

    const filename = `${slug}-step-${String(scriptIndex).padStart(2, '0')}.${ext}`;
    const relativePath = `scripts/${filename}`;

    const descriptionMatch = trimmed.match(/^#\s*(.+)$/m);
    const description = descriptionMatch ? descriptionMatch[1] : `Executable procedure ${scriptIndex} (${lang})`;

    scripts.push({
      id: `script-${scriptIndex}`,
      filename,
      relativePath,
      language: lang,
      content: trimmed,
      description,
      lineCount: lines.length,
      sizeBytes: Buffer.byteLength(trimmed, 'utf-8'),
    });

    scriptIndex++;

    // Replace with lean invocation reference in Markdown
    return `\`\`\`${lang}\n# Execute external procedure: ${relativePath}\n./${relativePath}\n\`\`\`\n\n*Reference: [\`${filename}\`](${relativePath})*`;
  });

  return {
    cleanedMarkdown,
    scripts,
  };
}

/**
 * Full decoupling pipeline: extracts both binary images and executable scripts.
 */
export function extractBinaryAssetsAndScripts(
  markdown: string,
  docSlug: string = 'doc'
): DecoupledMarkdownResult {
  // Step 1: Extract all base64 and binary assets
  const assetResult = decoupleBinaryAssets(markdown, docSlug);

  // Step 2: Extract heavy executable scripts
  const scriptResult = decoupleExecutableScripts(assetResult.cleanedMarkdown, docSlug);

  return {
    cleanedMarkdown: scriptResult.cleanedMarkdown,
    assets: assetResult.assets,
    scripts: scriptResult.scripts,
    totalBytesExtracted: assetResult.totalBytesExtracted,
    totalTokensSaved: assetResult.totalTokensSaved,
  };
}
