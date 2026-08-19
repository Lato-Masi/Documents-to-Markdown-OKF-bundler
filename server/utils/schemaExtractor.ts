import { GoogleGenAI } from "@google/genai";
import { fetchRenderedPage } from "./playwrightFetcher";
import { extractCleanArticleHtml } from "./readabilityExtractor";
import { convertDocumentLocally } from "./localConverter";
import { isHtmlWebPageUrl } from "./urlValidator";

export interface SchemaExtractionRequest {
  // Input source: either direct text/markdown content OR a web URL
  content?: string;
  url?: string;
  // JSON Schema definition or natural language structure instructions
  jsonSchema?: string | object;
  extractionPrompt?: string;
  // Optional schema preset ID for quick templates
  presetId?: string;
  apiKey?: string;
}

export interface SchemaExtractionResult {
  success: boolean;
  data: any;
  rawJsonString: string;
  schemaUsed: any;
  sourceType: "url" | "document_text";
  sourceUrl?: string;
  stats: {
    inputLengthChars: number;
    outputLengthChars: number;
    durationMs: number;
    modelUsed: string;
  };
  markdownSummary?: string;
}

// Built-in presets for common structured document and webpage extraction needs
export const EXTRACTION_PRESETS: {
  id: string;
  name: string;
  description: string;
  category: "Web & API" | "Business & Finance" | "Documentation & Knowledge" | "E-Commerce & Products";
  schema: object;
  defaultPrompt: string;
}[] = [
  {
    id: "api_reference",
    name: "REST / GraphQL API Endpoints",
    description: "Extract endpoints, HTTP methods, route paths, parameters, headers, and request/response payloads",
    category: "Web & API",
    schema: {
      type: "object",
      properties: {
        apiName: { type: "string" },
        baseUrl: { type: "string" },
        description: { type: "string" },
        endpoints: {
          type: "array",
          items: {
            type: "object",
            properties: {
              method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"] },
              path: { type: "string" },
              summary: { type: "string" },
              parameters: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    in: { type: "string", enum: ["query", "header", "path", "body"] },
                    required: { type: "boolean" },
                    type: { type: "string" },
                    description: { type: "string" },
                  },
                  required: ["name", "in", "type"],
                },
              },
              responseFormat: { type: "string" },
              exampleResponse: { type: "string" },
            },
            required: ["method", "path", "summary"],
          },
        },
      },
      required: ["endpoints"],
    },
    defaultPrompt: "Extract all API endpoints, parameters, authentication requirements, and response schemas documented on this page.",
  },
  {
    id: "pricing_tiers",
    name: "SaaS Pricing & Feature Matrix",
    description: "Extract subscription tiers, prices, billing intervals, target users, and included/excluded features",
    category: "Business & Finance",
    schema: {
      type: "object",
      properties: {
        productName: { type: "string" },
        currency: { type: "string" },
        plans: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              priceMonthly: { type: "string" },
              priceAnnual: { type: "string" },
              targetAudience: { type: "string" },
              isPopular: { type: "boolean" },
              featuresIncluded: { type: "array", items: { type: "string" } },
              limits: { type: "array", items: { type: "string" } },
              ctaText: { type: "string" },
            },
            required: ["name", "featuresIncluded"],
          },
        },
        faq: {
          type: "array",
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              answer: { type: "string" },
            },
            required: ["question", "answer"],
          },
        },
      },
      required: ["plans"],
    },
    defaultPrompt: "Extract all subscription pricing tiers, feature matrices, usage limits, and pricing FAQs into a structured comparison.",
  },
  {
    id: "faq_qna",
    name: "Frequently Asked Questions (FAQ / Q&A)",
    description: "Extract questions, full answers, category tags, and related topics",
    category: "Documentation & Knowledge",
    schema: {
      type: "object",
      properties: {
        topic: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              answer: { type: "string" },
              category: { type: "string" },
              keyTakeaway: { type: "string" },
            },
            required: ["question", "answer"],
          },
        },
      },
      required: ["items"],
    },
    defaultPrompt: "Extract all questions, answers, and supporting explanations from this document or page.",
  },
  {
    id: "product_specs",
    name: "Product Specifications & Catalog",
    description: "Extract product titles, SKU/model, technical specifications, dimensions, features, and warranty",
    category: "E-Commerce & Products",
    schema: {
      type: "object",
      properties: {
        productTitle: { type: "string" },
        brand: { type: "string" },
        modelNumber: { type: "string" },
        price: { type: "string" },
        availability: { type: "string" },
        technicalSpecs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              specName: { type: "string" },
              value: { type: "string" },
              category: { type: "string" },
            },
            required: ["specName", "value"],
          },
        },
        keyFeatures: { type: "array", items: { type: "string" } },
        pros: { type: "array", items: { type: "string" } },
        cons: { type: "array", items: { type: "string" } },
      },
      required: ["productTitle", "technicalSpecs"],
    },
    defaultPrompt: "Extract the exact product name, brand, technical specifications table, and key highlights.",
  },
  {
    id: "entities_relations",
    name: "Knowledge Graph Entities & Relationships",
    description: "Extract named entities (people, organizations, concepts, locations, dates) and their graph relations",
    category: "Documentation & Knowledge",
    schema: {
      type: "object",
      properties: {
        entities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              type: { type: "string", enum: ["Person", "Organization", "Concept", "Location", "Technology", "Event", "Metric"] },
              description: { type: "string" },
            },
            required: ["id", "name", "type"],
          },
        },
        relations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              sourceId: { type: "string" },
              predicate: { type: "string" },
              targetId: { type: "string" },
              context: { type: "string" },
            },
            required: ["sourceId", "predicate", "targetId"],
          },
        },
      },
      required: ["entities", "relations"],
    },
    defaultPrompt: "Extract all significant entities and their inter-relationships to form a knowledge graph representation.",
  },
  {
    id: "course_syllabus",
    name: "Course Syllabus / Educational Modules",
    description: "Extract lessons, modules, learning outcomes, prerequisites, and assigned readings",
    category: "Documentation & Knowledge",
    schema: {
      type: "object",
      properties: {
        courseTitle: { type: "string" },
        instructor: { type: "string" },
        duration: { type: "string" },
        prerequisites: { type: "array", items: { type: "string" } },
        modules: {
          type: "array",
          items: {
            type: "object",
            properties: {
              moduleNumber: { type: "number" },
              title: { type: "string" },
              description: { type: "string" },
              topics: { type: "array", items: { type: "string" } },
              learningOutcomes: { type: "array", items: { type: "string" } },
            },
            required: ["moduleNumber", "title", "topics"],
          },
        },
      },
      required: ["courseTitle", "modules"],
    },
    defaultPrompt: "Extract course modules, topics covered, learning outcomes, and prerequisites.",
  },
];

