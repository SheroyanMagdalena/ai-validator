export type PrimitiveType =
  | 'string'
  | 'integer'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'unknown';

export interface FieldDescriptor {
  /** Full, original dotted path as seen in source (e.g., Person.patronymic) */
  path: string;
  /** Leaf name only (Parent.Child -> Child) */
  leaf: string;
  /** Normalized name for equality (lowercased, punctuation removed) */
  norm: string;
  /** Core tokens after reduction */
  coreTokens: string[];
  /** Source-specific type and format hints */
  type: PrimitiveType;
  format?: string | null;
  /** For debugging */
  meta?: Record<string, any>;
}

export interface MatchReason {
  modelField: string;
  apiField: string;
  jwName: number;
  tokenJaccard: number;
  typeBonus: number;
  dateBias: number;
  synonymsBoost: number;
  finalScore: number;
  typeCompatible: boolean;
  notes: string[];
  tokensCompared: { api: string[]; model: string[] };
}

export interface FieldMatch {
  api: FieldDescriptor;
  model: FieldDescriptor;
  score: number;
  reason: MatchReason;
}

export interface CompareOptions {
  /** 0..1 threshold for semantic step */
  fuzzyThreshold?: number;
  /** Enable AI (GPT-5) hints for token correspondences */
  aiHints?: boolean;
  /** API provider key etc. - optional */
  aiConfig?: {
    provider?: 'openai';
    model?: 'gpt-5-thinking' | string;
    apiKey?: string;
  };
}

export interface CompareResultField {
  field_name: string; // API leaf name (after normalization)
  status: 'matched' | 'unmatched' | 'extra' | 'missing';
  expected_type: string; // model type
  actual_type: string; // api type
  expected_format: string | null;
  actual_format: string | null;
  issue: string;
  suggestion: string;
  confidence: number; // 0..1
  rationale: string; // human-readable reasoning
}

export interface CompareResult {
  api_name: string;
  validation_date: string;
  total_fields_compared: number;
  matched_fields: number;
  unmatched_fields: number;
  extra_fields: number;
  missing_fields: number;
  accuracy_score: number; // matched / (matched + unmatched + missing)
  fields: CompareResultField[];
  matches: Array<{
    api_field: string;
    model_field: string;
    score: number;
    reason: MatchReason;
  }>;
}

/**
 * Wrapper result when comparing an API against multiple DB models.
 */
export interface MultiModelCompareResult {
  success: boolean;
  api_name: string;
  compared_models: CompareResult[]; // results for each chosen model
  total_models: number; // total number of models found in DB
  chosen_count: number; // how many were selected for comparison
  message?: string; // optional error/warning (e.g., "no matching models")
}

/**
 * Response for upload endpoint that can handle both comparison results and informational messages
 */
export interface UploadResponse {
  success: boolean;
  message?: string;
  document_type?: 'openapi' | 'data-model' | 'unknown';
  comparison_result?: CompareResult;
  timestamp: string;
}
