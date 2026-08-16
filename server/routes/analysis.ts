import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import { SentimentAnalyzer, TextStatistics, LanguageDetector, KeywordExtractor } from "textanalysis-tool";
import { getGeminiApiKey, getFriendlyErrorMessage, generateContentStreamWithRetry } from "../utils/geminiService";

const router = Router();

// Endpoint: POST /api/analyze - Text statistics, sentiment, readability, language detection
router.post("/analyze", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Text content is required." });
    }

    // 1. Sentiment Analysis
    let sentiment = { score: 0, classification: "neutral" };
    try {
      const sentimentAnalyzer = new SentimentAnalyzer();
      const sentResult = sentimentAnalyzer.analyze(text);
      if (sentResult) {
        sentiment = {
          score: sentResult.score !== undefined ? sentResult.score : 0,
          classification: sentResult.classification || "neutral",
        };
      }
    } catch (e) {
      console.warn("Sentiment Analysis failed:", e);
    }

    // 2. Readability Metrics
    let readability = null;
    try {
      const textStats = new TextStatistics();
      const readResult = textStats.fleschKincaidReadability(text);
      if (readResult) {
        readability = {
          readabilityScore: readResult.readabilityScore,
          gradeLevel: readResult.gradeLevel,
          smogIndex: readResult.smogIndex,
          wordCount: readResult.wordCount,
          sentenceCount: readResult.sentenceCount,
          syllableCount: readResult.syllableCount,
          avgWordsPerSentence: readResult.avgWordsPerSentence,
          avgSyllablesPerWord: readResult.avgSyllablesPerWord,
          complexity: readResult.complexity,
        };
      }
    } catch (e) {
      console.warn("Readability calculation failed:", e);
    }

    // 3. Language Detection
    let language = { detectedLanguage: "unknown", languageName: "Unknown", confidence: 100 };
    try {
      const detector = new LanguageDetector();
      const langResult = detector.detect(text);
      if (langResult) {
        language = {
          detectedLanguage: langResult.detectedLanguage || "unknown",
          languageName: langResult.languageName || "Unknown",
          confidence: langResult.confidence !== undefined ? langResult.confidence : 100,
        };
      }
    } catch (e) {
      console.warn("Language detection failed:", e);
    }

    // 4. Keyword Extraction
    let keywords: string[] = [];
    try {
      const extractor = new KeywordExtractor();
      keywords = extractor.extractKeywords(text, 12) || [];
    } catch (e) {
      console.warn("Keyword extraction failed:", e);
    }

    res.json({
      sentiment,
      readability,
      language,
      keywords,
    });
  } catch (error: any) {
    console.error("Text Analysis API Error:", error);
    res.status(500).json({ error: error.message || "An error occurred during text analysis." });
  }
});

// Endpoint: GET /api/agent/info - Agent status & capabilities
router.get("/agent/info", (req, res) => {
  const hasApiKey = Boolean(getGeminiApiKey());
  res.json({
    status: "active",
    model: "gemini-3.6-flash",
    skill: "okf-open-knowledge-format",
    specification: "https://okf.md/spec/",
    hasApiKey,
    capabilities: [
      "Interactive Knowledge Q&A",
      "Entity & Knowledge Graph Reasoning",
      "OKF Block Generation & Refinement",
      "OKF Compliance Audit & Schema Validation"
    ]
  });
});

// Endpoint: POST /api/agent/okf - OKF format streaming & audit assistant
router.post("/agent/okf", async (req, res) => {
  try {
    const { task, okfContent, userQuery } = req.body;

    if (!okfContent && !userQuery) {
      return res.status(400).json({ error: "Either okfContent or userQuery is required." });
    }

    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured. Please check Settings > Secrets.",
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    const okfSkillInstruction = `You are an expert Gemini AI Agent equipped with the official Open Knowledge Format (OKF v1.0) skill (https://okf.md/spec/ and https://github.com/fabricioctelles/skills/blob/main/skills/okf-open-knowledge-format/SKILL.md).

Core System Directives:
1. Always adhere strictly to OKF v1.0 specifications.
2. Structure knowledge into semantic blocks: :::summary, :::concept, :::procedure, :::code, :::table, :::note, :::faq, :::reference.
3. Identify and leverage wiki links ([[Concept Name]]) and bold entities (**Key Entity**) for Knowledge Graph reasoning.
4. When requested to generate or modify OKF documents, include valid YAML frontmatter (declaring okf: 1.0, id, title, description, tags).
5. Provide clear, precise, and highly structured knowledge responses.`;

    let prompt = "";
    if (task === "qa") {
      prompt = `The user is asking a question about the following Open Knowledge Format (OKF) document:

## OKF Document Content:
\`\`\`markdown
${okfContent || "No document provided"}
\`\`\`

## User Question:
${userQuery}

Instructions:
Answer the user's question accurately based on the OKF knowledge blocks. Cite relevant block types (e.g. "According to the :::concept block..." or "In the :::procedure step...") and entities in your explanation. Format your answer using clean Markdown and OKF blocks if appropriate.`;
    } else if (task === "audit") {
      prompt = `Perform a comprehensive Open Knowledge Format (OKF v1.0) compliance audit on the following document:

\`\`\`markdown
${okfContent}
\`\`\`

Audit Tasks:
1. Check YAML Frontmatter for 'okf: 1.0', id, title, description, and tags.
2. Validate knowledge block syntax (:::summary, :::concept, :::procedure, :::code, :::table, :::note, :::faq, :::reference).
3. Evaluate Entity Graph links ([[Wiki Links]] and **Bold Entities**).
4. Provide a numerical Compliance Score (0-100%), list Pass/Warning/Error items, and output an improved, perfectly compliant OKF version.`;
    } else if (task === "synthesize") {
      prompt = `Convert and structure the following text into a fully compliant Open Knowledge Format (OKF v1.0) document:

Source Text / Request:
${userQuery || okfContent}

Instructions:
1. Include full YAML frontmatter with 'okf: 1.0', unique id, descriptive title, summary description, and relevant tags.
2. Divide content into appropriate :::summary, :::concept, :::procedure, :::code, :::table, :::note, :::faq, and :::reference blocks.
3. Annotate key entities with [[Wiki Links]] and **bold terms**.
4. Return the complete raw OKF Markdown document directly.`;
    } else {
      prompt = `Context OKF Document:
\`\`\`markdown
${okfContent || "None"}
\`\`\`

User Request:
${userQuery}

Respond as an OKF-trained AI Agent using knowledge blocks and clean Markdown.`;
    }

    const responseStream = await generateContentStreamWithRetry(ai, {
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        systemInstruction: okfSkillInstruction,
        temperature: 0.3,
      },
    });

    for await (const chunk of responseStream) {
      res.write(chunk.text || "");
    }
    res.end();
  } catch (error: any) {
    console.error("Gemini OKF Agent API Error:", error);
    const friendlyMsg = getFriendlyErrorMessage(error);
    if (!res.headersSent) {
      res.status(500).json({ error: friendlyMsg });
    } else {
      res.write(`\n\n[Error: ${friendlyMsg}]`);
      res.end();
    }
  }
});

export default router;
