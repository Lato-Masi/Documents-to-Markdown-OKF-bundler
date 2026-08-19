import { fetchRenderedPage } from "./playwrightFetcher";
import { isSafeUrlForFetching } from "./siteDiscoveryEngine";
import { extractCleanArticleHtml } from "./readabilityExtractor";
import { convertDocumentLocally } from "./localConverter";
import { isHtmlWebPageUrl } from "./urlValidator";

export interface BatchScrapeUrlItem {
  url: string;
  customTitle?: string;
  status: "pending" | "processing" | "completed" | "error";
  title?: string;
  markdownContent?: string;
  wordCount?: number;
  charCount?: number;
  durationMs?: number;
  error?: string;
}

export interface BatchScrapeOptions {
  urls: string[];
  concurrency?: number;
  cleanClutter?: boolean;
  docStyle?: "standard" | "gfm" | "academic";
  onProgress?: (event: {
    completedCount: number;
    totalCount: number;
    currentItem: BatchScrapeUrlItem;
  }) => void;
}

export interface BatchScrapeResult {
  totalRequested: number;
  successCount: number;
  errorCount: number;
  durationMs: number;
  items: BatchScrapeUrlItem[];
  mergedMarkdownCorpus: string;
}

/**
 * Scrapes a single URL safely using Playwright + Readability + Turndown
 */
async function scrapeSingleUrl(
  url: string,
  docStyle: "standard" | "gfm" | "academic" = "standard"
): Promise<{ title: string; markdown: string; durationMs: number }> {
  const start = Date.now();
  const check = isSafeUrlForFetching(url);
  if (!check.safe) {
    throw new Error(`Security validation failed: ${check.reason}`);
  }

  if (!isHtmlWebPageUrl(url)) {
    throw new Error(`Batch Scraper only targets HTML websites. Non-HTML/PDF/media links are excluded.`);
  }

  // 1. Fetch DOM rendered page via headless Playwright
  const rendered = await fetchRenderedPage(url, { timeoutMs: 15000 });

  // 2. Extract clean article HTML via Mozilla Readability
  const cleaned = extractCleanArticleHtml(rendered.html, {
    preserveLinks: true,
    sourceUrl: url,
    docTitle: rendered.title,
  });

  // 3. Convert clean HTML into high quality Markdown
  const markdown = await convertDocumentLocally(cleaned.cleanedHtml, "html", docStyle);
  const durationMs = Date.now() - start;

  return {
    title: rendered.title || cleaned.title || url,
    markdown,
    durationMs,
  };
}

/**
 * Executes high-performance parallel batch scraping with concurrency control.
 */
export async function executeBatchUrlScrape(
  options: BatchScrapeOptions
): Promise<BatchScrapeResult> {
  const startTime = Date.now();
  const { urls, concurrency = 3, docStyle = "standard", onProgress } = options;

  // Deduplicate and filter non-empty URLs
  const uniqueUrls = Array.from(
    new Set(
      urls
        .map((u) => u.trim())
        .filter((u) => u.length > 0 && (u.startsWith("http://") || u.startsWith("https://")))
    )
  );

  const items: BatchScrapeUrlItem[] = uniqueUrls.map((url) => ({
    url,
    status: "pending",
  }));

  let completedCount = 0;
  let successCount = 0;
  let errorCount = 0;

  // Worker queue processor with concurrency pool
  let nextIdx = 0;
  const runWorker = async () => {
    while (nextIdx < items.length) {
      const idx = nextIdx++;
      const item = items[idx];
      item.status = "processing";

      try {
        const { title, markdown, durationMs } = await scrapeSingleUrl(item.url, docStyle);
        item.status = "completed";
        item.title = title;
        item.markdownContent = markdown;
        item.wordCount = markdown.trim().split(/\s+/).filter(Boolean).length;
        item.charCount = markdown.length;
        item.durationMs = durationMs;
        successCount++;
      } catch (err: any) {
        item.status = "error";
        item.error = err?.message || "Failed to fetch or convert page";
        errorCount++;
      } finally {
        completedCount++;
        if (onProgress) {
          onProgress({
            completedCount,
            totalCount: items.length,
            currentItem: item,
          });
        }
      }
    }
  };

  const poolSize = Math.min(concurrency, items.length);
  const workers = Array.from({ length: poolSize }, () => runWorker());
  await Promise.all(workers);

  // Compile unified OKF multi-doc corpus
  const mergedSections: string[] = [
    `---`,
    `title: "Batch URL Web Scraping Corpus"`,
    `total_sources: ${successCount}`,
    `generated_at: "${new Date().toISOString()}"`,
    `engine: "Playwright Headless + Mozilla Readability + OKF Architecture"`,
    `---`,
    `\n# Batch Web Scrape Knowledge Corpus\n`,
    `## Table of Contents\n`,
  ];

  const successfulItems = items.filter((i) => i.status === "completed" && i.markdownContent);

  successfulItems.forEach((item, idx) => {
    const slug = (item.title || `doc-${idx + 1}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    mergedSections.push(`${idx + 1}. [${item.title || item.url}](#${slug}) (${item.wordCount?.toLocaleString()} words)`);
  });

  mergedSections.push(`\n---\n`);

  successfulItems.forEach((item, idx) => {
    const slug = (item.title || `doc-${idx + 1}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    mergedSections.push(
      `## ${item.title || item.url} {#${slug}}\n\n` +
      `**Source URL:** [${item.url}](${item.url})  \n` +
      `**Extracted:** ${new Date().toLocaleTimeString()} | **Length:** ${item.wordCount?.toLocaleString()} words\n\n` +
      `${item.markdownContent}\n\n---\n`
    );
  });

  const mergedMarkdownCorpus = mergedSections.join("\n");
  const totalDurationMs = Date.now() - startTime;

  return {
    totalRequested: items.length,
    successCount,
    errorCount,
    durationMs: totalDurationMs,
    items,
    mergedMarkdownCorpus,
  };
}
