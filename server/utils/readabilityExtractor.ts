/**
 * @file server/utils/readabilityExtractor.ts
 * @description High-performance Readability and Content-Pruning Engine for HTML web pages.
 * Isolates the primary article/document body and systematically eliminates:
 * - Advertisements, sponsored blocks, and promotional banners
 * - Navigation headers, navbars, sidebars, and breadcrumbs
 * - Cookie consent banners, GDPR notices, and newsletter popups
 * - Tracking pixels, decorative icons, and graphical clutter
 * - Social sharing buttons, comment sections, and related post carousels
 */

export interface ReadabilityOptions {
  stripImages?: boolean;
  preserveLinks?: boolean;
  minWordCount?: boolean;
  docTitle?: string;
}

export interface ReadabilityResult {
  title: string;
  byline?: string;
  siteName?: string;
  publishedTime?: string;
  cleanedHtml: string;
  textWordCount: number;
  prunedElementCount: number;
  adBlocksRemoved: number;
  isArticleDetected: boolean;
}

// Clutter / Advertisement / Navigation class and ID patterns
const UNLIKELY_CANDIDATES_REGEX = /(?:^|\s|-|_)(?:ad|ads|advert|advertisement|advertising|sponsor|sponsored|promo|promotion|banner-ad|google-ad|taboola|outbrain|cookie|consent|gdpr|privacy-banner|modal|overlay|newsletter|subscribe|signup|drawer|sidebar|navbar|nav-item|breadcrumb|social-share|share-btn|share-button|comments|disqus|related-posts|recommended|trending|widget|footer|header|masthead|inline-ad)(?:$|\s|-|_)/i;

// Highly likely article container classes / IDs
const OK_MAYBE_ITS_A_CANDIDATE_REGEX = /(?:^|\s|-|_)(?:article|body|content|entry|main|page|post|story|text|blog|prose|markdown-body|documentation|article-content|post-body)(?:$|\s|-|_)/i;

/**
 * Strips known noise tags completely (scripts, styles, inputs, forms, iframes, SVGs, etc.)
 */
function stripNoiseTags(html: string): { html: string; removedCount: number } {
  let count = 0;
  let cleaned = html;

  const noiseTagPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,
    /<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi,
    /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
    /<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi,
    /<canvas\b[^<]*(?:(?!<\/canvas>)<[^<]*)*<\/canvas>/gi,
    /<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi,
    /<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi,
    /<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi,
    /<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi,
    /<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi,
    /<!--[\s\S]*?-->/g, // HTML comments
  ];

  for (const pattern of noiseTagPatterns) {
    const matches = cleaned.match(pattern);
    if (matches) {
      count += matches.length;
      cleaned = cleaned.replace(pattern, " ");
    }
  }

  return { html: cleaned, removedCount: count };
}

/**
 * Extracts metadata (title, author, published date, site name) from HTML head.
 */
