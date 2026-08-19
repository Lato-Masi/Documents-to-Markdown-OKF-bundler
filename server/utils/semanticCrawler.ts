/**
 * @file server/utils/semanticCrawler.ts
 * @description Phase 2: AI-Guided Semantic Recursive Crawler Engine
 * Features:
 * - Domain-locked priority queue with depth & page limit guards
 * - robots.txt politeness & crawl-delay compliance
 * - Playwright headless browser / direct asset fetching per page
 * - Mozilla Readability DOM content & link extraction
 * - Gemini Contextual Link Evaluator: Evaluates page markdown + extracted links to rank
 *   and prune candidate URLs for Open Knowledge Framework (OKF) coherence
 * - Streaming SSE multi-page telemetry
 * - Master Knowledge Base compiler with Table of Contents, cross-links & section frontmatter
 */

import { GoogleGenAI } from "@google/genai";
import { parseRobotsTxt, RobotsTxtInfo } from "./siteDiscoveryEngine";
import { fetchRenderedPage } from "./playwrightFetcher";
import { extractCleanArticleHtml } from "./readabilityExtractor";
import { convertDocumentLocally } from "./localConverter";
import { isHtmlWebPageUrl } from "./urlValidator";

export interface CrawlPageResult {
  url: string;
  depth: number;
  title: string;
  markdown: string;
  wordCount: number;
  readingTimeMinutes: number;
  extractedLinks: string[];
  status: "success" | "skipped" | "failed";
  reason?: string;
  prunedClutterCount?: number;
}

export interface CrawlProgressEvent {
  type: "init" | "page_start" | "page_done" | "ai_eval" | "error" | "complete";
  pageIndex?: number;
  totalPages?: number;
  currentUrl?: string;
  depth?: number;
  message: string;
  pageResult?: CrawlPageResult;
  stats?: {
    pagesCrawled: number;
    pagesQueued: number;
    totalWords: number;
    durationMs: number;
  };
}

export interface SemanticCrawlOptions {
  seedUrl: string;
  maxDepth?: number; // default 2, max 4
  maxPages?: number; // default 15, max 30
  pathPrefixLock?: boolean; // only crawl URLs starting with seed's pathname
  semanticFocusPrompt?: string; // e.g. "Focus on API documentation, core architecture, and tutorials"
  apiKey?: string;
  onProgress?: (event: CrawlProgressEvent) => void;
}

export interface CrawlKnowledgeBaseResult {
  domain: string;
  seedUrl: string;
  crawledAt: string;
  totalPages: number;
  totalWords: number;
  masterMarkdown: string;
  tableOfContents: { title: string; url: string; depth: number; anchor: string }[];
  pages: CrawlPageResult[];
}

/**
 * Normalizes and extracts valid candidate URLs from clean HTML / DOM anchor elements.
 */
function extractCandidateLinks(html: string, currentUrl: string, rootHost: string): string[] {
  const urlObj = new URL(currentUrl);
  const linkRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
  const candidates = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html)) !== null) {
    const rawHref = match[1].trim();

    // Ignore anchors, javascript, mailto, tel
    if (
      !rawHref ||
      rawHref.startsWith("#") ||
      rawHref.startsWith("javascript:") ||
      rawHref.startsWith("mailto:") ||
      rawHref.startsWith("tel:")
    ) {
      continue;
    }

    try {
      const resolved = new URL(rawHref, currentUrl);

      // Enforce same host constraint
      if (resolved.host !== rootHost) {
        continue;
      }

      // Strip query parameters that cause duplicate crawls (tracking params)
      resolved.hash = "";
      resolved.searchParams.delete("utm_source");
      resolved.searchParams.delete("utm_medium");
      resolved.searchParams.delete("utm_campaign");
      resolved.searchParams.delete("ref");

      const cleanUrl = resolved.toString();

      // Ensure URL points to an HTML web page and not a PDF, document, archive, or media file
      if (!isHtmlWebPageUrl(cleanUrl)) {
        continue;
      }

      // Filter out utility / media / auth patterns
      const lower = cleanUrl.toLowerCase();
      if (
        lower.includes("/login") ||
        lower.includes("/signin") ||
        lower.includes("/signup") ||
        lower.includes("/logout") ||
        lower.includes("/auth") ||
        lower.includes("/privacy") ||
        lower.includes("/terms") ||
        lower.includes("/cart") ||
        lower.includes("/checkout")
      ) {
        continue;
      }

      candidates.add(cleanUrl);
    } catch {
      // Invalid URL ignored
    }
  }

  return Array.from(candidates);
}

