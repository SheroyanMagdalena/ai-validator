import { Module } from '@nestjs/common';
import { FileValidationService } from './file-validation.service';
import { FileValidationPipe } from './file-validation.pipe';
import { FileUploadInterceptor } from './file-upload.interceptor';
import { SanitizationService } from './sanitization.service';

@Module({
  providers: [
    FileValidationService, 
    FileValidationPipe, 
    FileUploadInterceptor,
    SanitizationService
  ],
  exports: [
    FileValidationService, 
    FileValidationPipe, 
    FileUploadInterceptor,
    SanitizationService
  ],
})
export class ValidationModule {}