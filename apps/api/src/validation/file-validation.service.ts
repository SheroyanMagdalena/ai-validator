import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import * as path from 'path';
import * as crypto from 'crypto';

export interface FileValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metadata: {
    originalName: string;
    mimeType: string;
    size: number;
    hash: string;
    extension: string;
  };
}

export interface ValidationConfig {
  maxFileSize: number; // in bytes
  allowedMimeTypes: string[];
  allowedExtensions: string[];
  maxFiles: number;
  requireBothFiles: boolean;
}

@Injectable()
export class FileValidationService {
  private readonly logger = new Logger(FileValidationService.name);

  private readonly defaultConfig: ValidationConfig = {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: [
      'application/json',
      'text/json',
      'text/yaml',
      'text/yml',
      'application/yaml',
      'application/x-yaml',
      'text/plain', // Allow plain text that might be JSON/YAML
    ],
    allowedExtensions: ['.json', '.yaml', '.yml', '.txt'],
    maxFiles: 2,
    requireBothFiles: true,
  };

  /**
   * Validate uploaded files for comparison service
   */
  async validateUploadedFiles(
    files: Array<Express.Multer.File>,
    config: Partial<ValidationConfig> = {}
  ): Promise<{
    apiFile: Express.Multer.File | null;
    modelFile: Express.Multer.File | null;
    validationResults: { [fieldname: string]: FileValidationResult };
  }> {
    const finalConfig = { ...this.defaultConfig, ...config };
    const validationResults: { [fieldname: string]: FileValidationResult } = {};
    
    // Basic file count validation
    if (!files || files.length === 0) {
      throw new BadRequestException('No files uploaded. Please upload both API and model files.');
    }

    if (files.length > finalConfig.maxFiles) {
      throw new BadRequestException(`Too many files. Maximum allowed: ${finalConfig.maxFiles}`);
    }

    // Validate each file
    for (const file of files) {
      validationResults[file.fieldname] = await this.validateSingleFile(file, finalConfig);
    }

    // Find API and model files
    const apiFile = this.findFileByFieldname(files, ['api', 'apiFile', 'apiDoc', 'openapi']);
    const modelFile = this.findFileByFieldname(files, ['model', 'modelFile', 'modelSchema', 'schema']);

    // Check if both required files are present
    if (finalConfig.requireBothFiles) {
      if (!apiFile) {
        throw new BadRequestException('API file not found. Please upload a file with fieldname "api", "apiFile", or "apiDoc"');
      }
      if (!modelFile) {
        throw new BadRequestException('Model file not found. Please upload a file with fieldname "model", "modelFile", or "modelSchema"');
      }
    }

    // Check validation results for errors
    const hasErrors = Object.values(validationResults).some(result => !result.isValid);
    if (hasErrors) {
      const allErrors = Object.entries(validationResults)
        .filter(([, result]) => !result.isValid)
        .map(([fieldname, result]) => `${fieldname}: ${result.errors.join(', ')}`)
        .join('; ');
      throw new BadRequestException(`File validation failed: ${allErrors}`);
    }

    this.logger.log(`Successfully validated ${files.length} files`);

    return {
      apiFile,
      modelFile,
      validationResults,
    };
  }

  /**
   * Validate a single file
   */
  private async validateSingleFile(
    file: Express.Multer.File,
    config: ValidationConfig
  ): Promise<FileValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic file properties validation
    if (!file.originalname) {
      errors.push('File name is required');
    }

    if (!file.buffer || file.buffer.length === 0) {
      errors.push('File is empty');
    }

    // File size validation
    if (file.size > config.maxFileSize) {
      errors.push(`File size (${this.formatFileSize(file.size)}) exceeds maximum allowed size (${this.formatFileSize(config.maxFileSize)})`);
    }

    // File extension validation
    const extension = path.extname(file.originalname).toLowerCase();
    if (!config.allowedExtensions.includes(extension)) {
      errors.push(`File extension "${extension}" is not allowed. Allowed extensions: ${config.allowedExtensions.join(', ')}`);
    }

    // MIME type validation
    const mimeType = file.mimetype || this.detectMimeType(file.originalname);
    if (!config.allowedMimeTypes.includes(mimeType)) {
      // Allow text/plain if it might contain JSON/YAML
      if (mimeType === 'text/plain' && this.mightBeStructuredData(file.buffer)) {
        warnings.push('File detected as plain text but appears to contain structured data');
      } else {
        errors.push(`MIME type "${mimeType}" is not allowed. Allowed types: ${config.allowedMimeTypes.join(', ')}`);
      }
    }

    // Content validation
    try {
      await this.validateFileContent(file.buffer, extension);
    } catch (error) {
      errors.push(`Content validation failed: ${error.message}`);
    }

    // Security validation
    const securityIssues = this.performSecurityChecks(file.buffer, file.originalname);
    errors.push(...securityIssues);

    // Generate file hash for caching and deduplication
    const hash = crypto.createHash('md5').update(file.buffer).digest('hex');

