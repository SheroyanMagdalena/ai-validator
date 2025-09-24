import { CacheModuleOptions } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';

export const getCacheConfig = async (): Promise<CacheModuleOptions> => {
  const isProduction = process.env.NODE_ENV === 'production';
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  if (isProduction) {
    // Use Redis in production
    return {
      store: await redisStore({
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
        },
        password: process.env.REDIS_PASSWORD,
        database: parseInt(process.env.REDIS_DATABASE || '0'),
      }),
      ttl: 30 * 60 * 1000, // 30 minutes default TTL
      max: 1000, // Maximum number of items in cache
    };
  } else {
    // Use in-memory cache for development
    return {
      ttl: 15 * 60 * 1000, // 15 minutes for development
      max: 100, // Smaller cache for development
    };
  }
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