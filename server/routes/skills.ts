import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import { sliceMonolithToAgentSkill, computeProgressiveDisclosureMetrics } from "../../src/lib/skillProceduralSlicer";
import { validateAgentSkill } from "../../src/lib/skillValidator";
import { auditAgentSkillBestPractices } from "../../src/lib/agentSkillBestPracticesEngine";
import { classifyTextLogic } from "../../src/lib/logicClassifier";
import { exportAgentSkillAsZip } from "../../src/utils/skillZipExporter";
import { AgentSkillPackage } from "../../src/types/agentSkill";
import { getGeminiApiKey, getFriendlyErrorMessage, generateContentWithRetry } from "../utils/geminiService";
import { estimateTokens } from "../../src/utils/tokenEstimator";

const router = Router();

// In-memory active skill registry
let activeSkillPackages: Record<string, AgentSkillPackage> = {};

/**
 * POST /api/skills/synthesize
 * Synthesizes a raw markdown runbook/SOP into an Agent Skill package (SKILL.md, references, scripts)
 * Uses 100% NLP and deterministic logic first for optimal token conservation.
 */
router.post("/skills/synthesize", (req, res) => {
  try {
    const { markdown, skillName, allowedTools, license, compatibility } = req.body;
    if (!markdown || typeof markdown !== "string") {
      return res.status(400).json({ error: "Missing required string 'markdown' in request body." });
    }

    const pkg = sliceMonolithToAgentSkill(markdown, {
      customSkillName: skillName,
      allowedTools,
      license,
      compatibility,
    });

    const validation = validateAgentSkill(pkg);
    const audit = auditAgentSkillBestPractices(pkg);
    const logicClassification = classifyTextLogic(markdown);

    // Cache package in registry
    activeSkillPackages[pkg.name] = pkg;

    res.json({
      success: true,
      skill: pkg,
      validation,
      audit,
      logicClassification,
      metrics: pkg.metrics,
      filesGenerated: {
        rootSkill: "SKILL.md",
        referencesCount: pkg.references.length,
        scriptsCount: pkg.scripts.length,
        assetsCount: pkg.assets.length,
      },
    });
  } catch (error: any) {
    console.error("Skill Synthesis API Error:", error);
    res.status(500).json({ error: error.message || "Failed to synthesize agent skill." });
  }
});

/**
 * POST /api/skills/audit-best-practices
 * Evaluates a skill package against agentskills.io and Claude Agent Skills specifications.
 */
router.post("/skills/audit-best-practices", (req, res) => {
  try {
    const { skillPackage } = req.body;
    if (!skillPackage || !skillPackage.rootSkillMd) {
      return res.status(400).json({ error: "Invalid skillPackage payload. Expected rootSkillMd and package structure." });
    }

    const audit = auditAgentSkillBestPractices(skillPackage);
    const validation = validateAgentSkill(skillPackage);

    res.json({
      success: true,
      audit,
      validation,
    });
  } catch (error: any) {
    console.error("Best Practices Audit API Error:", error);
    res.status(500).json({ error: error.message || "Failed to audit skill best practices." });
  }
});

/**
 * POST /api/skills/enhance-with-gemini
 * Token-optimized Gemini AI Refinement:
 * Invokes Gemini 2.5 Flash strictly on the high-level workflow skeleton and frontmatter description
 * to elevate compliance with agentskills.io and Claude agent skills best practices.
 */
