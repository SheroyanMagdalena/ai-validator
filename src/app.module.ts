import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BackendModule } from './backend/backend.module';
import { ApisModule } from './apis/apis.module';
import { PdfToolsModule } from './pdf-tools/pdf-tools.module';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // So you don't need to import it in every module
    }),
    MongooseModule.forRoot(process.env.MONGO_URL || 'mongodb://mongo:27017/pdfstore'),
    BackendModule,
    ApisModule,
    PdfToolsModule,
  ],
})
export class AppModule {}
