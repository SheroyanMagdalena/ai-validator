// src/comparison/comparison.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ComparisonController } from './comparison.controller';
import { ComparisonService } from './comparison.service';

@Module({
  imports: [HttpModule],
  controllers: [ComparisonController],
  providers: [ComparisonService],
})
export class ComparisonModule {}