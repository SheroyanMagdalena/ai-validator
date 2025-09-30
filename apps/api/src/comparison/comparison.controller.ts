import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ComparisonService } from './comparison.service';
import { CompareOptions, MultiModelCompareResult, CompareResult } from './types';
import { CacheService } from '../cache/cache.service';
import { PerformanceService } from '../cache/performance.service';
import { FileValidationService } from '../validation/file-validation.service';
import { FileUploadInterceptor } from '../validation/file-upload.interceptor';
import { SanitizationService } from '../validation/sanitization.service';
import { FileUploadDto } from '../validation/validation.dto';
import * as yaml from 'js-yaml';

function parseTextToObject(buf: Buffer, label: string): any {
  if (!buf || buf.length === 0)
    throw new BadRequestException(`${label} file is empty`);
  const text = buf.toString('utf8').trim();
  try {
    return JSON.parse(text);
  } catch {
    /* try YAML */
  }
  try {
    const obj = yaml.load(text);
    if (obj && typeof obj === 'object') return obj as any;
  } catch {
    /* fallthrough */
  }
  throw new BadRequestException(`${label} must be valid JSON or YAML`);
}

@Controller('comparison')
export class ComparisonController {
  constructor(
    private readonly service: ComparisonService,
    private readonly cacheService: CacheService,
    private readonly performanceService: PerformanceService,
    private readonly fileValidationService: FileValidationService,
    private readonly sanitizationService: SanitizationService,
  ) {}

  @Get('health')
  health() {
    return { ok: true, service: 'comparison', ts: new Date().toISOString() };
  }

  @Get('cache/stats')
  async getCacheStats() {
    const stats = await this.cacheService.getStats();
    return {
      stats: stats || { message: 'Cache statistics not available' },
      timestamp: new Date().toISOString(),
    };
  }

  @Delete('cache')
  async clearCache() {
    await this.cacheService.clearAll();
    return {
      message: 'Cache cleared successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('performance/metrics')
  async getPerformanceMetrics() {
    const metrics = this.performanceService.getMetrics();
    return {
      ...metrics,
      cacheHitRate: this.performanceService.getCacheHitRate(),
    };
  }

  @Post('performance/reset')
  async resetPerformanceMetrics() {
    this.performanceService.reset();
    return {
      message: 'Performance metrics reset successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('performance/summary')
  async getPerformanceSummary() {
    this.performanceService.logSummary();
    return {
      message: 'Performance summary logged to console',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * New main endpoint:
   * Upload one API file → compare against models from DB
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @UsePipes(new ValidationPipe({ transform: true }))
  async uploadAndCompare(
    @UploadedFile() apiFile: Express.Multer.File,
    @Body() body: FileUploadDto,
  ): Promise<CompareResult> {
    if (!apiFile) {
      throw new BadRequestException('Missing API file');
    }

    // Parse API file
    let content = apiFile.buffer.toString('utf8');
    content = this.sanitizationService.sanitizeContent(content);

    let apiDoc: any;
    try {
      apiDoc = JSON.parse(content);
    } catch {
      try {
        apiDoc = yaml.load(content, { schema: yaml.JSON_SCHEMA, json: true });
      } catch (yamlError) {
        throw new BadRequestException('API file must be valid JSON or YAML');
      }
    }

    if (!apiDoc || typeof apiDoc !== 'object') {
      throw new BadRequestException(
        'API file must contain a valid object or array',
      );
    }

    apiDoc = this.sanitizationService.sanitizeJson(apiDoc);

    // Parse options (optional)
    let options: CompareOptions = {};
    if (body.options) {
      options = {
        fuzzyThreshold: body.options.fuzzyThreshold,
        aiHints: body.options.aiHints,
        aiConfig: body.options.aiConfig,
      };
    }

    return this.service.compare(apiDoc, options);
  }
}
