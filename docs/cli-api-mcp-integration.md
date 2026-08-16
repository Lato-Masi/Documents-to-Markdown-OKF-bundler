# Integration Guide: CLI, REST API & MCP Server

The system provides three interoperable interfaces for procedural **Agent Skills (`SKILL.md`)** and declarative **Knowledge Concepts (`OKF`)**:

```
                               ┌────────────────────────┐
                               │  Human / CI / Agent    │
                               └───────────┬────────────┘
                                           │
            ┌──────────────────────────────┼──────────────────────────────┐
            ▼                              ▼                              ▼
  ┌──────────────────┐           ┌───────────────────┐          ┌───────────────────┐
  │   CLI Tooling    │           │     REST API      │          │   MCP JSON-RPC    │
  │   (@okf/cli)     │           │   (Express 4.x)   │          │ (Anthropic Spec)  │
  └─────────┬────────┘           └─────────┬─────────┘          └─────────┬─────────┘
            │                              │                              │
            └──────────────────────────────┼──────────────────────────────┘
                                           │
                                           ▼
                       ┌──────────────────────────────────────┐
                       │  Deterministic Slicer & AST Engine   │
                       ├──────────────────────────────────────┤
                       │ • Formal Logic Classifier (FOL/HOL)  │
                       │ • Token Progressive Disclosure (<5k) │
                       │ • Preflight Linter (SKILL-001..006)  │
                       └──────────────────────────────────────┘
```

---

## 1. CLI Reference (`@okf/cli`)

Run directly via `npx okf <command>`:

### Agent Skills Commands
| Command | Description | Example |
| :--- | :--- | :--- |
| `npx okf skill-split <file>` | Decomposes a monolithic runbook into an Agent Skill package | `npx okf skill-split deploy-sop.md --out-dir=.skills --tools=run_command,edit_file` |
| `npx okf skill-lint <dir>` | Validates a skill directory against rules SKILL-001 through SKILL-006 | `npx okf skill-lint .skills/deploy-sop --strict` |
| `npx okf skill-classify <file>` | Runs the formal First-Order Logic (FOL/HOL/Modal) NLP classifier | `npx okf skill-classify manual.md` |
| `npx okf skill-init <name>` | Scaffolds a compliant starter skill package | `npx okf skill-init redis-failover` |

### Declarative OKF Commands
| Command | Description | Example |
| :--- | :--- | :--- |
| `npx okf init [dir]` | Scaffolds an `.okf/` knowledge base directory | `npx okf init` |
| `npx okf check [--strict]` | Verifies knowledge schemas, links, and detects cyclic graphs | `npx okf check --strict` |
| `npx okf split <file>` | Slices text into atomic concept nodes | `npx okf split architecture.md` |
| `npx okf export --format=<fmt>` | Exports graph to W3C Turtle RDF, JSON-LD, or Obsidian | `npx okf export --format=turtle` |
| `npx okf query "<prompt>"` | Executes Graph-RAG neighborhood retrieval with 1-hop traversal | `npx okf query "Raft consensus election"` |

---

## 2. REST API Endpoints

All endpoints are hosted on port `3000` under `/api/`:

### Procedural Skills API (`/api/skills/*`)
* `POST /api/skills/synthesize`
  * **Payload**: `{ markdown: string, skillName?: string, allowedTools?: string[] }`
  * **Response**: `{ success: true, skill: AgentSkillPackage, validation: DiagnosticReport, metrics: TokenMetrics }`
* `POST /api/skills/validate`
  * **Payload**: `{ skillPackage: AgentSkillPackage }`
  * **Response**: `{ valid: boolean, score: number, diagnostics: Diagnostic[] }`
* `POST /api/skills/classify-logic`
  * **Payload**: `{ text: string }`
  * **Response**: `{ classification: LogicClassificationResult }`
* `GET /api/skills/list`
  * **Response**: Array of synthesized skills with token budgets and savings percentages.

---

## 3. Model Context Protocol (MCP) Integration

The server implements the standard **MCP JSON-RPC 2.0 protocol** (`/api/mcp/rpc`) and capability manifest (`/api/mcp/manifest`), allowing direct integration with Claude Desktop, Cursor, and autonomous agents.

### Supported MCP Tools
1. `synthesize_agent_skill`: Partitions unstructured SOPs into `SKILL.md`, `references/`, and `scripts/`.
2. `classify_document_logic`: Computes First-Order Logic and Modal Deontic scores to determine procedural vs. declarative text.
3. `validate_agent_skill_preflight`: Executes static analysis linting (SKILL-001 through SKILL-006).
4. `search_okf_concepts`: Semantic and tag-filtered search across declarative OKF concepts.
5. `traverse_okf_graph`: 1-hop and 2-hop topological dependency walking.
6. `get_okf_concept`: Fetches raw concept markdown and YAML frontmatter.
