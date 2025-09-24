import { Module } from '@nestjs/common';
import { CacheService } from './cache.service';
import { PerformanceService } from './performance.service';

@Module({
  providers: [CacheService, PerformanceService],
  exports: [CacheService, PerformanceService],
})
export class AppCacheModule {}