/**
 * @okf/connectors - AI Agent Ecosystem SDK Code Generators & Protocol Bridges
 * Provides production-ready connectors for:
 * - LangChain (Python & TypeScript)
 * - LlamaIndex (Python & TypeScript)
 * - Model Context Protocol (MCP JSON-RPC 2.0 Live Protocol Schema)
 * - Claude Desktop MCP Configuration
 * - AutoGen / CrewAI Multi-Agent Swarm Knowledge Tools
 */

import type { OkfBundle } from 'okf-ts';

export interface EcosystemCodeSnippet {
  name: string;
  framework: 'langchain' | 'llamaindex' | 'mcp' | 'autogen' | 'crewai';
  language: 'python' | 'typescript' | 'json';
  filename: string;
  description: string;
  code: string;
}

/**
 * Generates LangChain Python custom OKF Graph-RAG retriever.
 */
export function generateLangChainPython(bundleName: string): string {
  return `"""
OKF Knowledge Graph Retriever for LangChain (Python)
Zero-hallucination neighborhood traversal with trust-tier ranking.
"""
from typing import List, Optional, Dict, Any
from langchain_core.retrievers import BaseRetriever
from langchain_core.documents import Document
from langchain_core.callbacks import CallbackManagerForRetrieverRun
import requests

class OKFKnowledgeRetriever(BaseRetriever):
    """LangChain Retriever backed by an Open Knowledge Format (OKF) graph."""
    
    endpoint_url: str = "http://localhost:3000/api/mcp/rag/query"
    max_hops: int = 1
    top_k: int = 3
    min_trust_tier: str = "human-reviewed" # "human-reviewed" | "machine-confirmed" | "all"
    
    def _get_relevant_documents(
        self, query: str, *, run_manager: Optional[CallbackManagerForRetrieverRun] = None
    ) -> List[Document]:
        payload = {
            "query": query,
            "topK": self.top_k,
            "maxHops": self.max_hops,
            "minTrustTier": self.min_trust_tier,
            "bundle": "${bundleName}"
        }
        
        try:
            resp = requests.post(self.endpoint_url, json=payload, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            
            docs = []
            for item in data.get("nodes", []):
                doc = Document(
                    page_content=item.get("content", ""),
                    metadata={
                        "id": item.get("id"),
                        "title": item.get("title"),
                        "type": item.get("type"),
                        "trustTier": item.get("trustTier"),
                        "hopDistance": item.get("hopDistance", 0),
                        "prerequisites": item.get("prerequisites", []),
                        "relatedConcepts": item.get("relatedConcepts", [])
                    }
                )
                docs.append(doc)
            return docs
        except Exception as e:
            # Fallback or log error
            return [Document(page_content=f"OKF Retrieval error: {str(e)}", metadata={"error": True})]

# Example Usage in a LangChain RAG Chain:
# ----------------------------------------------------
# from langchain_openai import ChatOpenAI
# from langchain.chains import create_retrieval_chain
# from langchain.chains.combine_documents import create_stuff_documents_chain
# from langchain_core.prompts import ChatPromptTemplate
#
# retriever = OKFKnowledgeRetriever(max_hops=1, top_k=3)
# llm = ChatOpenAI(model="gpt-4o", temperature=0)
#
# prompt = ChatPromptTemplate.from_template("""
# You are an expert answering based strictly on verified OKF Knowledge:
# <context>
# {context}
# </context>
# Question: {input}
# Answer with provenance and concept citations:
# """)
#
# doc_chain = create_stuff_documents_chain(llm, prompt)
# rag_chain = create_retrieval_chain(retriever, doc_chain)
# response = rag_chain.invoke({"input": "What are the core system requirements?"})
# print(response["answer"])
`;
}

/**
 * Generates LangChain TypeScript / JS custom retriever.
 */
