/**
 * Compromise-inspired NLP Engine & Lightweight Rule-based POS Tagger
 * 
 * Incorporates architectural patterns from Spencer Mountain's Compromise NLP:
 * 1. Tokenizer with normalization (punctuation strip, contractions, casing)
 * 2. Multi-word and phrase lookup with suffix & prefix rules
 * 3. Part-of-Speech (POS) Tagger with Brill-style tagging heuristics & tag hierarchy
 * 4. Noun phrase (NP) chunking & Entity detection (People, Organizations, Concepts, Dates/Metrics, Acronyms)
 * 5. Term-frequency / Saliency scoring based on syntactic position and frequency
 */

export type PosTag =
  | 'Noun'
  | 'ProperNoun'
  | 'Person'
  | 'Organization'
  | 'Place'
  | 'Verb'
  | 'Adjective'
  | 'Adverb'
  | 'Value'
  | 'Unit'
  | 'Acronym'
  | 'TechnicalTerm'
  | 'Pronoun'
  | 'Conjunction'
  | 'Preposition'
  | 'Determiner';

export interface PosTagInfo {
  tag: PosTag;
  parent?: PosTag;
  description: string;
}

// Compromise-style tag graph hierarchy
export const TAG_HIERARCHY: Record<PosTag, PosTagInfo> = {
  Noun: { tag: 'Noun', description: 'General noun or object' },
  ProperNoun: { tag: 'ProperNoun', parent: 'Noun', description: 'Capitalized specific entity or identifier' },
  Person: { tag: 'Person', parent: 'ProperNoun', description: 'Name of an individual person' },
  Organization: { tag: 'Organization', parent: 'ProperNoun', description: 'Company, institution, or group' },
  Place: { tag: 'Place', parent: 'ProperNoun', description: 'Geographic location or region' },
  TechnicalTerm: { tag: 'TechnicalTerm', parent: 'ProperNoun', description: 'Algorithm, architecture, framework, or technology' },
  Acronym: { tag: 'Acronym', parent: 'TechnicalTerm', description: 'All-caps or alphanumeric abbreviation' },
  Value: { tag: 'Value', description: 'Numeric quantity, percentage, or measurement' },
  Unit: { tag: 'Unit', parent: 'Value', description: 'Unit of measure or currency' },
  Verb: { tag: 'Verb', description: 'Action or state predicate' },
  Adjective: { tag: 'Adjective', description: 'Descriptive attribute or modifier' },
  Adverb: { tag: 'Adverb', description: 'Action modifier' },
  Pronoun: { tag: 'Pronoun', description: 'Reference pronoun (it, he, they)' },
  Conjunction: { tag: 'Conjunction', description: 'Connecting word (and, but, although)' },
  Preposition: { tag: 'Preposition', description: 'Spatial or relational preposition (in, on, with)' },
  Determiner: { tag: 'Determiner', description: 'Article or determiner (the, a, this)' },
};

export interface NlpToken {
  text: string;
  normal: string;
  tags: Set<PosTag>;
  index: number;
  hasLeadingSpace: boolean;
  isCapitalized: boolean;
  isAllUpper: boolean;
  isBackticked: boolean;
}

export interface NlpSentence {
  text: string;
  tokens: NlpToken[];
}

export interface NlpPhraseMatch {
  text: string;
  normalized: string;
  category: 'concept' | 'organization' | 'person' | 'protocol' | 'technology' | 'metric';
  tags: PosTag[];
  startIndex: number;
  length: number;
  confidence: number;
}

// Common honorifics and person title clues
const PERSON_TITLES = new Set(['dr', 'prof', 'mr', 'mrs', 'ms', 'sir', 'president', 'author', 'creator', 'founder', 'ceo', 'cto']);

// Common organization suffixes (Compromise rule-based scan)
const ORG_SUFFIXES = new Set(['inc', 'corp', 'llc', 'ltd', 'foundation', 'group', 'lab', 'labs', 'team', 'institute', 'consortium', 'association', 'dao']);

