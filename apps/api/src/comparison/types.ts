export type PrimitiveType =
  | 'string'
  | 'integer'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'unknown';

export type MatchKind = 'exact' | 'containment' | 'fuzzy';

export interface FieldDescriptor {
  path: string;
  leaf: string;
  norm: string;
  coreTokens: string[];
  type: PrimitiveType;
  format?: string | null;
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
  kind?: MatchKind; 
}

export interface CompareOptions {
  /** 0..1 threshold for semantic step */
  fuzzyThreshold?: number;
  /** Enable AI (GPT-5) hints for token correspondences */
  aiHints?: boolean;
  aiConfig?: {
    provider?: 'openai';
    model?: 'gpt-5-thinking' | string;
    apiKey?: string;
  };
}

export interface CompareResultField {
  field_name: string;
  status: 'matched' | 'extra' | 'missing';
  api_path?: string | null;
  model_path?: string | null;
  resolution?: MatchKind | null;
  expected_type: string;
  actual_type: string;
  expected_format: string | null;
  actual_format: string | null;
  issue: string;
  suggestion: string;
  confidence: number; 
  rationale: string; 
}


export interface CompareResult {
  api_name: string;
  model_id?: string | null;
  model_title?: string | null;
  model_system_code?: string | null;
  validation_date: string;
  total_fields_compared: number;
  matched_fields: number;
  unmatched_fields: number;
  extra_fields: number;
  missing_fields: number;
  accuracy_score: number;
  fields: CompareResultField[];
  matches: Array<{
    api_field: string;
    model_field: string;
    score: number;
    reason: MatchReason;
    match_type?: MatchKind;
    
  }>;
   models_compared_count?: number;
  models_compared?: Array<{
    id?: string | null;
    title?: string | null;
    level?: 'HIGH' | 'HM' | 'legacy' | 'all';
    accuracy_score?: number; 
  }>;
}

/**
 * Wrapper result when comparing an API against multiple DB models.
 */
export interface MultiModelCompareResult {
  success: boolean;
  api_name: string;
  compared_models: CompareResult[]; 
  total_models: number; 
  chosen_count: number; 
  message?: string; 
}
