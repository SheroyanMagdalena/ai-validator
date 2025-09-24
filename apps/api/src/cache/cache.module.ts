import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';
import { PerformanceService } from './performance.service';
import { getCacheConfig } from './cache.config';

@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        return getCacheConfig();
      },
      inject: [ConfigService],
      isGlobal: true,
    }),
  ],
  providers: [CacheService, PerformanceService],
  exports: [CacheService, PerformanceService],
})
export class AppCacheModule {}