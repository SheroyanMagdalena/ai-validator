import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { CACHE_KEYS, CACHE_TTL, getCacheConfig } from './cache.config';

interface CacheEntry {
  value: any;
  expiry: number;
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private cache = new Map<string, CacheEntry>();
  private readonly config = getCacheConfig();

  constructor() {
    // Clean up expired entries every 5 minutes
    setInterval(() => this.cleanupExpired(), 5 * 60 * 1000);
  }

  /**
   * Generate a cache key based on content hash
   */
  private generateKey(prefix: string, content: any): string {
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    const hash = createHash('md5').update(contentStr).digest('hex').substring(0, 8);
    return `${prefix}:${hash}`;
  }

  /**
   * Set cache entry
   */
  private set(key: string, value: any, ttl: number = this.config.ttl): void {
    // Remove oldest entries if at max capacity
    if (this.cache.size >= this.config.max) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      expiry: Date.now() + ttl,
    });
  }

  /**
   * Get cache entry
   */
  private get<T = any>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Clean up expired entries
   */
  private cleanupExpired(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired cache entries`);
    }
  }

  /**
   * Cache file content with hash-based key
   */
  async cacheFileContent(content: string, parsedContent: any): Promise<void> {
    const key = this.generateKey(CACHE_KEYS.FILE_CONTENT, content);
    this.set(key, parsedContent, CACHE_TTL.LONG);
  }

  /**
   * Get cached file content
   */
  async getFileContent(content: string): Promise<any | null> {
    const key = this.generateKey(CACHE_KEYS.FILE_CONTENT, content);
    return this.get(key);
  }

  /**
   * Cache flattened API structure
   */
  async cacheFlattenedApi(apiDoc: any, flattened: Map<string, any>): Promise<void> {
    const key = this.generateKey(CACHE_KEYS.FLATTENED_API, apiDoc);
    const flattenedObj = Object.fromEntries(flattened);
    this.set(key, flattenedObj, CACHE_TTL.MEDIUM);
  }

  /**
   * Get cached flattened API structure
   */
  async getFlattenedApi(apiDoc: any): Promise<Map<string, any> | null> {
    const key = this.generateKey(CACHE_KEYS.FLATTENED_API, apiDoc);
    const cached = this.get<Record<string, any>>(key);
    return cached ? new Map(Object.entries(cached)) : null;
  }

  /**
   * Cache flattened model structure
   */
  async cacheFlattenedModel(modelSchema: any, flattened: Map<string, any>): Promise<void> {
    const key = this.generateKey(CACHE_KEYS.FLATTENED_MODEL, modelSchema);
    const flattenedObj = Object.fromEntries(flattened);
    this.set(key, flattenedObj, CACHE_TTL.MEDIUM);
  }

  /**
   * Get cached flattened model structure
   */
  async getFlattenedModel(modelSchema: any): Promise<Map<string, any> | null> {
    const key = this.generateKey(CACHE_KEYS.FLATTENED_MODEL, modelSchema);
    const cached = this.get<Record<string, any>>(key);
    return cached ? new Map(Object.entries(cached)) : null;
  }

  /**
   * Cache comparison result
   */
  async cacheComparisonResult(
    apiDoc: any, 
    modelSchema: any, 
    options: any, 
    result: any
  ): Promise<void> {
    const key = this.generateKey(CACHE_KEYS.COMPARISON_RESULT, { apiDoc, modelSchema, options });
    this.set(key, result, CACHE_TTL.LONG);
  }

  /**
   * Get cached comparison result
   */
  async getComparisonResult(apiDoc: any, modelSchema: any, options: any): Promise<any | null> {
    const key = this.generateKey(CACHE_KEYS.COMPARISON_RESULT, { apiDoc, modelSchema, options });
    return this.get(key);
  }

  /**
   * Cache normalized field data
   */
  async cacheNormalizedFields(fields: any[], normalizedData: any[]): Promise<void> {
    const key = this.generateKey(CACHE_KEYS.NORMALIZED_FIELDS, fields);
    this.set(key, normalizedData, CACHE_TTL.VERY_LONG);
  }

  /**
   * Get cached normalized field data
   */
  async getNormalizedFields(fields: any[]): Promise<any[] | null> {
    const key = this.generateKey(CACHE_KEYS.NORMALIZED_FIELDS, fields);
    return this.get<any[]>(key);
  }

  /**
   * Cache AI hints
   */
  async cacheAiHints(apiFields: any[], modelFields: any[], hints: any): Promise<void> {
    const key = this.generateKey(CACHE_KEYS.AI_HINTS, { apiFields, modelFields });
    this.set(key, hints, CACHE_TTL.VERY_LONG);
  }

  /**
   * Get cached AI hints
   */
  async getAiHints(apiFields: any[], modelFields: any[]): Promise<any | null> {
    const key = this.generateKey(CACHE_KEYS.AI_HINTS, { apiFields, modelFields });
    return this.get(key);
  }

  /**
   * Clear all cache entries
   */
  async clearAll(): Promise<void> {
    this.cache.clear();
    this.logger.log('All cache entries cleared');
  }

  /**
   * Clear cache entries by pattern
   */
  async clearByPattern(pattern: string): Promise<void> {
    let cleared = 0;
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        cleared++;
      }
    }
    this.logger.log(`Cleared ${cleared} cache entries matching pattern: ${pattern}`);
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ hits: number; misses: number; size: number; maxSize: number } | null> {
    return {
      hits: 0, // Simple implementation doesn't track hits/misses
      misses: 0,
      size: this.cache.size,
      maxSize: this.config.max,
    };
  }
}