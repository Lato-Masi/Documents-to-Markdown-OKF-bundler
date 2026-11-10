/**
 * @file server/utils/urlValidator.ts
 * @description Centralized URL & HTML web page filtering helper and production SSRF security validator.
 * Strictly blocks loopback, RFC 1918 private IPv4 ranges, IPv6 loopback/unique-local/link-local,
 * cloud metadata services (AWS/GCP/Azure), and non-HTTP/HTTPS protocols.
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
 * Unified Production SSRF Security Validator.
 * Blocks loopback, private IPv4/IPv6 CIDR spaces, link-local, cloud metadata endpoints, and non-HTTP(S) schemes.
 */
export function validateSafeRemoteUrl(rawUrl: string): {
  safe: boolean;
  reason?: string;
  parsedUrl?: URL;
} {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { safe: false, reason: "URL must be a non-empty string." };
  }

  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { safe: false, reason: "Only HTTP and HTTPS protocols are permitted." };
    }

    // Reject embedded credentials in URLs
    if (parsed.username || parsed.password) {
      return { safe: false, reason: "Embedded credentials in URLs are prohibited." };
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

    // 1. Block localhost, loopback, and internal domain suffixes
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "0:0:0:0:0:0:0:1" ||
      hostname === "0.0.0.0" ||
      hostname === "::" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".arpa")
    ) {
      return { safe: false, reason: "Access to loopback or internal hostnames is prohibited." };
    }

    // 2. Block Cloud Metadata Services (AWS, GCP, Azure, DigitalOcean, Alibaba)
    if (
      hostname === "169.254.169.254" ||
      hostname === "metadata.google.internal" ||
      hostname === "metadata" ||
      hostname === "100.100.100.200"
    ) {
      return { safe: false, reason: "Access to cloud instance metadata services is prohibited." };
    }

    // 3. Block Private & Reserved IPv4 Ranges
    const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const [_, o1, o2, o3, o4] = ipv4Match.map(Number);
      if ([o1, o2, o3, o4].some((octet) => octet > 255)) {
        return { safe: false, reason: "Malformed IPv4 address." };
      }
      if (
        o1 === 10 || // 10.0.0.0/8 (RFC 1918)
        o1 === 127 || // 127.0.0.0/8 (Loopback)
        o1 === 0 || // 0.0.0.0/8 (Current network)
        (o1 === 172 && o2 >= 16 && o2 <= 31) || // 172.16.0.0/12 (RFC 1918)
        (o1 === 192 && o2 === 168) || // 192.168.0.0/16 (RFC 1918)
        (o1 === 169 && o2 === 254) || // 169.254.0.0/16 (Link-local)
        (o1 === 100 && o2 >= 64 && o2 <= 127) || // 100.64.0.0/10 (CGNAT)
        o1 >= 224 // Multicast & Reserved (224.0.0.0/4+)
      ) {
        return { safe: false, reason: "Access to private, loopback, or reserved IPv4 addresses is prohibited." };
      }
    }

    // 4. Block Private, Link-Local, and IPv4-Mapped IPv6 Addresses
    if (hostname.includes(":")) {
      const normalizedIpv6 = hostname.toLowerCase();
      if (
        normalizedIpv6 === "::1" ||
        normalizedIpv6 === "::" ||
        normalizedIpv6.startsWith("fc") || // Unique Local (fc00::/7)
        normalizedIpv6.startsWith("fd") || // Unique Local (fd00::/8)
        normalizedIpv6.startsWith("fe8") || // Link-local (fe80::/10)
        normalizedIpv6.startsWith("fe9") ||
        normalizedIpv6.startsWith("fea") ||
        normalizedIpv6.startsWith("feb") ||
        normalizedIpv6.startsWith("ff") || // Multicast (ff00::/8)
        normalizedIpv6.startsWith("::ffff:") // IPv4-mapped IPv6
      ) {
        return { safe: false, reason: "Access to private, link-local, or mapped IPv6 addresses is prohibited." };
      }
    }

    return { safe: true, parsedUrl: parsed };
  } catch {
    return { safe: false, reason: "Malformed URL format." };
  }
}

/**
 * Checks if a given URL points to a standard HTML web page rather than a binary / PDF / media file.
 */
export function isHtmlWebPageUrl(rawUrl: string): boolean {
  const safety = validateSafeRemoteUrl(rawUrl);
  if (!safety.safe || !safety.parsedUrl) return false;

  const pathname = safety.parsedUrl.pathname.toLowerCase();

  for (const ext of NON_HTML_EXTENSIONS) {
    if (pathname.endsWith(ext) || pathname.includes(`${ext}/`)) {
      return false;
    }
  }

  return true;
}

/**
 * Extracts all unique HTTP/HTTPS web links found inside a Markdown document.
 * Strictly filters out non-HTML links (PDFs, images, downloads) and unsafe SSRF targets.
 */
export function extractWebLinksFromMarkdown(markdownText: string): string[] {
  if (!markdownText) return [];

  const foundUrls = new Set<string>();

  const mdLinkRegex = /\[(?:[^\]]*)\]\((https?:\/\/[^\s\)]+)\)/gi;
  let match: RegExpExecArray | null;
  while ((match = mdLinkRegex.exec(markdownText)) !== null) {
    const url = match[1].trim();
    if (isHtmlWebPageUrl(url)) {
      foundUrls.add(url);
    }
  }

  const rawUrlRegex = /(https?:\/\/[^\s<>"'{}|\\^`]+)/gi;
  while ((match = rawUrlRegex.exec(markdownText)) !== null) {
    let url = match[1].trim();
    url = url.replace(/[\.\,\;\:\)\!]+$/, "");
    if (isHtmlWebPageUrl(url)) {
      foundUrls.add(url);
    }
  }

  return Array.from(foundUrls);
}
