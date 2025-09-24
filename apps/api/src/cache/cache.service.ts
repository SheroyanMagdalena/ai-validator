import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { createHash } from 'crypto';
import { CACHE_KEYS, CACHE_TTL } from './cache.config';

@Injectable()
export class CacheService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  /**
   * Generate a cache key based on content hash
   */
  private generateKey(prefix: string, content: any): string {
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    const hash = createHash('md5').update(contentStr).digest('hex').substring(0, 8);
    return `${prefix}:${hash}`;
  }

  /**
   * Cache file content with hash-based key
   */
  async cacheFileContent(content: string, parsedContent: any): Promise<void> {
    const key = this.generateKey(CACHE_KEYS.FILE_CONTENT, content);
    await this.cacheManager.set(key, parsedContent, CACHE_TTL.LONG);
  }

  /**
   * Get cached file content
   */
  async getFileContent(content: string): Promise<any | null> {
    const key = this.generateKey(CACHE_KEYS.FILE_CONTENT, content);
    return await this.cacheManager.get(key);
  }

  /**
   * Cache flattened API structure
   */
  async cacheFlattenedApi(apiDoc: any, flattened: Map<string, any>): Promise<void> {
    const key = this.generateKey(CACHE_KEYS.FLATTENED_API, apiDoc);
    // Convert Map to Object for caching
    const flattenedObj = Object.fromEntries(flattened);
    await this.cacheManager.set(key, flattenedObj, CACHE_TTL.MEDIUM);
  }

  /**
   * Get cached flattened API structure
   */
  async getFlattenedApi(apiDoc: any): Promise<Map<string, any> | null> {
    const key = this.generateKey(CACHE_KEYS.FLATTENED_API, apiDoc);
    const cached = await this.cacheManager.get<Record<string, any>>(key);
    return cached ? new Map(Object.entries(cached)) : null;
  }

  /**
   * Cache flattened model structure
   */
  async cacheFlattenedModel(modelSchema: any, flattened: Map<string, any>): Promise<void> {
    const key = this.generateKey(CACHE_KEYS.FLATTENED_MODEL, modelSchema);
    // Convert Map to Object for caching
    const flattenedObj = Object.fromEntries(flattened);
    await this.cacheManager.set(key, flattenedObj, CACHE_TTL.MEDIUM);
  }

  /**
   * Get cached flattened model structure
   */
  async getFlattenedModel(modelSchema: any): Promise<Map<string, any> | null> {
    const key = this.generateKey(CACHE_KEYS.FLATTENED_MODEL, modelSchema);
    const cached = await this.cacheManager.get<Record<string, any>>(key);
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
    await this.cacheManager.set(key, result, CACHE_TTL.LONG);
  }

  /**
   * Get cached comparison result
   */
  async getComparisonResult(apiDoc: any, modelSchema: any, options: any): Promise<any | null> {
    const key = this.generateKey(CACHE_KEYS.COMPARISON_RESULT, { apiDoc, modelSchema, options });
    return await this.cacheManager.get(key);
  }

  /**
   * Cache normalized field data
   */
  async cacheNormalizedFields(fields: any[], normalizedData: any[]): Promise<void> {
    const key = this.generateKey(CACHE_KEYS.NORMALIZED_FIELDS, fields);
    await this.cacheManager.set(key, normalizedData, CACHE_TTL.VERY_LONG);
  }

  /**
   * Get cached normalized field data
   */
  async getNormalizedFields(fields: any[]): Promise<any[] | null> {
    const key = this.generateKey(CACHE_KEYS.NORMALIZED_FIELDS, fields);
    return await this.cacheManager.get<any[]>(key);
  }

  /**
   * Cache AI hints
   */
  async cacheAiHints(apiFields: any[], modelFields: any[], hints: any): Promise<void> {
    const key = this.generateKey(CACHE_KEYS.AI_HINTS, { apiFields, modelFields });
    await this.cacheManager.set(key, hints, CACHE_TTL.VERY_LONG);
  }

  /**
   * Get cached AI hints
   */
  async getAiHints(apiFields: any[], modelFields: any[]): Promise<any | null> {
    const key = this.generateKey(CACHE_KEYS.AI_HINTS, { apiFields, modelFields });
    return await this.cacheManager.get(key);
  }

  /**
   * Clear all cache entries
   */
  async clearAll(): Promise<void> {
    await this.cacheManager.reset();
  }

  /**
   * Clear cache entries by pattern (if supported by the cache store)
   */
  async clearByPattern(pattern: string): Promise<void> {
    // This depends on the cache store implementation
    // For Redis, we could use KEYS pattern, but it's not efficient
    // For now, we'll just clear all cache
    await this.clearAll();
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ hits: number; misses: number } | null> {
    // This would depend on the cache store implementation
    // For now, return null as not all stores support stats
    return null;
  }
}