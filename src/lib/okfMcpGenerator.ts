/**
 * @file okfMcpGenerator.ts
 * @description Comprehensive Model Context Protocol (MCP) Tool Configuration & Server Generator for OKF v0.2.
 *
 * Supports generating production-ready MCP configurations and executable server implementations for:
 * - Claude Desktop (`claude_desktop_config.json`)
 * - Cursor IDE (`.cursor/mcp.json`)
 * - Windsurf IDE (`mcp_config.json`)
 * - Zed Editor (`settings.json`)
 * - Cline / Roo Code / VS Code (`cline_mcp_settings.json`)
 * - OpenAI Function Calling / LangChain / LlamaIndex Tools
 * - Standalone Zero-Dependency Node.js Stdio Server (`mcp-server.js`)
 * - Standalone Python FastMCP Server (`server.py`)
 * - Docker Container Configuration (`Dockerfile` + run commands)
 */

import type { OkfBundle, OkfConcept, OkfMetadata } from 'okf-ts';
import type { SemanticGraphResult } from './okfSemanticGraphEngine';
import { deriveTrustTier } from './okfKnowledgeEngine';

export type MCPClientTarget =
  | 'claude-desktop'
  | 'cursor'
  | 'windsurf'
  | 'zed'
  | 'cline'
  | 'openai'
  | 'standalone-node'
  | 'fastmcp-python'
  | 'docker';

export type MCPTransportType = 'stdio' | 'sse' | 'http';

export interface MCPToolDefinition {
  id: string;
  name: string;
  description: string;
  category: 'search' | 'retrieval' | 'graph' | 'sparql' | 'trust' | 'skill' | 'reasoning';
  enabledByDefault: boolean;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPPromptDefinition {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    required: boolean;
  }>;
}

export interface MCPGeneratorOptions {
  serverName?: string;
  serverVersion?: string;
  transport?: MCPTransportType;
  serverUrl?: string; // For SSE or HTTP
  commandPath?: string;
  customEnv?: Record<string, string>;
  enabledToolIds?: string[];
  includePrompts?: boolean;
  includeResources?: boolean;
  includeEmbeddedKnowledge?: boolean;
}

/**
 * Registry of all available standard OKF MCP Tools
 */