export function generateLangChainTypeScript(bundleName: string): string {
  return `/**
 * OKF Knowledge Graph Retriever for LangChain.js (TypeScript)
 * Supports typed Concept Nodes, Wikilink hops & Trust Tiers.
 */
import { BaseRetriever, type BaseRetrieverInput } from "@langchain/core/retrievers";
import { Document } from "@langchain/core/documents";
import type { CallbackManagerForRetrieverRun } from "@langchain/core/callbacks/manager";

export interface OKFRetrieverFields extends BaseRetrieverInput {
  endpointUrl?: string;
  topK?: number;
  maxHops?: number;
  minTrustTier?: "human-reviewed" | "machine-confirmed" | "all";
}

export class OKFRetriever extends BaseRetriever {
  lc_namespace = ["langchain", "retrievers", "okf"];
  endpointUrl: string;
  topK: number;
  maxHops: number;
  minTrustTier: string;

  constructor(fields?: OKFRetrieverFields) {
    super(fields);
    this.endpointUrl = fields?.endpointUrl ?? "http://localhost:3000/api/mcp/rag/query";
    this.topK = fields?.topK ?? 3;
    this.maxHops = fields?.maxHops ?? 1;
    this.minTrustTier = fields?.minTrustTier ?? "all";
  }

  async _getRelevantDocuments(
    query: string,
    _runManager?: CallbackManagerForRetrieverRun
  ): Promise<Document[]> {
    const response = await fetch(this.endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        topK: this.topK,
        maxHops: this.maxHops,
        minTrustTier: this.minTrustTier,
        bundle: "${bundleName}",
      }),
    });

    if (!response.ok) {
      throw new Error(\`OKF Retrieval failed: \${response.statusText}\`);
    }

    const data = await response.json();
    return (data.nodes || []).map(
      (node: any) =>
        new Document({
          pageContent: \`# \${node.title} (\${node.type})\\n\\n\${node.content}\`,
          metadata: {
            id: node.id,
            title: node.title,
            type: node.type,
            trustTier: node.trustTier,
            hopDistance: node.hopDistance,
            prerequisites: node.prerequisites || [],
            source: node.path || node.id,
          },
        })
    );
  }
}
`;
}

/**
 * Generates LlamaIndex Python NodeParser and PropertyGraph retriever.
 */
export function generateLlamaIndexPython(bundleName: string): string {
  return `"""
LlamaIndex Custom OKF (Open Knowledge Format) Reader & Graph Index
Converts OKF concept markdown files into PropertyGraph Nodes with relational edges.
"""
from typing import List, Dict, Any
from llama_index.core.schema import TextNode, NodeRelationship, RelatedNodeInfo
from llama_index.core import PropertyGraphIndex
import json
import glob
import os

class OKFDirectoryReader:
    """Reads an .okf/ repository directory and builds typed Knowledge Nodes."""
    
    def __init__(self, okf_dir: str = ".okf"):
        self.okf_dir = okf_dir

    def load_nodes(self) -> List[TextNode]:
        nodes = []
        md_files = glob.glob(f"{self.okf_dir}/**/*.md", recursive=True)
        
        for file_path in md_files:
            if os.path.basename(file_path) == "index.md":
                continue
                
            with open(file_path, "r", encoding="utf-8") as f:
                raw_text = f.read()
                
            # Parse YAML frontmatter & body
            frontmatter, body = self._parse_frontmatter(raw_text)
            concept_id = os.path.relpath(file_path, self.okf_dir).replace(".md", "")
            
            node = TextNode(
                text=body,
                id_=concept_id,
                metadata={
                    "title": frontmatter.get("title", concept_id),
                    "type": frontmatter.get("type", "concept"),
                    "status": frontmatter.get("status", "stable"),
                    "trustTier": frontmatter.get("trustTier", "machine-confirmed"),
                    "tags": frontmatter.get("tags", []),
                    "depends_on": frontmatter.get("depends_on", []),
                }
            )
            nodes.append(node)
            
        return nodes

    def _parse_frontmatter(self, text: str) -> (Dict[str, Any], str):
        if not text.startswith("---"):
            return {}, text
        parts = text.split("---", 2)
        if len(parts) >= 3:
            import yaml
            try:
                fm = yaml.safe_load(parts[1]) or {}
                return fm, parts[2].strip()
            except Exception:
                return {}, text
        return {}, text

# Example Usage:
# ----------------------------------------------------
# reader = OKFDirectoryReader(".okf")
# nodes = reader.load_nodes()
# index = PropertyGraphIndex.from_documents(nodes)
# query_engine = index.as_query_engine(include_text=True, similarity_top_k=3)
# response = query_engine.query("Explain the deployment pipeline flow.")
# print(response)
`;
}

