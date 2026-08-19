/**
 * Custom NLP Lexicon Storage & Default Presets
 * Provides local persistence, built-in domain dictionaries (Cloud/Infra, AI/ML, Distributed Systems, Web3),
 * and JSON import/export capabilities.
 */

export type LexiconCategory = 'concept' | 'organization' | 'person' | 'protocol' | 'technology' | 'metric';

export interface CustomLexiconEntry {
  id: string;
  canonicalName: string;
  category: LexiconCategory;
  aliases: string[];
  baseSalience?: number;
  description?: string;
  enabled?: boolean;
}

export interface LexiconPresetPack {
  id: string;
  name: string;
  description: string;
  category: string;
  entries: Omit<CustomLexiconEntry, 'id'>[];
}

export interface LexiconImportFormatWrapper {
  version?: string;
  exportedAt?: string;
  description?: string;
  entries: Array<{
    canonicalName: string;
    category?: LexiconCategory | string;
    aliases?: string[];
    baseSalience?: number;
    description?: string;
    enabled?: boolean;
    id?: string;
  }>;
}

export const BUILTIN_LEXICON_PRESETS: LexiconPresetPack[] = [
  {
    id: 'distributed_systems',
    name: 'Distributed Systems & Consensus',
    description: 'Consensus protocols, replication, fault-tolerance algorithms, and vector clocks.',
    category: 'Architecture',
    entries: [
      {
        canonicalName: 'Raft Consensus',
        category: 'concept',
        aliases: ['raft', 'raft protocol', 'raft consensus'],
        baseSalience: 0.95,
        description: 'Understandable distributed consensus algorithm by Diego Ongaro and John Ousterhout.',
      },
      {
        canonicalName: 'Paxos Protocol',
        category: 'concept',
        aliases: ['paxos', 'multi-paxos', 'fast paxos'],
        baseSalience: 0.95,
        description: 'Classic consensus algorithm introduced by Leslie Lamport.',
      },
      {
        canonicalName: 'Byzantine Fault Tolerance',
        category: 'concept',
        aliases: ['bft', 'pbft', 'byzantine fault tolerance', 'byzantine agreement'],
        baseSalience: 0.9,
        description: 'Fault tolerance condition where components may fail and provide arbitrary misinformation.',
      },
      {
        canonicalName: 'Vector Clock',
        category: 'concept',
        aliases: ['vector clock', 'vector clocks', 'lamport timestamp'],
        baseSalience: 0.85,
        description: 'Logical clock algorithm for generating partial ordering of events in distributed systems.',
      },
      {
        canonicalName: 'Consistent Hashing',
        category: 'concept',
        aliases: ['consistent hashing', 'hash ring', 'ketama'],
        baseSalience: 0.85,
        description: 'Hashing technique that minimizes reorganization when slots change.',
      },
    ],
  },
  {
    id: 'ai_and_rag',
    name: 'Modern AI, LLMs & Vector Retrieval',
    description: 'Embeddings, vector databases, Graph-RAG, tokenizers, and retrieval algorithms.',
    category: 'Artificial Intelligence',
    entries: [
      {
        canonicalName: 'Graph-RAG',
        category: 'concept',
        aliases: ['graph-rag', 'graph rag', 'graph augmented generation', 'knowledge graph rag'],
        baseSalience: 0.95,
        description: 'Topological graph-assisted retrieval augmented generation combining vector similarity with relation graphs.',
      },
      {
        canonicalName: 'Reciprocal Rank Fusion',
        category: 'concept',
        aliases: ['rrf', 'reciprocal rank fusion'],
        baseSalience: 0.9,
        description: 'Information retrieval algorithm fusing disparate ranking scores without calibration.',
      },
      {
        canonicalName: 'MetaAST Specification',
        category: 'concept',
        aliases: ['metaast', 'meta ast', 'metaast construct', 'ast enrichment'],
        baseSalience: 0.95,
        description: 'Hierarchically enriched Abstract Syntax Tree specification for dual-layer vector DB chunking.',
      },
      {
        canonicalName: 'Open Knowledge Format',
        category: 'concept',
        aliases: ['okf', 'open knowledge format', 'okf bundle'],
        baseSalience: 0.95,
        description: 'Human-verifiable and LLM-executable semantic knowledge representation format.',
      },
      {
        canonicalName: 'Google DeepMind',
        category: 'organization',
        aliases: ['deepmind', 'google deepmind', 'gemini team'],
        baseSalience: 0.85,
        description: 'Pioneering artificial intelligence research laboratory.',
      },
      {
        canonicalName: 'Qdrant Vector Engine',
        category: 'technology',
        aliases: ['qdrant', 'qdrant vector db'],
        baseSalience: 0.85,
        description: 'Open-source vector search engine and database written in Rust.',
      },
      {
        canonicalName: 'Pinecone Vector DB',
        category: 'technology',
        aliases: ['pinecone', 'pinecone db', 'pinecone vector'],
        baseSalience: 0.85,
        description: 'Managed, cloud-native vector database optimized for similarity search.',
      },
    ],
  },
  {
    id: 'cloud_and_databases',
    name: 'Cloud Platforms & Data Infrastructure',
    description: 'Relational databases, object storage, cloud providers, and container runtimes.',
    category: 'Infrastructure',
    entries: [
      {
        canonicalName: 'PostgreSQL pgvector',
        category: 'technology',
        aliases: ['pgvector', 'postgres vector', 'postgresql vector'],
        baseSalience: 0.9,
        description: 'Open-source vector similarity search extension for PostgreSQL.',
      },
      {
        canonicalName: 'Google Cloud Platform',
        category: 'organization',
        aliases: ['gcp', 'google cloud', 'google cloud platform'],
        baseSalience: 0.8,
        description: 'Suite of cloud computing services running on Google infrastructure.',
      },
      {
        canonicalName: 'Amazon Web Services',
        category: 'organization',
        aliases: ['aws', 'amazon web services'],
        baseSalience: 0.8,
        description: 'Cloud computing platform provided by Amazon.',
      },
      {
        canonicalName: 'Model Context Protocol',
        category: 'protocol',
        aliases: ['mcp', 'model context protocol'],
        baseSalience: 0.95,
        description: 'Open standard that enables developers to build secure, two-way connections between data sources and AI models.',
      },
      {
        canonicalName: 'SPARQL Protocol',
        category: 'protocol',
        aliases: ['sparql', 'sparql 1.1', 'rdf sparql'],
        baseSalience: 0.9,
        description: 'W3C semantic query language and protocol for databases able to retrieve and manipulate data stored in RDF format.',
      },
    ],
  },
];