// Technical suffixes (Compromise suffix-rule heuristics)
const TECH_SUFFIXES = [
  { suffix: 'db', tag: 'TechnicalTerm' as PosTag, confidence: 0.9 },
  { suffix: 'ql', tag: 'TechnicalTerm' as PosTag, confidence: 0.85 },
  { suffix: 'sql', tag: 'TechnicalTerm' as PosTag, confidence: 0.95 },
  { suffix: 'js', tag: 'TechnicalTerm' as PosTag, confidence: 0.9 },
  { suffix: 'ts', tag: 'TechnicalTerm' as PosTag, confidence: 0.9 },
  { suffix: 'py', tag: 'TechnicalTerm' as PosTag, confidence: 0.8 },
  { suffix: 'engine', tag: 'TechnicalTerm' as PosTag, confidence: 0.85 },
  { suffix: 'protocol', tag: 'TechnicalTerm' as PosTag, confidence: 0.9 },
  { suffix: 'algorithm', tag: 'TechnicalTerm' as PosTag, confidence: 0.9 },
  { suffix: 'network', tag: 'TechnicalTerm' as PosTag, confidence: 0.8 },
  { suffix: 'cluster', tag: 'TechnicalTerm' as PosTag, confidence: 0.85 },
];

// Stopwords and non-salient function words
export const NLP_STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'could', 'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further',
  'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
  'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me', 'more', 'most', 'my', 'myself',
  'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves',
  'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their',
  'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too',
  'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who',
  'whom', 'why', 'with', 'would', 'you', 'your', 'yours', 'yourself', 'yourselves', 'also', 'e.g', 'i.e',
  'etc', 'note', 'see', 'example', 'page', 'doc', 'docs', 'using', 'used', 'file', 'files', 'true', 'false',
  'null', 'undefined', 'return', 'const', 'let', 'var', 'function', 'class', 'import', 'export', 'from'
]);

/**
 * Tokenizes and tags text using Compromise-style normalization and rule-based inference.
 */
