/**
 * @file server/utils/urlValidator.ts
 * @description Centralized URL & HTML web page filtering helper.
 * Strictly ensures that web scraping, crawling, site discovery, and sitemap exploration
 * only target HTML websites and web documentation pages, strictly filtering out
 * PDF, Word docs, PowerPoint, Excel, archives, audio/video, binaries, and images.
 */

export const NON_HTML_EXTENSIONS = new Set([
  // Documents & eBooks
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
  ".epub",
  ".mobi",
  ".rtf",
  ".odt",
  ".ods",
  ".odp",
  // Archives & Binaries
  ".zip",
  ".tar",
  ".gz",
  ".tgz",
  ".bz2",
  ".xz",
  ".7z",
  ".rar",
  ".exe",
  ".dmg",
  ".pkg",
  ".deb",
  ".rpm",
  ".iso",
  ".apk",
  ".jar",
  ".bin",
  // Images
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".ico",
  ".bmp",
  ".tiff",
  ".avif",
  // Audio & Video
  ".mp3",
  ".mp4",
  ".wav",
  ".ogg",
  ".webm",
  ".mov",
  ".avi",
  ".mkv",
  ".flac",
  ".aac",
  // Fonts & Data dumps
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".otf",
  ".sql",
  ".db",
  ".sqlite",
]);

/**
 * Checks if a given URL points to a standard HTML web page rather than a binary / PDF / media file.
 */
export function isHtmlWebPageUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== "string") return false;

  try {
    const parsed = new URL(rawUrl);

    // Only allow HTTP/HTTPS web URLs
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    const pathname = parsed.pathname.toLowerCase();

    // Check against forbidden non-HTML file extensions
    for (const ext of NON_HTML_EXTENSIONS) {
      if (pathname.endsWith(ext) || pathname.includes(`${ext}/`)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Extracts all unique HTTP/HTTPS web links found inside a Markdown document.
 * Strictly filters out non-HTML links (PDFs, images, downloads).
 */
export function extractWebLinksFromMarkdown(markdownText: string): string[] {
  if (!markdownText) return [];

  const foundUrls = new Set<string>();

  // Match standard Markdown links: [text](https://example.com/page)
  const mdLinkRegex = /\[(?:[^\]]*)\]\((https?:\/\/[^\s\)]+)\)/gi;
  let match: RegExpExecArray | null;
  while ((match = mdLinkRegex.exec(markdownText)) !== null) {
    const url = match[1].trim();
    if (isHtmlWebPageUrl(url)) {
      foundUrls.add(url);
    }
  }

  // Match raw standalone URLs: https://example.com/page
  const rawUrlRegex = /(https?:\/\/[^\s<>"'{}|\\^`]+)/gi;
  while ((match = rawUrlRegex.exec(markdownText)) !== null) {
    let url = match[1].trim();
    // Strip trailing punctuation often caught in sentences
    url = url.replace(/[\.\,\;\:\)\!]+$/, "");
    if (isHtmlWebPageUrl(url)) {
      foundUrls.add(url);
    }
  }

  return Array.from(foundUrls);
}