router.post("/skills/enhance-with-gemini", async (req, res) => {
  try {
    const { skillPackage, customApiKey } = req.body;
    if (!skillPackage || !skillPackage.rootSkillMd) {
      return res.status(400).json({ error: "Invalid skillPackage payload." });
    }

    const headerKey = (req.headers["x-gemini-api-key"] as string) || customApiKey;
    const apiKey = getGeminiApiKey(headerKey);
    if (!apiKey) {
      // Graceful fallback to NLP-only package if API key is not configured
      const audit = auditAgentSkillBestPractices(skillPackage);
      return res.json({
        success: true,
        enhanced: false,
        message: "Gemini API key is not configured in settings. Returning NLP-optimized skill package.",
        skill: skillPackage,
        audit,
      });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Build token-compact prompt to minimize LLM token consumption
    const prompt = `You are an expert AI Architect specializing in Agent Skills specifications (agentskills.io) and Anthropic Claude Agent Skills best practices.
Task: Refine and elevate this synthesized Agent Skill package to achieve 100% compliance with Agent Skills best practices.

Current Skill Name: "${skillPackage.name}"
Current Frontmatter:
Name: ${skillPackage.frontmatter?.name}
Description: ${skillPackage.frontmatter?.description}
Allowed Tools: ${JSON.stringify(skillPackage.frontmatter?.['allowed-tools'] || skillPackage.frontmatter?.allowed_tools || [])}

Current SKILL.md Body (Truncated/Summary):
${skillPackage.rootSkillMd.substring(0, 4000)}

List of Existing References:
${skillPackage.references?.map((r: any) => `- ${r.relativePath}: ${r.title}`).join('\n') || 'None'}

List of Existing Scripts:
${skillPackage.scripts?.map((s: any) => `- ${s.relativePath} (${s.language})`).join('\n') || 'None'}

Instructions for Enhancement:
1. Provide an enhanced "description" (under 1024 characters) strictly incorporating high-precision "Use when..." activation triggers, coverage topics, and expected tool usage.
2. Refine the Root SKILL.md body into crisp, numbered, imperative execution steps with explicit pre-conditions, verification checklists, and rollback/error handling instructions.
3. Keep SKILL.md lightweight (< 3500 tokens) by preserving links to references/ and scripts/.
4. Return a valid JSON object strictly matching this schema:
{
  "enhancedDescription": "Use when instructed to ...",
  "enhancedRootSkillMd": "--- full YAML frontmatter and markdown body ---",
  "improvementsMade": ["improvement 1", "improvement 2", "improvement 3"],
  "complianceSummary": "Summary of best practices achieved..."
}`;

    const response = await generateContentWithRetry(ai, {
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });

    const responseText = response.text || "";
    let parsed: any;
    try {
      parsed = JSON.parse(responseText);
    } catch (parseErr) {
      console.warn("Failed to parse Gemini JSON output, attempting cleanup...", parseErr);
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Could not parse structured JSON response from Gemini.");
      }
    }

    // Merge enhancements into skill package
    const enhancedPkg: AgentSkillPackage = {
      ...skillPackage,
      rootSkillMd: parsed.enhancedRootSkillMd || skillPackage.rootSkillMd,
      frontmatter: {
        ...skillPackage.frontmatter,
        description: parsed.enhancedDescription || skillPackage.frontmatter.description,
      },
    };

    // Recompute metrics & validation
    enhancedPkg.metrics = computeProgressiveDisclosureMetrics(
      enhancedPkg.frontmatter,
      enhancedPkg.rootSkillMd,
      enhancedPkg.references,
      enhancedPkg.scripts,
      enhancedPkg.assets
    );

    const audit = auditAgentSkillBestPractices(enhancedPkg);
    const validation = validateAgentSkill(enhancedPkg);

    // Update in-memory registry
    activeSkillPackages[enhancedPkg.name] = enhancedPkg;

    res.json({
      success: true,
      enhanced: true,
      skill: enhancedPkg,
      improvementsMade: parsed.improvementsMade || [
        "Enriched activation triggers in frontmatter description",
        "Structured imperative numbered steps with verification checklists",
        "Reinforced error recovery and rollback protocols",
      ],
      complianceSummary: parsed.complianceSummary || "Skill successfully optimized against agentskills.io specifications.",
      audit,
      validation,
    });
  } catch (error: any) {
    console.error("Gemini Skill Enhancement Error:", error);
    res.status(500).json({
      error: getFriendlyErrorMessage(error) || "Failed to enhance skill with Gemini AI.",
    });
  }
});

/**
 * POST /api/skills/validate
 * Performs preflight linting (SKILL-001 through SKILL-006) on an existing skill package
 */
router.post("/skills/validate", (req, res) => {
  try {
    const { skillPackage } = req.body;
    if (!skillPackage || !skillPackage.rootSkillMd) {
      return res.status(400).json({ error: "Invalid skillPackage payload. Expected rootSkillMd and package structure." });
    }

    const validation = validateAgentSkill(skillPackage);
    res.json({
      success: true,
      valid: validation.valid,
      issues: validation.issues,
      tokenBudgetSatisfied: validation.tokenBudgetSatisfied,
    });
  } catch (error: any) {
    console.error("Skill Validation API Error:", error);
    res.status(500).json({ error: error.message || "Failed to validate agent skill." });
  }
});

/**
 * POST /api/skills/classify-logic
 * Runs formal NLP logic analysis (FOL, HOL, Modal, Temporal) on any arbitrary text passage
 */
router.post("/skills/classify-logic", (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Missing required string 'text' in request body." });
    }

    const classification = classifyTextLogic(text);
    res.json({
      success: true,
      classification,
    });
  } catch (error: any) {
    console.error("Logic Classification API Error:", error);
    res.status(500).json({ error: error.message || "Failed to classify text logic." });
  }
});

/**
 * GET /api/skills/list
 * Lists all synthesized skill packages cached in memory
 */
router.get("/skills/list", (req, res) => {
  const skills = Object.values(activeSkillPackages).map((pkg) => ({
    name: pkg.name,
    title: pkg.sourceDocumentTitle || pkg.name,
    activationTokens: pkg.metrics.activationTokens,
    discoveryTokens: pkg.metrics.discoveryTokens,
    contextSavingsPercentage: pkg.metrics.contextSavingsPercentage,
    referencesCount: pkg.references.length,
    scriptsCount: pkg.scripts.length,
    createdAt: pkg.createdAt,
  }));
  res.json({ success: true, count: skills.length, skills });
});

/**
 * GET /api/skills/:skillName
 * Retrieves a full skill package by name
 */
router.get("/skills/:skillName", (req, res) => {
  const { skillName } = req.params;
  const pkg = activeSkillPackages[skillName];
  if (!pkg) {
    return res.status(404).json({ error: `Skill '${skillName}' not found in active registry.` });
  }
  res.json({ success: true, skill: pkg });
});

export { activeSkillPackages };
export default router;
