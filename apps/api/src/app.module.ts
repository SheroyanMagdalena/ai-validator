// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ComparisonModule } from './comparison/comparison.module';
import { OpenaiModule } from './openai/openai.module';

@Module({
  imports: [
    // Makes environment variables available application-wide
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // Feature modules
    ComparisonModule,
    OpenaiModule,
  ],
})
export class AppModule {}