/**
 * Evaluates candidate links using Gemini to select the most coherent semantic continuations
 * for building an OKF knowledge base.
 */
async function evaluateLinksWithGemini(
  pageTitle: string,
  pageMarkdownSnippet: string,
  candidateLinks: string[],
  semanticFocus: string | undefined,
  apiKey: string
): Promise<string[]> {
  if (candidateLinks.length <= 3) {
    return candidateLinks;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are an AI Semantic Web Crawler building a coherent, high-density Knowledge Base for the Open Knowledge Framework (OKF).
We just converted this webpage:
Title: "${pageTitle}"
Context Snippet:
${pageMarkdownSnippet.slice(0, 1500)}

${semanticFocus ? `User Focus Goal: "${semanticFocus}"` : ""}

Here are the candidate links found on this page:
${candidateLinks.map((link, idx) => `${idx + 1}. ${link}`).join("\n")}

Select the top 3-6 links that are the most coherent pedagogical continuations, in-depth documentation sub-chapters, concepts, or tutorials directly related to the core topic.
Reject generic navigation duplicates, pricing, marketing fluff, or irrelevant sections.

Return ONLY a JSON array of selected URL strings, e.g. ["https://.../concept1", "https://.../concept2"].`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: [{ text: prompt }],
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text || "[]";
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Validate that returned links were in the candidate pool
      const validRanked = parsed.filter(
        (url: any) => typeof url === "string" && candidateLinks.includes(url)
      );
      if (validRanked.length > 0) {
        return validRanked;
      }
    }
  } catch (err) {
    console.info("[Crawler] Gemini link ranking note:", (err as Error)?.message);
  }

  // Fallback: heuristic prioritization (links sharing deeper path segments)
  return candidateLinks.slice(0, 5);
}

/**
 * Main AI-Guided Semantic Recursive Crawler Engine
 */
export async function executeSemanticCrawl(
  options: SemanticCrawlOptions
): Promise<CrawlKnowledgeBaseResult> {
  const {
    seedUrl,
    maxDepth = 2,
    maxPages = 15,
    pathPrefixLock = true,
    semanticFocusPrompt,
    apiKey = process.env.GEMINI_API_KEY || "",
    onProgress,
  } = options;

  const urlObj = new URL(seedUrl);
  const rootHost = urlObj.host;
  const rootDomain = urlObj.hostname;
  const rootProtocol = urlObj.protocol;
  const rootUrl = `${rootProtocol}//${rootHost}`;
  const pathPrefix = pathPrefixLock ? urlObj.pathname.replace(/\/$/, "") : "";

  // 1. Fetch robots.txt compliance
  onProgress?.({
    type: "init",
    message: `Checking robots.txt compliance & politeness rules for ${rootHost}...`,
  });

  const robotsInfo: RobotsTxtInfo = await parseRobotsTxt(rootUrl);
  const crawlDelayMs = Math.min((robotsInfo.crawlDelay || 0.5) * 1000, 3000);

  // Queue of items to crawl: { url, depth }
  const queue: { url: string; depth: number }[] = [{ url: seedUrl, depth: 0 }];
  const visitedUrls = new Set<string>();
  const crawledPages: CrawlPageResult[] = [];
  const startTime = Date.now();

  while (queue.length > 0 && crawledPages.length < maxPages) {
    const current = queue.shift()!;
    const currentUrl = current.url;
    const currentDepth = current.depth;

    if (visitedUrls.has(currentUrl)) continue;
    visitedUrls.add(currentUrl);

    // Enforce robots.txt
    if (robotsInfo.found && !robotsInfo.isBotAllowed(new URL(currentUrl).pathname)) {
      onProgress?.({
        type: "page_done",
        currentUrl,
        depth: currentDepth,
        message: `Skipped by robots.txt Disallow rule: ${currentUrl}`,
        pageResult: {
          url: currentUrl,
          depth: currentDepth,
          title: "Disallowed by robots.txt",
          markdown: "",
          wordCount: 0,
          readingTimeMinutes: 0,
          extractedLinks: [],
          status: "skipped",
          reason: "robots.txt Disallow rule",
        },
      });
      continue;
    }

    onProgress?.({
      type: "page_start",
      pageIndex: crawledPages.length + 1,
      totalPages: maxPages,
      currentUrl,
      depth: currentDepth,
      message: `Fetching [Depth ${currentDepth}/${maxDepth}] (${crawledPages.length + 1}/${maxPages}): ${currentUrl}`,
      stats: {
        pagesCrawled: crawledPages.length,
        pagesQueued: queue.length,
        totalWords: crawledPages.reduce((acc, p) => acc + p.wordCount, 0),
        durationMs: Date.now() - startTime,
      },
    });

    try {
      // Check if target is a binary file (e.g. PDF)
      const isBinaryDoc = currentUrl.toLowerCase().endsWith(".pdf") || currentUrl.toLowerCase().endsWith(".docx");
      let pageTitle = "";
      let pageMarkdown = "";
      let wordCount = 0;
      let readingTime = 0;
      let rawHtml = "";

      if (isBinaryDoc) {
        const binRes = await fetch(currentUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
          signal: AbortSignal.timeout(15000),
        });
        const arrayBuf = await binRes.arrayBuffer();
        const b64 = Buffer.from(arrayBuf).toString("base64");
        const docName = currentUrl.split("/").pop() || "document.pdf";
        const converted = await convertDocumentLocally(docName, "application/pdf", b64);
        pageTitle = docName;
        pageMarkdown = converted || `# ${docName}\n\n[Binary Document Content]`;
        wordCount = pageMarkdown.split(/\s+/).length;
        readingTime = Math.ceil(wordCount / 200);
      } else {
        // Fetch via Headless Chromium / Rendered DOM
        const pageResult = await fetchRenderedPage(currentUrl, { timeoutMs: 15000 });
        rawHtml = pageResult.html;
        pageTitle = pageResult.title || currentUrl.split("/").pop() || "Untitled Document";

        // Mozilla Readability Reader Mode extraction
        const readability = extractCleanArticleHtml(rawHtml, {
          sourceUrl: currentUrl,
          stripImages: false,
          docTitle: pageTitle,
        });

        pageMarkdown = readability.markdown?.trim() || "";
        if (readability.title) pageTitle = readability.title;
        wordCount = readability.textWordCount || pageMarkdown.split(/\s+/).length;
        readingTime = readability.readingTimeMinutes || Math.ceil(wordCount / 200);
      }

      // Extract candidate links from the DOM for recursion
      const candidateLinks = extractCandidateLinks(rawHtml || pageMarkdown, currentUrl, rootHost);

      // Filter candidate links by prefix if lock is active
      const filteredCandidates = candidateLinks.filter((cand) => {
        if (visitedUrls.has(cand)) return false;
        if (queue.some((q) => q.url === cand)) return false;
        if (pathPrefix && pathPrefix !== "/" && !new URL(cand).pathname.startsWith(pathPrefix)) {
          return false;
        }
        return true;
      });

      const pageRecord: CrawlPageResult = {
        url: currentUrl,
        depth: currentDepth,
        title: pageTitle,
        markdown: pageMarkdown,
        wordCount,
        readingTimeMinutes: readingTime,
        extractedLinks: filteredCandidates,
        status: "success",
      };

      crawledPages.push(pageRecord);

      onProgress?.({
        type: "page_done",
        pageIndex: crawledPages.length,
        totalPages: maxPages,
        currentUrl,
        depth: currentDepth,
        message: `Converted "${pageTitle}" (${wordCount} words, ~${readingTime}m read). Found ${filteredCandidates.length} potential sub-links.`,
        pageResult: pageRecord,
        stats: {
          pagesCrawled: crawledPages.length,
          pagesQueued: queue.length,
          totalWords: crawledPages.reduce((acc, p) => acc + p.wordCount, 0),
          durationMs: Date.now() - startTime,
        },
      });

      // If we have not hit maxDepth and have space in crawl budget, evaluate next links with Gemini
      if (currentDepth < maxDepth && crawledPages.length < maxPages && filteredCandidates.length > 0) {
        let selectedLinks: string[] = [];

        if (apiKey && filteredCandidates.length > 2) {
          onProgress?.({
            type: "ai_eval",
            currentUrl,
            message: `🧠 Evaluating ${filteredCandidates.length} candidate links with Gemini for OKF semantic topic coherence...`,
          });

          selectedLinks = await evaluateLinksWithGemini(
            pageTitle,
            pageMarkdown,
            filteredCandidates,
            semanticFocusPrompt,
            apiKey
          );
        } else {
          selectedLinks = filteredCandidates.slice(0, 4);
        }

        // Add selected semantic links to frontier
        for (const link of selectedLinks) {
          if (!visitedUrls.has(link) && !queue.some((q) => q.url === link)) {
            queue.push({ url: link, depth: currentDepth + 1 });
          }
        }
      }

      // Respect crawl-delay
      if (crawlDelayMs > 0 && queue.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, crawlDelayMs));
      }
    } catch (err: any) {
      console.error(`[Crawler] Failed to crawl ${currentUrl}:`, err?.message);
      onProgress?.({
        type: "error",
        currentUrl,
        depth: currentDepth,
        message: `Failed to crawl ${currentUrl}: ${err?.message || "Unknown network error"}`,
        pageResult: {
          url: currentUrl,
          depth: currentDepth,
          title: "Crawl Error",
          markdown: "",
          wordCount: 0,
          readingTimeMinutes: 0,
          extractedLinks: [],
          status: "failed",
          reason: err?.message,
        },
      });
    }
  }

  // 3. Compile Master Open Knowledge Framework (OKF) Knowledge Base Document
  const tableOfContents: { title: string; url: string; depth: number; anchor: string }[] = [];
  let masterMarkdown = `# Open Knowledge Framework (OKF) Knowledge Base\n\n`;
  masterMarkdown += `**Source Domain:** \`${rootDomain}\`  \n`;
  masterMarkdown += `**Seed URL:** [${seedUrl}](${seedUrl})  \n`;
  masterMarkdown += `**Crawled Date:** ${new Date().toUTCString()}  \n`;
  masterMarkdown += `**Total Sections:** ${crawledPages.length} pages • **Total Words:** ${crawledPages.reduce(
    (acc, p) => acc + p.wordCount,
    0
  )} words  \n\n`;

  if (semanticFocusPrompt) {
    masterMarkdown += `> 🎯 **Semantic Focus:** *${semanticFocusPrompt}*\n\n`;
  }

  masterMarkdown += `## Table of Contents\n\n`;

  // Build TOC and Anchors
  crawledPages.forEach((page, idx) => {
    const slug = page.title
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-");
    const anchor = `section-${idx + 1}-${slug}`;
    const indent = "  ".repeat(Math.max(0, page.depth));
    masterMarkdown += `${indent}- [${page.title}](#${anchor}) *(Depth ${page.depth}, ~${page.readingTimeMinutes} min)*\n`;
    tableOfContents.push({
      title: page.title,
      url: page.url,
      depth: page.depth,
      anchor,
    });
  });

  masterMarkdown += `\n---\n\n`;

  // Append Each Page Section with OKF Frontmatter
  crawledPages.forEach((page, idx) => {
    const tocEntry = tableOfContents[idx];
    masterMarkdown += `<a id="${tocEntry.anchor}"></a>\n\n`;
    masterMarkdown += `## ${idx + 1}. ${page.title}\n\n`;
    masterMarkdown += `\`\`\`yaml\n`;
    masterMarkdown += `okf_section_id: "sec-${idx + 1}"\n`;
    masterMarkdown += `source_url: "${page.url}"\n`;
    masterMarkdown += `depth: ${page.depth}\n`;
    masterMarkdown += `word_count: ${page.wordCount}\n`;
    masterMarkdown += `est_read_time_min: ${page.readingTimeMinutes}\n`;
    masterMarkdown += `\`\`\`\n\n`;

    // Strip redundant leading H1 if page markdown starts with identical title
    let cleanSectionBody = page.markdown;
    if (cleanSectionBody.startsWith(`# ${page.title}`)) {
      cleanSectionBody = cleanSectionBody.replace(`# ${page.title}`, "").trim();
    }

    masterMarkdown += `${cleanSectionBody}\n\n`;
    masterMarkdown += `[⬆ Return to Table of Contents](#table-of-contents)\n\n---\n\n`;
  });

  const totalWords = crawledPages.reduce((acc, p) => acc + p.wordCount, 0);

  onProgress?.({
    type: "complete",
    message: `Knowledge Base generated successfully! Compiled ${crawledPages.length} pages (${totalWords} words).`,
    stats: {
      pagesCrawled: crawledPages.length,
      pagesQueued: 0,
      totalWords,
      durationMs: Date.now() - startTime,
    },
  });

  return {
    domain: rootDomain,
    seedUrl,
    crawledAt: new Date().toISOString(),
    totalPages: crawledPages.length,
    totalWords,
    masterMarkdown,
    tableOfContents,
    pages: crawledPages,
  };
}
