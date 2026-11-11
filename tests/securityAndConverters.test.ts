import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  validateSafeRemoteUrl,
  isHtmlWebPageUrl,
  extractWebLinksFromMarkdown,
} from "../server/utils/urlValidator";
import { cleanMarkdownOutput } from "../src/utils/markdownCleaner";
import {
  loadCustomLexicon,
  loadHiddenPresetIds,
  saveCustomLexicon,
  parseAndValidateLexiconFile,
  exportLexiconToCsv,
} from "../src/lib/lexiconStorage";
import {
  convertMultipleMarkdownsToOKFBundle,
  exportOKFBundleAsZip,
} from "../src/utils/okfZipExporter";

describe("SSRF URL Security Validator & Link Filtering", () => {
  it("blocks loopback, RFC 1918 private IPs, IPv6 local addresses, cloud metadata endpoints, and unsafe protocols", () => {
    const blockedUrls = [
      "http://localhost:3000/api/health",
      "http://127.0.0.1:8080/admin",
      "http://0.0.0.0/",
      "http://[::1]/secret",
      "http://10.0.0.15/internal",
      "http://172.16.5.4/metrics",
      "http://192.168.1.1/router",
      "http://169.254.169.254/latest/meta-data/",
      "http://metadata.google.internal/computeMetadata/v1/",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "https://user:pass@example.com/private",
    ];

    for (const url of blockedUrls) {
      expect(validateSafeRemoteUrl(url).safe, `Expected ${url} to be blocked`).toBe(false);
    }

    expect(validateSafeRemoteUrl("https://docs.example.com/guide/architecture").safe).toBe(true);
  });

  it("extracts unique HTML links from Markdown while excluding binary assets and SSRF targets", () => {
    expect(isHtmlWebPageUrl("https://example.com/docs/intro")).toBe(true);
    expect(isHtmlWebPageUrl("https://example.com/report.pdf")).toBe(false);
    expect(isHtmlWebPageUrl("https://example.com/archive.zip")).toBe(false);

    const md = `
      Read the [Architecture Guide](https://example.com/docs/arch) and
      download [Policy PDF](https://example.com/files/brief.pdf).
      Internal link [Admin](http://127.0.0.1:3000/admin) should be ignored.
      Duplicate raw URL: https://example.com/docs/arch.
    `;
    expect(extractWebLinksFromMarkdown(md)).toEqual(["https://example.com/docs/arch"]);
  });
});

describe("Markdown Output Sanitizer", () => {
  it("strips telemetry banners, dead PDF image tags, icon noise, and outer markdown fences while keeping valid tables and code", () => {
    const raw = [
      "```markdown",
      "> 🧬 **Multimodal Vision Active**",
      "> [Server Stage] Connecting to pipeline...",
      "# Clinical Findings",
      "",
      "![](img_p1_2.png)",
      "»=//",
      "| Metric | Value |",
      "| :--- | :---: |",
      "| Coverage | 84% |",
      "",
      "```ts",
      "const status = 'healthy';",
      "```",
      "---",
      "*Document Conversion Complete (2.1s)*",
      "```",
    ].join("\n");

    const cleaned = cleanMarkdownOutput(raw);
    expect(cleaned.startsWith("# Clinical Findings")).toBe(true);
    expect(cleaned).not.toContain("Multimodal Vision Active");
    expect(cleaned).not.toContain("[Server Stage]");
    expect(cleaned).not.toContain("img_p1_2.png");
    expect(cleaned).not.toContain("»=//");
    expect(cleaned).not.toContain("Document Conversion Complete");
    expect(cleaned).toContain("| Coverage | 84% |");
    expect(cleaned).toContain("```ts\nconst status = 'healthy';\n```");
  });
});

describe("Isomorphic Node Safety & Custom Lexicon Serialization", () => {
  it("executes lexiconStorage safely in Node.js without window or localStorage globals", () => {
    expect(typeof window).toBe("undefined");
    expect(() => saveCustomLexicon([])).not.toThrow();
    expect(loadHiddenPresetIds()).toEqual([]);

    const defaults = loadCustomLexicon();
    expect(defaults.length).toBeGreaterThan(5);

    const csv = exportLexiconToCsv(defaults.slice(0, 3));
    const reimported = parseAndValidateLexiconFile(csv, "lexicon.csv");
    expect(reimported.success).toBe(true);
    expect(reimported.format).toBe("csv");
    expect(reimported.entries).toHaveLength(3);
    expect(reimported.entries[0].canonicalName).toBe(defaults[0].canonicalName);
  });
});

describe("OKF v0.2 Knowledge Bundle Compiler & ZIP Exporter", () => {
  it("compiles multi-section Markdown into typed OKF concepts and packages a valid ZIP archive", async () => {
    const sampleMarkdown = [
      "# Urban Primary Care Overview",
      "",
      "Primary healthcare centres coordinate non-communicable disease screening and referrals.",
      "",
      "## Medication Supply Protocol",
      "",
      "1. Maintain essential antihypertensive stock at every facility.",
      "2. Track monthly dispensing metrics in the digital registry.",
    ].join("\n");

    const bundle = convertMultipleMarkdownsToOKFBundle(
      [{ fileName: "urban-care.md", markdown: sampleMarkdown }],
      "urban-care-kb"
    );

    expect(bundle.concepts.length).toBeGreaterThanOrEqual(2);

    const { success, totalFiles, zipBlob } = await exportOKFBundleAsZip(bundle, {
      bundleName: "urban-care-kb",
    });

    expect(success).toBe(true);
    expect(totalFiles).toBeGreaterThan(2);
    const arrayBuffer = await zipBlob.arrayBuffer();
    const loadedZip = await JSZip.loadAsync(arrayBuffer);
    const zipFileNames = Object.keys(loadedZip.files);

    expect(zipFileNames.some((f) => f.endsWith(".md"))).toBe(true);
    expect(zipFileNames.some((f) => f.endsWith(".json"))).toBe(true);
  });
});
