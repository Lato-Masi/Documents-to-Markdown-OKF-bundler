import { NON_HTML_EXTENSIONS } from "../../server/utils/urlValidator";

export function isHtmlWebPageUrlClient(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== "string") return false;

  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    const pathname = parsed.pathname.toLowerCase();
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
export function extractWebLinksFromMarkdownClient(markdownText: string): string[] {
  if (!markdownText) return [];

  const foundUrls = new Set<string>();

  // Match standard Markdown links: [text](https://example.com/page)
  const mdLinkRegex = /\[(?:[^\]]*)\]\((https?:\/\/[^\s\)]+)\)/gi;
  let match: RegExpExecArray | null;
  while ((match = mdLinkRegex.exec(markdownText)) !== null) {
    const url = match[1].trim();
    if (isHtmlWebPageUrlClient(url)) {
      foundUrls.add(url);
    }
  }

  // Match raw standalone URLs: https://example.com/page
  const rawUrlRegex = /(https?:\/\/[^\s<>"'{}|\\^`]+)/gi;
  while ((match = rawUrlRegex.exec(markdownText)) !== null) {
    let url = match[1].trim();
    // Strip trailing punctuation
    url = url.replace(/[\.\,\;\:\)\!]+$/, "");
    if (isHtmlWebPageUrlClient(url)) {
      foundUrls.add(url);
    }
  }

  return Array.from(foundUrls);
}
