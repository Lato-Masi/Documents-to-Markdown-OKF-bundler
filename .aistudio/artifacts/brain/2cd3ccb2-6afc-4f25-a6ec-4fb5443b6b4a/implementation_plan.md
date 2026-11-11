# Complex PDF Accuracy, Spatial Column Reconstruction & Noise Elimination Plan

## 1. Root-Cause Summary
The defects observed in your test output were caused by three interacting issues:
1. **Unconditional Tesseract OCR on Digital PDFs**: `liteparseEngine.ts` ran `ocrEnabled: true` on native digital PDFs, causing Tesseract to OCR decorative vector icons, logos, and emblems into meaningless symbol strings (`a =)`, `»=//`, `=]`, `w=]`, `m=]`, `hs`, `AN`, `2S`, `ll`) and emit dead image tags (`![](img_p1_2.png)`).
2. **Scrambled Multi-Column Table Heuristic & Detached PDF Layer Coordinates**: LiteParse's built-in markdown formatter treated Page 1's 2-column layout + bar chart as a 4-column table, slicing sentences horizontally across cells. On Page 2, colored inline emphasis (`"NCD guidelines"`, `"respectively."`, `"patients. The budget"`) and quote lines were stored in separate PDF drawing layers and output out of vertical sequence.
3. **Model Alias Fallback Gap**: When an API key lacked access to preview model IDs or when no server key was configured, `/api/convert` fell back to LiteParse's raw `structuredMarkdown` while `cleanMarkdownOutput()` hid the fallback warning banner.

---

## 2. Digital-First PDF Extraction & Artifact Sanitizer (`server/utils/liteparseEngine.ts` & `src/utils/markdownCleaner.ts`)
* **Digital-First Vector Extraction (`ocrEnabled: false` Default)**:
  * Run LiteParse with `ocrEnabled: false` first (completes in ~50ms on digital PDFs with zero icon/logo OCR noise).
  * Only invoke `ocrEnabled: true` if a page is genuinely a scanned image (`< 25` digital words extracted per page).
* **Comprehensive PDF Artifact & Noise Filter**:
  * Strip dead local image references (`!\[[^\]]*\]\(img_p\d+_\d+\.[a-z0-9]+\)`).
  * Strip OCR icon/glyph noise clusters (`a =)`, `»=//`, `=]`, `“=`, `=|`, `w=]`, `m=]`, `/\\`, isolated icon bullets) and replacement characters (`\uFFFD`).
  * Detect and reject malformed pseudo-tables where multi-column prose paragraphs were erroneously wrapped into Markdown table cells.

---

## 3. 2D Spatial Column, Quote & Chart Reconstructor (`server/utils/pdfSpatialReconstructor.ts`)
Build a dedicated 2D spatial geometry engine that consumes the `(x, y, width, height, fontSize, fontName)` text items from each page and reconstructs true semantic reading order before AI grounding or local output:
1. **Page Zone Segmentation**:
   * **Header Banner Zone**: Top full-width metadata (`Policy Brief`, `January 2023`, Title, Subtitle/Attribution).
   * **Column Split Detection**: Automatically compute the vertical column gutter (`splitX`) for both symmetrical 50/50 columns (Page 2) and asymmetrical 62/38 main-plus-sidebar layouts (Page 1 `Background` + `Key Findings` callout box).
   * **Footer & Reference Zone**: Bottom full-width numbered citations (`1.`, `2.`, `3.`), footnotes (`*WHO Health System Building Blocks`, `*CHORUS is funded...`), and partner attributions.
2. **Y-Band Line Clustering & Left-to-Right Stitching**:
   * Group text items within each column whose vertical baselines fall within `±4.5pt` into a single horizontal line sorted strictly by `x` coordinate.
   * This re-attaches inline phrases drawn in separate PDF operations (such as `"NCD guidelines"` in *Service Delivery*, `"respectively."` in *Drugs and Equipment*, and `"patients. The budget"` in *Health Financing*) directly into their exact sentence position.
3. **Semantic Sub-Section & Quote Grouping**:
   * Within each column stream, identify domain subheadings (`Service Delivery:`, `Health Workforce:`, `Drugs and Equipment:`, `Health Financing:`, `Health Information System:`, `Leadership and Governance:`) and ensure the `###` heading always precedes its body paragraph.
   * Stitch cross-column continuations (e.g., `Health Information System` starting at the bottom of Page 2 Column 1 and continuing at the top of Page 2 Column 2).
   * Group italicized/quoted lines (`"..."`) with their bracketed speaker role (`[Policy Maker, MoLGRDC]`, `[Project Manager_Urban PHC Centre]`, `[Health Care Provider_Urban PHC Centre]`, `[Policy Maker_MoHFW]`) into clean attributed blockquotes:
     `> *"..."* — **[Speaker Role]**`
4. **Spatial Chart-to-GFM Table Reconstruction**:
   * Reconstruct embedded charts (`Figure: Non Communicable Disease (NCD) Risk Factor Prevalence (Urban vs Rural)` and `Figure: Domain Indices across Facilities`) by spatially pairing X-axis category labels with their corresponding series/percentage values into aligned GFM tables.

---

## 4. Resilient Multi-Model Gemini Vision Pipeline (`server/utils/geminiService.ts` & `server/routes/convert.ts`)
* **Multi-Model Compatibility Chain**:
  * Set **Gemini 4 Pro (`gemini-4-argon`)** and **Gemini 3.8 Flash (`gemini-3.8-flash`)** as primary multimodal vision models, with an automatic compatibility fallback chain:
    `gemini-4-argon` $\rightarrow$ `gemini-3.8-flash` $\rightarrow$ `gemini-2.5-pro` $\rightarrow$ `gemini-2.5-flash`.
  * If a user's external BYOK key returns `404 Model Not Found` or `403 Permission Denied` on a preview alias, the retry engine immediately switches to the next available multimodal model in the chain without dropping the request.
* **Clean Grounding Anchor & Offline Resilience**:
  * Pass the clean **2D Spatially Reconstructed Markdown** (instead of raw LiteParse output) as the structural anchor to Gemini Vision, and use it as the deterministic output whenever no API key is configured.
