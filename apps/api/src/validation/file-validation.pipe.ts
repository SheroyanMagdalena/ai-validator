import { 
  PipeTransform, 
  Injectable, 
  BadRequestException, 
  ArgumentMetadata,
  Logger 
} from '@nestjs/common';
import { FileValidationService } from './file-validation.service';

@Injectable()
export class FileValidationPipe implements PipeTransform {
  private readonly logger = new Logger(FileValidationPipe.name);

  constructor(private readonly fileValidationService: FileValidationService) {}

  async transform(value: any, metadata: ArgumentMetadata) {
    if (metadata.type === 'custom' && metadata.data === 'files') {
      if (!Array.isArray(value)) {
        throw new BadRequestException('Expected an array of files');
      }

      try {
        const validationResult = await this.fileValidationService.validateUploadedFiles(value);
        
        this.logger.log(`Validated ${value.length} files successfully`);
        
        // Return both files and validation results for use in controller
        return {
          files: value,
          apiFile: validationResult.apiFile,
          modelFile: validationResult.modelFile,
          validationResults: validationResult.validationResults,
        };
      } catch (error) {
        this.logger.error(`File validation failed: ${error.message}`);
        throw error;
      }
    }

    return value;
  }
}