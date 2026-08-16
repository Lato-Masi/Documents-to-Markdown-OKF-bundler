/**
 * Comprehensive Markdown Cleaning Utility
 * 
 * Ensures that converted document Markdown contains ONLY the pure extracted document content
 * and removes all internal server telemetry, pipeline stage banners, heartbeat markers,
 * sliding-window headers, and completion trailers.
 */

export function cleanMarkdownOutput(rawText: string): string {
  if (!rawText) return "";

  let cleaned = rawText;

  // 1. Remove all telemetry blockquote lines starting with > and specific status icons/tags
  cleaned = cleaned.replace(/^>\s*(?:🛰️|⏱️|🧬|🪟|⚡|⚠️|❌)\s*.*$\n?/gm, "");

  // 2. Remove server stage, heartbeat, model retry, and pipeline fallback banner tags
  cleaned = cleaned.replace(/^>\s*\[(?:Server Stage|Server Heartbeat|Server Error|Gemini Model Retry).*?$\n?/gm, "");
  cleaned = cleaned.replace(
    /^>\s*\*\*(?:LiteParse|Phase|Sliding Window|Quality Escalation|Fast Deterministic|Fast Direct|Pipeline Fallback|Conversion Failure|Conversion Error).*?\*\*.*?$\n?/gm,
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

  // 5. If the entire content is wrapped inside a single Markdown code block (```markdown ... ```), unwrap it
  const trimmed = cleaned.trim();
  if (
    (trimmed.startsWith("```markdown\n") || trimmed.startsWith("```md\n")) &&
    trimmed.endsWith("```")
  ) {
    cleaned = trimmed.replace(/^```(?:markdown|md)\r?\n/i, "").replace(/\r?\n```$/, "");
  }

  // 6. Clean multiple consecutive blank lines at the beginning or end
  return cleaned.trim();
}
