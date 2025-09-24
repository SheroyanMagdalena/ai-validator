import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { FileValidationService } from './file-validation.service';

@Injectable()
export class FileUploadInterceptor implements NestInterceptor {
  private readonly logger = new Logger(FileUploadInterceptor.name);

  constructor(private readonly fileValidationService: FileValidationService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    
    // Check if this is a file upload request
    if (request.files && Array.isArray(request.files)) {
      try {
        // Validate files before processing
        const validationResult = await this.fileValidationService.validateUploadedFiles(request.files);
        
        // Attach validated files to request for easy access
        request.validatedFiles = {
          apiFile: validationResult.apiFile,
          modelFile: validationResult.modelFile,
          validationResults: validationResult.validationResults,
        };

        this.logger.log(`Files validated successfully for request ${request.url}`);

      } catch (error) {
        this.logger.error(`File validation failed: ${error.message}`);
        return throwError(() => error);
      }
    }

    return next.handle().pipe(
      map((data) => {
        // Add validation metadata to response if available
        if (request.validatedFiles) {
          return {
            ...data,
            _metadata: {
              fileValidation: {
                filesValidated: request.files?.length || 0,
                timestamp: new Date().toISOString(),
              },
            },
          };
        }
        return data;
      }),
      catchError((error) => {
        this.logger.error(`Request processing failed: ${error.message}`);
        return throwError(() => error);
      }),
    );
  }
}