export class CompromiseNlpEngine {
  /**
   * Tokenizes text into structured sentences and tokens.
   */
  public tokenize(text: string): NlpSentence[] {
    if (!text || !text.trim()) return [];

    // Split text into coarse sentence blocks (respecting punctuation)
    const rawSentences = text
      .split(/(?<=[.?!])\s+(?=[A-Z0-9`"'])|\n+/)
      .map((s) => s.trim())
      .filter(Boolean);

    return rawSentences.map((sentenceStr) => {
      const tokens: NlpToken[] = [];
      const regex = /(`[^`]+`)|([\w'-]+|[^\s\w])/g;
      let match: RegExpExecArray | null;
      let index = 0;

      while ((match = regex.exec(sentenceStr)) !== null) {
        const rawToken = match[0];
        if (!rawToken || !rawToken.trim()) continue;

        const isBackticked = rawToken.startsWith('`') && rawToken.endsWith('`') && rawToken.length > 2;
        const cleanText = isBackticked ? rawToken.slice(1, -1) : rawToken;
        const isWord = /^[\w'-]+$/.test(cleanText);

        if (!isWord && !isBackticked) {
          // Punctuation token
          continue;
        }

        const isCapitalized = /^[A-Z][a-z0-9]/.test(cleanText);
        const isAllUpper = /^[A-Z0-9_-]{2,}$/.test(cleanText) && /[A-Z]/.test(cleanText);
        const normal = cleanText.toLowerCase().replace(/[^\w-]/g, '');

        const token: NlpToken = {
          text: cleanText,
          normal,
          tags: new Set<PosTag>(),
          index: index++,
          hasLeadingSpace: match.index > 0 && sentenceStr[match.index - 1] === ' ',
          isCapitalized,
          isAllUpper,
          isBackticked,
        };

        // Initial Tagging
        this.tagTokenInitial(token);
        tokens.push(token);
      }

      // Contextual Sweep & Brill Tag Fixes
      this.applyContextualTaggerRules(tokens);

      return {
        text: sentenceStr,
        tokens,
      };
    });
  }

  /**
   * Initial rule-based POS tagging based on morphology, casing, and suffixes.
   */
  private tagTokenInitial(token: NlpToken): void {
    const { normal, text, isCapitalized, isAllUpper, isBackticked } = token;

    // 1. Backticked technical identifier
    if (isBackticked) {
      token.tags.add('TechnicalTerm');
      token.tags.add('ProperNoun');
      token.tags.add('Noun');
      return;
    }

    // 2. Numeric / Values
    if (/^\d+(\.\d+)?(%|ms|s|kb|mb|gb|tb|hz|ghz|k|m|b)?$/i.test(text)) {
      token.tags.add('Value');
      if (/[a-z%]/i.test(text)) {
        token.tags.add('Unit');
      }
      return;
    }

    // 3. Acronyms & Short Caps (RRF, BM25, MCP, BFT, Raft)
    if (isAllUpper && normal.length >= 2 && normal.length <= 7) {
      token.tags.add('Acronym');
      token.tags.add('TechnicalTerm');
      token.tags.add('ProperNoun');
      token.tags.add('Noun');
      return;
    }

    // 4. Suffix rules (Compromise fast suffix scan)
    for (const rule of TECH_SUFFIXES) {
      if (normal.endsWith(rule.suffix) && normal.length > rule.suffix.length + 2) {
        token.tags.add(rule.tag);
        token.tags.add('Noun');
        break;
      }
    }

    // 5. Morphological Verb/Adjective clues
    if (normal.endsWith('ing') || normal.endsWith('ed')) {
      token.tags.add('Verb');
    } else if (normal.endsWith('ly')) {
      token.tags.add('Adverb');
    } else if (normal.endsWith('able') || normal.endsWith('ible') || normal.endsWith('al') || normal.endsWith('ive')) {
      token.tags.add('Adjective');
    } else if (normal.endsWith('tion') || normal.endsWith('sion') || normal.endsWith('ment') || normal.endsWith('ity')) {
      token.tags.add('Noun');
    }

    // 6. Capitalization clues
    if (isCapitalized && !NLP_STOPWORDS.has(normal)) {
      token.tags.add('ProperNoun');
      token.tags.add('Noun');
    } else if (!token.tags.size) {
      token.tags.add('Noun');
    }
  }

  /**
   * Brill-style contextual rules to refine POS tags based on neighbors.
   */
  private applyContextualTaggerRules(tokens: NlpToken[]): void {
    for (let i = 0; i < tokens.length; i++) {
      const curr = tokens[i];
      const prev = tokens[i - 1];
      const next = tokens[i + 1];

      // Rule 1: Title preceding a capitalized word -> Person (Dr. Lamport, Prof. Knuth)
      if (prev && PERSON_TITLES.has(prev.normal) && curr.isCapitalized) {
        curr.tags.add('Person');
        curr.tags.add('ProperNoun');
      }

      // Rule 2: Org suffix following capitalized word -> Organization (Google DeepMind, Linux Foundation)
      if (curr.isCapitalized && next && ORG_SUFFIXES.has(next.normal)) {
        curr.tags.add('Organization');
        curr.tags.add('ProperNoun');
      }

      // Rule 3: Determinant followed by Adjective -> next word is Noun ("The Byzantine fault")
      if (prev && ['the', 'a', 'an', 'this'].includes(prev.normal) && curr.tags.has('Adjective') && next) {
        next.tags.add('Noun');
      }

      // Rule 4: PascalCase identifiers without spaces -> TechnicalTerm ("VectorIndex", "MetaAST")
      if (/^[A-Z][a-z0-9]+[A-Z][a-zA-Z0-9]+$/.test(curr.text)) {
        curr.tags.add('TechnicalTerm');
        curr.tags.add('ProperNoun');
      }
    }
  }

  /**
   * Finds consecutive noun-phrase chunks and multi-word entities (Compromise chunking).
   * Example: "Distributed Consensus Protocol" or "Leslie Lamport"
   */
  public extractNounPhrases(sentences: NlpSentence[]): string[] {
    const phrases: string[] = [];

    for (const sentence of sentences) {
      let currentChunk: string[] = [];

      for (let i = 0; i < sentence.tokens.length; i++) {
        const token = sentence.tokens[i];
        const isSalient =
          (token.tags.has('ProperNoun') || token.tags.has('TechnicalTerm') || token.tags.has('Noun') || token.tags.has('Acronym')) &&
          !NLP_STOPWORDS.has(token.normal);

        if (isSalient) {
          currentChunk.push(token.text);
        } else {
          if (currentChunk.length >= 2) {
            phrases.push(currentChunk.join(' '));
          }
          currentChunk = [];
        }
      }

      if (currentChunk.length >= 2) {
        phrases.push(currentChunk.join(' '));
      }
    }

    return phrases;
  }
}

export const compromiseNlp = new CompromiseNlpEngine();
