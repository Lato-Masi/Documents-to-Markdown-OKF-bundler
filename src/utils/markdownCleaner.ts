/**
 * Comprehensive Markdown Cleaning & PDF Artifact Sanitization Utility
 *
 * Ensures that converted document Markdown contains ONLY the pure extracted document content
 * and removes all internal server telemetry, pipeline stage banners, heartbeat markers,
 * dead local image references (e.g. ![](img_p1_2.png)), and OCR icon symbol noise.
 */

export function cleanMarkdownOutput(rawText: string): string {
  if (!rawText) return "";

  let cleaned = rawText;

  // 1. Remove all telemetry blockquote lines starting with > and specific status icons/tags
  cleaned = cleaned.replace(/^>\s*(?:🛰️|⏱️|🧬|🪟|⚡|⚠️|❌)\s*.*$\n?/gm, "");

  // 2. Remove server stage, heartbeat, model retry, and pipeline fallback banner tags
  cleaned = cleaned.replace(/^>\s*\[(?:Server Stage|Server Heartbeat|Server Error|Gemini Model Retry).*?$\n?/gm, "");
  cleaned = cleaned.replace(
    /^>\s*\*\*(?:LiteParse|Phase|Sliding Window|Quality Escalation|Multimodal Layout Escalation|Fast Deterministic|Fast Direct|Pipeline Fallback|Conversion Failure|Conversion Error).*?\*\*.*?$\n?/gm,
    ""
  );

  // 3. Remove sliding window section dividers and subheaders
  cleaned = cleaned.replace(/^###\s*🪟.*?$\n?/gm, "");
  cleaned = cleaned.replace(/^###\s*Window\s+\d+\s+of\s+\d+.*?$\n?/gm, "");

  // 4. Remove completion trailers and end-of-document server footnotes
  cleaned = cleaned.replace(
    /^---\s*\n\s*\*(?:Document Conversion Complete|LiteParse Deterministic Conversion Complete|Phase 2[AB] Complete|Complete Stream Delivered|All Pages Converted).*?\*\s*$/gm,
    ""
  );
  cleaned = cleaned.replace(
    /^\*(?:Document Conversion Complete|LiteParse Deterministic Conversion Complete|Phase 2[AB] Complete|Complete Stream Delivered|All Pages Converted).*?\*\s*$/gm,
    ""
  );

  // 5. Remove dead local image tags emitted by PDF extractors (e.g. ![](img_p1_2.png))
  cleaned = cleaned.replace(/!\[[^\]]*\]\((?:img_p\d+_\d+|page_\d+)[^)]*\)\s*/gi, "");

  // 6. Remove standalone OCR icon noise lines (e.g. "a =)", "»=//", "=]", "“=", "=|", "w=]", "m=]", "hs", "AN", "2S", "ll")
  cleaned = cleaned.replace(
    /^\s*(?:a\s*=\)|»=\/\/|=]|“=|=\||w=]|m=]|n=|\/\\|2S|ll|o|0|=\)|=\/\/|®|hs|AN|nv)\s*$/gm,
    ""
  );

  // 7. If the entire content is wrapped inside a single Markdown code block (```markdown ... ```), unwrap it
  const trimmed = cleaned.trim();
  if (
    (trimmed.startsWith("```markdown\n") || trimmed.startsWith("```md\n")) &&
    trimmed.endsWith("```")
  ) {
    cleaned = trimmed.replace(/^```(?:markdown|md)\r?\n/i, "").replace(/\r?\n```$/, "");
  }

  // 8. Collapse 3+ consecutive blank lines into 2
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  return cleaned.trim();
}
