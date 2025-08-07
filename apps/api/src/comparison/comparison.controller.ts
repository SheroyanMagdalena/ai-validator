// src/comparison/comparison.controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { ComparisonService } from './comparison.service';
import { CompareApisDto } from './dto/compare-apis.dto';

@Controller('comparison')
export class ComparisonController {
  constructor(private readonly comparisonService: ComparisonService) {}

  @Post('compare')
  async compareApis(@Body() compareApisDto: CompareApisDto) {
    const dataModel1 = await this.comparisonService.fetchApiData(compareApisDto.apiUrl1);
    const dataModel2 = await this.comparisonService.fetchApiData(compareApisDto.apiUrl2);

    // For now, we just return the fetched data.
    // In the next part, we'll send this to the OpenAI service.
    return {
      message: 'Successfully fetched data models. AI comparison will be implemented next.',
      dataModel1,
      dataModel2,
    };
  }
}