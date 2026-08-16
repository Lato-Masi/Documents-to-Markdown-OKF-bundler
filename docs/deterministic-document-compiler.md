# Deterministic Document Compilation for LLM Agents

## Reducing Hallucinations & Providing Verification Guarantees

Modern LLM-powered autonomous agents frequently face reliability issues when processing large-scale technical manuals, standard operating procedures (SOPs), and enterprise runbooks. This document outlines the architectural principles behind the **Deterministic Knowledge & Skill Compiler**, explaining how compiling unstructured text into structured, formal representations minimizes hallucinations and provides rigorous verification assurances.

---

## 1. The Core Paradigm Shift

```
TRADITIONAL PROMPTING (Non-Deterministic / High Hallucination Risk)
Raw 50-page PDF / Runbook ───► Injected into 128k LLM Context Window ───► "Lost in the Middle" + Hallucinations

DETERMINISTIC COMPILATION (Deterministic Execution Contract)
Raw Monolithic Document
         │
         ▼
[ AST / Markdown Slicer ]   ───► Extracts Semantic Headings, Tables & Code Fences
         │
         ▼
[ Formal Logic Classifier ] ───► Categorizes FOL (∀, ∃), Modal (□), Temporal (U) vs Declarative
         │
         ├─────────────────────────────────────────────┐
         ▼                                             ▼
[ Declarative Graph (OKF) ]                   [ Agent Skills Router (SKILL.md) ]
 • RDF / JSON-LD / TTL Triples                • Deterministic Preflight (SKILL-001..006)
 • Strict Entity Schemas & Cycles Verified    • Progressive Disclosure (<5,000 tokens)
 • Graph-RAG Grounded Traversal               • Sandboxed Scripts (scripts/*) & JIT Refs
```

Traditional Retrieval-Augmented Generation (RAG) and raw prompt stuffing treat text as arbitrary token sequences. In contrast, **Deterministic Document Compilation** treats human documentation as **source code** that is parsed, typed, validated, and compiled into dual-mode target artifacts:
1. **Declarative Knowledge (Open Knowledge Format / OKF)**: Formal concept nodes, relations, and RDF graphs for fact retrieval.
2. **Procedural Action (Agent Skills / `SKILL.md`)**: Progressive-disclosure execution packages with typed tools and scripts for task execution.

---

## 2. The Four Pillars of Hallucination Reduction

### Pillar 1: Progressive Disclosure & Token Budgeting
- **The Problem**: When monolithic 50,000-token manuals are dumped into an LLM context, attention mechanisms suffer from the "lost-in-the-middle" effect. This leads to missed constraints, inverted logic, and hallucinated CLI flags.
- **The Compiler Solution**:
  - **Tier 1 (Discovery)**: ~50–100 tokens exposed in agent system indexes.
  - **Tier 2 (Activation Router)**: Root `SKILL.md` body strictly constrained under 5,000 tokens (well below the attention saturation threshold).
  - **Tier 3 (Execution / JIT)**: Specialized reference tables, error codes, and edge cases offloaded to `references/<topic>.md`, fetched only when relevant.

### Pillar 2: Grounding in Formal Logic Constructs
- **The Problem**: Ambiguous natural language (e.g., *"You should probably verify the pod status"*) causes unpredictable agent execution.
- **The Compiler Solution**:
  - The NLP classifier evaluates text against **First-Order Logic (FOL)**, **Higher-Order Logic (HOL)**, **Modal Deontic Logic**, and **Linear Temporal Logic (LTL)**:
    - **Modal Deontic ($\mathcal{O}, \mathcal{F}$)**: Identifies mandatory obligations (`must`, `shall`) and safety guards (`must not`, `never`).
    - **First-Order Quantifiers ($\forall, \exists$)**: Identifies search queries (`find matching`) and batch iterations (`for each`).
    - **Temporal Logic ($\mathbf{U}, \mathbf{X}$)**: Identifies retry loops (`while status == 429`), backoff intervals, and sequential step ordering.
  - These are compiled into explicit state-machine workflows with clear decision branches and fallback strategies.

### Pillar 3: Sandboxed Script Extraction
- **The Problem**: Asking an LLM to generate complex `bash`, `python`, or `SQL` scripts at runtime frequently produces hallucinated flags, outdated API invocations, or syntax errors.
- **The Compiler Solution**:
  - The compiler extracts all verified executable code blocks into static, immutable scripts located in `scripts/`.
  - The agent simply calls `./scripts/deploy.sh` instead of hallucinating code on the fly.

### Pillar 4: Preflight Static Analysis & Linting (SKILL-001 through SKILL-006)
- Just as a compiler enforces type safety, our preflight validation suite verifies the package before runtime:
  - **SKILL-001 (Name Invariant)**: Validates naming schema against strict kebab-case regex rules.
  - **SKILL-002 (Trigger Clarity)**: Enforces clear, descriptive triggers in frontmatter.
  - **SKILL-003 (Token Budget Guard)**: Enforces token ceiling constraints (<5,000 tokens).
  - **SKILL-004 (Referential Integrity)**: Confirms all markdown hyperlinks to `references/` or `scripts/` resolve to valid files.
  - **SKILL-005 (Tool Contract)**: Verifies that required tool interfaces are declared.
  - **SKILL-006 (Secret Scrubbing)**: Scans for leaked keys, tokens, and credentials.

---

## 3. Measurable Reliability Outcomes

| Metric | Raw Uncompiled Prompting | Compiled Skill / OKF Architecture |
| :--- | :--- | :--- |
| **Context Consumption** | 20k–100k tokens / request | 1k–4k active tokens / request (90%+ savings) |
| **Instruction Following** | Variable (probabilistic degradation) | High (structured constraints & typed tools) |
| **Code Syntax Errors** | High (runtime hallucinations) | Zero (pre-extracted, validated static scripts) |
| **Broken References** | Common (unverified assumptions) | Zero (enforced by SKILL-004 preflight linting) |
