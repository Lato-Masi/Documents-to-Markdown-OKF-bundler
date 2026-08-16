import React, { useMemo, useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  FileText,
  Clock,
  BookOpen,
  Hash,
  AlertCircle,
  TrendingUp,
  Layout,
  List,
  Sparkles,
  Globe,
  Smile,
  Tags,
  Activity,
  Award,
} from "lucide-react";

interface DocumentInsightsProps {
  markdown: string;
  hasRunAnalysis?: boolean;
  onRunAnalysis?: () => void;
  isAnalyzing?: boolean;
}

interface NlpData {
  sentiment: {
    score: number;
    classification: string;
  };
  readability: {
    readabilityScore: number;
    gradeLevel: number;
    smogIndex: number;
    wordCount: number;
    sentenceCount: number;
    syllableCount: number;
    avgWordsPerSentence: number;
    avgSyllablesPerWord: number;
    complexity: string;
  } | null;
  language: {
    detectedLanguage: string;
    languageName: string;
    confidence: number;
  };
  keywords: string[];
}

export default function DocumentInsights({
  markdown,
  hasRunAnalysis = false,
  onRunAnalysis,
  isAnalyzing = false,
}: DocumentInsightsProps) {
  const [nlpData, setNlpData] = useState<NlpData | null>(null);
  const [isLoadingNlp, setIsLoadingNlp] = useState(false);
  const [userRequested, setUserRequested] = useState(false);

  const executeAnalysis = async () => {
    if (!markdown || markdown.trim().length < 5) return;
    setIsLoadingNlp(true);
    setUserRequested(true);
    if (onRunAnalysis) {
      onRunAnalysis();
    }

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: markdown }),
      });
      if (response.ok) {
        const data = await response.json();
        setNlpData(data);
      }
    } catch (err) {
      console.error("Failed to fetch NLP insights:", err);
    } finally {
      setIsLoadingNlp(false);
    }
  };

  // Trigger analysis automatically if parent requested it via prop or if user explicitly requested
  useEffect(() => {
    if ((hasRunAnalysis || isAnalyzing) && !nlpData && !isLoadingNlp && markdown) {
      executeAnalysis();
    }
  }, [hasRunAnalysis, isAnalyzing, markdown]);

  const parsedStats = useMemo(() => {
    const text = markdown || "";
    const charCount = text.length;
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    const readingTime = Math.max(1, Math.ceil(wordCount / 200));

    // Headings breakdown
    const h1Count = (text.match(/^#\s+/gm) || []).length;
    const h2Count = (text.match(/^##\s+/gm) || []).length;
    const h3Count = (text.match(/^###\s+/gm) || []).length;
    const otherHeadings = (text.match(/^####+\s+/gm) || []).length;
    const totalHeadings = h1Count + h2Count + h3Count + otherHeadings;

    // Code blocks & Inline code
    const codeBlocks = Math.floor((text.match(/^```/gm) || []).length / 2);
    const inlineCode = (text.match(/`[^`\n]+`/g) || []).length;

    // Tables approximation
    const tableDividers = (text.match(/^[| \t]*:?-+:?[| \t-]+$/gm) || []).length;
    const approxTables = tableDividers;

    // Media and Links
    const images = (text.match(/!\[.*?\]\(.*?\)/g) || []).length;
    const links = Math.max(0, (text.match(/\[.*?\]\(.*?\)/g) || []).length - images);

    // Lists items
    const bulletListItems = (text.match(/^\s*[-*+]\s+/gm) || []).length;
    const numberedListItems = (text.match(/^\s*\d+\.\s+/gm) || []).length;
    const totalListItems = bulletListItems + numberedListItems;

    // Math formulas (LaTeX)
    const blockMath = (text.match(/\$\$/g) || []).length / 2;
    const inlineMath = (text.match(/\$[^\$\n]+\$/g) || []).length;
    const mathCount = Math.floor(blockMath) + inlineMath;

    // Paragraphs estimation
    const paragraphs = text
      .split(/\n\s*\n/)
      .filter((p) => {
        const trimmed = p.trim();
        if (!trimmed) return false;
        // Exclude headings, tables, code blocks, lists
        if (
          trimmed.startsWith("#") ||
          trimmed.startsWith("|") ||
          trimmed.startsWith("```") ||
          trimmed.startsWith("-") ||
          trimmed.startsWith("*") ||
          trimmed.startsWith("+") ||
          /^\d+\./.test(trimmed)
        ) {
          return false;
        }
        return true;
      }).length;

    // Fallback Flesch-Kincaid index
    const sentences = Math.max(1, (text.match(/[.!?]+(?=\s|$)/g) || []).length);
    const avgSentenceLength = wordCount / sentences;
    const syllables = wordCount * 1.35;
    const avgSyllablesPerWord = syllables / wordCount;
    const rawGrade = 0.39 * avgSentenceLength + 11.8 * avgSyllablesPerWord - 15.59;
    const gradeLevel = isNaN(rawGrade) ? 0 : Math.max(1, Math.min(18, Math.round(rawGrade)));

    let readingComplexity = "Standard";
    if (gradeLevel <= 6) readingComplexity = "Easy / Conversational";
    else if (gradeLevel <= 10) readingComplexity = "Intermediate / Informative";
    else if (gradeLevel <= 14) readingComplexity = "Advanced / Academic";
    else readingComplexity = "Highly Technical / Research";

    return {
      charCount,
      wordCount,
      readingTime,
      headings: {
        total: totalHeadings,
        h1: h1Count,
        h2: h2Count,
        h3: h3Count,
        other: otherHeadings,
      },
      codeBlocks,
      inlineCode,
      tables: approxTables,
      images,
      links,
      listItems: {
        total: totalListItems,
        bullet: bulletListItems,
        numbered: numberedListItems,
      },
      paragraphs: Math.max(1, paragraphs),
      mathCount,
      gradeLevel,
      readingComplexity,
    };
  }, [markdown]);

  // Chart data formatting
  const chartData = useMemo(() => {
    return [
      { name: "Headings", count: parsedStats.headings.total, color: "#4f46e5" }, // Indigo
      { name: "Tables", count: parsedStats.tables, color: "#06b6d4" }, // Cyan
      { name: "Images", count: parsedStats.images, color: "#10b981" }, // Emerald
      { name: "Code Blocks", count: parsedStats.codeBlocks, color: "#8b5cf6" }, // Violet
      { name: "List Items", count: parsedStats.listItems.total, color: "#f59e0b" }, // Amber
      { name: "Math LaTeX", count: parsedStats.mathCount, color: "#ec4899" }, // Pink
    ];
  }, [parsedStats]);

  const activeChartData = useMemo(() => {
    const filtered = chartData.filter((item) => item.count > 0);
    return filtered.length > 0 ? filtered : chartData.slice(0, 5);
  }, [chartData]);

  // Custom tooltip component matching our minimalist design
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900 border border-slate-800 text-white px-3 py-2 rounded-lg shadow-xl text-xs font-mono flex flex-col gap-1">
          <span className="font-semibold text-slate-400">{data.name}</span>
          <span className="text-sm font-bold text-white flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full inline-block"
              style={{ backgroundColor: data.color }}
            ></span>
            Count: {data.count}
          </span>
        </div>
      );
    }
    return null;
  };

  // Sentiment formatting values
  const sentimentScore = nlpData?.sentiment?.score ?? 0;
  const sentimentClass = nlpData?.sentiment?.classification ?? "neutral";
  const sentimentColor =
    sentimentClass === "positive"
      ? "text-emerald-600 bg-emerald-50 border-emerald-100"
      : sentimentClass === "negative"
      ? "text-rose-600 bg-rose-50 border-rose-100"
      : "text-slate-600 bg-slate-50 border-slate-100";

  const sentimentEmoji = sentimentClass === "positive" ? "😊" : sentimentClass === "negative" ? "😢" : "😐";

  return (
    <div className="flex flex-col gap-6 animate-fade-in select-text">
      {/* On-demand Phase 2 Analysis Banner */}
      {!hasRunAnalysis && !userRequested && !nlpData && !isLoadingNlp && (
        <div className="p-5 bg-indigo-950/40 border border-indigo-800/60 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-900/60 text-indigo-400 rounded-xl shrink-0 border border-indigo-700/50">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <span>Phase 2: Deep Document Analysis</span>
                <span className="px-2 py-0.5 rounded-md bg-indigo-900 text-indigo-300 text-[10px] font-mono border border-indigo-700">
                  ON DEMAND
                </span>
              </h4>
              <p className="text-xs text-zinc-300 mt-0.5">
                Markdown conversion (Phase 1) is complete. Click to calculate Flesch readability grade, sentiment polarity, and NLP key concepts.
              </p>
            </div>
          </div>
          <button
            onClick={executeAnalysis}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition shrink-0 flex items-center gap-2 shadow-lg shadow-indigo-950/50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Run Deep Analysis</span>
          </button>
        </div>
      )}

      {isLoadingNlp && (
        <div className="p-4 bg-indigo-950/40 border border-indigo-800/60 rounded-xl flex items-center gap-3 text-xs text-indigo-300">
          <Sparkles className="w-4 h-4 animate-spin text-indigo-400 shrink-0" />
          <span><strong>Phase 2/2:</strong> Running document analysis (Readability grade, sentiment polarity & keyword extraction)...</span>
        </div>
      )}

      {/* Metrics Row: 4 grid items */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric Card 1: Words & Length */}
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs flex items-center gap-3.5">
          <div className="bg-indigo-50 p-2.5 rounded-lg text-indigo-600">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Word Count</div>
            <div className="text-base font-bold text-slate-800">{parsedStats.wordCount.toLocaleString()}</div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
              {parsedStats.charCount.toLocaleString()} chars
            </div>
          </div>
        </div>

        {/* Metric Card 2: Estimated Readability */}
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs flex items-center gap-3.5">
          <div className="bg-emerald-50 p-2.5 rounded-lg text-emerald-600">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div className="truncate">
            <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Readability</div>
            <div className="text-base font-bold text-slate-800 truncate">
              {nlpData?.readability?.complexity || parsedStats.readingComplexity}
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
              Grade {nlpData?.readability?.gradeLevel ?? parsedStats.gradeLevel} (Flesch Score:{" "}
              {nlpData?.readability?.readabilityScore !== undefined
                ? Math.round(nlpData.readability.readabilityScore)
                : "70"}
              )
            </div>
          </div>
        </div>

        {/* Metric Card 3: Deep Sentiment (NLP) */}
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs flex items-center gap-3.5">
          <div className="bg-amber-50 p-2.5 rounded-lg text-amber-600">
            <Smile className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Sentiment Vibe</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-base font-bold text-slate-800 capitalize">
                {sentimentClass} {sentimentEmoji}
              </span>
              {isLoadingNlp && (
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-ping"></span>
              )}
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              Polarity score: {sentimentScore.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Metric Card 4: Language (NLP) */}
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs flex items-center gap-3.5">
          <div className="bg-rose-50 p-2.5 rounded-lg text-rose-600">
            <Globe className="w-4 h-4" />
          </div>
          <div className="truncate">
            <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Language</div>
            <div className="text-base font-bold text-slate-800 truncate">
              {nlpData?.language?.languageName || "Detecting..."}
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
              Confidence: {nlpData?.language?.confidence ? Math.round(nlpData.language.confidence) : "100"}%
            </div>
          </div>
        </div>
      </div>

      {/* Main Insights Canvas */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left Column: Recharts Distribution & NLP Lexicon */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs flex flex-col gap-4">
            <div className="flex justify-between items-start border-b border-slate-50 pb-3">
              <div className="flex flex-col gap-0.5">
                <h4 className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <Layout className="w-4 h-4 text-slate-400" />
                  Document Structural Distribution
                </h4>
                <p className="text-[11px] text-slate-400">
                  Visual frequency of formatting blocks extracted from the source document.
                </p>
              </div>
              <div className="text-[11px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded font-mono">
                Recharts Engine
              </div>
            </div>

            {/* Bar Chart Container */}
            <div className="w-full h-[250px] mt-1 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={activeChartData}
                  margin={{ top: 10, right: 10, left: -25, bottom: 5 }}
                  barSize={32}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#64748b", fontSize: 10, fontFamily: "var(--font-sans)" }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: "#64748b", fontSize: 10, fontFamily: "var(--font-mono)" }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f8fafc" }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {activeChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Deep NLP Lexical Stats Panel */}
          {nlpData?.readability && (
            <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs flex flex-col gap-4">
              <h4 className="text-xs font-semibold text-slate-800 flex items-center gap-1.5 border-b border-slate-50 pb-3">
                <Activity className="w-4 h-4 text-indigo-500 animate-pulse" />
                Deep NLP Lexical Statistics
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-[11px] text-slate-600">
                <div className="bg-slate-50/50 p-2.5 rounded-lg border border-slate-100/40 flex flex-col gap-0.5">
                  <span className="text-slate-400 text-[10px] font-sans">Sentences</span>
                  <span className="font-bold text-slate-800">{nlpData.readability.sentenceCount}</span>
                </div>
                <div className="bg-slate-50/50 p-2.5 rounded-lg border border-slate-100/40 flex flex-col gap-0.5">
                  <span className="text-slate-400 text-[10px] font-sans">Syllables</span>
                  <span className="font-bold text-slate-800">{nlpData.readability.syllableCount}</span>
                </div>
                <div className="bg-slate-50/50 p-2.5 rounded-lg border border-slate-100/40 flex flex-col gap-0.5">
                  <span className="text-slate-400 text-[10px] font-sans">Avg. Sentence Words</span>
                  <span className="font-bold text-slate-800">
                    {nlpData.readability.avgWordsPerSentence.toFixed(1)}
                  </span>
                </div>
                <div className="bg-slate-50/50 p-2.5 rounded-lg border border-slate-100/40 flex flex-col gap-0.5">
                  <span className="text-slate-400 text-[10px] font-sans">Avg. Word Syllables</span>
                  <span className="font-bold text-slate-800">
                    {nlpData.readability.avgSyllablesPerWord.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Counts & NLP Keyword Extractor */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Detailed Counts list */}
          <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs flex flex-col gap-4">
            <h4 className="text-xs font-semibold text-slate-800 flex items-center gap-1.5 border-b border-slate-50 pb-3">
              <Hash className="w-4 h-4 text-slate-400" />
              Syntactic Element Metrics
            </h4>

            <div className="flex flex-col gap-2.5 font-mono text-xs text-slate-600">
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-100/60">
                <span className="text-[11px] text-slate-500 font-sans flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                  Headings (H1-H3)
                </span>
                <span className="font-semibold text-slate-800">{parsedStats.headings.total}</span>
              </div>
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-100/60">
                <span className="text-[11px] text-slate-500 font-sans flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full"></span>
                  Tabular Tables
                </span>
                <span className="font-semibold text-slate-800">{parsedStats.tables}</span>
              </div>
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-100/60">
                <span className="text-[11px] text-slate-500 font-sans flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                  Images / Captions
                </span>
                <span className="font-semibold text-slate-800">{parsedStats.images}</span>
              </div>
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-100/60">
                <span className="text-[11px] text-slate-500 font-sans flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-violet-500 rounded-full"></span>
                  Fenced Code Blocks
                </span>
                <span className="font-semibold text-slate-800">{parsedStats.codeBlocks}</span>
              </div>
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-100/60">
                <span className="text-[11px] text-slate-500 font-sans flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                  Bullet & Num Lists
                </span>
                <span className="font-semibold text-slate-800">{parsedStats.listItems.total}</span>
              </div>
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-100/60">
                <span className="text-[11px] text-slate-500 font-sans flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-pink-500 rounded-full"></span>
                  LaTeX Formulas
                </span>
                <span className="font-semibold text-slate-800">{parsedStats.mathCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500 font-sans flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full"></span>
                  Normal Paragraphs
                </span>
                <span className="font-semibold text-slate-800">{parsedStats.paragraphs}</span>
              </div>
            </div>
          </div>

          {/* NLP Extracted Keywords */}
          <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs flex flex-col gap-3.5">
            <div className="flex items-center justify-between border-b border-slate-50 pb-3">
              <h4 className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                <Tags className="w-4 h-4 text-amber-500" />
                NLP-Extracted Keywords (TF-IDF)
              </h4>
              {isLoadingNlp && (
                <span className="text-[10px] text-indigo-500 font-medium">Extracting...</span>
              )}
            </div>

            {nlpData?.keywords && nlpData.keywords.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {nlpData.keywords.map((kw, i) => (
                  <span
                    key={`${kw}-${i}`}
                    className="text-[11px] font-medium font-mono text-indigo-700 bg-indigo-50/60 px-2 py-0.5 rounded-md border border-indigo-100/40 hover:bg-indigo-100/40 transition-colors duration-150"
                  >
                    #{kw}
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-[11px] text-slate-400">
                {isLoadingNlp ? "Running lexical analysis..." : "No keywords extracted yet. Type more text to extract."}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Structural Checklist Breakdown */}
      <div className="bg-slate-50/50 p-5 rounded-xl border border-slate-100 flex flex-col gap-4">
        <h4 className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
          <List className="w-4 h-4 text-slate-400" />
          Document Hierarchy Diagnostics & Validation
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="bg-white p-3.5 rounded-lg border border-slate-100 flex flex-col gap-1.5 shadow-2xs">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Heading Tree</span>
            <div className="flex gap-4 mt-1 font-mono text-[11px] text-slate-600">
              <div>H1: <span className="font-semibold text-slate-800">{parsedStats.headings.h1}</span></div>
              <div>H2: <span className="font-semibold text-slate-800">{parsedStats.headings.h2}</span></div>
              <div>H3: <span className="font-semibold text-slate-800">{parsedStats.headings.h3}</span></div>
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-lg border border-slate-100 flex flex-col gap-1.5 shadow-2xs">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Reference Links</span>
            <div className="flex gap-4 mt-1 font-mono text-[11px] text-slate-600">
              <div>Anchor Links: <span className="font-semibold text-slate-800">{parsedStats.links}</span></div>
              <div>Inline Code: <span className="font-semibold text-slate-800">{parsedStats.inlineCode}</span></div>
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-lg border border-slate-100 flex flex-col gap-1.5 shadow-2xs">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">List Nesting</span>
            <div className="flex gap-4 mt-1 font-mono text-[11px] text-slate-600">
              <div>Bullet Points: <span className="font-semibold text-slate-800">{parsedStats.listItems.bullet}</span></div>
              <div>Numbered: <span className="font-semibold text-slate-800">{parsedStats.listItems.numbered}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
