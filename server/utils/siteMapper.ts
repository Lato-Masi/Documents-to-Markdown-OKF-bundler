import { parseSitemaps, parseRobotsTxt, parseLlmsTxt, SitemapUrlEntry } from "./siteDiscoveryEngine";

export interface SiteMapExtractOptions {
  domainOrSitemapUrl: string;
  maxUrls?: number;
  filterPrefix?: string;
  filterExtension?: string;
  searchKeyword?: string;
}

export interface SiteMapExtractResult {
  domain: string;
  rootUrl: string;
  totalFound: number;
  filteredCount: number;
  sitemapSources: string[];
  urls: SitemapUrlEntry[];
  hierarchyTree: SitePathNode;
  llmsTxtCuratedCount: number;
  robotsTxtSitemapsCount: number;
}

export interface SitePathNode {
  name: string;
  path: string;
  fullUrl?: string;
  children: { [key: string]: SitePathNode };
  urlCount: number;
  isLeaf?: boolean;
}

/**
 * Builds a hierarchical tree from a flat list of URL paths
 */
function buildPathTree(urls: SitemapUrlEntry[], rootUrl: string): SitePathNode {
  const rootNode: SitePathNode = {
    name: "/",
    path: "/",
    children: {},
    urlCount: urls.length,
  };

  for (const entry of urls) {
    try {
      const parsed = new URL(entry.url);
      const segments = parsed.pathname.split("/").filter(Boolean);

      let current = rootNode;
      let currentPath = "";

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        currentPath += `/${seg}`;

        if (!current.children[seg]) {
          current.children[seg] = {
            name: seg,
            path: currentPath,
            children: {},
            urlCount: 0,
            fullUrl: i === segments.length - 1 ? entry.url : undefined,
            isLeaf: i === segments.length - 1,
          };
        }

        current.children[seg].urlCount++;
        current = current.children[seg];
      }
    } catch {
      // Ignore unparseable URLs
    }
  }

  return rootNode;
}

/**
 * Executes high-performance domain sitemap extraction and URL hierarchy mapping.
 */
export async function executeSiteMapExtraction(
  options: SiteMapExtractOptions
): Promise<SiteMapExtractResult> {
  const { domainOrSitemapUrl, maxUrls = 500, filterPrefix, filterExtension, searchKeyword } = options;

  let formattedUrl = domainOrSitemapUrl.trim();
  if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
    formattedUrl = `https://${formattedUrl}`;
  }

  const urlObj = new URL(formattedUrl);
  const domain = urlObj.hostname;
  const rootUrl = `${urlObj.protocol}//${urlObj.host}`;

  // 1. Fetch robots.txt to discover declared sitemaps
  const robotsInfo = await parseRobotsTxt(rootUrl);

  // 2. Fetch llms.txt to cross-reference curated links
  const llmsInfo = await parseLlmsTxt(rootUrl);

  // 3. Parse XML sitemaps recursively
  const declaredSitemaps = [...robotsInfo.sitemaps];
  if (formattedUrl.endsWith(".xml")) {
    declaredSitemaps.unshift(formattedUrl);
  }

  const sitemapResult = await parseSitemaps(rootUrl, declaredSitemaps, maxUrls);

  // Merge any URLs from llms.txt that might not be in the sitemap
  const mergedMap = new Map<string, SitemapUrlEntry>();
  for (const entry of sitemapResult.urls) {
    mergedMap.set(entry.url, entry);
  }

  for (const llmUrl of llmsInfo.curatedUrls) {
    if (!mergedMap.has(llmUrl)) {
      mergedMap.set(llmUrl, {
        url: llmUrl,
        lastmod: undefined,
        changefreq: "curated_llms_txt",
        priority: 1.0,
      });
    }
  }

  let allEntries = Array.from(mergedMap.values());

  // 4. Apply filtering criteria
  let filtered = allEntries;

  if (filterPrefix && filterPrefix.trim()) {
    const prefix = filterPrefix.trim().toLowerCase();
    filtered = filtered.filter((entry) => {
      try {
        const p = new URL(entry.url).pathname.toLowerCase();
        return p.startsWith(prefix) || p.includes(prefix);
      } catch {
        return false;
      }
    });
  }

  if (filterExtension && filterExtension.trim()) {
    const ext = filterExtension.trim().toLowerCase().replace(/^\./, "");
    filtered = filtered.filter((entry) => {
      try {
        const pathname = new URL(entry.url).pathname.toLowerCase();
        return pathname.endsWith(`.${ext}`) || pathname.includes(`.${ext}`);
      } catch {
        return false;
      }
    });
  }

  if (searchKeyword && searchKeyword.trim()) {
    const kw = searchKeyword.trim().toLowerCase();
    filtered = filtered.filter((entry) => entry.url.toLowerCase().includes(kw));
  }

  // 5. Construct URL path hierarchy
  const hierarchyTree = buildPathTree(filtered, rootUrl);

  return {
    domain,
    rootUrl,
    totalFound: allEntries.length,
    filteredCount: filtered.length,
    sitemapSources: sitemapResult.sitemapUrls,
    urls: filtered,
    hierarchyTree,
    llmsTxtCuratedCount: llmsInfo.curatedUrls.length,
    robotsTxtSitemapsCount: robotsInfo.sitemaps.length,
  };
}
