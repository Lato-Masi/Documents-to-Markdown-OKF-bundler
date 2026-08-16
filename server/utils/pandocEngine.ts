import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";
import TurndownService from "turndown";
// @ts-ignore
import { gfm } from "turndown-plugin-gfm";

const execAsync = promisify(exec);

// Initialize Turndown with GFM extensions for deterministic HTML -> GFM Markdown conversion
const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "*",
});
turndownService.use(gfm);

// Custom Turndown rules for clean table formatting and code blocks
turndownService.addRule("strikethrough", {
  filter: ["del", "s"],
  replacement: (content) => `~~${content}~~`,
});

export interface ConversionEngineResult {
  markdown: string;
  engineUsed: "Pandoc (CLI)" | "pdf-parse + Pandoc AST" | "Turndown (Deterministic GFM)" | "Gemini 3.6 Flash (Multimodal)";
  isDeterministic: boolean;
  processingTimeMs: number;
}

export interface PandocConversionResult {
  markdown: string;
  engine: "Pandoc (CLI)" | "Turndown (Deterministic GFM)";
  success: boolean;
  fallbackTriggered: boolean;
  error?: string;
}

/**
 * Check if the `pandoc` binary is installed and executable in system PATH
 */
export async function isPandocAvailable(): Promise<boolean> {
  try {
    const { stdout } = await execAsync("pandoc -v");
    return stdout.includes("pandoc");
  } catch {
    return false;
  }
}

/**
 * Execute Pandoc CLI directly using stdin/stdout or temporary file buffer
 */
export async function convertWithPandocCLI(
  inputBuffer: Buffer,
  fromFormat: string,
  toFormat: string = "gfm",
  extraArgs: string[] = []
): Promise<string> {
  const tempDir = os.tmpdir();
  const inputPath = path.join(tempDir, `pandoc_in_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
  const outputPath = path.join(tempDir, `pandoc_out_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.md`);

  try {
    await fs.promises.writeFile(inputPath, inputBuffer);
    const args = [
      `"${inputPath}"`,
      `-f ${fromFormat}`,
      `-t ${toFormat}`,
      `--wrap=none`,
      ...extraArgs,
      `-o "${outputPath}"`,
    ].join(" ");

    await execAsync(`pandoc ${args}`);
    const result = await fs.promises.readFile(outputPath, "utf-8");
    return result.trim();
  } finally {
    // Clean up temp files
    try {
      if (fs.existsSync(inputPath)) await fs.promises.unlink(inputPath);
      if (fs.existsSync(outputPath)) await fs.promises.unlink(outputPath);
    } catch (e) {
      // ignore cleanup errors
    }
  }
}

/**
 * High-performance deterministic HTML to GFM Markdown conversion using Pandoc or Turndown AST engine
 */
export async function convertHtmlToMarkdownPandoc(
  htmlContent: string
): Promise<PandocConversionResult> {
  const pandocOk = await isPandocAvailable();
  if (pandocOk) {
    try {
      const buffer = Buffer.from(htmlContent, "utf-8");
      const md = await convertWithPandocCLI(buffer, "html", "gfm");
      if (md && md.trim().length > 0) {
        return {
          markdown: md,
          engine: "Pandoc (CLI)",
          success: true,
          fallbackTriggered: false,
        };
      } else {
        console.warn("[Pandoc CLI] Output was empty for input HTML length:", htmlContent.length);
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      console.warn("[Pandoc CLI] Conversion failed, triggering Turndown AST fallback:", errMsg);
      try {
        const turndownMd = turndownService.turndown(htmlContent);
        if (turndownMd && turndownMd.trim().length > 0) {
          return {
            markdown: turndownMd,
            engine: "Turndown (Deterministic GFM)",
            success: true,
            fallbackTriggered: true,
            error: `Pandoc CLI execution failed (${errMsg}). Used Turndown AST fallback.`,
          };
        }
      } catch (tErr: any) {
        return {
          markdown: "",
          engine: "Pandoc (CLI)",
          success: false,
          fallbackTriggered: true,
          error: `Pandoc CLI (${errMsg}) and Turndown AST (${tErr?.message || String(tErr)}) both failed.`,
        };
      }
    }
  }

  // Fallback to Turndown AST converter if Pandoc CLI is not installed
  try {
    const markdown = turndownService.turndown(htmlContent);
    return {
      markdown,
      engine: "Turndown (Deterministic GFM)",
      success: markdown.trim().length > 0,
      fallbackTriggered: !pandocOk,
      error: pandocOk ? undefined : "Pandoc CLI not installed on host; used Turndown GFM engine.",
    };
  } catch (tErr: any) {
    return {
      markdown: "",
      engine: "Turndown (Deterministic GFM)",
      success: false,
      fallbackTriggered: true,
      error: `Turndown AST conversion error: ${tErr?.message || String(tErr)}`,
    };
  }
}
