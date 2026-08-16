/**
 * OKF NLP Intelligence Engine
 * Provides Semantic Keyphrase Extraction, Named Entity Recognition, Salience Summarization,
 * Concept Classification, Topic Boundary Discovery, and Content Quality Auditing.
 */

// Common English stopwords
const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'could', 'did', 'do', 'does', 'doing', 'down', 'during',
  'each', 'few', 'for', 'from', 'further',
  'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
  'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself',
  'just', 'me', 'more', 'most', 'my', 'myself',
  'no', 'nor', 'not', 'now',
  'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', 'she', 'should', 'so', 'some', 'such',
  'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too',
  'under', 'until', 'up', 'very',
  'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would',
  'you', 'your', 'yours', 'yourself', 'yourselves',
  // Common generic documentation stopwords
  'also', 'e.g', 'eg', 'i.e', 'ie', 'etc', 'use', 'using', 'used', 'can', 'may', 'will', 'see', 'note', 'section', 'document', 'page'
]);

export interface NLPEntity {
  text: string;
  category: 'technical' | 'code' | 'protocol' | 'metric' | 'organization' | 'general';
  confidence: number;
}

export interface NLPConceptAnalysis {
  inferredType: 'concept' | 'procedure' | 'table' | 'metric' | 'guideline' | 'reference';
  typeConfidence: number;
  extractedTitle: string;
  summaryDescription: string;
  tags: string[];
  entities: NLPEntity[];
  readability: {
    fleschReadingEase: number;
    gradeLevel: number;
    wordCount: number;
    sentenceCount: number;
    avgWordsPerSentence: number;
    complexityLabel: 'Simple' | 'Standard' | 'Technical' | 'Advanced';
  };
  qualitySignals: {
    hasActionSteps: boolean;
    hasCodeBlocks: boolean;
    hasTabularData: boolean;
    hasMetrics: boolean;
    ambiguityScore: number; // 0 (clear) to 1 (vague)
    ambiguousPhrases: string[];
    completenessScore: number; // 0 to 100
  };
}

/**
 * Normalizes and tokenizes text into clean words.
 */
export function tokenizeText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * Extracts technical entities, acronyms, and code identifiers from text.
 */
