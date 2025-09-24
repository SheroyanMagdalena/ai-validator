import { IsOptional, IsNumber, IsBoolean, IsArray, IsString, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CompareOptionsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  @Transform(({ value }) => parseFloat(value))
  fuzzyThreshold?: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  aiHints?: boolean;

  @IsOptional()
  aiConfig?: any;
}

export class FileUploadDto {
  @IsOptional()
  @Type(() => CompareOptionsDto)
  options?: CompareOptionsDto;
}

export class ValidationConfigDto {
  @IsOptional()
  @IsNumber()
  @Min(1024) // Minimum 1KB
  @Max(100 * 1024 * 1024) // Maximum 100MB
  maxFileSize?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedMimeTypes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedExtensions?: string[];

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  maxFiles?: number;

  @IsOptional()
  @IsBoolean()
  requireBothFiles?: boolean;
}

// Response DTOs
export class FileMetadataDto {
  originalName: string;
  mimeType: string;
  size: number;
  hash: string;
  extension: string;
}

export class ValidationResultDto {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metadata: FileMetadataDto;
}

export class ValidationResponseDto {
  success: boolean;
  message: string;
  files: {
    api?: ValidationResultDto;
    model?: ValidationResultDto;
  };
  timestamp: string;
}