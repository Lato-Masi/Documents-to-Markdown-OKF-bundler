/**
 * @file server/utils/openApiSpec.ts
 * @description Generates the OpenAPI 3.0.3 JSON specification for the Remote API v1 (/api/v1/*).
 */

export function generateOpenApiSpec(baseUrl: string) {
  const cleanBaseUrl = (baseUrl || "http://localhost:3000").replace(/\/+$/, "");

  return {
    openapi: "3.0.3",
    info: {
      title: "Open Knowledge & Document-to-Markdown Remote API",
      version: "1.0.0",
      description:
        "Production Remote REST & JSON-RPC 2.0 API for multimodal document conversion (PDF, DOCX, XLSX, CSV, HTML, Images), headless URL extraction, NLP readability & sentiment analysis, Agent Skill compilation, Formal Logic classification, MetaAST Vector DB chunking, and Model Context Protocol (MCP) knowledge graph queries.",
      contact: {
        name: "Open Knowledge Format (OKF) API Gateway",
        url: "https://okf.md/spec/",
      },
    },
    servers: [
      {
        url: `${cleanBaseUrl}/api/v1`,
        description: "Remote API v1 Endpoint Gateway",
      },
    ],
    security: [{ BearerAuth: [] }, { ApiKeyHeader: [] }],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "API_KEY",
          description: "Pass your Remote API key as `Authorization: Bearer okf_live_...`",
        },
        ApiKeyHeader: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description: "Pass your Remote API key via the `X-API-Key: okf_live_...` HTTP header",
        },
      },
      schemas: {
        ErrorResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            error: {
              type: "object",
              properties: {
                code: { type: "string", example: "UNAUTHORIZED" },
                message: { type: "string", example: "Missing or invalid API key." },
              },
            },
          },
        },
      },
    },
    paths: {
      "/status": {
        get: {
          tags: ["System & Health"],
          summary: "Verify API key authentication & pipeline readiness",
          description: "Returns server health, uptime, authenticated key metadata, and enabled pipeline capabilities.",
          responses: {
            "200": {
              description: "Authenticated status response",
            },
            "401": {
              description: "Missing or invalid API key",
            },
          },
        },
      },
      "/convert/file": {
        post: {
          tags: ["1. Convert & Web Extraction"],
          summary: "Convert base64 document or image to structured Markdown",
          description:
            "Converts PDF, DOCX, PPTX, XLSX, CSV, HTML, or Image files encoded in Base64 into clean Markdown using LiteParse spatial layout analysis, Mammoth/Turndown deterministic engines, and Gemini multimodal fallback.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["fileName", "base64Data"],
                  properties: {
                    fileName: { type: "string", example: "architecture-guide.pdf" },
                    fileType: { type: "string", example: "application/pdf" },
                    base64Data: { type: "string", description: "Base64-encoded file content" },
                    conversionMode: {
                      type: "string",
                      enum: ["standard", "rich", "text-only"],
                      default: "standard",
                    },
                    targetStyle: {
                      type: "string",
                      enum: ["standard", "gfm", "academic"],
                      default: "gfm",
                    },
                    qualityThreshold: { type: "number", default: 75 },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Converted Markdown and extraction diagnostics" },
          },
        },
      },
      "/convert/url": {
        post: {
          tags: ["1. Convert & Web Extraction"],
          summary: "Fetch and convert a public web page or document URL to Markdown",
          description:
            "Fetches any public URL via Playwright headless rendering and Mozilla Readability content pruning, or downloads binary document links directly, returning clean GFM Markdown and article metadata.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["url"],
                  properties: {
                    url: { type: "string", example: "https://en.wikipedia.org/wiki/Markdown" },
                    conversionMode: {
                      type: "string",
                      enum: ["standard", "rich", "text-only"],
                      default: "standard",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Clean Markdown and extracted article metadata" },
          },
        },
      },
      "/extract/json": {
        post: {
          tags: ["1. Convert & Web Extraction"],
          summary: "Extract strict schema-validated JSON from text or URL",
          description: "Extracts structured JSON adhering to a custom JSON Schema or preset template.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    content: { type: "string", description: "Raw Markdown or text to extract from" },
                    url: { type: "string", description: "Optional public URL to fetch and extract from" },
                    presetId: { type: "string", example: "technical-spec" },
                    extractionPrompt: { type: "string", example: "Extract key entities, specifications, and action items" },
                    jsonSchema: { type: "object", description: "Custom JSON Schema object" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Structured JSON output" },
          },
        },
      },
      "/site/discover": {
        post: {
          tags: ["1. Convert & Web Extraction"],
          summary: "Inspect domain robots.txt, llms.txt, and sitemaps",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["url"],
                  properties: {
                    url: { type: "string", example: "https://playwright.dev" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Domain discovery report" },
          },
        },
      },
      "/site/map": {
        post: {
          tags: ["1. Convert & Web Extraction"],
          summary: "Extract domain sitemap hierarchy and URLs",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["domainOrSitemapUrl"],
                  properties: {
                    domainOrSitemapUrl: { type: "string", example: "https://playwright.dev" },
                    maxUrls: { type: "number", default: 100 },
                    searchKeyword: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Mapped URL list and tree" },
          },
        },
      },
      "/nlp/analyze": {
        post: {
          tags: ["2. NLP & OKF Intelligence"],
          summary: "Analyze readability, sentiment, language, and keywords",
          description:
            "Computes Flesch-Kincaid readability score, grade level, SMOG index, sentiment classification, language detection, and top keywords.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["text"],
                  properties: {
                    text: {
                      type: "string",
                      example:
                        "Distributed consensus algorithms such as Raft and Paxos guarantee state machine replication safety across fault-tolerant server clusters.",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "NLP readability, sentiment, language, and keyword metrics" },
          },
        },
      },
      "/okf/agent": {
        post: {
          tags: ["2. NLP & OKF Intelligence"],
          summary: "Run OKF v1.0 compliance audit, synthesis, or grounded Q&A",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    task: {
                      type: "string",
                      enum: ["synthesize", "audit", "qa"],
                      default: "synthesize",
                    },
                    okfContent: { type: "string" },
                    userQuery: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "OKF agent response" },
          },
        },
      },
      "/skills/synthesize": {
        post: {
          tags: ["3. Agent Skills & Formal Logic"],
          summary: "Compile Markdown runbook into an Agent Skill package",
          description:
            "Slices a monolithic Markdown SOP or runbook into a progressive-disclosure Agent Skill package (SKILL.md, references/, scripts/) with token conservation metrics and preflight validation.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["markdown"],
                  properties: {
                    markdown: {
                      type: "string",
                      example:
                        "# PostgreSQL Failover Runbook\n\n## Overview\nProcedure to promote a read replica when primary node fails.\n\n## Step 1: Verify Replication Lag\n```bash\npsql -c 'SELECT pg_last_wal_replay_lsn();'\n```",
                    },
                    skillName: { type: "string", example: "postgres-failover-ops" },
                    allowedTools: {
                      type: "array",
                      items: { type: "string" },
                      example: ["bash", "psql"],
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Synthesized Agent Skill package, validation, and formal logic profile" },
          },
        },
      },
      "/skills/validate": {
        post: {
          tags: ["3. Agent Skills & Formal Logic"],
          summary: "Validate and audit an Agent Skill package (SKILL-001 to SKILL-006)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["skillPackage"],
                  properties: {
                    skillPackage: { type: "object" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Validation and best practices audit report" },
          },
        },
      },
      "/skills/classify-logic": {
        post: {
          tags: ["3. Agent Skills & Formal Logic"],
          summary: "Classify text using First-Order, Higher-Order, Modal, and Temporal Logic",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["text"],
                  properties: {
                    text: {
                      type: "string",
                      example:
                        "For all cluster nodes x, if node x fails health check three consecutive times, then failover controller must isolate x before promoting standby node y.",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Formal logic classification breakdown" },
          },
        },
      },
      "/meta-ast/parse": {
        post: {
          tags: ["4. MetaAST & Vector DB"],
          summary: "Parse Markdown into an enriched MetaAST block syntax tree",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["markdown"],
                  properties: {
                    markdown: {
                      type: "string",
                      example: "# Vector Indexing\n\n## Chunking Strategy\nPreserve code blocks and table headers.",
                    },
                    documentTitle: { type: "string", example: "Vector Indexing Guide" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Enriched MetaAST nodes and token distribution" },
          },
        },
      },
      "/meta-ast/vector-chunks": {
        post: {
          tags: ["4. MetaAST & Vector DB"],
          summary: "Chunk Markdown for Vector Databases (Pinecone, Qdrant, pgvector)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["markdown"],
                  properties: {
                    markdown: {
                      type: "string",
                      example:
                        "# RAG Architecture\n\n## Semantic Chunking\nMetaAST preserves hierarchical breadcrumbs.\n\n```python\nchunks = chunk_markdown(doc, max_tokens=512)\n```",
                    },
                    options: {
                      type: "object",
                      properties: {
                        maxTokensPerChunk: { type: "number", default: 512 },
                        minHeadingFlushTokens: { type: "number", default: 150 },
                        defaultDocumentTitle: { type: "string", example: "RAG Architecture" },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Vector-ready chunks with breadcrumb metadata" },
          },
        },
      },
      "/mcp/manifest": {
        get: {
          tags: ["5. Model Context Protocol (MCP)"],
          summary: "Get MCP Server capability manifest, tools, and OKF resources",
          responses: {
            "200": { description: "MCP 2024-11-05 manifest" },
          },
        },
      },
      "/mcp/rpc": {
        post: {
          tags: ["5. Model Context Protocol (MCP)"],
          summary: "Execute MCP JSON-RPC 2.0 requests (initialize, tools/list, tools/call, resources/read)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["jsonrpc", "method"],
                  properties: {
                    jsonrpc: { type: "string", example: "2.0" },
                    id: { type: "number", example: 1 },
                    method: { type: "string", example: "tools/call" },
                    params: {
                      type: "object",
                      example: {
                        name: "classify_document_logic",
                        arguments: {
                          text: "If primary database is unreachable for 30s, execute automated replica promotion.",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "JSON-RPC 2.0 response payload" },
          },
        },
      },
      "/mcp/query": {
        post: {
          tags: ["5. Model Context Protocol (MCP)"],
          summary: "Query active OKF knowledge base with 1-hop graph dependency expansion",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["query"],
                  properties: {
                    query: { type: "string", example: "consensus" },
                    topK: { type: "number", default: 3 },
                    expandGraph: { type: "boolean", default: true },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Matched OKF concepts and assembled context" },
          },
        },
      },
    },
  };
}
