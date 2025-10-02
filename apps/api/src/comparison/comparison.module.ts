import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ComparisonController } from './comparison.controller';
import { ComparisonService } from './comparison.service';
import { AppCacheModule } from '../cache/cache.module';
import { ValidationModule } from '../validation/validation.module';
import { MongoClient, Db } from 'mongodb';

@Module({
  imports: [AppCacheModule, ValidationModule],
  controllers: [ComparisonController],
  providers: [
    {
      provide: 'DATABASE_CONNECTION',
      useFactory: async (configService: ConfigService): Promise<Db> => {
        const uri = configService.get<string>('MONGO_URI');
        const dbName = configService.get<string>('MONGO_DB');
        if (!uri || !dbName) {
          throw new Error('Missing MONGO_URI or MONGO_DB in environment variables');
        }

        const client = await MongoClient.connect(uri, {
          useNewUrlParser: true,
          useUnifiedTopology: true,
        } as any);

        return client.db(dbName);
      },
      inject: [ConfigService],
    },
    ComparisonService,
  ],
  exports: [ComparisonService],
})
export class ComparisonModule {}