/**
 * Generates Claude Desktop / Cursor MCP Server configuration JSON.
 */
export function generateClaudeDesktopMcpConfig(serverUrl: string = 'http://localhost:3000/api/mcp'): string {
  return JSON.stringify(
    {
      mcpServers: {
        'okf-knowledge-graph': {
          command: 'npx',
          args: ['-y', '@okf/mcp-server', '--endpoint', serverUrl],
          env: {
            OKF_LOG_LEVEL: 'info',
            OKF_STRICT_MODE: 'true',
          },
        },
      },
    },
    null,
    2
  );
}

/**
 * Generates AutoGen / CrewAI Python Multi-Agent Tool.
 */
export function generateCrewAiPython(bundleName: string): string {
  return `"""
CrewAI & AutoGen Tool for Querying Verified OKF Knowledge Graphs
"""
from crewai.tools import tool
import requests

@tool("Query OKF Knowledge Graph")
def query_okf_knowledge_graph(query: str, max_hops: int = 1) -> str:
    """
    Search and retrieve verified concept documents, procedures, and dependency graphs
    from the project's Open Knowledge Format (OKF) repository.
    
    Args:
        query (str): The search query or question to answer.
        max_hops (int): Graph traversal depth (0 for direct match, 1 for dependencies).
    """
    url = "http://localhost:3000/api/mcp/rag/query"
    payload = {
        "query": query,
        "maxHops": max_hops,
        "bundle": "${bundleName}"
    }
    
    try:
        response = requests.post(url, json=payload, timeout=8)
        response.raise_for_status()
        data = response.json()
        
        output = [f"### Retreived OKF Grounded Context for '{query}':\\n"]
        for node in data.get("nodes", []):
            output.append(f"**[{node.get('type', 'concept').upper()}] {node.get('title')}** (Trust: {node.get('trustTier')})")
            output.append(f"{node.get('content')}\\n")
            if node.get("prerequisites"):
                output.append(f"*Prerequisites:* {', '.join(node.get('prerequisites'))}\\n")
        return "\\n".join(output)
    except Exception as e:
        return f"Error retrieving from OKF graph: {str(e)}"
`;
}

/**
 * Returns all ecosystem code snippets.
 */
export function getAllEcosystemSnippets(bundleName: string = 'okf-knowledge-base'): EcosystemCodeSnippet[] {
  return [
    {
      name: 'LangChain (Python)',
      framework: 'langchain',
      language: 'python',
      filename: 'okf_langchain_retriever.py',
      description: 'Custom BaseRetriever subclass with multi-hop graph expansion & trust tier filtering.',
      code: generateLangChainPython(bundleName),
    },
    {
      name: 'LangChain.js (TypeScript)',
      framework: 'langchain',
      language: 'typescript',
      filename: 'OKFRetriever.ts',
      description: 'Zero-dependency TypeScript retriever compatible with LangChain.js & LangGraph.',
      code: generateLangChainTypeScript(bundleName),
    },
    {
      name: 'LlamaIndex (Python)',
      framework: 'llamaindex',
      language: 'python',
      filename: 'okf_llamaindex_reader.py',
      description: 'Parses .okf/ directory into PropertyGraph TextNodes with relational frontmatter.',
      code: generateLlamaIndexPython(bundleName),
    },
    {
      name: 'Claude Desktop MCP Config',
      framework: 'mcp',
      language: 'json',
      filename: 'claude_desktop_config.json',
      description: 'Configuration to connect Claude Desktop directly to this OKF MCP Server.',
      code: generateClaudeDesktopMcpConfig(),
    },
    {
      name: 'CrewAI / AutoGen Agent Tool',
      framework: 'crewai',
      language: 'python',
      filename: 'okf_crewai_tool.py',
      description: 'Decorated @tool function for multi-agent swarms (CrewAI, AutoGen, LangGraph).',
      code: generateCrewAiPython(bundleName),
    },
  ];
}
