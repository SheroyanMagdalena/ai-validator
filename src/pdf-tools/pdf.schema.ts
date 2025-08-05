import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class Pdf {
  @Prop()
  filename: string;

  @Prop()
  uploadedAt: Date;

  @Prop()
  metadata: Record<string, any>;
}

export type PdfDocument = Pdf & Document;
export const PdfSchema = SchemaFactory.createForClass(Pdf);
