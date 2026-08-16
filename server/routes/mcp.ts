import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import { getGeminiApiKey, getFriendlyErrorMessage, generateContentStreamWithRetry } from "../utils/geminiService";
import { sliceMonolithToAgentSkill } from "../../src/lib/skillProceduralSlicer";
import { validateAgentSkill } from "../../src/lib/skillValidator";
import { classifyTextLogic } from "../../src/lib/logicClassifier";

const router = Router();

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType: string;
  text?: string;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: object;
}

// In-memory active knowledge base cache for fast agent query
let currentKnowledgeBase: {
  name: string;
  concepts: Array<{
    id: string;
    path: string;
    type: string;
    title: string;
    description: string;
    tags: string[];
    status: string;
    trustTier: string;
    body: string;
    prerequisites?: string[];
    relatedConcepts?: string[];
  }>;
  rawMarkdown?: string;
  updatedAt: string;
} = {
  name: "Default OKF Knowledge Base",
  concepts: [],
  updatedAt: new Date().toISOString(),
};

/**
 * Endpoint: POST /api/mcp/sync-knowledge-base
 * Allows client UI or agents to register or update the active OKF bundle
 */
router.post("/mcp/sync-knowledge-base", (req, res) => {
  try {
    const { name, concepts, rawMarkdown } = req.body;
    if (!concepts || !Array.isArray(concepts)) {
      return res.status(400).json({ error: "Invalid concepts payload. Expected array of OKF concepts." });
    }

    currentKnowledgeBase = {
      name: name || "OKF Knowledge Base",
      concepts,
      rawMarkdown: rawMarkdown || "",
      updatedAt: new Date().toISOString(),
    };

    res.json({
      status: "synced",
      bundleName: currentKnowledgeBase.name,
      totalConcepts: currentKnowledgeBase.concepts.length,
      updatedAt: currentKnowledgeBase.updatedAt,
    });
  } catch (error: any) {
    console.error("MCP Sync Error:", error);
    res.status(500).json({ error: error.message || "Failed to sync knowledge base." });
  }
});

/**
 * Endpoint: GET /api/mcp/manifest
 * Returns the MCP Server capability manifest, available tools, and resources list
 */
