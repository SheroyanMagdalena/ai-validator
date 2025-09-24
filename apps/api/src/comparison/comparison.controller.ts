import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Post,
  UploadedFiles,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { ComparisonService } from './comparison.service';
import { CompareOptions } from './types';
import { CacheService } from '../cache/cache.service';
import { PerformanceService } from '../cache/performance.service';
import { FileValidationService } from '../validation/file-validation.service';
import { FileUploadInterceptor } from '../validation/file-upload.interceptor';
import { SanitizationService } from '../validation/sanitization.service';
import { CompareOptionsDto, FileUploadDto } from '../validation/validation.dto';
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
  @UseInterceptors(AnyFilesInterceptor(), FileUploadInterceptor)
  @UsePipes(new ValidationPipe({ transform: true }))
  async upload(
    @UploadedFiles() files: Array<Express.Multer.File>, 
    @Body() body: FileUploadDto
  ) {
    const { apiDoc, modelDoc, options } = await this.parseAndValidateUpload(files, body);
    return this.service.compare(apiDoc, modelDoc, options);
  }

  @Post('upload/validate')
  @UseInterceptors(AnyFilesInterceptor())
  async validateFiles(@UploadedFiles() files: Array<Express.Multer.File>) {
    const validationResult = await this.fileValidationService.validateUploadedFiles(files);
    
    return {
      success: true,
      message: 'Files validated successfully',
      files: {
        api: validationResult.validationResults[validationResult.apiFile?.fieldname || ''],
        model: validationResult.validationResults[validationResult.modelFile?.fieldname || ''],
      },
      timestamp: new Date().toISOString(),
    };
  }

  // ========== helpers ==========

  private async parseAndValidateUpload(files: Array<Express.Multer.File>, body: FileUploadDto): Promise<{
    apiDoc: any; modelDoc: any; options: CompareOptions;
  }> {
    // Validate files first
    const validationResult = await this.fileValidationService.validateUploadedFiles(files);
    
    if (!validationResult.apiFile) {
      throw new BadRequestException('Missing API file field');
    }
    if (!validationResult.modelFile) {
      throw new BadRequestException('Missing model file field');
    }

    // Parse and sanitize file contents
    const apiDoc = this.parseAndSanitizeFile(validationResult.apiFile, 'API');
    const modelDoc = this.parseAndSanitizeFile(validationResult.modelFile, 'Model');

    // Parse options
    let options: CompareOptions = {};
    if (body.options) {
      options = {
        fuzzyThreshold: body.options.fuzzyThreshold,
        aiHints: body.options.aiHints,
        aiConfig: body.options.aiConfig,
      };
    }

    return { apiDoc, modelDoc, options };
  }

  private parseAndSanitizeFile(file: Express.Multer.File, label: string): any {
    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException(`${label} file is empty`);
    }

    let content = file.buffer.toString('utf8');
    content = this.sanitizationService.sanitizeContent(content);

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      try {
        parsed = yaml.load(content, { 
          schema: yaml.JSON_SCHEMA,
          json: true 
        });
      } catch (yamlError) {
        throw new BadRequestException(`${label} file must be valid JSON or YAML`);
      }
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new BadRequestException(`${label} file must contain a valid object or array`);
    }

    // Sanitize the parsed content
    return this.sanitizationService.sanitizeJson(parsed);
  }

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
