# Intelligent PDF Preflight Architecture & Unified Processing Pipeline

## Overview

This document describes the hybrid PDF processing architecture implemented in the application. Document conversion balances **speed, deterministic accuracy, token efficiency, and visual layout fidelity**. 

Rather than treating every PDF identically or routing all files through expensive multimodal AI models, the application employs an **Automated Preflight Inspection Engine**. This engine analyzes the raw binary and structural markers of incoming documents before processing begins, routing them down the optimal path:

1. **Phase 1: Deterministic Preflight Inspection** (Fast, zero-LLM metadata & layout analysis)
2. **Phase 2A: Deterministic Fast-Path** (`pdf-parse` + Pandoc GFM AST Engine)
3. **Phase 2B: Multimodal Vision + LLM Structural Hybrid Path** (Gemini 3.6 Flash + Deterministic Grounding Anchor)
4. **Resilient Failover & Automatic Recovery Switch** (Seamless fallback if deterministic parsing limits are hit)

---

## Phase 1: Preflight Complexity Detection

Before any conversion stream is initialized, the PDF buffer undergoes a lightweight inspection pass using `pdf-parse` page-by-page analysis. The preflight analyzer measures five key structural metrics:

### Key Inspection Metrics & Heuristics

| Metric | Target Signals | Threshold & Interpretation |
| :--- | :--- | :--- |
| **Text Density** | `totalCharacters / totalPages` | `< 50 chars/page` indicates a **scanned PDF** or image-heavy document requiring OCR. |
| **Math & Symbol Density** | Regex detection of LaTeX operators (`\sum`, `\int`, `\partial`, `\alpha`, `\beta`, `\approx`, `\frac`) and mathematical symbols (`√`, `∫`, `∑`, `∏`, `∞`, `≤`, `≥`, `≠`) | High symbol counts indicate academic papers or technical specifications requiring formula rendering. |
| **Multi-Column & Layout Grid Score** | Detection of short line lengths (`< 35 chars`), repetitive line wraps, margin callouts, and multi-tier side-by-side blocks | Columnar layouts (e.g., IEEE/ACM two-column research papers, newsletter columns) confuse standard linear text extractors. |
| **Table Grid Density** | Presence of tabular grid delimiters (`+---+`, `|---|`), matrix patterns, and tab-delimited alignment blocks | Multi-row/multi-column grid tables require visual or AST table reconstruction. |
| **Unicode Encoding Quality** | Ratio of replacement characters (`\uFFFD`), non-printable control codes, or missing glyph maps | High garble ratios (`> 2%`) indicate corrupt embedded fonts, requiring visual AI OCR. |

### Decision Matrix & Scoring Thresholds

A composite **Complexity Score (0 to 100)** is computed from these metrics:

* **Score 0–25 (Low Complexity / Single-Column Text)**: Standard ebooks, clean text reports, single-column memos, or plain text documents.
  * **Route**: **Phase 2A (Deterministic Fast-Path)** if mode is `text-only` or speed is prioritized.
* **Score 26–100 (High Complexity / Multi-Column / Math / Scanned)**: Two-column research papers (e.g., CACM/ACM formats), scanned pages, heavy LaTeX formulas, complex nested tables, or corrupted glyph maps.
  * **Route**: **Phase 2B (Gemini 3.6 Flash Multimodal + Pandoc Anchor)**.

---

## Phase 2A: Deterministic Fast-Path (`pdf-parse` + Pandoc / Turndown AST)

For documents identified as standard text or single-column layouts:

1. **Text Extraction**: `pdf-parse` extracts exact character sequences page-by-page directly from the document's embedded content streams.
2. **AST Markdown Normalization**: The raw page content is converted to standard GFM (GitHub Flavored Markdown) using Pandoc AST rules (or Turndown GFM as a deterministic engine).
3. **Execution Cost**: $0 compute cost, 0 LLM tokens, sub-second latency.
4. **Use Cases**: Quick text extraction, copy-paste workflows, plain document conversion.

---

## Phase 2B: Multimodal AI & Hybrid Pipeline (Gemini 3.6 Flash + Pandoc Anchor)

For complex documents (academic papers, multi-column layouts, financial tables, mathematical proofs, scanned documents):

1. **Deterministic Grounding Anchor**: The preflight analyzer extracts the raw text and page outline from `pdf-parse` to act as a **Ground-Truth Text Reference Anchor**.
2. **Multimodal Dual-Input**: Both the raw PDF binary (`inlineData`) and the deterministic text anchor are passed to **Gemini 3.6 Flash**.
3. **Visual & Layout Reconstruction**: Gemini leverages its high-resolution visual processing to:
   * Reconstruct multi-column text in correct reading order (left column $\rightarrow$ right column).
   * Render mathematical equations into standard LaTeX (`$...$` and `$$...$$`).
   * Structure sidebars, margin notes, callout boxes, and footnotes in proper hierarchy.
   * Parse complex, borderless tables into clean Markdown GFM tables.
4. **Streaming Delivery**: The response is streamed in real-time to the user interface.

---

## Resilient Failover & Automatic Recovery Switch

To guarantee zero silent failures and continuous execution:

* If the **Pandoc / `pdf-parse` step** encounters an unexpected error, memory limit, or garbled character stream, the server **automatically emits a status notification banner**:
  `> ⚠️ **Pipeline Fallback Switch**: Pandoc deterministic conversion encountered a parsing limit. Automatically switched to deeper Gemini 3.6 Flash multimodal analysis...`
* The request smoothly transitions into full multimodal visual processing without dropping the connection or timing out.
* The frontend UI displays a **Streaming Live Progress Badge** and word counter, providing immediate visual feedback throughout the process.