router.get("/mcp/manifest", (req, res) => {
  const rootId = (currentKnowledgeBase.name || "okf-kb").toLowerCase().replace(/\s+/g, "-");

  const resources: MCPResource[] = currentKnowledgeBase.concepts.map((c) => ({
    uri: `okf://${rootId}/${c.path || c.id}`,
    name: c.title || c.path || c.id,
    description: c.description || `OKF Concept Document (${c.type})`,
    mimeType: "text/markdown",
  }));

  resources.unshift({
    uri: `okf://${rootId}/INDEX.md`,
    name: `${currentKnowledgeBase.name} Master Index`,
    description: "Root OKF Catalog and Concept Manifest",
    mimeType: "text/markdown",
  });

  const tools: MCPTool[] = [
    {
      name: "search_okf_concepts",
      description: "Perform semantic keyword, tag, or trust-tier filtered search across all OKF knowledge blocks.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search terms or keywords" },
          tag: { type: "string", description: "Optional tag filter (e.g. distributed-systems)" },
          type: { type: "string", description: "Optional concept type (concept, procedure, table, guideline)" },
          trustTier: { type: "string", enum: ["all", "human-reviewed", "machine-confirmed"] },
          limit: { type: "number", description: "Max results to return (default 5)" },
        },
        required: ["query"],
      },
    },
    {
      name: "get_okf_concept",
      description: "Retrieve full frontmatter metadata and body text for an atomic OKF concept by its ID or file path.",
      inputSchema: {
        type: "object",
        properties: {
          conceptId: { type: "string", description: "Path or ID of the concept (e.g. concepts/consensus.md)" },
        },
        required: ["conceptId"],
      },
    },
    {
      name: "traverse_okf_graph",
      description: "Walk directed dependency edges (prerequisites, implementers, references) starting from a concept node.",
      inputSchema: {
        type: "object",
        properties: {
          conceptId: { type: "string", description: "Origin concept node ID" },
          direction: { type: "string", enum: ["upstream", "downstream", "both"], description: "Direction of dependency traversal" },
          maxHops: { type: "number", description: "Max graph traversal hops (1 or 2)" },
        },
        required: ["conceptId"],
      },
    },
    {
      name: "query_grounded_agent",
      description: "Execute structured reasoning over the knowledge graph with full citation grounding.",
      inputSchema: {
        type: "object",
        properties: {
          question: { type: "string", description: "The natural language question to answer" },
          filterTrust: { type: "string", enum: ["all", "human-reviewed"] },
        },
        required: ["question"],
      },
    },
    {
      name: "validate_okf_syntax",
      description: "Validate raw Markdown against OKF v0.2 / v1.0 standard rules and return compliance score.",
      inputSchema: {
        type: "object",
        properties: {
          markdown: { type: "string", description: "Raw Markdown with YAML frontmatter to validate" },
        },
        required: ["markdown"],
      },
    },
    {
      name: "synthesize_agent_skill",
      description: "Compile and partition a monolithic runbook/SOP into an Agent Skill package (SKILL.md, references/, scripts/).",
      inputSchema: {
        type: "object",
        properties: {
          markdown: { type: "string", description: "Raw monolithic runbook/SOP markdown" },
          skillName: { type: "string", description: "Optional skill name in kebab-case (e.g. redis-cluster-recovery)" },
          allowedTools: { type: "array", items: { type: "string" }, description: "Tool names allowed for execution" },
        },
        required: ["markdown"],
      },
    },
    {
      name: "classify_document_logic",
      description: "Perform formal First-Order Logic (FOL), Higher-Order Logic, Modal, and Temporal analysis to classify procedural vs declarative text.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Text snippet or full document to classify" },
        },
        required: ["text"],
      },
    },
    {
      name: "validate_agent_skill_preflight",
      description: "Execute 6-point preflight validation on an agent skill package (SKILL-001 through SKILL-006).",
      inputSchema: {
        type: "object",
        properties: {
          rootSkillMd: { type: "string", description: "The content of SKILL.md" },
          references: { type: "array", description: "List of reference files" },
          scripts: { type: "array", description: "List of script files" },
        },
        required: ["rootSkillMd"],
      },
    },
  ];

  res.json({
    jsonrpc: "2.0",
    protocolVersion: "2024-11-05",
    serverInfo: {
      name: "okf-model-context-protocol-server",
      version: "0.2.0",
      vendor: "Open Knowledge Format (OKF)",
      specUrl: "https://okf.md/spec/",
    },
    capabilities: {
      resources: { subscribe: false, listChanged: true },
      tools: { listChanged: false },
      prompts: { listChanged: false },
    },
    resources,
    tools,
  });
});

/**
 * Endpoint: POST /api/mcp/rpc
 * JSON-RPC 2.0 endpoint for MCP Clients (Claude Desktop, Cursor, Custom Agents)
 */