export function extractEntities(text: string): NLPEntity[] {
  const entitiesMap = new Map<string, NLPEntity>();

  // 1. Code identifiers: camelCase, PascalCase, snake_case, UPPER_CASE
  const codeRegex = /\b([a-z]+[A-Z][a-zA-Z0-9]*|[A-Z][a-zA-Z0-9]+[A-Z][a-zA-Z0-9]*|[a-zA-Z0-9]+_[a-zA-Z0-9_]+|[A-Z]{2,}_[A-Z0-9_]+)\b/g;
  let match: RegExpExecArray | null;
  while ((match = codeRegex.exec(text)) !== null) {
    const term = match[1];
    if (term.length >= 3 && !STOPWORDS.has(term.toLowerCase())) {
      entitiesMap.set(term, {
        text: term,
        category: 'code',
        confidence: 0.95,
      });
    }
  }

  // 2. Protocols and Standards (OAuth, JWT, REST, GraphQL, gRPC, HTTP, SQL, JSON, YAML, etc.)
  const protocolRegex = /\b(OAuth(?:\s*2\.0)?|JWT|REST(?:ful)?|GraphQL|gRPC|HTTP[S]?|SQL|PostgreSQL|MySQL|SQLite|NoSQL|JSON|YAML|XML|API|SDK|SDKs|CLI|TCP|UDP|IP|DNS|SSL|TLS|Docker|Kubernetes|HTML|CSS|TypeScript|JavaScript|Python|Rust|Go|C\+\+|AWS|GCP|Azure|Firebase|Firestore|Markdown|OKF)\b/gi;
  while ((match = protocolRegex.exec(text)) !== null) {
    const term = match[1];
    entitiesMap.set(term, {
      text: term,
      category: 'protocol',
      confidence: 0.98,
    });
  }

  // 3. Technical Acronyms (3-5 uppercase letters)
  const acronymRegex = /\b([A-Z]{3,5})\b/g;
  while ((match = acronymRegex.exec(text)) !== null) {
    const term = match[1];
    if (!STOPWORDS.has(term.toLowerCase()) && !entitiesMap.has(term)) {
      entitiesMap.set(term, {
        text: term,
        category: 'technical',
        confidence: 0.85,
      });
    }
  }

  // 4. Metrics & Benchmarks (e.g., 99.9%, 250ms, 100 req/s, 10 MB, 5 GB)
  const metricRegex = /\b(\d+(?:\.\d+)?\s*(?:%|ms|seconds?|mins?|hours?|req\/s|rps|KB|MB|GB|TB|kps|fps|tokens?))\b/gi;
  while ((match = metricRegex.exec(text)) !== null) {
    const term = match[1];
    entitiesMap.set(term, {
      text: term,
      category: 'metric',
      confidence: 0.9,
    });
  }

  // 5. Backtick enclosed code identifiers
  const backtickRegex = /`([^`\n]+)`/g;
  while ((match = backtickRegex.exec(text)) !== null) {
    const term = match[1].trim();
    if (term.length >= 2 && term.length <= 40 && !STOPWORDS.has(term.toLowerCase())) {
      entitiesMap.set(term, {
        text: term,
        category: 'code',
        confidence: 0.9,
      });
    }
  }

  return Array.from(entitiesMap.values()).slice(0, 20);
}

/**
 * Extracts salient keyphrases (unigrams and bigrams) using frequency and TF-IDF style weighting.
 */
export function extractKeyphrases(text: string, maxKeywords: number = 8): string[] {
  const clean = text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]+`/g, ' ');
  const tokens = tokenizeText(clean);
  const freqMap = new Map<string, number>();

  // 1. Unigram frequency
  for (const token of tokens) {
    freqMap.set(token, (freqMap.get(token) || 0) + 1);
  }

  // 2. Bigrams
  const words = clean.split(/\s+/).map((w) => w.toLowerCase().replace(/[^\w-]/g, '')).filter(Boolean);
  for (let i = 0; i < words.length - 1; i++) {
    const w1 = words[i];
    const w2 = words[i + 1];
    if (w1.length > 2 && w2.length > 2 && !STOPWORDS.has(w1) && !STOPWORDS.has(w2)) {
      const bigram = `${w1} ${w2}`;
      freqMap.set(bigram, (freqMap.get(bigram) || 0) + 2.5); // Boost bigrams
    }
  }

  // Boost words appearing in title or bold markup
  const boldMatches = clean.match(/\*\*([^*]+)\*\*/g) || [];
  for (const bold of boldMatches) {
    const bTokens = tokenizeText(bold);
    for (const bt of bTokens) {
      if (freqMap.has(bt)) {
        freqMap.set(bt, (freqMap.get(bt) || 0) + 3);
      }
    }
  }

  return Array.from(freqMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([phrase]) => phrase.replace(/\s+/g, '-'))
    .filter((phrase) => phrase.length >= 3)
    .slice(0, maxKeywords);
}

/**
 * Computes Flesch Reading Ease and Flesch-Kincaid Grade Level.
 */
export function computeReadability(text: string) {
  const clean = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`]+`/g, '');
  const words = clean.trim().split(/\s+/).filter((w) => w.length > 0);
  const wordCount = Math.max(1, words.length);

  // Sentences split by punctuation
  const sentences = clean.split(/[.!?]+(?:\s+|$)/).filter((s) => s.trim().length > 3);
  const sentenceCount = Math.max(1, sentences.length);

  // Approximate syllable count
  let syllableCount = 0;
  for (const word of words) {
    const w = word.toLowerCase().replace(/[^a-z]/g, '');
    if (w.length <= 3) {
      syllableCount += 1;
      continue;
    }
    const syllables = w.replace(/(?:[^laeiouy]|ed|es|e)$/, '')
      .replace(/^y/, '')
      .match(/[aeiouy]{1,2}/g);
    syllableCount += syllables ? Math.max(1, syllables.length) : 1;
  }

  const avgWordsPerSentence = wordCount / sentenceCount;
  const avgSyllablesPerWord = syllableCount / wordCount;

  // Flesch Reading Ease Score
  const fleschReadingEase = Math.max(
    0,
    Math.min(100, Math.round(206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord))
  );

  // Flesch-Kincaid Grade Level
  const gradeLevel = Math.max(
    1,
    Math.round(0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59)
  );

  let complexityLabel: 'Simple' | 'Standard' | 'Technical' | 'Advanced' = 'Standard';
  if (fleschReadingEase >= 70) complexityLabel = 'Simple';
  else if (fleschReadingEase >= 50) complexityLabel = 'Standard';
  else if (fleschReadingEase >= 30) complexityLabel = 'Technical';
  else complexityLabel = 'Advanced';

  return {
    fleschReadingEase,
    gradeLevel,
    wordCount,
    sentenceCount,
    avgWordsPerSentence: Math.round(avgWordsPerSentence * 10) / 10,
    complexityLabel,
  };
}

