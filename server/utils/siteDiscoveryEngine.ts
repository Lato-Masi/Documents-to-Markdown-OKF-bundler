/**
 * @file server/utils/siteDiscoveryEngine.ts
 * @description Domain Discovery & Standards Compliance Engine
 * Handles:
 * 1. robots.txt retrieval & parsing (Disallow rules, user agents, crawl-delays, sitemap locations)
 * 2. llms.txt & llms-full.txt discovery (AI/LLM-optimized documentation guides)
 * 3. sitemap.xml & sitemap_index.xml recursive parsing (URL extractions, lastmod dates, priorities)
 * 4. Domain URL hierarchy tree compilation & safety validation
 */

import { JSDOM } from "jsdom";
import { isHtmlWebPageUrl } from "./urlValidator";

/**
 * SSRF security validation to block loopback, link-local, private IP spaces, and non-http/https protocols
 */
export function isSafeUrlForFetching(rawUrl: string): { safe: boolean; reason?: string; parsedUrl?: URL } {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { safe: false, reason: "Only HTTP and HTTPS protocols are permitted." };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block localhost, loopback, and standard private hostnames
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "0.0.0.0" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal")
    ) {
      return { safe: false, reason: "Access to loopback or local hostnames is prohibited." };
    }

    // Block Cloud metadata endpoints
    if (hostname === "169.254.169.254" || hostname === "metadata.google.internal") {
      return { safe: false, reason: "Access to cloud metadata services is prohibited." };
    }

    // Check for private IPv4 ranges
    const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const [_, o1, o2] = ipv4Match.map(Number);
      if (
        o1 === 10 ||
        o1 === 127 ||
        o1 === 0 ||
        (o1 === 172 && o2 >= 16 && o2 <= 31) ||
        (o1 === 192 && o2 === 168) ||
        (o1 === 169 && o2 === 254)
      ) {
        return { safe: false, reason: "Access to private or link-local IP addresses is prohibited." };
      }
    }

    return { safe: true, parsedUrl: parsed };
  } catch {
    return { safe: false, reason: "Malformed URL format." };
  }
}

export interface RobotsRule {
  userAgent: string;
  disallowedPaths: string[];
  allowedPaths: string[];
  crawlDelay?: number;
}

export interface RobotsTxtInfo {
  found: boolean;
  url: string;
  rules: RobotsRule[];
  sitemaps: string[];
  rawContent?: string;
  isBotAllowed: (path: string, userAgent?: string) => boolean;
  crawlDelay?: number;
}

export interface LlmsTxtSection {
  title: string;
  description?: string;
  links: { title: string; url: string; description?: string }[];
}

export interface LlmsTxtInfo {
  found: boolean;
  url: string;
  rawContent?: string;
  sections: LlmsTxtSection[];
  curatedUrls: string[];
}

export interface SitemapUrlEntry {
  url: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
}

export interface SitemapDiscoveryResult {
  found: boolean;
  sitemapUrls: string[];
  totalUrls: number;
  urls: SitemapUrlEntry[];
  nestedSitemaps: string[];
}

export interface DomainDiscoveryReport {
  domain: string;
  rootUrl: string;
  checkedAt: string;
  robotsTxt: {
    found: boolean;
    url: string;
    sitemapsDeclared: string[];
    crawlDelay?: number;
    disallowedSample: string[];
    allowedSample: string[];
  };
  llmsTxt: {
    found: boolean;
    url?: string;
    sectionsCount: number;
    curatedUrlsCount: number;
    curatedUrls: string[];
  };
  sitemaps: {
    found: boolean;
    sitemapSources: string[];
    totalIndexedUrls: number;
    sampleUrls: SitemapUrlEntry[];
  };
  suggestedSeedUrls: string[];
}

const DEFAULT_FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 (Compatible; KnowledgeBaseBot/1.0)",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain,*/*;q=0.8",
};

/**
 * Fetch and parse robots.txt for a given domain/URL.
 */