router.post("/mcp/rpc", async (req, res) => {
  const { jsonrpc, id, method, params } = req.body;

  if (jsonrpc !== "2.0" || !method) {
    return res.status(400).json({
      jsonrpc: "2.0",
      id: id || null,
      error: { code: -32600, message: "Invalid JSON-RPC 2.0 Request" },
    });
  }

  try {
    switch (method) {
      // 1. Initialize Protocol Handshake
      case "initialize": {
        return res.json({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {
              resources: {},
              tools: {},
            },
            serverInfo: {
              name: "okf-mcp-server",
              version: "0.2.0",
            },
          },
        });
      }

      // 2. List Resources
      case "resources/list": {
        const rootId = (currentKnowledgeBase.name || "okf-kb").toLowerCase().replace(/\s+/g, "-");
        const resources = currentKnowledgeBase.concepts.map((c) => ({
          uri: `okf://${rootId}/${c.path || c.id}`,
          name: c.title || c.path || c.id,
          description: c.description || `OKF Concept Document (${c.type})`,
          mimeType: "text/markdown",
        }));
        return res.json({ jsonrpc: "2.0", id, result: { resources } });
      }

      // 3. Read Specific Resource
      case "resources/read": {
        const uri = params?.uri as string;
        if (!uri) {
          return res.status(400).json({
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: "Missing resource URI" },
          });
        }

        const cleanPath = uri.replace(/^okf:\/\/[^/]+\//, "");
        const concept = currentKnowledgeBase.concepts.find(
          (c) => c.path === cleanPath || c.id === cleanPath || c.path.endsWith(cleanPath)
        );

        if (cleanPath === "INDEX.md" || cleanPath === "") {
          const indexContent = `# ${currentKnowledgeBase.name} Index\n\nTotal Concepts: ${currentKnowledgeBase.concepts.length}\n\n` +
            currentKnowledgeBase.concepts.map((c) => `- [${c.title}](${c.path}) (${c.type})`).join("\n");
          return res.json({
            jsonrpc: "2.0",
            id,
            result: {
              contents: [{ uri, mimeType: "text/markdown", text: indexContent }],
            },
          });
        }

        if (!concept) {
          return res.status(404).json({
            jsonrpc: "2.0",
            id,
            error: { code: -32001, message: `Resource not found: ${uri}` },
          });
        }

        const markdownRepresentation = `---
type: ${concept.type}
title: "${concept.title}"
description: "${concept.description || ''}"
tags: [${(concept.tags || []).join(", ")}]
status: ${concept.status || 'stable'}
trustTier: ${concept.trustTier || 'machine-confirmed'}
---

${concept.body}`;

        return res.json({
          jsonrpc: "2.0",
          id,
          result: {
            contents: [{ uri, mimeType: "text/markdown", text: markdownRepresentation }],
          },
        });
      }

      // 4. List Tools
      case "tools/list": {
        return res.json({
          jsonrpc: "2.0",
          id,
          result: {
            tools: [
              {
                name: "search_okf_concepts",
                description: "Search concepts, tags, procedures, and tables across the OKF knowledge base.",
                inputSchema: {
                  type: "object",
                  properties: {
                    query: { type: "string" },
                    limit: { type: "number" },
                  },
                  required: ["query"],
                },
              },
              {
                name: "get_okf_concept",
                description: "Retrieve a specific concept markdown file with frontmatter metadata.",
                inputSchema: {
                  type: "object",
                  properties: {
                    conceptId: { type: "string" },
                  },
                  required: ["conceptId"],
                },
              },
              {
                name: "traverse_okf_graph",
                description: "Find upstream prerequisites and downstream dependents for a concept.",
                inputSchema: {
                  type: "object",
                  properties: {
                    conceptId: { type: "string" },
                    maxHops: { type: "number" },
                  },
                  required: ["conceptId"],
                },
              },
            ],
          },
        });
      }

      // 5. Call Tool
      case "tools/call": {
        const { name, arguments: args } = params;

        if (name === "search_okf_concepts") {
          const query = (args?.query || "").toLowerCase();
          const limit = args?.limit || 5;

          const matches = currentKnowledgeBase.concepts
            .map((c) => {
              let score = 0;
              const text = `${c.title} ${c.description} ${c.tags.join(" ")} ${c.body}`.toLowerCase();
              if (c.title.toLowerCase().includes(query)) score += 10;
              if (c.description.toLowerCase().includes(query)) score += 5;
              if (c.tags.some((t) => t.toLowerCase().includes(query))) score += 4;
              if (text.includes(query)) score += 2;
              return { concept: c, score };
            })
            .filter((m) => m.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);

          return res.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      query,
                      totalMatches: matches.length,
                      results: matches.map((m) => ({
                        id: m.concept.id,
                        path: m.concept.path,
                        title: m.concept.title,
                        type: m.concept.type,
                        trustTier: m.concept.trustTier,
                        description: m.concept.description,
                        tags: m.concept.tags,
                        relevanceScore: m.score,
                      })),
                    },
                    null,
                    2
                  ),
                },
              ],
            },
          });
        }

        if (name === "get_okf_concept") {
          const cid = args?.conceptId;
          const concept = currentKnowledgeBase.concepts.find(
            (c) => c.id === cid || c.path === cid || c.path.endsWith(cid)
          );

          if (!concept) {
            return res.json({
              jsonrpc: "2.0",
              id,
              result: {
                content: [{ type: "text", text: `Concept '${cid}' not found in active knowledge base.` }],
                isError: true,
              },
            });
          }

          return res.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(concept, null, 2),
                },
              ],
            },
          });
        }

        if (name === "traverse_okf_graph") {
          const cid = args?.conceptId;
          const concept = currentKnowledgeBase.concepts.find(
            (c) => c.id === cid || c.path === cid || c.path.endsWith(cid)
          );

          return res.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      targetConcept: cid,
                      prerequisites: concept?.prerequisites || [],
                      relatedConcepts: concept?.relatedConcepts || [],
                      directNeighborsCount: (concept?.prerequisites?.length || 0) + (concept?.relatedConcepts?.length || 0),
                    },
                    null,
                    2
                  ),
                },
              ],
            },
          });
        }

        if (name === "synthesize_agent_skill") {
          const markdown = args?.markdown as string;
          if (!markdown) {
            return res.json({
              jsonrpc: "2.0",
              id,
              result: { content: [{ type: "text", text: "Missing required 'markdown' argument." }], isError: true },
            });
          }
          const pkg = sliceMonolithToAgentSkill(markdown, {
            customSkillName: args?.skillName,
            allowedTools: args?.allowedTools,
          });
          const validation = validateAgentSkill(pkg);
          return res.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      name: pkg.name,
                      metrics: pkg.metrics,
                      validation,
                      rootSkillMd: pkg.rootSkillMd,
                      references: pkg.references,
                      scripts: pkg.scripts,
                      assets: pkg.assets,
                    },
                    null,
                    2
                  ),
                },
              ],
            },
          });
        }

        if (name === "classify_document_logic") {
          const text = args?.text as string;
          if (!text) {
            return res.json({
              jsonrpc: "2.0",
              id,
              result: { content: [{ type: "text", text: "Missing required 'text' argument." }], isError: true },
            });
          }
          const classification = classifyTextLogic(text);
          return res.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(classification, null, 2),
                },
              ],
            },
          });
        }

        if (name === "validate_agent_skill_preflight") {
          const pkgPayload = {
            name: args?.name || "test-skill",
            rootSkillMd: args?.rootSkillMd || "",
            references: args?.references || [],
            scripts: args?.scripts || [],
            assets: args?.assets || [],
            metrics: {
              discoveryTokens: 0,
              activationTokens: 0,
              executionTotalTokens: 0,
              originalTotalTokens: 0,
              contextSavingsPercentage: 0,
            },
            createdAt: new Date().toISOString(),
          };
          const validation = validateAgentSkill(pkgPayload as any);
          return res.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(validation, null, 2),
                },
              ],
            },
          });
        }

        return res.status(404).json({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Tool '${name}' not recognized.` },
        });
      }

      default:
        return res.status(400).json({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method '${method}' not found.` },
        });
    }
  } catch (err: any) {
    console.error("MCP Execution Error:", err);
    return res.status(500).json({
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: err.message || "Internal RPC Error" },
    });
  }
});