    const result: FileValidationResult = {
      isValid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        originalName: file.originalname,
        mimeType,
        size: file.size,
        hash,
        extension,
      },
    };

    if (warnings.length > 0) {
      this.logger.warn(`File validation warnings for ${file.originalname}: ${warnings.join(', ')}`);
    }

    return result;
  }

  /**
   * Validate file content structure
   */
  private async validateFileContent(buffer: Buffer, extension: string): Promise<void> {
    const content = buffer.toString('utf-8');

    // Check for null bytes (potential binary file)
    if (content.includes('\0')) {
      throw new Error('File appears to be binary, not text');
    }

    // Check file size vs content size (potential encoding issues)
    if (buffer.length !== Buffer.byteLength(content, 'utf-8')) {
      throw new Error('File encoding issues detected');
    }

    // Validate based on extension
    if (extension === '.json' || this.looksLikeJson(content)) {
      await this.validateJsonContent(content);
    } else if (['.yaml', '.yml'].includes(extension) || this.looksLikeYaml(content)) {
      await this.validateYamlContent(content);
    }

    // Check for reasonable structure depth
    try {
      const parsed = JSON.parse(content);
      this.validateObjectDepth(parsed, 0, 20); // Max depth of 20
    } catch (error) {
      // If it's not JSON, try YAML
      try {
        const yaml = require('js-yaml');
        const parsed = yaml.load(content);
        if (typeof parsed === 'object' && parsed !== null) {
          this.validateObjectDepth(parsed, 0, 20);
        }
      } catch (yamlError) {
        throw new Error('File is neither valid JSON nor YAML');
      }
    }
  }

  /**
   * Validate JSON content
   */
  private async validateJsonContent(content: string): Promise<void> {
    try {
      const parsed = JSON.parse(content);
      
      if (parsed === null || parsed === undefined) {
        throw new Error('JSON content is null or undefined');
      }

      if (typeof parsed !== 'object') {
        throw new Error('JSON content must be an object or array');
      }

      // Check for empty objects/arrays
      if (Array.isArray(parsed) && parsed.length === 0) {
        throw new Error('JSON array is empty');
      }

      if (typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length === 0) {
        throw new Error('JSON object is empty');
      }

    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON syntax: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Validate YAML content
   */
  private async validateYamlContent(content: string): Promise<void> {
    try {
      const yaml = require('js-yaml');
      const parsed = yaml.load(content, { 
        schema: yaml.JSON_SCHEMA,
        json: true 
      });

      if (parsed === null || parsed === undefined) {
        throw new Error('YAML content is null or undefined');
      }

      if (typeof parsed !== 'object') {
        throw new Error('YAML content must be an object or array');
      }

    } catch (error) {
      throw new Error(`Invalid YAML syntax: ${error.message}`);
    }
  }

  /**
   * Perform basic security checks
   */
  private performSecurityChecks(buffer: Buffer, filename: string): string[] {
    const errors: string[] = [];
    const content = buffer.toString('utf-8');

    // Check for potentially dangerous patterns
    const dangerousPatterns = [
      /javascript:/gi,
      /data:text\/html/gi,
      /vbscript:/gi,
      /<script[^>]*>/gi,
      /eval\s*\(/gi,
      /Function\s*\(/gi,
      /setTimeout\s*\(/gi,
      /setInterval\s*\(/gi,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(content)) {
        errors.push(`Potentially dangerous content detected: ${pattern.source}`);
      }
    }

    // Check filename for dangerous characters
    const dangerousChars = /[<>:"|?*\x00-\x1f]/;
    if (dangerousChars.test(filename)) {
      errors.push('Filename contains potentially dangerous characters');
    }

    // Check for excessively long strings (potential DoS)
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length > 10000) {
        errors.push(`Line ${i + 1} is excessively long (potential DoS attack)`);
        break;
      }
    }

    // Check for deeply nested structures (potential DoS)
    const openBrackets = (content.match(/[{\[]/g) || []).length;
    if (openBrackets > 1000) {
      errors.push('File contains excessive nesting (potential DoS attack)');
    }

    return errors;
  }

  /**
   * Helper methods
   */
  private findFileByFieldname(files: Express.Multer.File[], fieldnames: string[]): Express.Multer.File | null {
    for (const fieldname of fieldnames) {
      const file = files.find(f => f.fieldname.toLowerCase() === fieldname.toLowerCase());
      if (file) return file;
    }
    return null;
  }

  private detectMimeType(filename: string): string {
    const extension = path.extname(filename).toLowerCase();
    switch (extension) {
      case '.json': return 'application/json';
      case '.yaml':
      case '.yml': return 'application/yaml';
      default: return 'text/plain';
    }
  }

  private mightBeStructuredData(buffer: Buffer): boolean {
    const content = buffer.toString('utf-8', 0, Math.min(1000, buffer.length));
    return this.looksLikeJson(content) || this.looksLikeYaml(content);
  }

  private looksLikeJson(content: string): boolean {
    const trimmed = content.trim();
    return (trimmed.startsWith('{') && trimmed.endsWith('}')) || 
           (trimmed.startsWith('[') && trimmed.endsWith(']'));
  }

  private looksLikeYaml(content: string): boolean {
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    return lines.some(line => /^\s*\w+\s*:\s*.+/.test(line));
  }

  private validateObjectDepth(obj: any, currentDepth: number, maxDepth: number): void {
    if (currentDepth > maxDepth) {
      throw new Error(`Object nesting too deep (max: ${maxDepth})`);
    }

    if (typeof obj === 'object' && obj !== null) {
      if (Array.isArray(obj)) {
        for (const item of obj) {
          this.validateObjectDepth(item, currentDepth + 1, maxDepth);
        }
      } else {
        for (const value of Object.values(obj)) {
          this.validateObjectDepth(value, currentDepth + 1, maxDepth);
        }
      }
    }
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}