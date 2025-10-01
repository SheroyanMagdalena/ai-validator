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
import { CompareOptions, MultiModelCompareResult, CompareResult, UploadResponse } from './types';
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

/**
 * Detect if the uploaded document is a data model (JSON Schema) vs OpenAPI specification
 */
function detectDocumentType(doc: any): 'data-model' | 'openapi' | 'unknown' {
  if (!doc || typeof doc !== 'object') {
    return 'unknown';
  }

  // Check for OpenAPI indicators
  const hasOpenApiStructure = !!(
    doc.openapi ||                          // OpenAPI 3.x version field
    doc.swagger ||                          // Swagger 2.x version field
    doc.paths ||                            // API paths
    doc.info ||                             // API info
    (doc.components && doc.components.schemas) // OpenAPI components
  );

  // Check for JSON Schema indicators
  const hasJsonSchemaStructure = !!(
    doc.$schema ||                          // JSON Schema version
    (doc.type === 'object' && doc.properties) || // Object with properties
    doc.definitions ||                      // Schema definitions
    (doc.title && doc.type && !doc.paths)  // Schema with title/type but no paths
  );

  // If it has OpenAPI structure, it's an API spec
  if (hasOpenApiStructure && !hasJsonSchemaStructure) {
    return 'openapi';
  }

  // If it has JSON Schema structure but no OpenAPI structure, it's a data model
  if (hasJsonSchemaStructure && !hasOpenApiStructure) {
    return 'data-model';
  }

  // If it has both or neither, try to determine based on content
  if (doc.paths || doc.info?.title || doc.openapi || doc.swagger) {
    return 'openapi';
  }

  if (doc.type === 'object' || doc.$schema || doc.definitions) {
    return 'data-model';
  }

  return 'unknown';
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
  ): Promise<CompareResult | UploadResponse> {
    if (!apiFile) {
      return {
        success: false,
        document_type: 'unknown',
        message: 'No file uploaded: Please select a file to upload. The system expects an OpenAPI/Swagger specification in JSON or YAML format.',
        timestamp: new Date().toISOString(),
      };
    }

    // Check file extension and MIME type
    const allowedExtensions = ['.json', '.yaml', '.yml', '.txt'];
    const allowedMimeTypes = [
      'application/json',
      'text/json',
      'text/yaml',
      'text/yml',
      'application/yaml',
      'application/x-yaml',
      'text/plain',
    ];

    const fileExtension = apiFile.originalname ? 
      apiFile.originalname.toLowerCase().substring(apiFile.originalname.lastIndexOf('.')) : '';
    
    if (fileExtension && !allowedExtensions.includes(fileExtension)) {
      return {
        success: false,
        document_type: 'unknown',
        message: `Invalid file format: The file extension "${fileExtension}" is not supported. Please upload a file with one of these extensions: ${allowedExtensions.join(', ')}. The system expects JSON or YAML format files containing OpenAPI specifications.`,
        timestamp: new Date().toISOString(),
      };
    }

    if (apiFile.mimetype && !allowedMimeTypes.includes(apiFile.mimetype)) {
      return {
        success: false,
        document_type: 'unknown',
        message: `Unsupported file type: The file type "${apiFile.mimetype}" is not supported. Please upload a JSON or YAML file. Supported types include: application/json, text/yaml, application/yaml.`,
        timestamp: new Date().toISOString(),
      };
    }

    // Parse uploaded file
    let content: string;
    try {
      content = apiFile.buffer.toString('utf8');
      content = this.sanitizationService.sanitizeContent(content);
    } catch (encodingError) {
      return {
        success: false,
        document_type: 'unknown',
        message: 'File encoding error: Unable to read the file content. Please ensure the file is saved in UTF-8 encoding and contains valid text content.',
        timestamp: new Date().toISOString(),
      };
    }

    if (!content || content.trim().length === 0) {
      return {
        success: false,
        document_type: 'unknown',
        message: 'Empty file: The uploaded file appears to be empty. Please upload a file containing a valid OpenAPI specification in JSON or YAML format.',
        timestamp: new Date().toISOString(),
      };
    }

    let uploadedDoc: any;
    try {
      uploadedDoc = JSON.parse(content);
    } catch (jsonError) {
      try {
        uploadedDoc = yaml.load(content, { schema: yaml.JSON_SCHEMA, json: true });
      } catch (yamlError) {
        return {
          success: false,
          document_type: 'unknown',
          message: 'Invalid file format: The file content is not valid JSON or YAML. Please check your file syntax and ensure it contains properly formatted JSON or YAML content. Common issues include missing quotes, trailing commas, or incorrect indentation.',
          timestamp: new Date().toISOString(),
        };
      }
    }

    if (!uploadedDoc || typeof uploadedDoc !== 'object') {
      return {
        success: false,
        document_type: 'unknown',
        message: 'Invalid content structure: The file must contain a valid JSON object or YAML document. Simple strings, numbers, or arrays at the root level are not supported. Please ensure your file contains a structured object with properties.',
        timestamp: new Date().toISOString(),
      };
    }

    uploadedDoc = this.sanitizationService.sanitizeJson(uploadedDoc);

    // Detect document type
    const docType = detectDocumentType(uploadedDoc);

    if (docType === 'data-model') {
      return {
        success: false,
        document_type: 'data-model',
        message: 'Data model detected: The uploaded file appears to be a data model (JSON Schema) rather than an API specification. This endpoint is designed to compare OpenAPI/Swagger specifications against data models stored in the database. To proceed, please upload an OpenAPI specification file that describes API endpoints, request/response schemas, and other API documentation.',
        timestamp: new Date().toISOString(),
      };
    }

    if (docType === 'unknown') {
      return {
        success: false,
        document_type: 'unknown',
        message: 'Unrecognized format: The uploaded file does not appear to be a valid OpenAPI specification or data model. Please ensure your file contains proper OpenAPI/Swagger structure with paths, info, and other API specification elements.',
        timestamp: new Date().toISOString(),
      };
    }

    // If we get here, it should be an OpenAPI spec - return the original CompareResult format
    const apiDoc = uploadedDoc;

    // Parse options (optional)
    let options: CompareOptions = {};
    if (body.options) {
      options = {
        fuzzyThreshold: body.options.fuzzyThreshold,
        aiHints: body.options.aiHints,
        aiConfig: body.options.aiConfig,
      };
    }

    // Return the comparison result directly (preserving original API contract)
    return this.service.compare(apiDoc, options);
  }
}
