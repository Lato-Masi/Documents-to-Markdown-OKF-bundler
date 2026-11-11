import { describe, it, expect } from "vitest";
import {
  formatBytes,
  getFileExtension,
  getMimeTypeByExtension,
  isSupportedDocumentFormat,
  validateDocumentFile,
  DEFAULT_MAX_FILE_SIZE_BYTES,
} from "../fileHelpers";

describe("fileHelpers — getFileExtension", () => {
  it("extracts normalized lowercase extensions from standard and multi-dot filenames", () => {
    expect(getFileExtension("policy-brief.pdf")).toBe("pdf");
    expect(getFileExtension("Q4.Financial.Report.Final.XLSX")).toBe("xlsx");
    expect(getFileExtension("/var/tmp/archive/clinical_notes.DOCX")).toBe("docx");
    expect(getFileExtension("C:\\Users\\analyst\\Desktop\\summary.MD  ")).toBe("md");
  });

  it("returns empty string for extensionless files, trailing dots, and standalone dotfiles", () => {
    expect(getFileExtension("")).toBe("");
    expect(getFileExtension("README")).toBe("");
    expect(getFileExtension("pdf")).toBe("");
    expect(getFileExtension(".env")).toBe("");
    expect(getFileExtension(".gitignore")).toBe("");
    expect(getFileExtension("trailingdot.")).toBe("");
  });
});

