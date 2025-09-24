import { Test, TestingModule } from '@nestjs/testing';
import { FileValidationService } from './file-validation.service';

describe('FileValidationService', () => {
  let service: FileValidationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FileValidationService],
    }).compile();

    service = module.get<FileValidationService>(FileValidationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateUploadedFiles', () => {
    it('should validate JSON files successfully', async () => {
      const mockApiFile: Express.Multer.File = {
        fieldname: 'api',
        originalname: 'test-api.json',
        encoding: '7bit',
        mimetype: 'application/json',
        buffer: Buffer.from(JSON.stringify({ users: [{ id: 1, name: 'John' }] })),
        size: 100,
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      const mockModelFile: Express.Multer.File = {
        fieldname: 'model',
        originalname: 'test-model.json',
        encoding: '7bit',
        mimetype: 'application/json',
        buffer: Buffer.from(JSON.stringify({ type: 'object', properties: { id: { type: 'number' } } })),
        size: 80,
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      const result = await service.validateUploadedFiles([mockApiFile, mockModelFile]);

      expect(result.apiFile).toBeDefined();
      expect(result.modelFile).toBeDefined();
      expect(result.validationResults['api'].isValid).toBe(true);
      expect(result.validationResults['model'].isValid).toBe(true);
    });

    it('should reject files that are too large', async () => {
      const largeContent = 'x'.repeat(11 * 1024 * 1024); // 11MB
      const mockFile: Express.Multer.File = {
        fieldname: 'api',
        originalname: 'large-file.json',
        encoding: '7bit',
        mimetype: 'application/json',
        buffer: Buffer.from(largeContent),
        size: largeContent.length,
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      await expect(service.validateUploadedFiles([mockFile])).rejects.toThrow();
    });

    it('should reject files with dangerous content', async () => {
      const maliciousContent = JSON.stringify({
        data: '<script>alert("xss")</script>',
        url: 'javascript:alert("xss")'
      });

      const mockFile: Express.Multer.File = {
        fieldname: 'api',
        originalname: 'malicious.json',
        encoding: '7bit',
        mimetype: 'application/json',
        buffer: Buffer.from(maliciousContent),
        size: maliciousContent.length,
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      await expect(service.validateUploadedFiles([mockFile])).rejects.toThrow();
    });

    it('should reject invalid JSON files', async () => {
      const invalidJson = '{ invalid json content';
      const mockFile: Express.Multer.File = {
        fieldname: 'api',
        originalname: 'invalid.json',
        encoding: '7bit',
        mimetype: 'application/json',
        buffer: Buffer.from(invalidJson),
        size: invalidJson.length,
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      await expect(service.validateUploadedFiles([mockFile])).rejects.toThrow();
    });
  });
});