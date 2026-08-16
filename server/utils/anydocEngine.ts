import * as anydocModule from "@firecrawl/anydoc";
import fs from "fs";
import path from "path";
import os from "os";

export interface AnydocResult {
  markdown: string;
  format?: string;
  success: boolean;
  error?: string;
}

/**
 * High-performance Rust/Wasm document conversion using Firecrawl's anydoc engine.
 * Supports: .docx, .pptx, .xlsx, .pdf, .odt, .rtf, .epub, .csv, .html, .txt, etc.
 */
export async function convertWithAnydoc(
  buffer: Buffer,
  fileName: string,
  fileType?: string
): Promise<AnydocResult> {
  const ext = fileName.split(".").pop()?.toLowerCase() || "docx";
  const tempDir = os.tmpdir();
  const tempPath = path.join(
    tempDir,
    `anydoc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`
  );

  try {
    await fs.promises.writeFile(tempPath, buffer);
    const anydoc = anydocModule as any;

    let resultMarkdown: string | null = null;

    if (typeof anydoc.toMarkdown === "function") {
      const formatStr =
        typeof anydoc.formatFromExtension === "function"
          ? anydoc.formatFromExtension(ext)
          : ext;
      const res = await anydoc.toMarkdown(tempPath, formatStr);
      if (typeof res === "string") resultMarkdown = res;
      else if (res?.markdown) resultMarkdown = res.markdown;
      else if (res?.text) resultMarkdown = res.text;
    }

    if (
      resultMarkdown &&
      typeof resultMarkdown === "string" &&
      resultMarkdown.trim().length > 0
    ) {
      return {
        markdown: resultMarkdown.trim(),
        format: ext,
        success: true,
      };
    }

    return {
      markdown: "",
      format: ext,
      success: false,
      error: "Anydoc did not return non-empty markdown output",
    };
  } catch (err: any) {
    return {
      markdown: "",
      format: ext,
      success: false,
      error: err?.message || "Anydoc conversion exception",
    };
  } finally {
    try {
      if (fs.existsSync(tempPath)) {
        await fs.promises.unlink(tempPath);
      }
    } catch (_) {}
  }
}

export function isAnydocAvailable(): boolean {
  try {
    const anydoc = anydocModule as any;
    return typeof anydoc.toMarkdown === "function";
  } catch {
    return false;
  }
}