function extractHtmlMetadata(rawHtml: string): {
  title: string;
  byline?: string;
  siteName?: string;
  publishedTime?: string;
} {
  let title = "";
  let byline = "";
  let siteName = "";
  let publishedTime = "";

  // Title extraction
  const ogTitleMatch = rawHtml.match(/<meta\s+[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
    rawHtml.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  if (ogTitleMatch) {
    title = ogTitleMatch[1];
  } else {
    const titleTagMatch = rawHtml.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    if (titleTagMatch) {
      title = titleTagMatch[1].replace(/\s+/g, " ").trim();
    }
  }

  // Site name extraction
  const siteNameMatch = rawHtml.match(/<meta\s+[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i) ||
    rawHtml.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:site_name["']/i);
  if (siteNameMatch) {
    siteName = siteNameMatch[1].trim();
  }

  // Author / Byline extraction
  const authorMatch = rawHtml.match(/<meta\s+[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i) ||
    rawHtml.match(/<meta\s+[^>]*property=["']article:author["'][^>]*content=["']([^"']+)["']/i);
  if (authorMatch) {
    byline = authorMatch[1].trim();
  }

  // Publish date extraction
  const dateMatch = rawHtml.match(/<meta\s+[^>]*property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i) ||
    rawHtml.match(/<time\b[^>]*datetime=["']([^"']+)["']/i);
  if (dateMatch) {
    publishedTime = dateMatch[1].trim();
  }

  return { title, byline, siteName, publishedTime };
}

/**
 * Removes clutter elements identified by class, id, or role (ads, popups, cookie bars).
 */
function pruneClutterNodes(html: string): { html: string; prunedAds: number } {
  let prunedAds = 0;
  let cleaned = html;

  // Remove elements with ad/clutter attributes (div, section, aside, span, p)
  const elementPattern = /<(div|section|aside|span|p|ul|ol)\b([^>]*?)>([\s\S]*?)<\/\1>/gi;

  cleaned = cleaned.replace(elementPattern, (fullMatch, tag, attrs, content) => {
    const classOrId = `${attrs}`;
    if (
      UNLIKELY_CANDIDATES_REGEX.test(classOrId) &&
      !OK_MAYBE_ITS_A_CANDIDATE_REGEX.test(classOrId)
    ) {
      prunedAds++;
      return ""; // Drop the clutter element completely
    }
    return fullMatch;
  });

  return { html: cleaned, prunedAds };
}

/**
 * Prunes graphics, tracking pixels, and inline base64 graphics if text-only is requested.
 */
function pruneImagesAndGraphics(html: string, stripAllImages: boolean = false): string {
  let cleaned = html;

  // 1. Always remove 1x1 tracking pixels and decorative spacer GIFs
  cleaned = cleaned.replace(/<img\s+[^>]*?(?:width=["']1["']|height=["']1["']|spacer\.gif|pixel\.gif|1x1)[^>]*?>/gi, "");

  if (stripAllImages) {
    // Replace images with their alt text caption if present, otherwise strip
    cleaned = cleaned.replace(/<img\s+[^>]*?alt=["']([^"']+)["'][^>]*?>/gi, " *[Image: $1]* ");
    cleaned = cleaned.replace(/<img\b[^>]*?>/gi, "");
    cleaned = cleaned.replace(/<picture\b[^<]*(?:(?!<\/picture>)<[^<]*)*<\/picture>/gi, "");
    cleaned = cleaned.replace(/<figure\b[^>]*>([\s\S]*?)<\/figure>/gi, (match, inner) => {
      const captionMatch = inner.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i);
      return captionMatch ? `<p><em>${captionMatch[1].replace(/<[^>]+>/g, "").trim()}</em></p>` : "";
    });
  }

  return cleaned;
}

/**
 * Isolates the main article or content body if high-confidence article markers exist.
 */
function extractArticleContainer(html: string): { articleHtml: string; isArticle: boolean } {
  // Strategy 1: Look for semantic <article> or <main> container
  const semanticArticleMatch = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (semanticArticleMatch && semanticArticleMatch[1].trim().length > 200) {
    return { articleHtml: semanticArticleMatch[1], isArticle: true };
  }

  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch && mainMatch[1].trim().length > 200) {
    return { articleHtml: mainMatch[1], isArticle: true };
  }

  const roleMainMatch = html.match(/<div\b[^>]*role=["']main["'][^>]*>([\s\S]*?)<\/div>/i);
  if (roleMainMatch && roleMainMatch[1].trim().length > 200) {
    return { articleHtml: roleMainMatch[1], isArticle: true };
  }

  // Strategy 2: Look for common article content classes (.article-body, .post-content, .entry-content, .markdown-body)
  const classMatches = [
    /<div\b[^>]*class=["'][^"']*\b(?:article-body|post-content|entry-content|markdown-body|story-content|prose)\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<section\b[^>]*class=["'][^"']*\b(?:article-body|post-content|entry-content|markdown-body|story-content|prose)\b[^"']*["'][^>]*>([\s\S]*?)<\/section>/i,
  ];

  for (const pattern of classMatches) {
    const match = html.match(pattern);
    if (match && match[1].trim().length > 200) {
      return { articleHtml: match[1], isArticle: true };
    }
  }

  // Strategy 3: Fallback to the sanitized body
  return { articleHtml: html, isArticle: false };
}

/**
 * Main Readability Content-Pruning Pipeline:
 * Cleans HTML web pages down to core article content, eliminating ads, menus, and graphics.
 */
export function extractCleanArticleHtml(
  rawHtml: string,
  options: ReadabilityOptions = {}
): ReadabilityResult {
  // Step 1: Extract document metadata (title, author, date, site name)
  const metadata = extractHtmlMetadata(rawHtml);

  // Step 2: Strip scripts, styles, iframes, SVGs, navs, headers, footers
  const { html: tagSanitized, removedCount: tagRemovedCount } = stripNoiseTags(rawHtml);

  // Step 3: Prune ad blocks, cookie banners, popups, social counters
  const { html: adPruned, prunedAds } = pruneClutterNodes(tagSanitized);

  // Step 4: Isolate primary article container
  const { articleHtml, isArticle } = extractArticleContainer(adPruned);

  // Step 5: Prune images & graphics if requested (or remove tracking pixels)
  const finalHtml = pruneImagesAndGraphics(articleHtml, options.stripImages ?? false);

  // Compute text word count
  const plainText = finalHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const words = plainText.length > 0 ? plainText.split(/\s+/).length : 0;

  return {
    title: metadata.title || options.docTitle || "Web Document",
    byline: metadata.byline,
    siteName: metadata.siteName,
    publishedTime: metadata.publishedTime,
    cleanedHtml: finalHtml,
    textWordCount: words,
    prunedElementCount: tagRemovedCount + prunedAds,
    adBlocksRemoved: prunedAds,
    isArticleDetected: isArticle,
  };
}