/**
 * Detects ambiguity, speculative phrases, and calculates a completeness & quality score.
 */
export function analyzeContentQuality(text: string) {
  const lower = text.toLowerCase();

  // Vagueness & speculative words
  const ambiguityPatterns = [
    /\b(maybe|perhaps|probably|likely|somehow|somewhere|sometime)\b/gi,
    /\b(stuff|things?|etc\.?|and so on|kind of|sort of)\b/gi,
    /\b(as needed|appropriately|whatever|to be decided|tbd)\b/gi,
    /\b(in theory|usually|mostly|normally)\b/gi,
  ];

  const foundAmbiguities: string[] = [];
  for (const pat of ambiguityPatterns) {
    const matches = text.match(pat);
    if (matches) {
      foundAmbiguities.push(...matches.map((m) => m.toLowerCase()));
    }
  }

  const uniqueAmbiguities = Array.from(new Set(foundAmbiguities));
  const wordCount = Math.max(1, text.split(/\s+/).length);
  const ambiguityScore = Math.min(1, Math.round((foundAmbiguities.length / (wordCount / 30)) * 100) / 100);

  // Structural checks
  const hasActionSteps = /^\s*(?:\d+\.|\*|-)\s+(?:install|run|configure|create|open|navigate|execute|add|set|build|deploy|verify)/im.test(text);
  const hasCodeBlocks = /```[a-z0-9]*\n[\s\S]*?```/i.test(text);
  const hasTabularData = /\|(?:\s*[-:]+\s*\|)+/.test(text);
  const hasMetrics = /\b\d+(?:\.\d+)?\s*(?:%|ms|seconds?|req\/s|MB|GB|KB)\b/i.test(text);

  // Completeness score
  let completeness = 70;
  if (text.length > 200) completeness += 10;
  if (hasCodeBlocks || hasTabularData || hasActionSteps) completeness += 10;
  if (uniqueAmbiguities.length === 0) completeness += 10;
  else completeness -= Math.min(25, uniqueAmbiguities.length * 5);

  return {
    hasActionSteps,
    hasCodeBlocks,
    hasTabularData,
    hasMetrics,
    ambiguityScore,
    ambiguousPhrases: uniqueAmbiguities.slice(0, 6),
    completenessScore: Math.max(10, Math.min(100, completeness)),
  };
}

/**
 * Generates an extractive salient summary of the text for OKF YAML frontmatter description.
 */
export function generateSalientDescription(text: string, title?: string): string {
  // Strip code blocks and Markdown headers for sentence scoring
  const clean = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#+\s+.*$/gm, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`]/g, '')
    .trim();

  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 25 && s.length <= 220);

  if (sentences.length === 0) {
    return title ? `${title} concept document and specification.` : 'Open Knowledge Format concept document.';
  }

  const titleTokens = title ? new Set(tokenizeText(title)) : new Set<string>();

  // Score sentences
  let bestSentence = sentences[0];
  let highestScore = -1;

  sentences.forEach((sentence, index) => {
    let score = 0;
    const lower = sentence.toLowerCase();

    // Positional weight: first 2 sentences get strong bonus
    if (index === 0) score += 4;
    else if (index === 1) score += 2.5;

    // Definitional triggers: "is a", "defines", "provides", "used for", "allows", "represents"
    if (/\b(is a|is an|defines|provides|specifies|represents|implements|used for|allows|enables)\b/i.test(sentence)) {
      score += 5;
    }

    // Title keyword overlap
    const tokens = tokenizeText(sentence);
    for (const t of tokens) {
      if (titleTokens.has(t)) score += 2;
    }

    // Penalty for questions or list headers
    if (sentence.endsWith('?') || sentence.endsWith(':')) score -= 3;
    if (/^(for example|such as|note that|specifically)/i.test(sentence)) score -= 2;

    if (score > highestScore) {
      highestScore = score;
      bestSentence = sentence;
    }
  });

  // Clean trailing punctuation or artifacts
  const cleanSummary = bestSentence.replace(/\s+/g, ' ').trim();
  return cleanSummary.endsWith('.') ? cleanSummary : `${cleanSummary}.`;
}

