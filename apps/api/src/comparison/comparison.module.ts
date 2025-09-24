import { Module } from '@nestjs/common';
import { ComparisonController } from './comparison.controller';
import { ComparisonService } from './comparison.service';
import { AppCacheModule } from '../cache/cache.module';
import { ValidationModule } from '../validation/validation.module';

@Module({
  imports: [AppCacheModule, ValidationModule],
  controllers: [ComparisonController],
  providers: [ComparisonService],
  exports: [ComparisonService],
})
export class ComparisonModule {}
