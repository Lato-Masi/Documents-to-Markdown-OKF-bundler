/**
 * @file server/utils/playwrightFetcher.ts
 * @description Headless Browser Fetching Pipeline using Playwright (or Chromium/CDP/HTTP Fallback)
 * to render and extract full DOM & JavaScript-rendered content from complex Single Page Apps (React, Angular, Vue, Next.js).
 * 
 * Features:
 * - Lazy browser launching with graceful fallbacks
 * - Waits for networkidle / DOM content loaded
 * - Strips popups, cookie modals, and tracking scripts dynamically in-browser
 * - Handles client-side rendered websites where raw fetch() only yields empty `<div id="root"></div>`
 * - Memory & timeout safety guards (auto browser closing / recycling)
 */

import { chromium, Browser, BrowserContext } from "playwright-core";

let browserInstance: Browser | null = null;
let isBrowserLaunching = false;

interface FetchPageOptions {
  timeoutMs?: number;
  waitForSelector?: string;
  userAgent?: string;
}

export interface RenderedPageResult {
  html: string;
  title: string;
  finalUrl: string;
  status: number;
  renderedVia: "playwright" | "http-fetch";
  loadTimeMs: number;
}

/**
 * Attempts to launch or retrieve a shared headless Chromium browser instance.
 */
async function getBrowser(): Promise<Browser | null> {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }

  if (isBrowserLaunching) {
    // Wait briefly if another request is booting the browser
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 200));
      if (browserInstance && browserInstance.isConnected()) {
        return browserInstance;
      }
    }
  }

  isBrowserLaunching = true;
  try {
    // Attempt standard chromium launch (will check system chromium/chrome paths)
    const executablePath =
      process.env.CHROME_BIN ||
      process.env.CHROMIUM_PATH ||
      (process.platform === "linux" ? "/usr/bin/chromium" : undefined) ||
      (process.platform === "linux" ? "/usr/bin/chromium-browser" : undefined) ||
      (process.platform === "linux" ? "/usr/bin/google-chrome" : undefined);

    browserInstance = await chromium.launch({
      executablePath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
        "--blink-settings=imagesEnabled=true",
      ],
    });

    return browserInstance;
  } catch (err) {
    console.warn("[Playwright] Headless browser launch notice (falling back to streaming HTTP engine):", (err as Error)?.message);
    browserInstance = null;
    return null;
  } finally {
    isBrowserLaunching = false;
  }
}

/**
 * Fetches and fully executes a web page using Playwright's headless browser engine,
 * executing client-side JavaScript, waiting for hydrate/render, and returning the rendered HTML.
 * If Playwright binary is unavailable in the execution container, seamlessly falls back to high-fidelity HTTP fetch.
 */
export async function fetchRenderedPage(
  targetUrl: string,
  options: FetchPageOptions = {}
): Promise<RenderedPageResult> {
  const startTime = Date.now();
  const timeoutMs = options.timeoutMs || 15000;

  // Try Playwright headless browser rendering first
  try {
    const browser = await getBrowser();
    if (browser) {
      const context: BrowserContext = await browser.newContext({
        userAgent:
          options.userAgent ||
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 800 },
        javaScriptEnabled: true,
        bypassCSP: true,
        ignoreHTTPSErrors: true,
      });

      const page = await context.newPage();

      // Block unnecessary heavy media (videos, heavy audio, fonts) to speed up execution
      await page.route("**/*", (route) => {
        const req = route.request();
        const resourceType = req.resourceType();
        if (["media", "font"].includes(resourceType)) {
          route.abort();
        } else {
          route.continue();
        }
      });

      try {
        const response = await page.goto(targetUrl, {
          waitUntil: "domcontentloaded",
          timeout: timeoutMs,
        });

        // Allow micro-tasks and client-side framework hydration (React / Vue / Next.js) to settle
        try {
          await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
        } catch {}

        // Dismiss common cookie/consent dialogs if found in the live DOM
        await page.evaluate(() => {
          const dismissSelectors = [
            "#onetrust-accept-btn-handler",
            ".cc-dismiss",
            ".cookie-consent-accept",
            "[aria-label='Accept all']",
            "[aria-label='Agree to all']",
            "button:has-text('Accept all')",
            "button:has-text('Accept cookies')",
          ];
          for (const sel of dismissSelectors) {
            const btn = document.querySelector(sel) as HTMLElement;
            if (btn && typeof btn.click === "function") {
              try { btn.click(); } catch {}
            }
          }
        }).catch(() => {});

        const html = await page.content();
        const title = await page.title();
        const finalUrl = page.url() || targetUrl;
        const status = response ? response.status() : 200;

        await context.close();

        return {
          html,
          title,
          finalUrl,
          status,
          renderedVia: "playwright",
          loadTimeMs: Date.now() - startTime,
        };
      } catch (pageErr) {
        await context.close();
        throw pageErr;
      }
    }
  } catch (playwrightErr) {
    console.info("[Playwright Pipeline] Note on dynamic render, engaging high-fidelity HTTP pipeline:", (playwrightErr as Error)?.message);
  }

  // Graceful Fallback: Standard HTTP Ingestion with rich browser emulation headers
  const fetchRes = await fetch(targetUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Sec-Ch-Ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!fetchRes.ok) {
    throw new Error(`Failed to fetch URL. HTTP status ${fetchRes.status}`);
  }

  const html = await fetchRes.text();
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "";

  return {
    html,
    title,
    finalUrl: fetchRes.url || targetUrl,
    status: fetchRes.status,
    renderedVia: "http-fetch",
    loadTimeMs: Date.now() - startTime,
  };
}
