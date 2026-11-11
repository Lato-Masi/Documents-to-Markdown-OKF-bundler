import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import {
  hasBrokenImageTag,
  stripBrokenImageTags,
  isDecorativeIconOrSymbolItem,
  isHeaderFooterNoiseItem,
  normalizeMarginSignature,
  sanitizePdfTextArtifacts,
  reconstructPdfMarkdownFromSpatialPages,
} from "../server/utils/pdfSpatialReconstructor";
import {
  parsePdfWithLiteParse,
  getCachedSpatialEntry,
  type SpatialPage,
} from "../server/utils/liteparseEngine";

const SAMPLE_PDF_PATH = path.resolve(
  process.cwd(),
  "public/assets/aistudio/ARK-Urban-Primary-Care-NCD-Policy-Brief_f91069ba.pdf"
);

describe("PDF Spatial Reconstructor & Artifact Filters", () => {
  it("detects and strips dead local PDF image tags while preserving valid external images", () => {
    expect(hasBrokenImageTag("![](img_p1_2.png)")).toBe(true);
    expect(hasBrokenImageTag("Text before ![Figure](page_2_img_1.jpg) text after")).toBe(true);
    expect(hasBrokenImageTag('<img src="img_p2_1.png" alt="broken">')).toBe(true);
    expect(hasBrokenImageTag("![Architecture](https://example.com/diagram.png)")).toBe(false);

    const stripped = stripBrokenImageTags(
      "Intro ![](img_p1_2.png) middle img_p2_1.png and ![Valid](https://example.com/chart.png)"
    );
    expect(stripped).not.toContain("img_p1_2.png");
    expect(stripped).not.toContain("img_p2_1.png");
    expect(stripped).toContain("![Valid](https://example.com/chart.png)");
  });

  it("filters decorative icon fonts, Private Use Area glyphs, and OCR vector icon noise", () => {
    expect(isDecorativeIconOrSymbolItem({ text: "A", fontName: "Wingdings-Regular" })).toBe(true);
    expect(isDecorativeIconOrSymbolItem({ text: "star", fontName: "FontAwesome6Free" })).toBe(true);
    expect(isDecorativeIconOrSymbolItem({ text: "\uF0A7\uE001" })).toBe(true);
    expect(isDecorativeIconOrSymbolItem({ text: "»=//" })).toBe(true);
    expect(isDecorativeIconOrSymbolItem({ text: "w=]" })).toBe(true);
    expect(isDecorativeIconOrSymbolItem({ text: "a =)" })).toBe(true);

    // Legitimate words, percentages, and headings must NOT be filtered
    expect(isDecorativeIconOrSymbolItem({ text: "31%", fontName: "Helvetica" })).toBe(false);
    expect(isDecorativeIconOrSymbolItem({ text: "NCD", fontName: "Arial-BoldMT" })).toBe(false);
    expect(isDecorativeIconOrSymbolItem({ text: "[1]", fontName: "Times-Roman" })).toBe(false);
  });

  it("identifies repeated running headers/footers and isolated margin page numbers without dropping body numbers", () => {
    const sig = normalizeMarginSignature("Policy Brief | Urban Health Systems - Page 1 of 2");
    const repeated = new Set<string>([sig]);

    // Repeated running header at top margin (y = 20 on 1000px page)
    expect(
      isHeaderFooterNoiseItem(
        { text: "Policy Brief | Urban Health Systems - Page 2 of 2", y: 20 },
        800,
        1000,
        repeated
      )
    ).toBe(true);

    // Standalone page number at bottom margin (y = 960 on 1000px page)
    expect(
      isHeaderFooterNoiseItem({ text: "Page 2 of 2", y: 960 }, 800, 1000, repeated)
    ).toBe(true);

    // Same number inside the main document body (y = 450) must be preserved
    expect(
      isHeaderFooterNoiseItem({ text: "2", y: 450 }, 800, 1000, repeated)
    ).toBe(false);
  });

  it("sanitizes composite OCR icon noise and institutional watermark banners cleanly", () => {
    const dirty = [
      "![](img_p1_2.png)",
      "a =)",
      "»=// **sexual and reproductive health (SRH)**",
      "ark foundation ukKaid",
      "NCDC RESEARCH ON URBAN HEALTH",
      "Clean clinical paragraph with 41% coverage.",
    ].join("\n");

    const cleaned = sanitizePdfTextArtifacts(dirty);
    expect(cleaned).not.toContain("img_p1_2.png");
    expect(cleaned).not.toContain("ark foundation ukKaid");
    expect(cleaned).not.toContain("NCDC RESEARCH ON URBAN HEALTH");
    expect(cleaned).not.toMatch(/»=\/\//);
    expect(cleaned).toContain("**sexual and reproductive health (SRH)**");
    expect(cleaned).toContain("Clean clinical paragraph with 41% coverage.");
  });

  it("reconstructs two-column spatial pages in true column-by-column reading order instead of interleaving rows", () => {
    const syntheticPage: SpatialPage = {
      pageNum: 1,
      width: 1000,
      height: 1400,
      detectedColumns: 2,
      densityScore: 60,
      text: "",
      textItems: [
        // Left column items (x = 80)
        { text: "Left line 1 alpha", x: 80, y: 260, width: 320, height: 18, fontSize: 12 },
        { text: "Left line 2 beta", x: 80, y: 290, width: 320, height: 18, fontSize: 12 },
        { text: "Left line 3 gamma", x: 80, y: 320, width: 320, height: 18, fontSize: 12 },
        { text: "Left line 4 delta", x: 80, y: 350, width: 320, height: 18, fontSize: 12 },
        { text: "Left line 5 epsilon", x: 80, y: 380, width: 320, height: 18, fontSize: 12 },
        // Right column items at exact same Y baselines (x = 560)
        { text: "Right sidebar 1 one", x: 560, y: 260, width: 320, height: 18, fontSize: 12 },
        { text: "Right sidebar 2 two", x: 560, y: 290, width: 320, height: 18, fontSize: 12 },
        { text: "Right sidebar 3 three", x: 560, y: 320, width: 320, height: 18, fontSize: 12 },
        { text: "Right sidebar 4 four", x: 560, y: 350, width: 320, height: 18, fontSize: 12 },
        { text: "Right sidebar 5 five", x: 560, y: 380, width: 320, height: 18, fontSize: 12 },
      ],
    };

    const reconstructed = reconstructPdfMarkdownFromSpatialPages([syntheticPage]);
    const leftEndIdx = reconstructed.indexOf("Left line 5 epsilon");
    const rightStartIdx = reconstructed.indexOf("Right sidebar 1 one");

    expect(leftEndIdx).toBeGreaterThan(-1);
    expect(rightStartIdx).toBeGreaterThan(leftEndIdx);
  });
});

describe("LiteParse Complex Policy Brief Regression & SHA-256 LRU Cache", () => {
  it("parses the 2-column ARK Policy Brief PDF cleanly and serves subsequent lookups from SHA-256 cache in <5ms", async () => {
    expect(fs.existsSync(SAMPLE_PDF_PATH)).toBe(true);
    const pdfBuffer = fs.readFileSync(SAMPLE_PDF_PATH);

    const firstPass = await parsePdfWithLiteParse(
      pdfBuffer,
      "ARK-Urban-Primary-Care-NCD-Policy-Brief.pdf",
      75
    );

    expect(firstPass.success).toBe(true);
    expect(firstPass.totalPages).toBe(2);
    expect(firstPass.documentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(firstPass.quality.detectedColumns).toBe(2);
    expect(firstPass.quality.hasEmbeddedCharts).toBe(true);
    expect(firstPass.quality.hasComplexSemantics).toBe(true);
    expect(firstPass.quality.requiresMultimodalVision).toBe(true);

    // Ensure zero dead image tags or OCR vector icon noise survive in reconstructed Markdown
    expect(firstPass.markdown).not.toMatch(/!\[[^\]]*\]\(img_p/i);
    expect(firstPass.markdown).not.toMatch(/^\s*(?:»=\/\/|w=]|a\s*=\))\s*$/m);

    // Ensure key semantic structures, GFM chart tables, and speaker attributions are reconstructed
    expect(firstPass.markdown).toContain("Preparedness of Urban Primary Healthcare Centres");
    expect(firstPass.markdown).toContain("## Background");
    expect(firstPass.markdown).toContain("| Alcohol | 6.5 | 3.8 |");
    expect(firstPass.markdown).toContain("[Policy Maker, MoLGRDC]");
    expect(firstPass.markdown).toContain("## Policy Recommendations");
    expect(firstPass.markdown).toContain("## References");

    // Verify SHA-256 content-addressed cache hit and threshold adaptation (<5ms)
    const t0 = Date.now();
    const cachedLookup = getCachedSpatialEntry(firstPass.documentHash, 95);
    const elapsedMs = Date.now() - t0;

    expect(cachedLookup).not.toBeNull();
    expect(elapsedMs).toBeLessThan(10);
    expect(cachedLookup!.result.cacheHit).toBe(true);
    expect(cachedLookup!.result.quality.threshold).toBe(95);
    expect(cachedLookup!.buffer.equals(pdfBuffer)).toBe(true);

    // Calling parsePdfWithLiteParse again with the identical buffer also hits the cache
    const secondPass = await parsePdfWithLiteParse(
      pdfBuffer,
      "ARK-Urban-Primary-Care-NCD-Policy-Brief.pdf",
      50
    );
    expect(secondPass.cacheHit).toBe(true);
    expect(secondPass.quality.threshold).toBe(50);
  });
});
