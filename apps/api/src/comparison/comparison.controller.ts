//file upload
import { Controller, Post, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ComparisonService } from './comparison.service';

@Controller('comparison')
export class ComparisonController {
  constructor(private readonly comparisonService: ComparisonService) {}

  @Post('upload')
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'apiFile', maxCount: 1 },
    { name: 'modelFile', maxCount: 1 },
  ]))
  async compareFiles(
    @UploadedFiles() files: { apiFile?: Express.Multer.File[], modelFile?: Express.Multer.File[] }
  ) {
    if (!files.apiFile?.length || !files.modelFile?.length) {
      throw new Error('Both files are required');
    }

    const apiContent = files.apiFile[0].buffer.toString('utf8');
    const modelContent = files.modelFile[0].buffer.toString('utf8');

    return this.comparisonService.compareWithAI(apiContent, modelContent);
  }
}
