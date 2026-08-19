import { GoogleGenAI } from "@google/genai";
import { fetchRenderedPage } from "./playwrightFetcher";
import { isSafeUrlForFetching } from "./siteDiscoveryEngine";
import { extractCleanArticleHtml } from "./readabilityExtractor";
import { convertDocumentLocally } from "./localConverter";
import { isHtmlWebPageUrl } from "./urlValidator";

export interface SearchAndScrapeOptions {
  query: string;
  domainFilter?: string;
  maxSources?: number;
  apiKey?: string;
}

export interface SearchCitation {
  title: string;
  url: string;
  snippet?: string;
  markdownExtract?: string;
}

export interface SearchAndScrapeResult {
  query: string;
  synthesizedReport: string;
  citations: SearchCitation[];
  durationMs: number;
}

/**
 * AI-Guided Web Research & Synthesis Engine:
 * 1. Uses Gemini with Google Search Grounding to identify up-to-date documentation and web sources
 * 2. Fetches high-value URLs via Playwright & Mozilla Readability
 * 3. Compiles a grounded, citation-rich technical report in clean Markdown
 */
export async function executeSearchAndScrape(
  options: SearchAndScrapeOptions
): Promise<SearchAndScrapeResult> {
  const startTime = Date.now();
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY || "";

  if (!apiKey) {
    throw new Error("Gemini API key is required for Search & Scrape operations.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const maxSources = Math.min(Math.max(1, options.maxSources || 4), 8);

  const searchDirective = options.domainFilter
    ? `Find the latest technical documentation and guides for "${options.query}" specifically focusing on domain "${options.domainFilter}".`
    : `Find the most comprehensive, up-to-date documentation, tutorials, or articles for "${options.query}".`;

  // Step 1: Run Gemini with Google Search tool enabled to ground and retrieve candidate web URLs
  const searchPrompt = `${searchDirective}

Please provide:
1. A clear, highly structured, comprehensive technical explanation / synthesis of the topic with code examples and best practices.
2. A distinct section at the end titled '### Extracted Web Sources' listing the exact URLs and page titles of the primary web sources used.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: searchPrompt,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const rawAnswer = response.text || "No synthesis could be generated.";

  // Step 2: Extract candidate URLs from grounding metadata or response text
  const candidateUrls: { title: string; url: string }[] = [];
  
  // Inspect grounding metadata if present
  const groundingChunks = (response as any).candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (Array.isArray(groundingChunks)) {
    for (const chunk of groundingChunks) {
      if (chunk.web?.uri) {
        candidateUrls.push({
          title: chunk.web.title || "Web Reference",
          url: chunk.web.uri,
        });
      }
    }
  }

  // Regex fallback: extract any explicit markdown links in the text
  const linkMatches = rawAnswer.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g);
  for (const match of linkMatches) {
    const text = match[1];
    const url = match[2];
    if (!candidateUrls.some((c) => c.url === url)) {
      candidateUrls.push({ title: text, url });
    }
  }

  // Deduplicate and filter safe HTML web URLs
  const uniqueCandidateMap = new Map<string, string>();
  for (const c of candidateUrls) {
    const check = isSafeUrlForFetching(c.url);
    if (check.safe && isHtmlWebPageUrl(c.url) && !uniqueCandidateMap.has(c.url)) {
      uniqueCandidateMap.set(c.url, c.title);
    }
  }

  const topUrls = Array.from(uniqueCandidateMap.entries()).slice(0, maxSources);

  // Step 3: Fetch top primary sources via Playwright + Readability for verifiable extracts
  const citations: SearchCitation[] = [];
  for (const [url, title] of topUrls) {
    try {
      const page = await fetchRenderedPage(url, { timeoutMs: 10000 });
      const cleaned = extractCleanArticleHtml(page.html, {
        preserveLinks: true,
        sourceUrl: url,
        docTitle: page.title || title,
      });
      const md = await convertDocumentLocally(cleaned.cleanedHtml, "html", "standard");

      citations.push({
        title: page.title || title,
        url,
        snippet: cleaned.excerpt || md.slice(0, 300) + "...",
        markdownExtract: md.slice(0, 4000), // First 4k chars of clean article
      });
    } catch {
      citations.push({
        title,
        url,
        snippet: "Source referenced via search grounding.",
      });
    }
  }

  // Step 4: Construct consolidated Markdown report
  const reportBuilder: string[] = [
    `---`,
    `title: "AI Search & Scrape Synthesis: ${options.query}"`,
    `query: "${options.query}"`,
    `sources_count: ${citations.length}`,
    `generated_at: "${new Date().toISOString()}"`,
    `engine: "Google Search Grounding + Playwright Deep Scrape"`,
    `---`,
    `\n# ${options.query}\n`,
    `${rawAnswer}\n\n`,
    `## Verified Primary Web Source Extracts\n`,
  ];

  for (let i = 0; i < citations.length; i++) {
    const c = citations[i];
    reportBuilder.push(
      `### ${i + 1}. [${c.title}](${c.url})\n` +
      `**URL:** \`${c.url}\`\n\n` +
      (c.markdownExtract
        ? `\`\`\`markdown\n${c.markdownExtract}\n\`\`\`\n`
        : `*Source verified in search grounding.*\n`)
    );
  }

  const synthesizedReport = reportBuilder.join("\n");
  const durationMs = Date.now() - startTime;

  return {
    query: options.query,
    synthesizedReport,
    citations,
    durationMs,
  };
}