export async function parseRobotsTxt(targetUrl: string): Promise<RobotsTxtInfo> {
  const urlObj = new URL(targetUrl);
  const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;

  try {
    const res = await fetch(robotsUrl, {
      headers: DEFAULT_FETCH_HEADERS,
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return {
        found: false,
        url: robotsUrl,
        rules: [],
        sitemaps: [],
        isBotAllowed: () => true,
      };
    }

    const text = await res.text();
    const lines = text.split(/\r?\n/);

    const rules: RobotsRule[] = [];
    const sitemaps: string[] = [];
    let currentRule: RobotsRule | null = null;
    let globalCrawlDelay: number | undefined;

    for (let line of lines) {
      line = line.trim();
      // Ignore comments
      if (line.startsWith("#") || !line) continue;

      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;

      const field = line.slice(0, colonIdx).trim().toLowerCase();
      const value = line.slice(colonIdx + 1).trim();

      if (field === "user-agent") {
        if (currentRule && currentRule.userAgent.toLowerCase() === value.toLowerCase()) {
          // continue current rule
        } else {
          currentRule = {
            userAgent: value,
            disallowedPaths: [],
            allowedPaths: [],
          };
          rules.push(currentRule);
        }
      } else if (field === "disallow" && currentRule) {
        if (value) currentRule.disallowedPaths.push(value);
      } else if (field === "allow" && currentRule) {
        if (value) currentRule.allowedPaths.push(value);
      } else if (field === "crawl-delay") {
        const delaySec = parseFloat(value);
        if (!isNaN(delaySec)) {
          if (currentRule) currentRule.crawlDelay = delaySec;
          globalCrawlDelay = delaySec;
        }
      } else if (field === "sitemap") {
        if (value.startsWith("http")) {
          sitemaps.push(value);
        } else {
          sitemaps.push(`${urlObj.protocol}//${urlObj.host}${value.startsWith("/") ? "" : "/"}${value}`);
        }
      }
    }

    // Bot checker helper
    const isBotAllowed = (path: string, userAgent: string = "*"): boolean => {
      const normalizedPath = path.startsWith("/") ? path : `/${path}`;

      // Check specific userAgent rule first, then wildcard rule
      const rule =
        rules.find((r) => r.userAgent.toLowerCase() === userAgent.toLowerCase()) ||
        rules.find((r) => r.userAgent === "*");

      if (!rule) return true;

      // Allow directives take precedence if more specific
      for (const allow of rule.allowedPaths) {
        if (allow && normalizedPath.startsWith(allow)) return true;
      }

      for (const disallow of rule.disallowedPaths) {
        if (disallow && normalizedPath.startsWith(disallow)) return false;
      }

      return true;
    };

    return {
      found: true,
      url: robotsUrl,
      rules,
      sitemaps,
      rawContent: text,
      isBotAllowed,
      crawlDelay: globalCrawlDelay,
    };
  } catch {
    return {
      found: false,
      url: robotsUrl,
      rules: [],
      sitemaps: [],
      isBotAllowed: () => true,
    };
  }
}

/**
 * Searches for llms.txt or .well-known/llms.txt on a domain.
 * This standard provides an explicit list of documentation links curated for AI models.
 */
export async function parseLlmsTxt(targetUrl: string): Promise<LlmsTxtInfo> {
  const urlObj = new URL(targetUrl);
  const candidates = [
    `${urlObj.protocol}//${urlObj.host}/llms.txt`,
    `${urlObj.protocol}//${urlObj.host}/.well-known/llms.txt`,
    `${urlObj.protocol}//${urlObj.host}/llms-full.txt`,
  ];

  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, {
        headers: DEFAULT_FETCH_HEADERS,
        signal: AbortSignal.timeout(4000),
      });

      if (res.ok) {
        const text = await res.text();
        const { sections, curatedUrls } = parseLlmsTxtContent(text, `${urlObj.protocol}//${urlObj.host}`);
        if (curatedUrls.length > 0 || text.includes("#")) {
          return {
            found: true,
            url: candidate,
            rawContent: text,
            sections,
            curatedUrls,
          };
        }
      }
    } catch {
      // Try next candidate
    }
  }

  return {
    found: false,
    url: candidates[0],
    sections: [],
    curatedUrls: [],
  };
}

/**
 * Parses markdown-like llms.txt structure to extract sections and links.
 */