export function getStandardOKFMCPTools(bundleName: string): MCPToolDefinition[] {
  const cleanBundle = bundleName.toLowerCase().replace(/[^a-zA-Z0-9_]/g, '_');

  return [
    {
      id: 'search_okf_concepts',
      name: `search_${cleanBundle}_concepts`,
      description: `Perform fuzzy, keyword, or tag-filtered search across concepts, procedures, tables, and metrics in ${bundleName}.`,
      category: 'search',
      enabledByDefault: true,
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Keywords, entities, or natural language query to search for.',
          },
          type: {
            type: 'string',
            enum: ['all', 'concept', 'procedure', 'table', 'guideline', 'metric', 'reference'],
            description: 'Filter results by OKF concept type.',
          },
          trustTier: {
            type: 'string',
            enum: ['all', 'human-reviewed', 'machine-confirmed'],
            description: 'Filter by verification trust tier.',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return (default: 5).',
          },
        },
        required: ['query'],
      },
    },
    {
      id: 'get_okf_concept',
      name: `get_${cleanBundle}_concept`,
      description: `Retrieve full markdown text, YAML frontmatter, sources, trust level, and quality metrics for a concept by its path or ID.`,
      category: 'retrieval',
      enabledByDefault: true,
      inputSchema: {
        type: 'object',
        properties: {
          conceptId: {
            type: 'string',
            description: 'The concept path (e.g., "concepts/authentication.md") or slug ID.',
          },
        },
        required: ['conceptId'],
      },
    },
    {
      id: 'traverse_okf_graph',
      name: `traverse_${cleanBundle}_graph`,
      description: `Walk knowledge graph dependency edges to find prerequisites, implementers, and related concepts.`,
      category: 'graph',
      enabledByDefault: true,
      inputSchema: {
        type: 'object',
        properties: {
          conceptId: {
            type: 'string',
            description: 'Origin concept node ID to traverse from.',
          },
          direction: {
            type: 'string',
            enum: ['upstream', 'downstream', 'both'],
            description: 'Direction of dependency traversal: upstream (prerequisites) or downstream (dependents).',
          },
          maxHops: {
            type: 'number',
            description: 'Maximum graph traversal radius / hops (default: 1, max: 3).',
          },
        },
        required: ['conceptId'],
      },
    },
    {
      id: 'find_learning_path',
      name: `find_${cleanBundle}_path`,
      description: `Compute the optimal step-by-step prerequisite learning path between an origin concept and a target concept.`,
      category: 'graph',
      enabledByDefault: true,
      inputSchema: {
        type: 'object',
        properties: {
          fromConceptId: {
            type: 'string',
            description: 'Starting concept ID or path.',
          },
          toConceptId: {
            type: 'string',
            description: 'Goal concept ID or path.',
          },
        },
        required: ['fromConceptId', 'toConceptId'],
      },
    },
    {
      id: 'query_okf_sparql',
      name: `query_${cleanBundle}_sparql`,
      description: `Execute a formal W3C SPARQL 1.1 graph query against the RDF knowledge base model.`,
      category: 'sparql',
      enabledByDefault: false,
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'W3C SPARQL 1.1 SELECT or ASK query string.',
          },
        },
        required: ['query'],
      },
    },
    {
      id: 'verify_concept_trust',
      name: `verify_${cleanBundle}_trust`,
      description: `Audit verification status, cryptographic attestation signatures, stale_after freshness dates, and provenance sources.`,
      category: 'trust',
      enabledByDefault: true,
      inputSchema: {
        type: 'object',
        properties: {
          conceptId: {
            type: 'string',
            description: 'Concept ID to audit.',
          },
        },
        required: ['conceptId'],
      },
    },
    {
      id: 'synthesize_agent_skill',
      name: `synthesize_${cleanBundle}_skill`,
      description: `Compile a monolithic runbook or procedure into a structured Agent Skill package (SKILL.md, references/, scripts/).`,
      category: 'skill',
      enabledByDefault: false,
      inputSchema: {
        type: 'object',
        properties: {
          markdown: {
            type: 'string',
            description: 'Raw markdown document to partition.',
          },
          skillName: {
            type: 'string',
            description: 'Kebab-case skill identifier (e.g. "cluster-failover").',
          },
        },
        required: ['markdown'],
      },
    },
  ];
}

/**
 * Standard MCP Prompts
 */
export function getStandardOKFMCPPrompts(bundleName: string): MCPPromptDefinition[] {
  return [
    {
      name: 'explain_concept_with_prerequisites',
      description: `Guides the assistant to explain a ${bundleName} concept thoroughly, checking that all dependency prerequisites are understood first.`,
      arguments: [
        {
          name: 'conceptId',
          description: 'The concept to explain.',
          required: true,
        },
        {
          name: 'userExpertiseLevel',
          description: 'User proficiency (beginner, intermediate, expert).',
          required: false,
        },
      ],
    },
    {
      name: 'execute_procedure_safely',
      description: `Guides the assistant through executing an OKF procedure step-by-step with safety guards, preconditions, and post-action verification.`,
      arguments: [
        {
          name: 'procedureId',
          description: 'The procedure concept ID to execute.',
          required: true,
        },
      ],
    },
    {
      name: 'identify_knowledge_gaps',
      description: `Analyzes the knowledge base for missing prerequisite concepts or unverified trust boundaries.`,
    },
  ];
}

/**
 * Generates client-specific MCP configuration files and executable server templates.
 */
