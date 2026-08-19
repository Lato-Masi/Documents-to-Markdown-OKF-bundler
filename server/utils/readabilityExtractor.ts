/**
 * @file server/utils/readabilityExtractor.ts
 * @description High-performance Reader Mode Engine for any web page or article.
 * Combines Mozilla Readability (Firefox Reader View engine), JSDOM, and Turndown GFM
 * to extract clean, readable, clutter-free Markdown from any website.
 *
 * Capabilities:
 * - Mozilla Readability DOM scoring & link-density article isolation
 * - Universal clutter pruning (ads, navbars, sidebars, cookie banners, tracking pixels, popups)
 * - Domain-specific optimizations (Wikipedia, GitHub, Medium, Substack, News, Docs)
 * - Math & LaTeX formula preservation (KaTeX, MathJax, MediaWiki math elements)
 * - Code syntax block preservation with language tagging
 * - Table formatting & GitHub-Flavored Markdown (GFM) output
 * - Full metadata extraction (title, author/byline, site name, publication date, excerpt, reading time)
 */

import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
// @ts-ignore - turndown-plugin-gfm CommonJS types
import { gfm } from "turndown-plugin-gfm";

export interface ReadabilityOptions {
  stripImages?: boolean;
  preserveLinks?: boolean;
  docTitle?: string;
  sourceUrl?: string;
}

export interface ReadabilityResult {
  title: string;
  byline?: string;
  siteName?: string;
  publishedTime?: string;
  excerpt?: string;
  markdown: string;
  cleanedHtml: string;
  textWordCount: number;
  readingTimeMinutes: number;
  prunedElementCount: number;
  adBlocksRemoved: number;
  isArticleDetected: boolean;
}

/**
 * Universal noise selectors present across generic web pages.
 */
const UNIVERSAL_NOISE_SELECTORS = [
  // Scripts, styles, and web app chrome
  "script",
  "style",
  "noscript",
  "template",
  "canvas",
  "dialog",
  "applet",
  
  // Navigation, headers, footers
  "nav",
  "header:not(.article-header):not(.entry-header):not(.post-header)",
  "footer:not(.article-footer)",
  "aside:not(.pullquote):not(.article-aside)",
  
  // Forms, inputs, search boxes, login widgets
  "form",
  "input",
  "select",
  "textarea",
  "button:not([role='tab'])",
  
  // Cookie notices, GDPR walls, paywall teasers, newsletters
  "[id*='cookie' i]",
  "[class*='cookie' i]",
  "[id*='consent' i]",
  "[class*='consent' i]",
  "[id*='gdpr' i]",
  "[class*='gdpr' i]",
  "[class*='newsletter' i]",
  "[id*='newsletter' i]",
  "[class*='subscribe' i]",
  "[id*='subscribe' i]",
  "[class*='paywall-banner' i]",
  "[class*='modal' i]:not([class*='article'])",
  "[class*='popup' i]",
  "[class*='overlay' i]:not([class*='content'])",
  
  // Advertisements and sponsored blocks
  "[class*='advert' i]",
  "[id*='advert' i]",
  "[class*='google-ad' i]",
  "[id*='google-ad' i]",
  "[class*='ad-container' i]",
  "[class*='ad-wrapper' i]",
  "[class*='ad-banner' i]",
  "[class*='ad-slot' i]",
  "[class*='dfp-ad' i]",
  "[class*='taboola' i]",
  "[id*='taboola' i]",
  "[class*='outbrain' i]",
  "[id*='outbrain' i]",
  "[class*='sponsor' i]",
  "[id*='sponsor' i]",
  "[data-ad]",
  "[data-ad-unit]",
  
  // Social sharing bars, comment widgets
  "[class*='social-share' i]",
  "[class*='share-buttons' i]",
  "[class*='share-bar' i]",
  "[id*='disqus' i]",
  "[class*='disqus' i]",
  "[id*='comments' i]:not([class*='post']):not([class*='article'])",
  "[class*='comments' i]:not([class*='post']):not([class*='article'])",
  "[class*='related-posts' i]",
  "[class*='recommended-stories' i]",
  "[class*='more-from' i]",
  "[class*='trending' i]",
  
  // Hidden / screen-reader only elements with noise
  "[aria-hidden='true']:not([class*='math'])",
  ".hidden:not([class*='math'])",
  ".d-none:not([class*='math'])",
];

