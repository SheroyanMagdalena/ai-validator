import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SanitizationService {
  private readonly logger = new Logger(SanitizationService.name);

  /**
   * Sanitize JSON content by removing potentially dangerous properties
   */
  sanitizeJson(obj: any, depth: number = 0, maxDepth: number = 20): any {
    if (depth > maxDepth) {
      this.logger.warn(`Object depth limit reached (${maxDepth}), truncating`);
      return '[TRUNCATED - TOO DEEP]';
    }

    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }

    if (typeof obj === 'number' || typeof obj === 'boolean') {
      return obj;
    }

    if (Array.isArray(obj)) {
      // Limit array size to prevent DoS
      if (obj.length > 10000) {
        this.logger.warn(`Array size limit exceeded (${obj.length}), truncating to 10000`);
        obj = obj.slice(0, 10000);
      }
      return obj.map(item => this.sanitizeJson(item, depth + 1, maxDepth));
    }

    if (typeof obj === 'object') {
      const sanitized: any = {};
      const keys = Object.keys(obj);

      // Limit object properties to prevent DoS
      if (keys.length > 1000) {
        this.logger.warn(`Object property limit exceeded (${keys.length}), truncating to 1000`);
        keys.splice(1000);
      }

      for (const key of keys) {
        const sanitizedKey = this.sanitizeObjectKey(key);
        if (sanitizedKey && !this.isDangerousProperty(sanitizedKey)) {
          sanitized[sanitizedKey] = this.sanitizeJson(obj[key], depth + 1, maxDepth);
        }
      }

      return sanitized;
    }

    return obj;
  }

  /**
   * Sanitize string content
   */
  private sanitizeString(str: string): string {
    if (typeof str !== 'string') {
      return str;
    }

    // Limit string length to prevent DoS
    if (str.length > 50000) {
      this.logger.warn(`String length limit exceeded (${str.length}), truncating to 50000`);
      str = str.substring(0, 50000) + '[TRUNCATED]';
    }

    // Remove control characters except newlines and tabs
    str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '');

    // Remove potential script injections (basic)
    str = str.replace(/<script[^>]*>.*?<\/script>/gis, '[SCRIPT_REMOVED]');
    str = str.replace(/javascript:/gi, 'javascript-removed:');
    str = str.replace(/vbscript:/gi, 'vbscript-removed:');
    str = str.replace(/data:text\/html/gi, 'data-text-html-removed');

    // Remove excessive whitespace
    str = str.replace(/\s{100,}/g, ' [EXCESSIVE_WHITESPACE_REMOVED] ');

    return str;
  }

  /**
   * Sanitize object keys
   */
  private sanitizeObjectKey(key: string): string | null {
    if (typeof key !== 'string') {
      return null;
    }

    // Limit key length
    if (key.length > 500) {
      this.logger.warn(`Object key too long (${key.length}), truncating`);
      key = key.substring(0, 500);
    }

    // Remove dangerous characters from keys
    key = key.replace(/[<>:"|?*\x00-\x1f]/g, '');

    // Don't allow empty keys after sanitization
    if (key.trim().length === 0) {
      return null;
    }

    return key;
  }

  /**
   * Check if property name is potentially dangerous
   */
  private isDangerousProperty(propertyName: string): boolean {
    const dangerousProps = [
      '__proto__',
      'constructor',
      'prototype',
      'eval',
      'function',
      'script',
    ];

    return dangerousProps.some(dangerous => 
      propertyName.toLowerCase().includes(dangerous.toLowerCase())
    );
  }

  /**
   * Validate and sanitize file metadata
   */
  sanitizeFileMetadata(metadata: any): any {
    return {
      originalName: this.sanitizeString(metadata.originalName || 'unknown'),
      mimeType: this.sanitizeString(metadata.mimeType || 'application/octet-stream'),
      size: typeof metadata.size === 'number' ? metadata.size : 0,
      hash: this.sanitizeString(metadata.hash || ''),
      extension: this.sanitizeString(metadata.extension || ''),
    };
  }

  /**
   * Remove BOM (Byte Order Mark) from content
   */
  removeBOM(content: string): string {
    if (content.charCodeAt(0) === 0xFEFF) {
      return content.slice(1);
    }
    return content;
  }

  /**
   * Normalize line endings
   */
  normalizeLineEndings(content: string): string {
    return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  /**
   * Comprehensive content sanitization
   */
  sanitizeContent(content: string): string {
    content = this.removeBOM(content);
    content = this.normalizeLineEndings(content);
    return this.sanitizeString(content);
  }
}