const STORAGE_KEY = 'doc_conv_custom_lexicon';
const HIDDEN_PRESETS_KEY = 'doc_conv_hidden_presets';

/**
 * Loads the list of hidden/deleted built-in preset IDs.
 */
export function loadHiddenPresetIds(): string[] {
  try {
    const saved = localStorage.getItem(HIDDEN_PRESETS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Failed to load hidden presets list', e);
  }
  return [];
}

/**
 * Saves hidden/deleted built-in preset IDs to localStorage.
 */
export function saveHiddenPresetIds(hiddenIds: string[]): void {
  try {
    localStorage.setItem(HIDDEN_PRESETS_KEY, JSON.stringify(hiddenIds));
  } catch (e) {
    console.error('Failed to save hidden presets list', e);
  }
}

/**
 * Loads custom lexicon entries from localStorage with fallback to default preset entries.
 */
export function loadCustomLexicon(): CustomLexiconEntry[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load custom lexicon from storage', e);
  }

  // Default initial set seeded from built-in presets
  const initialEntries: CustomLexiconEntry[] = [];
  BUILTIN_LEXICON_PRESETS.forEach((preset) => {
    preset.entries.forEach((entry) => {
      initialEntries.push({
        id: `entry_${Math.random().toString(36).substring(2, 9)}`,
        ...entry,
        enabled: true,
      });
    });
  });

  saveCustomLexicon(initialEntries);
  return initialEntries;
}

