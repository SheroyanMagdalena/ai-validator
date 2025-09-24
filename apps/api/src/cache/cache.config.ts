export interface CacheConfig {
  ttl: number; // Time to live in milliseconds
  max: number; // Maximum number of items
}

export const getCacheConfig = (): CacheConfig => {
  return {
    ttl: 30 * 60 * 1000, // 30 minutes default TTL
    max: 1000, // Maximum number of items in cache
  };
};

export const CACHE_KEYS = {
  FILE_CONTENT: 'file_content',
  FLATTENED_API: 'flattened_api',
  FLATTENED_MODEL: 'flattened_model',
  COMPARISON_RESULT: 'comparison_result',
  NORMALIZED_FIELDS: 'normalized_fields',
  AI_HINTS: 'ai_hints',
} as const;

export const CACHE_TTL = {
  SHORT: 5 * 60 * 1000,     // 5 minutes
  MEDIUM: 15 * 60 * 1000,   // 15 minutes
  LONG: 60 * 60 * 1000,     // 1 hour
  VERY_LONG: 24 * 60 * 60 * 1000, // 24 hours
} as const;