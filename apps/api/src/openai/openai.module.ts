// src/openai/openai.module.ts
import { Module } from '@nestjs/common';
import { OpenaiService } from './openai.service';

@Module({
  providers: [OpenaiService],
  exports: [OpenaiService], // Export the service to be used in other modules
})
export class OpenaiModule {}