import * as pdfParseModule from "pdf-parse";

export function getPdfParseFn(): ((docBuffer: Buffer, options?: any) => Promise<any>) | null {
  const candidates = [
    pdfParseModule,
    (pdfParseModule as any)?.default,
    (pdfParseModule as any)?.default?.default,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "function") {
      return candidate;
    }
  }
  try {
    const loaded = require("pdf-parse");
    if (typeof loaded === "function") return loaded;
    if (typeof loaded?.default === "function") return loaded.default;
  } catch (e) {
    // ignore
  }
  return null;
}

// Helper to convert pdf-parse extracted text into clean, structured Markdown
export function processPdfTextToStructuredMarkdown(pageText: string, totalPages: number, fileName: string): string {
  if (!pageText || !pageText.trim()) return "";

  const lines = pageText.split("\n");
  let markdown = `# ${fileName || "Converted Document"}\n\n`;
  if (totalPages > 0) {
    markdown += `> *PDF Document Extracted via High-Fidelity OCR/Layout Engine (${totalPages} Pages)*\n\n`;
  }

  const commonHeadingKeywords = new Set([
    "summary", "contact", "top skills", "skills", "languages", "honors-awards", "honors & awards",
    "publications", "patents", "experience", "work experience", "education", "certifications",
    "projects", "overview", "introduction", "background", "references", "about", "profile"
  ]);

  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      if (inList) {
        markdown += "\n";
        inList = false;
      }
      continue;
    }

    // Page divider
    if (trimmed.startsWith("--- PAGE ")) {
      const pageLabel = trimmed.replace(/---/g, "").trim();
      markdown += `\n---\n\n### ${pageLabel}\n\n`;
      inList = false;
      continue;
    }

    const lowerTrimmed = trimmed.toLowerCase().replace(/[:\-_]/g, " ").trim();

    // Check if line looks like a major section heading
    if (
      commonHeadingKeywords.has(lowerTrimmed) ||
      (trimmed.length <= 40 && /^[A-Z][A-Za-z0-9\s&,\-\/]{2,35}$/.test(trimmed) && !trimmed.endsWith("."))
    ) {
      markdown += `\n## ${trimmed}\n\n`;
      inList = false;
      continue;
    }

    // Bullet points or numbered lists
    if (/^[•\-\*\u2022]\s+/.test(trimmed)) {
      markdown += `${trimmed.replace(/^[•\-\*\u2022]\s+/, "- ")}\n`;
      inList = true;
      continue;
    }
    if (/^\d+[\.\)]\s+/.test(trimmed)) {
      markdown += `${trimmed}\n`;
      inList = true;
      continue;
    }

    markdown += `${trimmed}\n\n`;
  }

  return markdown.trim();
}

// Helper to extract page-by-page text and spatial structure from PDF documents with strict timeout guard
export async function extractPdfPageByPageText(
  buffer: Buffer,
  fileName: string = ""
): Promise<{ totalPages: number; pageText: string; structuredMarkdown: string }> {
  const parseFn = getPdfParseFn();
  if (!parseFn) {
    console.warn("pdf-parse module could not be resolved as a function.");
    return { totalPages: 0, pageText: "", structuredMarkdown: "" };
  }

  const extractionPromise = (async () => {
    try {
      const pdfParseOptions = {
        pagerender: function (pageData: any) {
          return pageData.getTextContent().then(function (textContent: any) {
            const items = (textContent.items || []).map((item: any) => {
              const transform = item.transform || [1, 0, 0, 1, 0, 0];
              return {
                str: item.str || "",
                x: transform[4] || 0,
                y: transform[5] || 0,
                height: item.height || Math.abs(transform[3]) || 10,
              };
            });

            // Sort items by Y descending (top of page to bottom), then X ascending (left to right)
            items.sort((a: any, b: any) => {
              const yDiff = b.y - a.y;
              if (Math.abs(yDiff) > 3) {
                return yDiff;
              }
              return a.x - b.x;
            });

            let lastY: number | null = null;
            let currentLineParts: string[] = [];
            const lines: string[] = [];

            for (const item of items) {
              if (!item.str && !item.str.trim()) continue;
              if (lastY === null || Math.abs(lastY - item.y) > 3) {
                if (currentLineParts.length > 0) {
                  lines.push(currentLineParts.join(" "));
                  currentLineParts = [];
                }
                lastY = item.y;
              }
              currentLineParts.push(item.str.trim());
            }
            if (currentLineParts.length > 0) {
              lines.push(currentLineParts.join(" "));
            }

            const pageNum = pageData.pageIndex + 1;
            return `\n\n--- PAGE ${pageNum} ---\n\n${lines.join("\n")}`;
          });
        },
      };

      const parsedPdf = await parseFn(buffer, pdfParseOptions);
      const totalPages = parsedPdf?.numpages || 0;
      const pageText = parsedPdf?.text ? parsedPdf.text.trim() : "";
      const structuredMarkdown = processPdfTextToStructuredMarkdown(pageText, totalPages, fileName);

      return {
        totalPages,
        pageText,
        structuredMarkdown,
      };
    } catch (err) {
      console.warn("PDF page-by-page text extraction warning:", err);
      try {
        const basicParsed = await parseFn(buffer);
        const totalPages = basicParsed?.numpages || 0;
        const pageText = basicParsed?.text ? basicParsed.text.trim() : "";
        const structuredMarkdown = processPdfTextToStructuredMarkdown(pageText, totalPages, fileName);
        return {
          totalPages,
          pageText,
          structuredMarkdown,
        };
      } catch {
        return { totalPages: 0, pageText: "", structuredMarkdown: "" };
      }
    }
  })();

  // 3.5 second timeout guard: if pdf-parse takes longer than 3.5s, fall back to direct Gemini multimodal PDF stream
  const timeoutPromise = new Promise<{ totalPages: number; pageText: string; structuredMarkdown: string }>((resolve) => {
    setTimeout(() => {
      console.warn("PDF local pre-parsing timed out after 3500ms; proceeding directly with Gemini multimodal PDF stream.");
      resolve({ totalPages: 0, pageText: "", structuredMarkdown: "" });
    }, 3500);
  });

  return Promise.race([extractionPromise, timeoutPromise]);
}