function parseLlmsTxtContent(content: string, baseUrl: string): { sections: LlmsTxtSection[]; curatedUrls: string[] } {
  const sections: LlmsTxtSection[] = [];
  const curatedUrls: string[] = [];
  const lines = content.split(/\r?\n/);

  let currentSection: LlmsTxtSection = {
    title: "General Documentation",
    links: [],
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("##") || trimmed.startsWith("#")) {
      if (currentSection.links.length > 0) {
        sections.push(currentSection);
      }
      currentSection = {
        title: trimmed.replace(/^#+\s*/, "").trim(),
        links: [],
      };
    } else if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
      // Markdown link: - [Title](URL): Description
      const linkMatch = trimmed.match(/[-*]\s*\[([^\]]+)\]\(([^)]+)\)(?::\s*(.*))?/);
      if (linkMatch) {
        let url = linkMatch[2].trim();
        if (url.startsWith("/")) {
          url = `${baseUrl}${url}`;
        } else if (!url.startsWith("http")) {
          url = `${baseUrl}/${url}`;
        }

        const title = linkMatch[1].trim();
        const description = linkMatch[3]?.trim();

        if (isHtmlWebPageUrl(url)) {
          currentSection.links.push({ title, url, description });
          if (!curatedUrls.includes(url)) {
            curatedUrls.push(url);
          }
        }
      }
    }
  }

  if (currentSection.links.length > 0) {
    sections.push(currentSection);
  }

  return { sections, curatedUrls };
}

/**
 * Recursively parses sitemap.xml and nested sitemaps (sitemap index).
 */