/**
 * Execute strict JSON extraction on web pages or document markdown using Gemini 3.6 Flash.
 */
export async function executeStrictJsonExtraction(
  params: SchemaExtractionRequest
): Promise<SchemaExtractionResult> {
  const startTime = Date.now();
  const apiKey = params.apiKey || process.env.GEMINI_API_KEY || "";

  if (!apiKey) {
    throw new Error("Gemini API Key is required for structured schema extraction.");
  }

  // 1. Resolve content source: URL or direct text/markdown
  let rawText = "";
  let sourceType: "url" | "document_text" = "document_text";
  let sourceUrl: string | undefined = undefined;

  if (params.url && params.url.trim()) {
    sourceType = "url";
    sourceUrl = params.url.trim();

    if (!isHtmlWebPageUrl(sourceUrl)) {
      throw new Error("URL JSON Extraction only supports HTML websites. For documents, convert them to Markdown and extract from document text.");
    }

    // Use Playwright Headless Browser for rich DOM rendering & JS execution
    const rendered = await fetchRenderedPage(sourceUrl, { timeoutMs: 15000 });
    // Clean through Readability
    const cleaned = extractCleanArticleHtml(rendered.html, {
      preserveLinks: true,
      sourceUrl,
      docTitle: rendered.title,
    });
    // Convert to markdown
    const md = await convertDocumentLocally(cleaned.cleanedHtml, "html", "standard");
    rawText = `# Source: ${sourceUrl}\n# Title: ${rendered.title || cleaned.title}\n\n${md}`;
  } else if (params.content && params.content.trim()) {
    rawText = params.content.trim();
  } else {
    throw new Error("No source content or URL provided for schema extraction.");
  }

  // 2. Resolve JSON Schema definition
  let resolvedSchema: object | null = null;
  let defaultPrompt = "Extract the structured information matching the requested schema with high precision.";

  if (params.presetId) {
    const preset = EXTRACTION_PRESETS.find((p) => p.id === params.presetId);
    if (preset) {
      resolvedSchema = preset.schema;
      defaultPrompt = preset.defaultPrompt;
    }
  }

  if (params.jsonSchema) {
    if (typeof params.jsonSchema === "string") {
      try {
        resolvedSchema = JSON.parse(params.jsonSchema);
      } catch (err) {
        throw new Error("Provided JSON schema is not valid JSON string.");
      }
    } else {
      resolvedSchema = params.jsonSchema;
    }
  }

  if (!resolvedSchema) {
    // Default open extraction schema if none provided
    resolvedSchema = {
      type: "object",
      properties: {
        title: { type: "string" },
        summary: { type: "string" },
        keyItems: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              details: { type: "string" },
            },
            required: ["name", "description"],
          },
        },
      },
      required: ["title", "keyItems"],
    };
  }

  const promptDirective = params.extractionPrompt?.trim() || defaultPrompt;

  // 3. Construct Gemini system & user prompts for strict JSON schema output
  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `You are a strict, world-class JSON data extraction engine.
Your task is to analyze the provided document/web content and extract structured data conforming strictly to the requested JSON Schema.

Rules:
1. ONLY return valid, parseable JSON conforming strictly to the JSON schema.
2. Extract all relevant items accurately without hallucinating or adding imaginary fields.
3. If an optional field cannot be found in the source content, omit it or set it to null/empty array as appropriate according to the schema.
4. Do NOT wrap output in triple backtick markdown unless required; return pure JSON.
5. Extract verbatim names, values, code snippets, numbers, and strings from the text wherever available.`;

  const userPrompt = `### EXTRACTION GOAL:
${promptDirective}

### TARGET JSON SCHEMA:
${JSON.stringify(resolvedSchema, null, 2)}

### SOURCE CONTENT:
${rawText.slice(0, 75000)}

Extract the structured JSON object now:`;

  const response = await ai.models.generateContent({
    model: "gemini-3.6-flash",
    contents: userPrompt,
    config: {
      systemInstruction,
      temperature: 0.1, // High precision & low hallucination
      responseMimeType: "application/json",
    },
  });

  const rawJsonText = response.text || "{}";
  let parsedData: any = {};
  try {
    parsedData = JSON.parse(rawJsonText);
  } catch (err) {
    // Fallback: Attempt cleaning backticks if model wrapped it
    const cleanedJson = rawJsonText
      .replace(/^```json\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    parsedData = JSON.parse(cleanedJson);
  }

  const durationMs = Date.now() - startTime;

  return {
    success: true,
    data: parsedData,
    rawJsonString: JSON.stringify(parsedData, null, 2),
    schemaUsed: resolvedSchema,
    sourceType,
    sourceUrl,
    stats: {
      inputLengthChars: rawText.length,
      outputLengthChars: JSON.stringify(parsedData).length,
      durationMs,
      modelUsed: "gemini-3.6-flash",
    },
  };
}
