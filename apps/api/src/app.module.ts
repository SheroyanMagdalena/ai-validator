import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ComparisonModule } from './comparison/comparison.module';
import { AppCacheModule } from './cache/cache.module';
import { MongooseModule } from '@nestjs/mongoose';
import * as path from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [path.resolve(__dirname, '../../../.env')],
    }),
    AppCacheModule,

   MongooseModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    uri: config.get<string>('MONGO_URI', ''),
    dbName: config.get<string>('MONGO_DB', 'Data_Models'),
  }),
}),

    ComparisonModule,
  ],
})
export class AppModule {}