describe("fileHelpers — getMimeTypeByExtension", () => {
  it.each([
    ["report.pdf", "application/pdf"],
    ["manuscript.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["legacy-memo.doc", "application/msword"],
    ["slides.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    ["deck.ppt", "application/vnd.ms-powerpoint"],
    ["statement.rtf", "application/rtf"],
    ["chapter.odt", "application/vnd.oasis.opendocument.text"],
    ["handbook.epub", "application/epub+zip"],
    ["metrics.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ["budget-2020.xls", "application/vnd.ms-excel"],
    ["ledger.ods", "application/vnd.oasis.opendocument.spreadsheet"],
    ["survey_results.csv", "text/csv"],
    ["exports.tsv", "text/tab-separated-values"],
    ["notes.txt", "text/plain"],
    ["SKILL.md", "text/markdown"],
    ["guide.markdown", "text/markdown"],
    ["schema.json", "application/json"],
    ["events.jsonl", "application/jsonl"],
    ["index.html", "text/html"],
    ["legacy.htm", "text/html"],
    ["feed.xml", "application/xml"],
    ["config.yaml", "application/yaml"],
    ["pipeline.yml", "application/yaml"],
    ["chart.png", "image/png"],
    ["scan.jpg", "image/jpeg"],
    ["photo.JPEG", "image/jpeg"],
    ["figure.webp", "image/webp"],
    ["diagram.svg", "image/svg+xml"],
    ["animation.gif", "image/gif"],
    ["scan-page.tiff", "image/tiff"],
  ])("resolves %s to %s when browser MIME type is empty", (fileName, expectedMime) => {
    expect(getMimeTypeByExtension(fileName, "")).toBe(expectedMime);
  });

  it("preserves explicit browser-detected MIME types and normalizes casing/whitespace", () => {
    expect(getMimeTypeByExtension("custom-upload", "  Application/PDF ")).toBe("application/pdf");
    expect(getMimeTypeByExtension("clipboard-image", "image/png")).toBe("image/png");
    expect(getMimeTypeByExtension("data.bin", "text/csv")).toBe("text/csv");
  });

  it("upgrades generic browser application/octet-stream using the filename extension when known", () => {
    expect(getMimeTypeByExtension("ARK-Policy-Brief.PDF", "application/octet-stream")).toBe(
      "application/pdf"
    );
    expect(getMimeTypeByExtension("architecture.md", "application/octet-stream")).toBe(
      "text/markdown"
    );
    expect(getMimeTypeByExtension("dataset.xlsx", "application/octet-stream")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
  });

  it("falls back to application/octet-stream for unknown extensions or extensionless files without MIME", () => {
    expect(getMimeTypeByExtension("installer.exe", "")).toBe("application/octet-stream");
    expect(getMimeTypeByExtension("README", "")).toBe("application/octet-stream");
    expect(getMimeTypeByExtension("pdf", "")).toBe("application/octet-stream");
    expect(getMimeTypeByExtension("unknown.customext", "application/octet-stream")).toBe(
      "application/octet-stream"
    );
  });
});

describe("fileHelpers — formatBytes", () => {
  it("formats byte sizes across Bytes, KB, MB, GB, and TB accurately", () => {
    expect(formatBytes(0)).toBe("0 Bytes");
    expect(formatBytes(512)).toBe("512 Bytes");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536, 1)).toBe("1.5 KB");
    expect(formatBytes(1048576)).toBe("1 MB");
    expect(formatBytes(2.5 * 1024 * 1024 * 1024, 2)).toBe("2.5 GB");
    expect(formatBytes(1024 ** 4, 2)).toBe("1 TB");
  });

  it("handles negative sizes, non-finite numbers, and negative decimal precision safely", () => {
    expect(formatBytes(-100)).toBe("0 Bytes");
    expect(formatBytes(Number.NaN)).toBe("0 Bytes");
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("0 Bytes");
    expect(formatBytes(1536, -3)).toBe("2 KB");
  });
});

describe("fileHelpers — isSupportedDocumentFormat & validateDocumentFile", () => {
  it("accepts diverse supported document, tabular, markup, and image formats", () => {
    const validFiles = [
      { name: "ARK-Policy-Brief.pdf", size: 420_000, type: "application/pdf" },
      { name: "clinical-protocol.docx", size: 88_000, type: "" },
      { name: "facility-survey.xlsx", size: 125_000, type: "application/octet-stream" },
      { name: "quarterly-review.pptx", size: 2_400_000, type: "" },
      { name: "runbook.md", size: 4_096, type: "" },
      { name: "pasted-screenshot", size: 64_000, type: "image/png" },
    ];

    for (const file of validFiles) {
      expect(isSupportedDocumentFormat(file.name, file.type)).toBe(true);
      const res = validateDocumentFile(file);
      expect(res.valid, `Expected ${file.name} to be valid`).toBe(true);
      expect(res.error).toBeUndefined();
    }
  });

  it("rejects unsupported binary, archive, media, and executable formats", () => {
    const unsupportedFiles = [
      { name: "malware.exe", size: 10240, type: "application/x-msdownload" },
      { name: "installer.dmg", size: 50000, type: "application/octet-stream" },
      { name: "recording.mp4", size: 102400, type: "video/mp4" },
      { name: "disk.iso", size: 204800, type: "" },
    ];

    for (const file of unsupportedFiles) {
      expect(isSupportedDocumentFormat(file.name, file.type)).toBe(false);
      const res = validateDocumentFile(file);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/Unsupported file format/i);
    }
  });

  it("rejects null/missing filenames, empty 0-byte files, and files exceeding maxSizeBytes", () => {
    expect(validateDocumentFile(null).valid).toBe(false);
    expect(validateDocumentFile({ name: "   ", size: 100 }).valid).toBe(false);

    const emptyPdf = validateDocumentFile({
      name: "empty.pdf",
      size: 0,
      type: "application/pdf",
    });
    expect(emptyPdf.valid).toBe(false);
    expect(emptyPdf.error).toContain("0 Bytes");

    const oversizedPdf = validateDocumentFile({
      name: "huge-scan.pdf",
      size: DEFAULT_MAX_FILE_SIZE_BYTES + 1024,
      type: "application/pdf",
    });
    expect(oversizedPdf.valid).toBe(false);
    expect(oversizedPdf.error).toContain("exceeds the maximum supported file size");

    const customLimit = validateDocumentFile(
      { name: "notes.txt", size: 2048, type: "text/plain" },
      { maxSizeBytes: 1024 }
    );
    expect(customLimit.valid).toBe(false);
    expect(customLimit.error).toContain("1 KB");
  });
});
