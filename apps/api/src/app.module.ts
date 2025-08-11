import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ComparisonModule } from './comparison/comparison.module';
import * as path from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, 
      envFilePath: [path.resolve(__dirname, '../../../.env')],
    }),
    ComparisonModule,
      ],
})
export class AppModule {}