export function generateMCPConfiguration(
  bundle: OkfBundle,
  semanticGraph: SemanticGraphResult | undefined,
  target: MCPClientTarget,
  options: MCPGeneratorOptions = {}
): {
  filename: string;
  mimeType: string;
  content: string;
  instructions: string;
  configJson?: any;
} {
  const rootId = (bundle.root || 'okf-knowledge-base').toLowerCase().replace(/\s+/g, '-');
  const bundleTitle = bundle.root || 'OKF Knowledge Base';
  const serverName = options.serverName || `okf-${rootId}`;
  const allTools = getStandardOKFMCPTools(bundleTitle);
  const activeTools = options.enabledToolIds
    ? allTools.filter((t) => options.enabledToolIds!.includes(t.id))
    : allTools.filter((t) => t.enabledByDefault);

  const command = options.commandPath || 'node';
  const serverScriptPath = `./mcp-server.js`;
  const defaultEnv = {
    NODE_ENV: 'production',
    OKF_BUNDLE_NAME: bundleTitle,
    ...(options.customEnv || {}),
  };

  switch (target) {
    // -------------------------------------------------------------
    // 1. Claude Desktop (claude_desktop_config.json)
    // -------------------------------------------------------------
    case 'claude-desktop': {
      const config = {
        mcpServers: {
          [serverName]: {
            command: 'node',
            args: ['/ABSOLUTE/PATH/TO/' + serverScriptPath.replace('./', '')],
            env: defaultEnv,
          },
        },
      };

      const instructions = `### Claude Desktop Installation Guide
1. Copy the JSON snippet below.
2. Open your Claude Desktop configuration file:
   - **macOS**: \`~/Library/Application Support/Claude/claude_desktop_config.json\`
   - **Windows**: \`%APPDATA%\\Claude\\claude_desktop_config.json\`
   - **Linux**: \`~/.config/Claude/claude_desktop_config.json\`
3. Merge this server definition into your \`"mcpServers"\` object.
4. Replace \`/ABSOLUTE/PATH/TO/\` with the full path to your saved \`mcp-server.js\` file.
5. Fully restart Claude Desktop. The hammer 🔨 icon will appear in the prompt input with ${activeTools.length} OKF tools.`;

      return {
        filename: 'claude_desktop_config.json',
        mimeType: 'application/json',
        content: JSON.stringify(config, null, 2),
        instructions,
        configJson: config,
      };
    }

    // -------------------------------------------------------------
    // 2. Cursor IDE (.cursor/mcp.json)
    // -------------------------------------------------------------
    case 'cursor': {
      const config = {
        mcpServers: {
          [serverName]: {
            command: 'node',
            args: [serverScriptPath],
            env: defaultEnv,
          },
        },
      };

      const instructions = `### Cursor IDE Installation Guide
1. Place this file as \`.cursor/mcp.json\` in the root of your project workspace.
2. Or in Cursor: Go to **Settings** → **Features** → **MCP Servers** → **Add New MCP Server**.
3. Name: \`${serverName}\`
4. Type: \`command\`
5. Command: \`node ${serverScriptPath}\`
6. Cursor Agent & Composer will automatically leverage OKF tools when answering questions.`;

      return {
        filename: 'mcp.json',
        mimeType: 'application/json',
        content: JSON.stringify(config, null, 2),
        instructions,
        configJson: config,
      };
    }

    // -------------------------------------------------------------
    // 3. Windsurf IDE (mcp_config.json)
    // -------------------------------------------------------------
    case 'windsurf': {
      const config = {
        mcpServers: {
          [serverName]: {
            command: 'node',
            args: [serverScriptPath],
            env: defaultEnv,
          },
        },
      };

      const instructions = `### Windsurf IDE Installation Guide
1. Open \`~/.codeium/windsurf/mcp_config.json\` on your machine.
2. Add the \`${serverName}\` configuration to the \`mcpServers\` dictionary.
3. Save the file. Cascade will instantly detect the OKF knowledge tools.`;

      return {
        filename: 'mcp_config.json',
        mimeType: 'application/json',
        content: JSON.stringify(config, null, 2),
        instructions,
        configJson: config,
      };
    }

    // -------------------------------------------------------------
    // 4. Zed Editor (settings.json)
    // -------------------------------------------------------------
    case 'zed': {
      const config = {
        context_servers: {
          [serverName]: {
            command: 'node',
            args: [serverScriptPath],
            env: defaultEnv,
          },
        },
      };

      const instructions = `### Zed Editor Installation Guide
1. Open Zed Settings (\`Cmd + ,\` or \`Ctrl + ,\`).
2. Add this snippet inside your \`context_servers\` block in \`settings.json\`.
3. In the Assistant panel, type \`/context\` to attach OKF knowledge documents and run graph queries.`;

      return {
        filename: 'zed_settings.json',
        mimeType: 'application/json',
        content: JSON.stringify(config, null, 2),
        instructions,
        configJson: config,
      };
    }

    // -------------------------------------------------------------
    // 5. Cline / Roo Code / VS Code (cline_mcp_settings.json)
    // -------------------------------------------------------------
    case 'cline': {
      const config = {
        mcpServers: {
          [serverName]: {
            command: 'node',
            args: [serverScriptPath],
            env: defaultEnv,
            disabled: false,
            autoApprove: ['search_okf_concepts', 'get_okf_concept'],
          },
        },
      };

      const instructions = `### Cline / Roo Code Installation Guide
1. In VS Code, open the Cline / Roo Code sidebar.
2. Click the **MCP Servers** tab (cube icon) → **Configure MCP Servers**.
3. Paste the configuration snippet into your settings file.
4. Cline will automatically consult OKF concepts during coding and debugging sessions.`;

      return {
        filename: 'cline_mcp_settings.json',
        mimeType: 'application/json',
        content: JSON.stringify(config, null, 2),
        instructions,
        configJson: config,
      };
    }

    // -------------------------------------------------------------
    // 6. OpenAI Assistants / LangChain Tools JSON
    // -------------------------------------------------------------
    case 'openai': {
      const openAiTools = activeTools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      }));

      const instructions = `### OpenAI Assistants & LangChain Tool Definition
- Direct drop-in \`tools: [...]\` array for the OpenAI Chat Completions / Assistants API.
- Compatible with LangChain \`StructuredTool.from_function\` and LlamaIndex FunctionCallingAgent.`;

      return {
        filename: 'openai_tools.json',
        mimeType: 'application/json',
        content: JSON.stringify(openAiTools, null, 2),
        instructions,
        configJson: openAiTools,
      };
    }

    // -------------------------------------------------------------
    // 7. Standalone Node.js Zero-Dependency Executable Server (mcp-server.js)
    // -------------------------------------------------------------
    case 'standalone-node': {
      const serverCode = generateStandaloneNodeMcpServerScript(bundle, semanticGraph, activeTools);
      const instructions = `### Standalone Node.js MCP Server Guide
1. Save this file as \`mcp-server.js\`.
2. Run it locally via:
   \`\`\`bash
   node mcp-server.js
   \`\`\`
3. It speaks standard JSON-RPC 2.0 over \`stdio\` with zero external npm dependencies.
4. The entire OKF knowledge base and relationship graph are compiled directly into the script for instant startup and offline capability.`;

      return {
        filename: 'mcp-server.js',
        mimeType: 'application/javascript',
        content: serverCode,
        instructions,
      };
    }

    // -------------------------------------------------------------
    // 8. Python FastMCP Server (server.py)
    // -------------------------------------------------------------
    case 'fastmcp-python': {
      const pythonCode = generatePythonFastMcpScript(bundle, semanticGraph, activeTools);
      const instructions = `### Python FastMCP Server Guide
1. Install FastMCP:
   \`\`\`bash
   pip install mcp
   \`\`\`
2. Save as \`server.py\` and run with:
   \`\`\`bash
   python server.py
   # or with FastMCP CLI:
   mcp run server.py
   \`\`\`
3. Ready for integration with LangChain, LlamaIndex, and AutoGen.`;

      return {
        filename: 'server.py',
        mimeType: 'text/x-python',
        content: pythonCode,
        instructions,
      };
    }

    // -------------------------------------------------------------
    // 9. Docker Containerized Stdio Server
    // -------------------------------------------------------------
    case 'docker': {
      const dockerfile = `FROM node:20-alpine
WORKDIR /app
COPY mcp-server.js ./
USER node
ENV NODE_ENV=production
ENTRYPOINT ["node", "mcp-server.js"]
`;

      const clientConfig = {
        mcpServers: {
          [serverName]: {
            command: 'docker',
            args: ['run', '-i', '--rm', `${serverName}:latest`],
            env: {},
          },
        },
      };

      const combined = `# ==========================================
# 1. Dockerfile
# ==========================================
${dockerfile}

# ==========================================
# 2. Build Command
# ==========================================
# docker build -t ${serverName}:latest .

# ==========================================
# 3. Client MCP Config (claude_desktop_config.json)
# ==========================================
${JSON.stringify(clientConfig, null, 2)}
`;

      const instructions = `### Dockerized MCP Server Guide
1. Build the Docker container: \`docker build -t ${serverName}:latest .\`
2. Add the Docker command to your Claude Desktop or Cursor MCP config.
3. Completely isolates the knowledge server within an immutable container sandbox.`;

      return {
        filename: 'Dockerfile',
        mimeType: 'text/plain',
        content: combined,
        instructions,
      };
    }
  }
}

