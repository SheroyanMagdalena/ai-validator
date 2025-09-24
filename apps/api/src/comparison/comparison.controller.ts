import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { ComparisonService } from './comparison.service';
import { CompareOptions } from './types';
import { CacheService } from '../cache/cache.service';
import { PerformanceService } from '../cache/performance.service';
import * as yaml from 'js-yaml';

/** Simple DTO (kept lean for copy-paste) */
class CompareRequestDto {
  apiDoc!: unknown;
  modelSchema!: unknown;
  options?: CompareOptions;
}

function ensureObject<T = any>(v: unknown, label: string): T {
  if (v && typeof v === 'object') return v as T;
  throw new BadRequestException(`${label} must be an object/array`);
}

function parseTextToObject(buf: Buffer, label: string): any {
  if (!buf || buf.length === 0) throw new BadRequestException(`${label} file is empty`);
  const text = buf.toString('utf8').trim();
  try { return JSON.parse(text); } catch {/* try YAML */}
  try {
    const obj = yaml.load(text);
    if (obj && typeof obj === 'object') return obj as any;
  } catch {/* fallthrough */}
  throw new BadRequestException(`${label} must be valid JSON or YAML`);
}

@Controller('comparison')
export class ComparisonController {
  constructor(
    private readonly service: ComparisonService,
    private readonly cacheService: CacheService,
    private readonly performanceService: PerformanceService,
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
  @Post('compare')
  async compare(@Body() body: CompareRequestDto) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Body must be a JSON object');
    }
    const apiDoc = ensureObject<any>(body.apiDoc, 'apiDoc');
    const modelSchema = ensureObject<any>(body.modelSchema, 'modelSchema');
    const options: CompareOptions = body.options ?? {};
    return this.service.compare(apiDoc, modelSchema, options);
  }
  @Post('compare/files')
  @UseInterceptors(AnyFilesInterceptor())
  async compareFiles(@UploadedFiles() files: Array<Express.Multer.File>, @Body() body: any) {
    const { apiDoc, modelSchema, options } = this.parseUpload(files, body);
    return this.service.compare(apiDoc, modelSchema, options);
  }
  @Post('upload')
  @UseInterceptors(AnyFilesInterceptor())
  async upload(@UploadedFiles() files: Array<Express.Multer.File>, @Body() body: any) {
    const { apiDoc, modelSchema, options } = this.parseUpload(files, body);
    return this.service.compare(apiDoc, modelSchema, options);
  }

  // ========== helpers ==========

  private parseUpload(files: Array<Express.Multer.File>, body: any): {
    apiDoc: any; modelSchema: any; options: CompareOptions;
  } {
    if (!Array.isArray(files) || files.length === 0) {
      throw new BadRequestException('Upload two files: "api" and "model"');
    }
    // Support both exact names and some common alternates
    const apiFile =
      files.find(f => f.fieldname === 'api') ||
      files.find(f => /api/i.test(f.fieldname));
    const modelFile =
      files.find(f => f.fieldname === 'model') ||
      files.find(f => /model/i.test(f.fieldname));

    if (!apiFile) throw new BadRequestException('Missing file field "api"');
    if (!modelFile) throw new BadRequestException('Missing file field "model"');

    const apiDoc = parseTextToObject(apiFile.buffer, 'api');
    const modelSchema = parseTextToObject(modelFile.buffer, 'model');

    let options: CompareOptions = {};
    const optRaw = body?.options;
    if (typeof optRaw === 'string' && optRaw.trim().length) {
      try { options = JSON.parse(optRaw); }
      catch { throw new BadRequestException('options must be a JSON string'); }
    }
    return { apiDoc, modelSchema, options };
  }
}