export interface PdfPreflightResult {
  totalPages: number;
  pageText: string;
  structuredMarkdown: string;
  metrics: {
    avgCharsPerPage: number;
    isScannedOrImageHeavy: boolean;
    hasMultiColumnLayout: boolean;
    mathAndSymbolDensity: number;
    tableGridDensity: number;
    unicodeGarbleRatio: number;
    complexityScore: number;
  };
  recommendedRoute: "fast_path_deterministic" | "hybrid_gemini_multimodal";
  reasons: string[];
}

/**
 * Phase 1 Preflight Inspector: Analyzes PDF buffer to detect layout complexity,
 * scanned pages, math symbols, table grids, and unicode garbling before routing.
 */
export async function inspectPdfPreflight(
  buffer: Buffer,
  fileName: string = ""
): Promise<PdfPreflightResult> {
  const { totalPages, pageText, structuredMarkdown } = await extractPdfPageByPageText(buffer, fileName);
  const totalChars = pageText ? pageText.length : 0;
  const avgCharsPerPage = totalPages > 0 ? Math.round(totalChars / totalPages) : 0;
  const isScannedOrImageHeavy = totalPages === 0 || avgCharsPerPage < 60;

  // Math & LaTeX symbol detection
  const mathRegex = /(\\\(|\\\[|\\sum|\\int|\\partial|\\alpha|\\beta|\\gamma|\\delta|\\theta|\\lambda|\\approx|\\frac|\\le|\\ge|\\neq|\\in|\\forall|\\exists|\\rightarrow|√|∫|∑|∏|∞|≤|≥|≠|≈|∂|∆|±)/g;
  const mathMatches = pageText ? (pageText.match(mathRegex) || []).length : 0;

  // Multi-column layout detection (short lines ratio, parallel side-by-side blocks)
  let shortLinesCount = 0;
  let totalNonEmptyLines = 0;
  if (pageText) {
    const lines = pageText.split("\n").map(l => l.trim()).filter(Boolean);
    totalNonEmptyLines = lines.length;
    for (const line of lines) {
      if (line.length > 4 && line.length < 38 && !line.startsWith("#") && !line.startsWith("-")) {
        shortLinesCount++;
      }
    }
  }
  const shortLineRatio = totalNonEmptyLines > 0 ? shortLinesCount / totalNonEmptyLines : 0;
  const hasMultiColumnLayout = shortLineRatio > 0.32 || /cacm|acm|draft v\d|journal|conference|ieee|arxiv|col-2|two-column/i.test(pageText || "");

  // Table grid density detection
  const tableRegex = /(\|[^\n]+\||^\s*[\+\-]{3,}\s*$|^\s*\d+[\t\s]{2,}\d+[\t\s]{2,}\d+)/gm;
  const tableMatches = pageText ? (pageText.match(tableRegex) || []).length : 0;

  // Unicode garble ratio detection (\uFFFD or replacement characters)
  const garbleMatches = pageText ? (pageText.match(/[\uFFFD\x00-\x08\x0B\x0C\x0E-\x1F]/g) || []).length : 0;
  const unicodeGarbleRatio = totalChars > 0 ? garbleMatches / totalChars : 0;

  // Compute composite complexity score (0..100)
  const reasons: string[] = [];
  let score = 0;

  if (isScannedOrImageHeavy) {
    score += 40;
    reasons.push("Low text density (<60 chars/page) - scanned/image document requiring visual OCR");
  }

  if (hasMultiColumnLayout) {
    score += 30;
    reasons.push("Multi-column / side-by-side text layout structure detected");
  }

  if (mathMatches >= 5) {
    score += 25;
    reasons.push(`High math & LaTeX formula density (${mathMatches} math symbols)`);
  }

  if (tableMatches >= 3) {
    score += 20;
    reasons.push(`Complex tabular layout grid detected (${tableMatches} table markers)`);
  }

  if (unicodeGarbleRatio > 0.005) {
    score += 25;
    reasons.push(`Corrupted embedded font encoding detected (${(unicodeGarbleRatio * 100).toFixed(1)}% garbled glyphs)`);
  }

  if (score === 0) {
    reasons.push("Standard single-column text structure with clean embedded fonts");
  }

  const complexityScore = Math.min(100, score);
  // Route to multimodal AI if scanned, high math, garbled, or high complexity (>= 40)
  // For text-rich PDFs (>200 chars/page) with standard multi-column layout, recommend fast_path_deterministic
  const requiresMultimodal = isScannedOrImageHeavy || mathMatches >= 5 || unicodeGarbleRatio > 0.005 || complexityScore >= 40;
  const recommendedRoute = requiresMultimodal ? "hybrid_gemini_multimodal" : "fast_path_deterministic";

  return {
    totalPages,
    pageText,
    structuredMarkdown,
    metrics: {
      avgCharsPerPage,
      isScannedOrImageHeavy,
      hasMultiColumnLayout,
      mathAndSymbolDensity: mathMatches,
      tableGridDensity: tableMatches,
      unicodeGarbleRatio,
      complexityScore,
    },
    recommendedRoute,
    reasons,
  };
}