/**
 * Domain-specific noise filters (e.g. Wikipedia, Medium, GitHub docs).
 */
function cleanSiteSpecificClutter(doc: Document, sourceUrl?: string): number {
  let count = 0;
  if (!sourceUrl) return count;

  const urlLower = sourceUrl.toLowerCase();

  // 1. Wikipedia / Wikimedia
  if (urlLower.includes("wikipedia.org") || urlLower.includes("wikimedia.org") || urlLower.includes("wiktionary.org")) {
    const wikipediaSelectors = [
      ".mw-editsection",              // "[edit]" section links
      ".navbox",                      // Bottom navigation tables
      ".vertical-navbox",             // Side navigation boxes
      ".sidebar",                     // Sidebars
      ".ambox",                       // Article message boxes ("needs citations", etc.)
      ".ombox",                       // Other message boxes
      ".tmbox",                       // Talk message boxes
      ".cmbox",                       // Category message boxes
      ".fmbox",                       // Footer message boxes
      ".toc",                         // On-page Table of Contents
      "#toc",
      ".vector-toc",
      ".vector-page-toolbar",
      ".vector-dropdown",
      ".mw-jump-link",                // Jump to navigation
      ".noprint",                     // Print-hidden content
      ".mw-empty-elt",                // Empty template nodes
      ".mw-file-description",         // Image link text
      ".hatnote",                     // "For other uses, see..." hatnotes
      ".sister-project",              // Wikimedia sister project boxes
      ".metadata",                    // Internal metadata markers
      ".portal",                      // Portal links
      ".mw-ui-button",                // UI action buttons
      "#mw-navigation",               // Navigation frame
      "#mw-related-navigation",
      "#p-lang",                      // Language selector
      ".reflist .mw-cite-backlink",   // Reference backlink arrows (^ a b c)
    ];

    for (const sel of wikipediaSelectors) {
      doc.querySelectorAll(sel).forEach((el) => {
        el.remove();
        count++;
      });
    }

    // Preserve mathematical equations: Convert Wikipedia LaTeX formulas into standard Markdown math
    doc.querySelectorAll(".mwe-math-element, math").forEach((mathEl) => {
      const altTex = mathEl.getAttribute("alt") || mathEl.querySelector("annotation[encoding='application/x-tex']")?.textContent;
      if (altTex) {
        const isBlock = mathEl.classList.contains("mwe-math-fallback-image-display") || mathEl.tagName.toLowerCase() === "math";
        const mathText = isBlock ? `\n\n$$\n${altTex.trim()}\n$$\n\n` : `$${altTex.trim()}$`;
        const textNode = doc.createTextNode(mathText);
        mathEl.parentNode?.replaceChild(textNode, mathEl);
      }
    });

    // Fix relative links to absolute Wikipedia links
    doc.querySelectorAll("a[href^='/']").forEach((link) => {
      const href = link.getAttribute("href");
      if (href && !href.startsWith("//")) {
        link.setAttribute("href", `https://en.wikipedia.org${href}`);
      }
    });
  }

  // 2. Medium & Substack
  if (urlLower.includes("medium.com") || urlLower.includes("substack.com")) {
    const mediumSelectors = [
      "[data-test-id='post-sidebar']",
      "[data-test-id='newsletter-banner']",
      ".meteredContent",
      ".speechify-ignore",
      "[data-action='open-social-menu']",
    ];
    for (const sel of mediumSelectors) {
      doc.querySelectorAll(sel).forEach((el) => {
        el.remove();
        count++;
      });
    }
  }

  // 3. GitHub / Gitlab / Documentation
  if (urlLower.includes("github.com") || urlLower.includes("gitlab.com") || urlLower.includes("docs.")) {
    const docSelectors = [
      ".Header",
      ".repohead",
      ".file-navigation",
      ".Box-header",
      ".commit-tease",
      ".pagehead-actions",
      ".js-header-wrapper",
    ];
    for (const sel of docSelectors) {
      doc.querySelectorAll(sel).forEach((el) => {
        el.remove();
        count++;
      });
    }
  }

  return count;
}

/**
 * Sanitizes and normalizes DOM nodes before readability extraction.
 */