/**
 * Generates a self-contained zero-dependency Node.js MCP server script speaking standard JSON-RPC 2.0 over stdio.
 */
function generateStandaloneNodeMcpServerScript(
  bundle: OkfBundle,
  semanticGraph: SemanticGraphResult | undefined,
  activeTools: MCPToolDefinition[]
): string {
  const rootId = (bundle.root || 'okf-kb').toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_');
  const bundleTitle = bundle.root || 'OKF Knowledge Base';

  // Embed concepts data
  const conceptsPayload = bundle.concepts.map((c) => {
    const key = c.path || c.id || '';
    const trust = deriveTrustTier(c);
    const prereqs = semanticGraph?.edges
      .filter((e) => e.from === key && (e.kind === 'depends_on' || e.kind === 'prerequisite_of'))
      .map((e) => e.to) || [];
    const related = semanticGraph?.edges
      .filter((e) => e.from === key)
      .map((e) => e.to) || [];

    return {
      id: key,
      path: key,
      title: String(c.metadata?.title || key),
      type: String(c.metadata?.type || 'concept'),
      description: String(c.metadata?.description || ''),
      tags: Array.isArray(c.metadata?.tags) ? c.metadata.tags : [],
      status: String(c.metadata?.status || 'stable'),
      trustTier: trust,
      sources: c.metadata?.sources || [],
      stale_after: c.metadata?.stale_after || null,
      body: c.body || '',
      prerequisites: prereqs,
      relatedConcepts: related,
    };
  });

  const graphEdges = (semanticGraph?.edges || []).map((e) => ({
    from: e.from,
    to: e.to,
    kind: e.kind,
  }));

  const payloadJson = JSON.stringify(
    {
      name: bundleTitle,
      version: bundle.version || '0.2.0',
      concepts: conceptsPayload,
      edges: graphEdges,
    },
    null,
    2
  );

  return `#!/usr/bin/env node
/**
 * @file mcp-server.js
 * @description Standalone Zero-Dependency Model Context Protocol (MCP) Stdio Server for "${bundleTitle}".
 *
 * Implements MCP Specification 2024-11-05 over stdio with JSON-RPC 2.0 framing.
 * Auto-generated by Open Knowledge Format (OKF v0.2).
 */

const readline = require('readline');

// Embedded Knowledge Base Payload
const KNOWLEDGE_BASE = ${payloadJson};

// Server Metadata
const SERVER_NAME = "okf-${rootId}";
const SERVER_VERSION = KNOWLEDGE_BASE.version || "0.2.0";

// Standard JSON-RPC 2.0 Response Builder
function sendResponse(id, result, error = null) {
  const response = {
    jsonrpc: "2.0",
    id: id !== undefined ? id : null,
  };
  if (error) {
    response.error = error;
  } else {
    response.result = result;
  }
  process.stdout.write(JSON.stringify(response) + "\\n");
}

// Request Handler
async function handleRequest(request) {
  const { id, method, params } = request;

  switch (method) {
    // 1. Protocol Handshake
    case "initialize": {
      return sendResponse(id, {
        protocolVersion: "2024-11-05",
        capabilities: {
          resources: { listChanged: false },
          tools: { listChanged: false },
          prompts: { listChanged: false },
        },
        serverInfo: {
          name: SERVER_NAME,
          version: SERVER_VERSION,
        },
      });
    }

    // 2. Resources List
    case "resources/list": {
      const resources = KNOWLEDGE_BASE.concepts.map((c) => ({
        uri: \`okf://${rootId}/\${c.path}\`,
        name: c.title,
        description: c.description || \`OKF \${c.type}\`,
        mimeType: "text/markdown",
      }));
      resources.unshift({
        uri: \`okf://${rootId}/INDEX.md\`,
        name: \`\${KNOWLEDGE_BASE.name} Master Index\`,
        description: "Complete catalog of concepts",
        mimeType: "text/markdown",
      });
      return sendResponse(id, { resources });
    }

    // 3. Resources Read
    case "resources/read": {
      const uri = params?.uri || "";
      const cleanPath = uri.replace(/^okf:\\/\\/[^/]+\\//, "");
      
      if (cleanPath === "INDEX.md" || cleanPath === "") {
        const indexText = \`# \${KNOWLEDGE_BASE.name} Master Index\\n\\nTotal Concepts: \${KNOWLEDGE_BASE.concepts.length}\\n\\n\` +
          KNOWLEDGE_BASE.concepts.map(c => \`- [\${c.title}](\${c.path}) — \` + c.type).join("\\n");
        return sendResponse(id, {
          contents: [{ uri, mimeType: "text/markdown", text: indexText }],
        });
      }

      const concept = KNOWLEDGE_BASE.concepts.find(c => c.path === cleanPath || c.id === cleanPath);
      if (!concept) {
        return sendResponse(id, null, { code: -32001, message: \`Resource not found: \${uri}\` });
      }

      const md = \`---\\ntitle: "\${concept.title}"\\ntype: \${concept.type}\\ntrustTier: \${concept.trustTier}\\ntags: [\${concept.tags.join(', ')}]\\n---\\n\\n\${concept.body}\`;
      return sendResponse(id, {
        contents: [{ uri, mimeType: "text/markdown", text: md }],
      });
    }

    // 4. Tools List
    case "tools/list": {
      const tools = ${JSON.stringify(activeTools, null, 6)};
      return sendResponse(id, { tools });
    }

    // 5. Tools Call
    case "tools/call": {
      const name = params?.name || "";
      const args = params?.arguments || {};

      // Search Tool
      if (name.includes("search")) {
        const query = (args.query || "").toLowerCase();
        const typeFilter = args.type || "all";
        const limit = args.limit || 5;

        const results = KNOWLEDGE_BASE.concepts
          .map(c => {
            let score = 0;
            const fullText = \`\${c.title} \${c.description} \${c.tags.join(' ')} \${c.body}\`.toLowerCase();
            if (c.title.toLowerCase().includes(query)) score += 10;
            if (c.description.toLowerCase().includes(query)) score += 5;
            if (c.tags.some(t => t.toLowerCase().includes(query))) score += 4;
            if (fullText.includes(query)) score += 2;
            if (typeFilter !== "all" && c.type !== typeFilter) score = 0;
            return { concept: c, score };
          })
          .filter(m => m.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
          .map(m => ({
            id: m.concept.id,
            path: m.concept.path,
            title: m.concept.title,
            type: m.concept.type,
            trustTier: m.concept.trustTier,
            description: m.concept.description,
            tags: m.concept.tags,
            relevanceScore: m.score,
          }));

        return sendResponse(id, {
          content: [{ type: "text", text: JSON.stringify({ query, matches: results.length, results }, null, 2) }],
        });
      }

      // Get Concept Tool
      if (name.includes("get_") && name.includes("concept")) {
        const cid = args.conceptId;
        const concept = KNOWLEDGE_BASE.concepts.find(c => c.id === cid || c.path === cid || c.path.endsWith(cid));
        if (!concept) {
          return sendResponse(id, {
            content: [{ type: "text", text: \`Concept '\${cid}' not found.\` }],
            isError: true,
          });
        }
        return sendResponse(id, {
          content: [{ type: "text", text: JSON.stringify(concept, null, 2) }],
        });
      }

      // Traverse Graph Tool
      if (name.includes("traverse")) {
        const cid = args.conceptId;
        const concept = KNOWLEDGE_BASE.concepts.find(c => c.id === cid || c.path === cid);
        return sendResponse(id, {
          content: [{
            type: "text",
            text: JSON.stringify({
              originNode: cid,
              prerequisites: concept ? concept.prerequisites : [],
              relatedConcepts: concept ? concept.relatedConcepts : [],
              edgesCount: KNOWLEDGE_BASE.edges.length,
            }, null, 2),
          }],
        });
      }

      // Verify Trust Tool
      if (name.includes("verify") && name.includes("trust")) {
        const cid = args.conceptId;
        const concept = KNOWLEDGE_BASE.concepts.find(c => c.id === cid || c.path === cid);
        if (!concept) {
          return sendResponse(id, { content: [{ type: "text", text: "Concept not found" }], isError: true });
        }
        return sendResponse(id, {
          content: [{
            type: "text",
            text: JSON.stringify({
              concept: cid,
              trustTier: concept.trustTier,
              status: concept.status,
              stale_after: concept.stale_after,
              sourcesCount: concept.sources.length,
              verified: concept.trustTier !== 'unverified',
            }, null, 2),
          }],
        });
      }

      return sendResponse(id, null, { code: -32601, message: \`Tool '\${name}' not supported.\` });
    }

    default:
      return sendResponse(id, null, { code: -32601, message: \`Method '\${method}' not recognized.\` });
  }
}

// Read JSON-RPC 2.0 lines from stdin
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on('line', (line) => {
  if (!line.trim()) return;
  try {
    const json = JSON.parse(line);
    handleRequest(json);
  } catch (err) {
    sendResponse(null, null, { code: -32700, message: "Parse error: Invalid JSON." });
  }
});
`;
}