/**
 * Endpoint: POST /api/mcp/query
 * Simplified high-level Agent Query API for lightweight HTTP agents
 */
router.post("/mcp/query", async (req, res) => {
  try {
    const { query, trustTier, topK = 3, expandGraph = true } = req.body;
    if (!query) {
      return res.status(400).json({ error: "Search query is required." });
    }

    const matches = currentKnowledgeBase.concepts
      .map((c) => {
        let score = 0;
        const text = `${c.title} ${c.description} ${c.tags.join(" ")} ${c.body}`.toLowerCase();
        const q = query.toLowerCase();
        if (c.title.toLowerCase().includes(q)) score += 10;
        if (c.description.toLowerCase().includes(q)) score += 5;
        if (c.tags.some((t) => t.toLowerCase().includes(q))) score += 4;
        if (text.includes(q)) score += 2;
        return { concept: c, score };
      })
      .filter((m) => (trustTier && trustTier !== "all" ? m.concept.trustTier === trustTier : true))
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    // Collect 1-hop dependencies
    const expandedIds = new Set<string>();
    for (const m of matches) {
      expandedIds.add(m.concept.id);
      if (expandGraph && m.concept.prerequisites) {
        for (const p of m.concept.prerequisites) expandedIds.add(p);
      }
    }

    const assembledNodes = currentKnowledgeBase.concepts.filter((c) => expandedIds.has(c.id));

    res.json({
      query,
      bundleName: currentKnowledgeBase.name,
      primaryMatches: matches.map((m) => ({
        id: m.concept.id,
        path: m.concept.path,
        title: m.concept.title,
        type: m.concept.type,
        trustTier: m.concept.trustTier,
        relevanceScore: m.score,
      })),
      expandedNodes: assembledNodes.map((n) => ({
        id: n.id,
        path: n.path,
        title: n.title,
        type: n.type,
        trustTier: n.trustTier,
      })),
      assembledContextText: assembledNodes
        .map((n) => `### [${n.type.toUpperCase()}] ${n.title} (${n.path})\nTrust: ${n.trustTier}\n\n${n.body}`)
        .join("\n\n---\n\n"),
    });
  } catch (error: any) {
    console.error("Agent Query Error:", error);
    res.status(500).json({ error: error.message || "Failed to process query." });
  }
});

export default router;