function preCleanDocument(doc: Document, sourceUrl?: string): { prunedCount: number; adsRemoved: number } {
  let prunedCount = 0;
  let adsRemoved = 0;

  // 1. Remove site-specific clutter
  prunedCount += cleanSiteSpecificClutter(doc, sourceUrl);

  // 2. Strip universal noise selectors
  for (const selector of UNIVERSAL_NOISE_SELECTORS) {
    try {
      const elements = doc.querySelectorAll(selector);
      elements.forEach((el) => {
        if (/ad|banner|sponsor|taboola|outbrain|google/i.test(selector)) {
          adsRemoved++;
        }
        el.remove();
        prunedCount++;
      });
    } catch {
      // Ignore unsupported selector queries
    }
  }

  // 3. Strip 1x1 tracking pixels, hidden spacer images, and zero-width nodes
  doc.querySelectorAll("img").forEach((img) => {
    const width = img.getAttribute("width");
    const height = img.getAttribute("height");
    const src = img.getAttribute("src") || "";
    if (
      width === "1" ||
      height === "1" ||
      width === "0" ||
      height === "0" ||
      /1x1|spacer\.gif|pixel\.gif|tracking|beacon/i.test(src)
    ) {
      img.remove();
      prunedCount++;
    }
  });

  return { prunedCount, adsRemoved };
}

/**
 * Configure and construct a specialized TurndownService instance with GFM tables and math.
 */
function createTurndownConverter(options: ReadabilityOptions): TurndownService {
  const turndown = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    strongDelimiter: "**",
  });

  // Attach GitHub Flavored Markdown (tables, task lists, strikethrough)
  turndown.use(gfm);

  // Custom rule: Code blocks with language preservation
  turndown.addRule("fencedCodeBlockWithLang", {
    filter: (node) => {
      return (
        node.nodeName === "PRE" ||
        (node.nodeName === "DIV" && node.classList.contains("highlight"))
      );
    },
    replacement: (_content, node) => {
      const element = node as HTMLElement;
      const codeEl = element.querySelector("code") || element;
      
      // Determine language from class list (e.g. language-typescript, highlight-source-python, lang-js)
      let lang = "";
      const classAttr = `${element.className} ${codeEl.className}`;
      const langMatch = classAttr.match(/(?:language|lang|highlight-source)-([a-zA-Z0-9_-]+)/i);
      if (langMatch) {
        lang = langMatch[1].toLowerCase();
      }

      const text = codeEl.textContent || element.textContent || "";
      return `\n\n\`\`\`${lang}\n${text.replace(/\r\n/g, "\n").trim()}\n\`\`\`\n\n`;
    },
  });

  // Custom rule: Math formulas and block equations
  turndown.addRule("mathFormulas", {
    filter: (node) => {
      return (
        node.nodeName === "SPAN" &&
        (node.classList.contains("katex") ||
          node.classList.contains("MathJax") ||
          node.classList.contains("math") ||
          node.hasAttribute("data-math"))
      );
    },
    replacement: (_content, node) => {
      const el = node as HTMLElement;
      const latex =
        el.getAttribute("data-math") ||
        el.querySelector("annotation[encoding='application/x-tex']")?.textContent ||
        el.textContent ||
        "";
      return `$${latex.trim()}$`;
    },
  });

  // Custom rule: Clean up or strip images if text-only mode
  if (options.stripImages) {
    turndown.addRule("stripImagesMode", {
      filter: "img",
      replacement: (_content, node) => {
        const alt = (node as HTMLElement).getAttribute("alt");
        return alt ? ` *[Image: ${alt.trim()}]* ` : "";
      },
    });
  }

  // Custom rule: Handle Wikipedia/Generic blockquotes and callouts
  turndown.addRule("callouts", {
    filter: (node) => {
      return (
        node.nodeName === "DIV" &&
        (node.classList.contains("callout") ||
          node.classList.contains("quote") ||
          node.classList.contains("infobox-note"))
      );
    },
    replacement: (content) => {
      const cleanContent = content.trim().replace(/^/gm, "> ");
      return `\n\n${cleanContent}\n\n`;
    },
  });

  return turndown;
}

/**
 * Main Reader Mode Extraction Function:
 * Takes raw HTML string and produces clean article Markdown and structured metadata.
 */