/**
 * Generates a Python FastMCP server script.
 */
function generatePythonFastMcpScript(
  bundle: OkfBundle,
  semanticGraph: SemanticGraphResult | undefined,
  activeTools: MCPToolDefinition[]
): string {
  const rootId = (bundle.root || 'okf-kb').toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_');
  const bundleTitle = bundle.root || 'OKF Knowledge Base';

  return `"""
Model Context Protocol (FastMCP) Server for ${bundleTitle}
Auto-generated by Open Knowledge Format (OKF v0.2)
"""

from mcp.server.fastmcp import FastMCP
import json

# Initialize FastMCP Server
mcp = FastMCP("${bundleTitle}")

# In-memory concepts index
CONCEPTS = [
${bundle.concepts
  .map((c) => {
    const key = c.path || c.id || '';
    const trust = deriveTrustTier(c);
    return `    {
        "id": "${key}",
        "path": "${key}",
        "title": "${String(c.metadata?.title || key).replace(/"/g, '\\"')}",
        "type": "${String(c.metadata?.type || 'concept')}",
        "trustTier": "${trust}",
        "description": "${String(c.metadata?.description || '').replace(/"/g, '\\"')}",
        "tags": ${JSON.stringify(c.metadata?.tags || [])},
        "body": """${(c.body || '').replace(/"""/g, '\\"\\"\\"').slice(0, 400)}..."""
    }`;
  })
  .join(',\n')}
]

@mcp.tool()
def search_okf_concepts(query: str, limit: int = 5) -> str:
    """Search concepts, procedures, tables, and metrics across ${bundleTitle}."""
    q = query.lower()
    matches = []
    for c in CONCEPTS:
        score = 0
        if q in c["title"].lower(): score += 10
        if q in c["description"].lower(): score += 5
        if any(q in t.lower() for t in c["tags"]): score += 4
        if score > 0:
            matches.append((score, c))
    matches.sort(key=lambda x: x[0], reverse=True)
    return json.dumps([m[1] for m in matches[:limit]], indent=2)

@mcp.tool()
def get_okf_concept(concept_id: str) -> str:
    """Retrieve full atomic concept details and metadata by ID."""
    for c in CONCEPTS:
        if c["id"] == concept_id or c["path"] == concept_id:
            return json.dumps(c, indent=2)
    return f"Concept '{concept_id}' not found."

@mcp.resource("okf://${rootId}/INDEX.md")
def get_master_index() -> str:
    """Master catalog index of ${bundleTitle}."""
    lines = ["# ${bundleTitle} Index", "", "Total Concepts: " + str(len(CONCEPTS)), ""]
    for c in CONCEPTS:
        lines.append("- **" + str(c.get('title', '')) + "** (" + str(c.get('type', 'concept')) + ") - " + str(c.get('path', '')))
    return "\\n".join(lines)

if __name__ == "__main__":
    mcp.run()
`;
}
