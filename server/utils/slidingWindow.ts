export interface PageChunk {
  pageNumber: number;
  text: string;
}

export interface SlidingWindow {
  windowIndex: number;
  totalWindows: number;
  startPage: number;
  endPage: number;
  pagesText: string;
}

/**
 * Parses raw pageText (containing '--- PAGE X ---' headers) into structured PageChunk array.
 */
export function parsePageChunks(pageText: string): PageChunk[] {
  if (!pageText || !pageText.trim()) return [];
  const parts = pageText.split(/--- PAGE (\d+) ---/);
  const chunks: PageChunk[] = [];

  if (parts.length < 2) {
    return [{ pageNumber: 1, text: pageText.trim() }];
  }

  for (let i = 1; i < parts.length; i += 2) {
    const pageNum = parseInt(parts[i], 10) || Math.floor(i / 2) + 1;
    const text = parts[i + 1] ? parts[i + 1].trim() : "";
    chunks.push({ pageNumber: pageNum, text });
  }

  return chunks;
}

/**
 * Creates sliding windows with overlap to handle large multi-page documents seamlessly.
 * Overlap prevents cross-page tables or continuous sentences from being truncated or broken.
 */
export function createSlidingWindows(
  pages: PageChunk[],
  windowSize = 8,
  overlapSize = 2
): SlidingWindow[] {
  if (pages.length === 0) return [];
  if (pages.length <= windowSize) {
    return [
      {
        windowIndex: 0,
        totalWindows: 1,
        startPage: pages[0].pageNumber,
        endPage: pages[pages.length - 1].pageNumber,
        pagesText: pages.map((p) => `--- PAGE ${p.pageNumber} ---\n${p.text}`).join("\n\n"),
      },
    ];
  }

  const windows: SlidingWindow[] = [];
  let startIndex = 0;

  while (startIndex < pages.length) {
    const endIndex = Math.min(startIndex + windowSize, pages.length);
    const windowPages = pages.slice(startIndex, endIndex);

    windows.push({
      windowIndex: windows.length,
      totalWindows: 0,
      startPage: windowPages[0].pageNumber,
      endPage: windowPages[windowPages.length - 1].pageNumber,
      pagesText: windowPages.map((p) => `--- PAGE ${p.pageNumber} ---\n${p.text}`).join("\n\n"),
    });

    if (endIndex >= pages.length) break;
    // Advance by (windowSize - overlapSize)
    startIndex += windowSize - overlapSize;
  }

  const total = windows.length;
  return windows.map((w) => ({ ...w, totalWindows: total }));
}
