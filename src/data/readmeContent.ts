/**
 * Embedded README.md documentation string for the in-app About modal viewer.
 */
export const README_MARKDOWN = `# From Raw Documents to Living Knowledge

> A clear guide to unlocking your organization's documents, converting them into structured text, and building trusted, interconnected knowledge with the **Open Knowledge Format (OKF)**.

---

## 🌟 Executive Summary

Every organization relies on knowledge: policies, operating procedures, manuals, research papers, compliance guidelines, and training handbooks. Yet most of this valuable information is trapped inside rigid file formats like PDFs, presentations, and word processor files.

When people or AI assistants try to find answers in these files, they face two major hurdles:
1. **The Format Wall**: Traditional document formats prioritize visual layout for printing, not computerized reading or flexible sharing.
2. **The Context Gap**: Even when text is extracted, documents are often long, monolithic walls of text without clear boundaries, explicit relationships, or verification stamps.

This guide explains the two-step transformation that solves this:
- **Phase 1: Document to Markdown** — Unlocking raw documents into clean, universal structured text.
- **Phase 2: Markdown to Open Knowledge Format (OKF)** — Transforming text into an interconnected, verified knowledge network that both humans and AI systems can trust completely.

---

## 📖 The Two-Step Transformation Journey

\`\`\`
┌─────────────────────────┐
│   Traditional Files     │  PDFs, Word documents, presentations, scans
│ (Trapped in Containers) │  - Rigid layout, difficult to search accurately
└────────────┬────────────┘
             │
             │  Phase 1: Intelligent Document Parsing
             ▼
┌─────────────────────────┐
│    Structured Text      │  Clean, universal Markdown format
│     (Human & Machine    │  - Headings, tables, lists, and images preserved
│        Readable)        │  - No proprietary software required
└────────────┬────────────┘
             │
             │  Phase 2: OKF Concept Slicing & Trust Signals
             ▼
┌─────────────────────────┐
│   Open Knowledge Base   │  Modular, self-contained concepts
│     (OKF Knowledge      │  - Bidirectional links & relationship maps
│        Network)         │  - 5 Built-in Trust & Verification Signals
└─────────────────────────┘
\`\`\`

---

## 📄 Phase 1: The Document-to-Markdown Process

### Why Are Traditional Documents a Bottleneck?
When you look at a PDF or a scanned manual on a screen, your eyes naturally recognize the title, the columns, the callout boxes, and the footnotes. 

However, computer software sees a PDF as a coordinate map of scattered visual elements (e.g., *"draw letter 'A' at position X=120, Y=450"*). When generic tools attempt to extract this text, they often produce jumbled text blocks, broken sentences, split tables, and lost headers.

### What Document-to-Markdown Achieves
Intelligent document conversion acts like an expert human reader scanning the page:
- **Preserves Reading Order**: It identifies columns, sidebars, and callouts so sentences flow naturally.
- **Extracts Structured Tables**: Complex grids and financial statements are converted into clear rows and columns rather than scrambled strings.
- **Retains Document Hierarchy**: Main titles, section headings, and bullet points remain logically organized.
- **Isolates Figures and Captions**: Diagrams and charts are cataloged alongside their descriptive captions.

### The Result: Pure, Open Text
Markdown is the universal language of modern text. It contains no hidden formatting bloat, requires no expensive proprietary software to view, and can be read effortlessly on any device, phone, or web browser.

---

## 🧠 Phase 2: Why Raw Text Is Not Enough — The Need for OKF

Having clean text is a major step forward, but feeding a 300-page text document into an AI assistant or search engine still creates problems:

- **Information Overload**: If someone asks a specific question (e.g., *"What is our travel reimbursement limit?"*), loading the entire 300-page employee handbook wastes time and computing capacity.
- **Loss of Specific Context**: Different sections may use the same term to mean different things without clarifying the relationship.
- **Unknown Reliability**: Was this page written yesterday by the Chief Compliance Officer, or was it drafted three years ago by an intern and never approved?

### Enter the Open Knowledge Format (OKF)
The **Open Knowledge Format (OKF)** transforms a long, continuous document into a network of **modular "Concepts"**—think of them as standardized, interconnected knowledge building blocks.

Each concept focuses on a single clear topic (e.g., *a policy rule, an operational procedure, a product specification, or a definition*).

\`\`\`
   [ Traditional Monolithic Document ]
   ┌─────────────────────────────────┐
   │ 300-Page Employee Handbook      │
   │  - Section 1 (Overview)         │
   │  - Section 2 (Travel Policy)    │
   │  - Section 3 (Expense Claims)   │
   │  - Section 4 (Approvals)        │
   └─────────────────────────────────┘
                   │
                   │  Slices into Modular OKF Concepts
                   ▼
       [ OKF Interconnected Network ]
       
         ┌─────────────────────┐
         │ Concept: Overview   │
         └──────────┬──────────┘
                    │ links to
         ┌──────────▼──────────┐
         │ Concept: Travel     │◄─────────┐
         │ Policy              │          │ verified
         └──────────┬──────────┘          │ relationship
                    │ requires            │
         ┌──────────▼──────────┐          │
         │ Concept: Expense    ├──────────┘
         │ Claims & Limits     │
         └─────────────────────┘
\`\`\`

---

## 🛡️ The 5 Trust Signals of OKF (Version 0.2)

To ensure that AI assistants and team members never act on unverified, out-of-date, or incorrect information, every OKF concept is equipped with **5 Built-In Trust Signals**:

| Trust Signal | Key Question It Answers | What It Means for Your Business |
| :--- | :--- | :--- |
| **1. Provenance** | *Where did this information come from?* | Tracks the exact source document, URL, page number, original author, and lineage so every statement can be traced back to its origin. |
| **2. Trust Tier** | *Who verified this content?* | Distinguishes whether knowledge is **Human-Reviewed** (approved by a domain expert), **Machine-Confirmed** (processed by automated conversion), or **Unverified** (preliminary draft). |
| **3. Freshness** | *Is this still true and valid?* | Sets explicit expiration dates (*"stale after"*). When knowledge expires, the system flags it for review rather than serving outdated advice. |
| **4. Lifecycle** | *What stage is this knowledge in?* | Labels content as **Draft** (in progress), **Stable** (official current standard), or **Deprecated** (superseded by a newer policy). |
| **5. Attested Calculation** | *Was this number calculated correctly?* | Prevents AI systems from improvising math or guessing business formulas. It guarantees that financial rules, metric formulas, and scoring logic use certified formulas. |

---

## 📊 Comprehensive Comparison

### 1. Document Format Comparison

| Feature | Traditional Documents (PDF, DOCX) | Raw Markdown (.md) | Open Knowledge Format (OKF) |
| :--- | :--- | :--- | :--- |
| **Primary Design Goal** | Visual display and printing | Simple, lightweight text editing | Reliable, connected knowledge for humans and AI |
| **Ease of Reading for AI** | 🔴 Difficult (messy layouts, split text) | 🟡 Moderate (can read text, but lacks modular structure) | 🟢 Optimal (modular concepts with clear context) |
| **Cross-Referencing** | 🔴 Static page numbers that break easily | 🟡 Manual links | 🟢 Automatic bidirectional links between concepts |
| **Verification & Audit Stamps** | 🔴 Hidden in file properties or missing | 🔴 None built-in | 🟢 Standardized audit trails and reviewer stamps |
| **Freshness & Expiry Tracking** | 🔴 Manual and easily forgotten | 🔴 None | 🟢 Built-in expiration alerts |
| **Calculations & Formulas** | 🔴 Static text or isolated spreadsheets | 🔴 Plain text equations | 🟢 Certified formulas with defined rules |

---

### 2. How Different Systems Answer Your Questions

Imagine asking: *"What is the approved procedure for requesting international project equipment?"*

\`\`\`
Traditional Keyword Search
  Search: "international equipment"
  Result: 47 PDFs found matching the words.
  Experience: User must download 5 different 80-page files and search through each page manually.

Standard Generative AI (Without OKF)
  Prompt: "What is the procedure for requesting international equipment?"
  Result: Generates a confident answer, but may blend old 2022 rules with current 2026 policies,
          or guess approval thresholds.
  Risk: High risk of subtle hallucinations or outdated guidelines.

OKF-Powered Knowledge System
  Prompt: "What is the procedure for requesting international equipment?"
  Result: Instantly retrieves the exact "International Equipment Request" Concept.
  Assurance: 
    ✔ Verifies the policy is "Stable" (Active)
    ✔ Confirms "Human-Reviewed" by Procurement Director
    ✔ Shows it was sourced from "2026 Procurement Manual, Page 14"
    ✔ Automatically displays prerequisite steps (e.g., Budget Approval)
\`\`\`

---

## 🏢 Real-World Use Cases

### 1. Corporate Policy & Compliance
- **The Problem**: Policies are updated frequently across HR, legal, and security teams. Employees often follow outdated PDFs saved on their desktop.
- **With OKF**: Every policy concept has a verified status and freshness date. If a policy changes, the system immediately alerts teams that the old concept is deprecated and directs them to the current standard.

### 2. Technical & Engineering Operations
- **The Problem**: Large engineering manuals have complex interdependencies. Skipping a prerequisite step during maintenance can lead to costly downtime.
- **With OKF**: Concepts explicitly declare their prerequisites (e.g., *"Step 3 requires completion of Step 1 and Step 2"*). Service technicians and AI assistants always see the complete dependency chain.

### 3. Customer Support & Knowledge Portals
- **The Problem**: Support agents navigate hundreds of help articles. Inconsistent advice across team members frustrates customers.
- **With OKF**: Support agents get instant answers with clear confidence tiers. Answers backed by certified formulas ensure pricing discounts and refund amounts are calculated accurately every time.

### 4. Healthcare & Clinical Guidelines
- **The Problem**: Medical protocols require strict adherence to validated research and author credibility.
- **With OKF**: Provenance tracking guarantees that clinical recommendations cite the exact medical research source, review date, and attending specialist credentials.

---

## 🎯 Key Benefits at a Glance

- 🔍 **Eliminate Wasted Search Time**: Stop opening dozens of documents to find one sentence; get the exact, self-contained concept instantly.
- 🛡️ **Zero Guesswork for AI**: Provide AI assistants with verified, boundary-defined knowledge blocks rather than ambiguous walls of text.
- 🔗 **Understand the Big Picture**: Visual relationship maps show how rules, tools, and teams connect across the entire organization.
- ⏰ **Stay Up-to-Date Automatically**: Built-in freshness timestamps ensure outdated information is flagged before it leads to errors.
- 🌐 **True Portability**: Non-proprietary format that belongs to your organization—free from software lock-in.

---

## 🚀 Summary: The Future of Organizational Knowledge

Transforming static documents into the **Open Knowledge Format (OKF)** represents a shift from **passive file storage** to **active, reliable intelligence**.

By pairing clean, universal text with explicit trust signals and relationship mapping, your organization ensures that its collective wisdom remains accurate, discoverable, and ready for both human teams and modern AI collaboration.
`;
