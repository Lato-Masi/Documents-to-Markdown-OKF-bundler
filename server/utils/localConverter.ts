import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { extractPdfPageByPageText } from "./pdfUtils";
import { convertHtmlToMarkdownPandoc } from "./pandocEngine";
import { convertWithAnydoc } from "./anydocEngine";
import { extractCleanArticleHtml, ReadabilityOptions } from "./readabilityExtractor";

// Pre-sanitize raw HTML using Readability content-pruning filter to eliminate ads, menus, and noise
export function preProcessHtml(html: string, options: ReadabilityOptions = {}): string {
  const result = extractCleanArticleHtml(html, options);
  return result.cleanedHtml;
}

export function convertCsvToMarkdownTable(csvText: string): string {
  const lines = csvText.trim().split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return "";

  const parseRow = (rowStr: string) => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < rowStr.length; i++) {
      const char = rowStr[i];
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  const headerRow = `| ${headers.join(" | ")} |`;
  const separatorRow = `| ${headers.map(() => "---").join(" | ")} |`;

  const bodyRows = lines.slice(1).map((line) => {
    const cells = parseRow(line);
    while (cells.length < headers.length) cells.push("");
    return `| ${cells.slice(0, headers.length).join(" | ")} |`;
  });

  return [headerRow, separatorRow, ...bodyRows].join("\n");
}

export async function convertHtmlToMarkdownBasic(html: string): Promise<string> {
  const cleaned = preProcessHtml(html);
  const { markdown } = await convertHtmlToMarkdownPandoc(cleaned);
  return markdown;
}

// Local fallback conversion when Gemini API is unavailable or returns an invalid API key
export async function convertDocumentLocally(
  fileName: string,
  fileType: string,
  base64Data: string
): Promise<string | null> {
  try {
    const lowerName = (fileName || "").toLowerCase();
    const lowerType = (fileType || "").toLowerCase();
    const buffer = Buffer.from(base64Data, "base64");

    // Fast-path: Attempt Firecrawl anydoc high-performance conversion engine
    const anydocRes = await convertWithAnydoc(buffer, fileName, fileType);
    if (anydocRes.success && anydocRes.markdown && anydocRes.markdown.trim().length > 10) {
      return anydocRes.markdown;
    }

    // 0. PDF Document (.pdf)
    if (
      lowerType.includes("pdf") ||
      lowerName.endsWith(".pdf")
    ) {
      const { structuredMarkdown, pageText } = await extractPdfPageByPageText(buffer, fileName);
      if (structuredMarkdown && structuredMarkdown.trim()) {
        return structuredMarkdown;
      }
      if (pageText && pageText.trim()) {
        return pageText;
      }
    }

    // 1. Spreadsheet (.xlsx, .xls, .csv)
    if (
      lowerType.includes("spreadsheet") ||
      lowerType.includes("excel") ||
      lowerType.includes("csv") ||
      lowerName.endsWith(".xlsx") ||
      lowerName.endsWith(".xls") ||
      lowerName.endsWith(".csv")
    ) {
      if (lowerName.endsWith(".csv") || lowerType.includes("csv")) {
        const text = buffer.toString("utf-8");
        return convertCsvToMarkdownTable(text);
      }
      const workbook = XLSX.read(buffer, { type: "buffer" });
      let result = `# ${fileName}\n\n`;
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const csvText = XLSX.utils.sheet_to_csv(worksheet);
        if (csvText.trim()) {
          result += `### Sheet: ${sheetName}\n\n${convertCsvToMarkdownTable(csvText)}\n\n`;
        }
      }
      return result.trim();
    }

    // 2. Word Document (.docx, .doc, .odt, .rtf)
    if (
      lowerType.includes("wordprocessingml") ||
      lowerType.includes("msword") ||
      lowerType.includes("docx") ||
      lowerType.includes("opendocument.text") ||
      lowerName.endsWith(".docx") ||
      lowerName.endsWith(".doc") ||
      lowerName.endsWith(".odt") ||
      lowerName.endsWith(".rtf")
    ) {
      try {
        const mammothResult = await mammoth.convertToHtml({ buffer });
        if (mammothResult && mammothResult.value && mammothResult.value.trim().length > 0) {
          return await convertHtmlToMarkdownBasic(mammothResult.value);
        }
      } catch (mErr) {
        console.warn("Mammoth conversion exception in localConverter:", mErr);
      }
    }

    // 3. HTML Document
    if (
      lowerType.includes("html") ||
      lowerName.endsWith(".html") ||
      lowerName.endsWith(".htm")
    ) {
      const text = buffer.toString("utf-8");
      return await convertHtmlToMarkdownBasic(text);
    }

    // 4. Plain text / Markdown / JSON / XML
    if (
      lowerType.includes("text") ||
      lowerType.includes("json") ||
      lowerType.includes("xml") ||
      lowerName.endsWith(".txt") ||
      lowerName.endsWith(".md") ||
      lowerName.endsWith(".json") ||
      lowerName.endsWith(".xml")
    ) {
      const text = buffer.toString("utf-8");
      return text;
    }
  } catch (e) {
    console.warn("Local fallback conversion failed:", e);
  }
  return null;
}


