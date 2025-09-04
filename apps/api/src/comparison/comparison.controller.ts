import {
  Controller,
  Post,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ComparisonService } from './comparison.service';

@Controller('comparison')
export class ComparisonController {
  constructor(private readonly comparisonService: ComparisonService) {}

  @Post('upload')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'apiFile', maxCount: 1 },
      { name: 'modelFile', maxCount: 1 },
    ]),
  )
  async compareFiles(
    @UploadedFiles()
    files: {
      apiFile?: Express.Multer.File[];
      modelFile?: Express.Multer.File[];
    },
  ) {
    const apiFile = files.apiFile?.[0];
    const modelFile = files.modelFile?.[0];

    if (!apiFile || !modelFile) {
      throw new BadRequestException('Both apiFile and modelFile are required');
    }

    try {
      const apiContent = apiFile.buffer.toString('utf8');
      const modelContent = modelFile.buffer.toString('utf8');

      return await this.comparisonService.compareWithAI(apiContent, modelContent);
    } catch (error) {
      throw new BadRequestException(`Comparison failed: ${error.message}`);
    }
  }
}