export async function parseSitemaps(
  targetUrl: string,
  declaredSitemaps: string[] = [],
  maxUrls: number = 200
): Promise<SitemapDiscoveryResult> {
  const urlObj = new URL(targetUrl);
  const candidateSitemaps = [
    ...declaredSitemaps,
    `${urlObj.protocol}//${urlObj.host}/sitemap.xml`,
    `${urlObj.protocol}//${urlObj.host}/sitemap_index.xml`,
    `${urlObj.protocol}//${urlObj.host}/sitemap/sitemap.xml`,
  ];

  // Deduplicate candidates
  const uniqueSitemaps = Array.from(new Set(candidateSitemaps));
  const discoveredUrls: Map<string, SitemapUrlEntry> = new Map();
  const nestedSitemaps: string[] = [];
  const successfulSitemapSources: string[] = [];

  for (const sitemapUrl of uniqueSitemaps) {
    if (discoveredUrls.size >= maxUrls) break;

    try {
      const res = await fetch(sitemapUrl, {
        headers: {
          ...DEFAULT_FETCH_HEADERS,
          "Accept": "application/xml,text/xml,*/*",
        },
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok) continue;

      const xmlText = await res.text();
      successfulSitemapSources.push(sitemapUrl);

      // Check if it is a Sitemap Index (points to other sitemaps)
      if (xmlText.includes("<sitemapindex") || xmlText.includes("<sitemap>")) {
        const sitemapLocMatches = xmlText.matchAll(/<loc>([\s\S]*?)<\/loc>/gi);
        for (const match of sitemapLocMatches) {
          const loc = match[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim();
          if (loc && !nestedSitemaps.includes(loc)) {
            nestedSitemaps.push(loc);
          }
        }

        // Parse up to 3 child sitemaps from the index
        for (const childSitemap of nestedSitemaps.slice(0, 3)) {
          if (discoveredUrls.size >= maxUrls) break;
          try {
            const childRes = await fetch(childSitemap, {
              headers: DEFAULT_FETCH_HEADERS,
              signal: AbortSignal.timeout(5000),
            });
            if (childRes.ok) {
              const childXml = await childRes.text();
              parseXmlUrlsIntoMap(childXml, discoveredUrls, maxUrls);
            }
          } catch {}
        }
      } else {
        // Standard urlset sitemap
        parseXmlUrlsIntoMap(xmlText, discoveredUrls, maxUrls);
      }
    } catch {
      // Continue to next sitemap candidate
    }
  }

  const urlsList = Array.from(discoveredUrls.values());

  return {
    found: urlsList.length > 0 || successfulSitemapSources.length > 0,
    sitemapUrls: successfulSitemapSources,
    totalUrls: urlsList.length,
    urls: urlsList,
    nestedSitemaps,
  };
}

/**
 * Extracts <url><loc>...</loc><lastmod>...</lastmod></url> nodes from XML text.
 */
function parseXmlUrlsIntoMap(xml: string, map: Map<string, SitemapUrlEntry>, maxLimit: number) {
  // Regex parsing for resilient XML parsing across malformed sitemaps
  const urlBlockRegex = /<url\b[^>]*>([\s\S]*?)<\/url>/gi;
  let match: RegExpExecArray | null;

  while ((match = urlBlockRegex.exec(xml)) !== null && map.size < maxLimit) {
    const block = match[1];
    const locMatch = block.match(/<loc>([\s\S]*?)<\/loc>/i);
    if (!locMatch) continue;

    const rawLoc = locMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim();
    if (!rawLoc || map.has(rawLoc) || !isHtmlWebPageUrl(rawLoc)) continue;

    const lastmodMatch = block.match(/<lastmod>([\s\S]*?)<\/lastmod>/i);
    const lastmod = lastmodMatch ? lastmodMatch[1].trim() : undefined;

    const changefreqMatch = block.match(/<changefreq>([\s\S]*?)<\/changefreq>/i);
    const changefreq = changefreqMatch ? changefreqMatch[1].trim() : undefined;

    const priorityMatch = block.match(/<priority>([\s\S]*?)<\/priority>/i);
    const priority = priorityMatch ? parseFloat(priorityMatch[1].trim()) : undefined;

    map.set(rawLoc, {
      url: rawLoc,
      lastmod,
      changefreq,
      priority,
    });
  }

  // Fallback if <url> blocks were not well formed but <loc> exists
  if (map.size === 0) {
    const directLocMatches = xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi);
    for (const dMatch of directLocMatches) {
      if (map.size >= maxLimit) break;
      const rawLoc = dMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim();
      if (rawLoc && !map.has(rawLoc) && !rawLoc.endsWith(".xml")) {
        map.set(rawLoc, { url: rawLoc });
      }
    }
  }
}

/**
 * Performs a comprehensive Site Discovery inspection across robots.txt, llms.txt, and sitemaps.
 */
export async function discoverDomainArchitecture(targetUrl: string): Promise<DomainDiscoveryReport> {
  const urlObj = new URL(targetUrl);
  const rootUrl = `${urlObj.protocol}//${urlObj.host}`;
  const domain = urlObj.hostname;

  // Execute discovery tasks concurrently
  const [robotsInfo, llmsInfo] = await Promise.all([
    parseRobotsTxt(rootUrl),
    parseLlmsTxt(rootUrl),
  ]);

  const sitemapInfo = await parseSitemaps(rootUrl, robotsInfo.sitemaps, 150);

  // Compile suggested seed URLs
  const suggestedSeeds: string[] = [];

  // 1. LLMs.txt links (highest quality / curated for AI)
  if (llmsInfo.curatedUrls.length > 0) {
    suggestedSeeds.push(...llmsInfo.curatedUrls.slice(0, 10));
  }

  // 2. High priority sitemap links (documentation, guides, articles)
  const docKeywords = ["/docs", "/guide", "/tutorial", "/blog", "/learn", "/api", "/reference"];
  const prioritizedSitemap = sitemapInfo.urls
    .filter((u) => docKeywords.some((kw) => u.url.toLowerCase().includes(kw)))
    .map((u) => u.url);

  for (const url of prioritizedSitemap) {
    if (!suggestedSeeds.includes(url) && suggestedSeeds.length < 15) {
      suggestedSeeds.push(url);
    }
  }

  // 3. Fallback to top sitemap URLs
  for (const u of sitemapInfo.urls) {
    if (!suggestedSeeds.includes(u.url) && suggestedSeeds.length < 15) {
      suggestedSeeds.push(u.url);
    }
  }

  // If no sitemaps/llms, fallback to target URL
  if (suggestedSeeds.length === 0) {
    suggestedSeeds.push(targetUrl);
  }

  const wildcardRule = robotsInfo.rules.find((r) => r.userAgent === "*") || robotsInfo.rules[0];

  return {
    domain,
    rootUrl,
    checkedAt: new Date().toISOString(),
    robotsTxt: {
      found: robotsInfo.found,
      url: robotsInfo.url,
      sitemapsDeclared: robotsInfo.sitemaps,
      crawlDelay: robotsInfo.crawlDelay,
      disallowedSample: wildcardRule?.disallowedPaths.slice(0, 10) || [],
      allowedSample: wildcardRule?.allowedPaths.slice(0, 10) || [],
    },
    llmsTxt: {
      found: llmsInfo.found,
      url: llmsInfo.found ? llmsInfo.url : undefined,
      sectionsCount: llmsInfo.sections.length,
      curatedUrlsCount: llmsInfo.curatedUrls.length,
      curatedUrls: llmsInfo.curatedUrls,
    },
    sitemaps: {
      found: sitemapInfo.found,
      sitemapSources: sitemapInfo.sitemapUrls,
      totalIndexedUrls: sitemapInfo.totalUrls,
      sampleUrls: sitemapInfo.urls.slice(0, 50),
    },
    suggestedSeedUrls: suggestedSeeds,
  };
}