/**
 * Saves custom lexicon entries to localStorage.
 */
export function saveCustomLexicon(entries: CustomLexiconEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (e) {
    console.error('Failed to save custom lexicon to storage', e);
  }
}

/**
 * Validates and normalizes raw JSON data into CustomLexiconEntry array.
 * Supports both raw array format and { entries: [...] } envelope format.
 */
export function parseAndValidateLexiconJson(rawJson: unknown): {
  success: boolean;
  entries: CustomLexiconEntry[];
  error?: string;
  metadata?: { version?: string; description?: string };
} {
  let rawList: any[] = [];
  let metadata: { version?: string; description?: string } = {};

  if (Array.isArray(rawJson)) {
    rawList = rawJson;
  } else if (rawJson && typeof rawJson === 'object') {
    const obj = rawJson as Record<string, any>;
    if (Array.isArray(obj.entries)) {
      rawList = obj.entries;
      metadata = {
        version: obj.version,
        description: obj.description,
      };
    } else {
      return {
        success: false,
        entries: [],
        error: 'JSON must either be an Array of entity objects or an Object containing an "entries": [...] array.',
      };
    }
  } else {
    return {
      success: false,
      entries: [],
      error: 'Invalid JSON root. Expected an Array or Object.',
    };
  }

  if (rawList.length === 0) {
    return {
      success: false,
      entries: [],
      error: 'Lexicon payload contains 0 entity entries.',
    };
  }

  const validCategories: Set<LexiconCategory> = new Set([
    'concept',
    'organization',
    'person',
    'protocol',
    'technology',
    'metric',
  ]);

  const validated: CustomLexiconEntry[] = [];

  for (let i = 0; i < rawList.length; i++) {
    const item = rawList[i];
    if (!item || typeof item !== 'object') continue;

    const canonicalName = String(item.canonicalName || item.name || item.term || '').trim();
    if (!canonicalName) continue;

    let category: LexiconCategory = 'concept';
    const rawCat = String(item.category || '').toLowerCase();
    if (validCategories.has(rawCat as LexiconCategory)) {
      category = rawCat as LexiconCategory;
    }

    let aliases: string[] = [];
    if (Array.isArray(item.aliases)) {
      aliases = item.aliases.map((a: any) => String(a).trim().toLowerCase()).filter(Boolean);
    } else if (typeof item.aliases === 'string') {
      aliases = item.aliases
        .split(',')
        .map((a: string) => a.trim().toLowerCase())
        .filter(Boolean);
    }

    let baseSalience = 0.85;
    if (typeof item.baseSalience === 'number' && item.baseSalience >= 0 && item.baseSalience <= 1) {
      baseSalience = item.baseSalience;
    } else if (typeof item.salience === 'number' && item.salience >= 0 && item.salience <= 1) {
      baseSalience = item.salience;
    }

    const description = item.description ? String(item.description).trim() : undefined;
    const enabled = item.enabled !== false;

    validated.push({
      id: item.id && typeof item.id === 'string' ? item.id : `entry_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
      canonicalName,
      category,
      aliases,
      baseSalience,
      description,
      enabled,
    });
  }

  if (validated.length === 0) {
    return {
      success: false,
      entries: [],
      error: 'No valid entity items could be extracted (each item must have at least a "canonicalName" or "name").',
    };
  }

  return {
    success: true,
    entries: validated,
    metadata,
  };
}

/**
 * Parses a CSV string into CustomLexiconEntry items.
 * Handles standard RFC 4180 CSV syntax with escaped quotes, headers, and comments.
 * Supported columns (case-insensitive):
 * - canonicalName / name / term (Required)
 * - category (Optional: concept, organization, person, protocol, technology, metric)
 * - aliases / synonyms (Optional: separated by semicolons, pipes, or spaces if in quotes)
 * - baseSalience / salience (Optional: 0.0 - 1.0)
 * - description / context (Optional)
 * - enabled / active (Optional: true/false/1/0)
 */
export function parseAndValidateLexiconCsv(csvContent: string): {
  success: boolean;
  entries: CustomLexiconEntry[];
  error?: string;
  totalParsedRows?: number;
} {
  if (!csvContent || !csvContent.trim()) {
    return {
      success: false,
      entries: [],
      error: 'CSV file content is empty.',
    };
  }

  // Robust CSV row/cell lexer supporting quoted commas and multi-line fields
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let insideQuotes = false;

  for (let i = 0; i < csvContent.length; i++) {
    const char = csvContent[i];
    const nextChar = csvContent[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentCell += '"';
        i++; // skip escaped quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentCell.trim());
      currentCell = '';
      if (currentRow.some((c) => c.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentCell += char;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  if (rows.length === 0) {
    return {
      success: false,
      entries: [],
      error: 'No valid data rows found in CSV.',
    };
  }

  const validCategories: Set<LexiconCategory> = new Set([
    'concept',
    'organization',
    'person',
    'protocol',
    'technology',
    'metric',
  ]);

  // Check if first row is a header row
  const firstRow = rows[0].map((c) => c.toLowerCase());
  const hasHeader =
    firstRow.some((col) =>
      ['canonicalname', 'canonical_name', 'name', 'term', 'entity', 'title'].includes(col)
    );

  let headerMap: Record<string, number> = {};
  let dataRows = rows;

  if (hasHeader) {
    firstRow.forEach((colName, index) => {
      const normalized = colName.replace(/[\s_-]+/g, '');
      if (['canonicalname', 'name', 'term', 'entity', 'title'].includes(normalized)) {
        headerMap.canonicalName = index;
      } else if (['category', 'type', 'entitytype', 'class'].includes(normalized)) {
        headerMap.category = index;
      } else if (['aliases', 'alias', 'synonyms', 'synonym', 'acronyms', 'keywords'].includes(normalized)) {
        headerMap.aliases = index;
      } else if (['basesalience', 'salience', 'weight', 'score', 'priority'].includes(normalized)) {
        headerMap.baseSalience = index;
      } else if (['description', 'desc', 'context', 'notes', 'summary'].includes(normalized)) {
        headerMap.description = index;
      } else if (['enabled', 'active', 'status'].includes(normalized)) {
        headerMap.enabled = index;
      }
    });
    dataRows = rows.slice(1);
  } else {
    // Positional default columns: canonicalName, category, aliases, baseSalience, description
    headerMap = {
      canonicalName: 0,
      category: 1,
      aliases: 2,
      baseSalience: 3,
      description: 4,
      enabled: 5,
    };
  }

  const validated: CustomLexiconEntry[] = [];

  dataRows.forEach((row, rowIdx) => {
    // Skip empty lines or comment lines starting with '#'
    if (row.length === 0 || (row[0] && row[0].startsWith('#'))) return;

    const nameIdx = headerMap.canonicalName ?? 0;
    const rawName = row[nameIdx] ? row[nameIdx].trim() : '';
    if (!rawName) return;

    // Category
    let category: LexiconCategory = 'concept';
    if (headerMap.category !== undefined && row[headerMap.category]) {
      const catVal = row[headerMap.category].trim().toLowerCase();
      if (validCategories.has(catVal as LexiconCategory)) {
        category = catVal as LexiconCategory;
      }
    }

    // Aliases: split by semicolon, pipe, or comma (if not inside parent list)
    let aliases: string[] = [];
    if (headerMap.aliases !== undefined && row[headerMap.aliases]) {
      const rawAliases = row[headerMap.aliases];
      aliases = rawAliases
        .split(/[;|]/)
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean);

      // Fallback: if no semicolons/pipes, try splitting by comma
      if (aliases.length <= 1 && rawAliases.includes(',')) {
        aliases = rawAliases
          .split(',')
          .map((a) => a.trim().toLowerCase())
          .filter(Boolean);
      }
    }

    // Salience
    let baseSalience = 0.85;
    if (headerMap.baseSalience !== undefined && row[headerMap.baseSalience]) {
      const parsedNum = parseFloat(row[headerMap.baseSalience]);
      if (!isNaN(parsedNum) && parsedNum >= 0 && parsedNum <= 1) {
        baseSalience = parsedNum;
      }
    }

    // Description
    let description: string | undefined = undefined;
    if (headerMap.description !== undefined && row[headerMap.description]) {
      description = row[headerMap.description].trim() || undefined;
    }

    // Enabled
    let enabled = true;
    if (headerMap.enabled !== undefined && row[headerMap.enabled]) {
      const val = row[headerMap.enabled].trim().toLowerCase();
      if (['false', '0', 'no', 'disabled', 'off'].includes(val)) {
        enabled = false;
      }
    }

    validated.push({
      id: `entry_csv_${Date.now()}_${rowIdx}_${Math.random().toString(36).substring(2, 6)}`,
      canonicalName: rawName,
      category,
      aliases,
      baseSalience,
      description,
      enabled,
    });
  });

  if (validated.length === 0) {
    return {
      success: false,
      entries: [],
      error: 'No valid entity records found in CSV rows.',
    };
  }

  return {
    success: true,
    entries: validated,
    totalParsedRows: dataRows.length,
  };
}

/**
 * Exports CustomLexiconEntry array as standard RFC-compatible CSV string.
 */
export function exportLexiconToCsv(entries: CustomLexiconEntry[]): string {
  const escapeCsv = (val: string | number | undefined | null): string => {
    if (val === undefined || val === null) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = ['canonicalName', 'category', 'aliases', 'baseSalience', 'description', 'enabled'];
  const rows = entries.map((entry) => [
    escapeCsv(entry.canonicalName),
    escapeCsv(entry.category),
    escapeCsv((entry.aliases || []).join('; ')),
    escapeCsv(entry.baseSalience ?? 0.85),
    escapeCsv(entry.description ?? ''),
    escapeCsv(entry.enabled !== false ? 'true' : 'false'),
  ]);

  return [header.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
}

/**
 * Universal importer that automatically handles CSV and JSON (both Envelope and Flat Array formats).
 */
export function parseAndValidateLexiconFile(fileContent: string, fileName?: string): {
  success: boolean;
  entries: CustomLexiconEntry[];
  format: 'json_envelope' | 'json_array' | 'csv';
  error?: string;
  metadata?: { version?: string; description?: string };
} {
  const trimmed = fileContent.trim();
  const isLikelyCsv =
    (fileName && fileName.toLowerCase().endsWith('.csv')) ||
    (!trimmed.startsWith('{') && !trimmed.startsWith('['));

  if (isLikelyCsv) {
    const csvResult = parseAndValidateLexiconCsv(fileContent);
    return {
      success: csvResult.success,
      entries: csvResult.entries,
      format: 'csv',
      error: csvResult.error,
    };
  }

  try {
    const jsonParsed = JSON.parse(fileContent);
    const isEnvelope = jsonParsed && typeof jsonParsed === 'object' && !Array.isArray(jsonParsed);
    const jsonResult = parseAndValidateLexiconJson(jsonParsed);
    return {
      success: jsonResult.success,
      entries: jsonResult.entries,
      format: isEnvelope ? 'json_envelope' : 'json_array',
      error: jsonResult.error,
      metadata: jsonResult.metadata,
    };
  } catch (err: any) {
    // If JSON parsing failed, try CSV parser as graceful fallback
    const csvFallback = parseAndValidateLexiconCsv(fileContent);
    if (csvFallback.success && csvFallback.entries.length > 0) {
      return {
        success: true,
        entries: csvFallback.entries,
        format: 'csv',
      };
    }

    return {
      success: false,
      entries: [],
      format: 'json_array',
      error: `Failed to parse file as JSON or CSV: ${err?.message || 'Invalid format'}`,
    };
  }
}

