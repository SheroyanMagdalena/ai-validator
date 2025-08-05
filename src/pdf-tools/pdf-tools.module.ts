import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Pdf, PdfSchema } from './pdf.schema';

@Module({
  imports: [
     MongooseModule.forFeature([{ name: Pdf.name, schema: PdfSchema }])
  ],
  controllers: [],
  providers: [],
})
export class PdfToolsModule {}