export function extractCleanArticleHtml(
  rawHtml: string,
  options: ReadabilityOptions = {}
): ReadabilityResult {
  if (!rawHtml || typeof rawHtml !== "string" || rawHtml.trim().length === 0) {
    return {
      title: options.docTitle || "Untitled Document",
      markdown: "",
      cleanedHtml: "",
      textWordCount: 0,
      readingTimeMinutes: 0,
      prunedElementCount: 0,
      adBlocksRemoved: 0,
      isArticleDetected: false,
    };
  }

  // Step 1: Parse HTML into a robust JSDOM instance
  let dom: JSDOM;
  try {
    dom = new JSDOM(rawHtml, {
      url: options.sourceUrl || "https://example.com/article",
      referrer: options.sourceUrl,
      contentType: "text/html",
    });
  } catch {
    // Fallback: minimal JSDOM document
    dom = new JSDOM(`<!DOCTYPE html><html><body>${rawHtml}</body></html>`);
  }

  const doc = dom.window.document;

  // Step 2: Pre-clean clutter, ads, navigation, cookie banners, tracking scripts
  const { prunedCount, adsRemoved } = preCleanDocument(doc, options.sourceUrl);

  // Step 3: Run Mozilla Readability Engine to isolate the core article body
  let article: ReturnType<Readability["parse"]> = null;
  let isArticleDetected = false;

  try {
    const reader = new Readability(doc, {
      charThreshold: 150,
      keepClasses: false,
      nbTopCandidates: 5,
    });
    article = reader.parse();
    if (article && article.content && article.content.trim().length > 100) {
      isArticleDetected = true;
    }
  } catch (readerErr) {
    console.warn("[Reader Mode] Mozilla Readability parse notice:", readerErr);
  }

  // Step 4: Determine final HTML content and metadata
  const docTitle =
    article?.title ||
    doc.querySelector("title")?.textContent?.trim() ||
    doc.querySelector("h1")?.textContent?.trim() ||
    options.docTitle ||
    "Web Document";

  const siteName =
    article?.siteName ||
    doc.querySelector("meta[property='og:site_name']")?.getAttribute("content") ||
    (options.sourceUrl ? new URL(options.sourceUrl).hostname.replace(/^www\./, "") : undefined);

  const byline =
    article?.byline ||
    doc.querySelector("meta[name='author']")?.getAttribute("content") ||
    doc.querySelector("meta[property='article:author']")?.getAttribute("content") ||
    undefined;

  const publishedTime =
    doc.querySelector("meta[property='article:published_time']")?.getAttribute("content") ||
    doc.querySelector("time")?.getAttribute("datetime") ||
    undefined;

  const excerpt =
    article?.excerpt ||
    doc.querySelector("meta[name='description']")?.getAttribute("content") ||
    doc.querySelector("meta[property='og:description']")?.getAttribute("content") ||
    undefined;

  // Content HTML: Readability output, or fallback to cleaned body
  const cleanedHtml = article?.content || doc.body?.innerHTML || rawHtml;

  // Step 5: Convert cleaned HTML into structured Markdown via Turndown + GFM
  const turndown = createTurndownConverter(options);
  let markdown = "";

  try {
    markdown = turndown.turndown(cleanedHtml).trim();
  } catch (tdErr) {
    console.warn("[Reader Mode] Turndown conversion fallback:", tdErr);
    // Plaintext fallback
    markdown = (article?.textContent || doc.body?.textContent || "")
      .replace(/\n\s*\n\s*\n/g, "\n\n")
      .trim();
  }

  // Post-processing cleanup for generated Markdown
  markdown = markdown
    .replace(/\n{3,}/g, "\n\n") // Collapse consecutive blank lines
    .replace(/\[\s*\]\(\s*\)/g, "") // Remove empty markdown links []()
    .trim();

  // Word count & Reading time calculation
  const plainText = (article?.textContent || markdown.replace(/[#*`_\[\]()]/g, " ")).trim();
  const words = plainText.length > 0 ? plainText.split(/\s+/).filter(Boolean).length : 0;
  const readingTimeMinutes = Math.max(1, Math.ceil(words / 200));

  return {
    title: docTitle.replace(/\s+/g, " ").trim(),
    byline: byline?.trim(),
    siteName: siteName?.trim(),
    publishedTime: publishedTime?.trim(),
    excerpt: excerpt?.trim(),
    markdown,
    cleanedHtml,
    textWordCount: words,
    readingTimeMinutes,
    prunedElementCount: prunedCount,
    adBlocksRemoved: adsRemoved,
    isArticleDetected,
  };
}

export default extractCleanArticleHtml;

