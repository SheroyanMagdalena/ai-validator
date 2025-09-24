import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(BadRequestException)
export class ValidationExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ValidationExceptionFilter.name);

  catch(exception: BadRequestException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    // Enhanced validation error response
    let validationErrors: any = {};
    let message = exception.message;

    if (typeof exceptionResponse === 'object') {
      const responseObj = exceptionResponse as any;
      message = responseObj.message || message;
      
      // Handle class-validator errors
      if (responseObj.message && Array.isArray(responseObj.message)) {
        validationErrors = this.formatValidationErrors(responseObj.message);
      }
    }

    this.logger.warn(
      `Validation Error: ${message}`,
      `${request.method} ${request.url}`,
    );

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      error: 'Validation Failed',
      message,
      ...(Object.keys(validationErrors).length > 0 && { validationErrors }),
    };

    response.status(status).json(errorResponse);
  }

  private formatValidationErrors(errors: any[]): any {
    const formatted: any = {};
    
    for (const error of errors) {
      if (error.property && error.constraints) {
        formatted[error.property] = Object.values(error.constraints);
      }
    }
    
    return formatted;
  }
}