/**
 * Classifies the semantic concept type based on lexical patterns and structure.
 */
export function classifyConceptWithNLP(
  title: string,
  body: string
): { type: 'concept' | 'procedure' | 'table' | 'metric' | 'guideline' | 'reference'; confidence: number } {
  const lowerTitle = title.toLowerCase();
  const lowerBody = body.toLowerCase();

  // 1. Table
  if (/\|(?:\s*[-:]+\s*\|)+/.test(body) && (lowerTitle.includes('table') || lowerTitle.includes('schema') || lowerTitle.includes('matrix') || lowerTitle.includes('data') || body.split('|').length > 10)) {
    return { type: 'table', confidence: 0.95 };
  }

  // 2. Procedure
  const stepCount = (body.match(/^\s*(?:\d+\.|\bstep\s*\d+:)/gim) || []).length;
  const imperativeCount = (body.match(/\b(install|configure|run|execute|create|set up|download|click|navigate|open|deploy)\b/gi) || []).length;

  if (
    lowerTitle.includes('how to') ||
    lowerTitle.includes('procedure') ||
    lowerTitle.includes('workflow') ||
    lowerTitle.includes('guide') ||
    lowerTitle.includes('steps') ||
    lowerTitle.includes('installation') ||
    (stepCount >= 2 && imperativeCount >= 2)
  ) {
    return { type: 'procedure', confidence: 0.92 };
  }

  // 3. Metric / Benchmark
  if (
    lowerTitle.includes('metric') ||
    lowerTitle.includes('kpi') ||
    lowerTitle.includes('benchmark') ||
    lowerTitle.includes('latency') ||
    lowerTitle.includes('performance') ||
    lowerTitle.includes('stat') ||
    lowerTitle.includes('sla')
  ) {
    return { type: 'metric', confidence: 0.9 };
  }

  // 4. Guideline / Standard / Policy
  if (
    lowerTitle.includes('guideline') ||
    lowerTitle.includes('rule') ||
    lowerTitle.includes('policy') ||
    lowerTitle.includes('standard') ||
    lowerTitle.includes('compliance') ||
    /\b(must|shall|mandatory|prohibited|forbidden|required to)\b/i.test(body)
  ) {
    return { type: 'guideline', confidence: 0.88 };
  }

  // 5. Reference / API Specification
  if (
    lowerTitle.includes('api') ||
    lowerTitle.includes('reference') ||
    lowerTitle.includes('spec') ||
    lowerTitle.includes('glossary') ||
    lowerTitle.includes('dictionary') ||
    /\b(GET|POST|PUT|DELETE|PATCH)\s+\/api\//.test(body)
  ) {
    return { type: 'reference', confidence: 0.9 };
  }

  return { type: 'concept', confidence: 0.85 };
}

/**
 * Runs full NLP analysis on a concept section.
 */
export function analyzeConceptWithNLP(title: string, body: string): NLPConceptAnalysis {
  const { type, confidence: typeConfidence } = classifyConceptWithNLP(title, body);
  const entities = extractEntities(`${title}\n${body}`);
  const keyphrases = extractKeyphrases(`${title}\n${body}`, 8);
  const readability = computeReadability(body);
  const qualitySignals = analyzeContentQuality(body);
  const summaryDescription = generateSalientDescription(body, title);

  // Combine keyphrases and high-confidence entities into clean tags
  const tagSet = new Set<string>([type]);
  for (const kp of keyphrases) tagSet.add(kp);
  for (const ent of entities.slice(0, 4)) {
    tagSet.add(ent.text.toLowerCase().replace(/[^\w-]/g, '-'));
  }

  return {
    inferredType: type,
    typeConfidence,
    extractedTitle: title,
    summaryDescription,
    tags: Array.from(tagSet).slice(0, 8),
    entities,
    readability,
    qualitySignals,
  };
}
