// src/openai/openai.service.ts
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class OpenaiService {
  private readonly openai: OpenAI;

  constructor(private readonly configService: ConfigService) {
    // Instantiate the client in the constructor using the API key from config
    this.openai = new OpenAI({
      apiKey: this.configService.getOrThrow<string>('OPENAI_API_KEY'),
    });
  }

  /**
   * Asks OpenAI to provide a detailed comparison of two data models.
   */
  async compareDataModels(model1: unknown, model2: unknown): Promise<string> {
    const prompt = `
      As an expert API analyst, provide a detailed comparison of the following two JSON data models.
      Focus on structure, keys, data types, nesting, and semantic differences.
      Conclude with a summary of key similarities and differences.

      Data Model 1:
      ${JSON.stringify(model1, null, 2)}

      Data Model 2:
      ${JSON.stringify(model2, null, 2)}
    `;

    return this.getAiCompletion(prompt);
  }

  /**
   * Asks OpenAI to provide a detailed analysis of a single data model.
   */
  async analyzeDataModel(model: unknown): Promise<string> {
    const prompt = `
      As an expert API analyst, provide a detailed analysis of the following JSON data model.
      Describe its structure, keys, data types, and infer the likely purpose of this data structure.

      Data Model:
      ${JSON.stringify(model, null, 2)}
    `;

    return this.getAiCompletion(prompt);
  }

  /**
   * A private helper method to communicate with the OpenAI Chat Completions API.
   */
  private async getAiCompletion(prompt: string): Promise<string> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o', // Or 'gpt-4', 'gpt-3.5-turbo'
        messages: [{ role: 'user', content: prompt }],
      });

      // FIX: Use the nullish coalescing operator to provide a default empty string.
      // This ensures the function always returns a string, satisfying the Promise<string> type.
      return completion.choices[0].message.content ?? '';
    } catch (error) {
      console.error('OpenAI API request failed:', error);
      throw new ServiceUnavailableException('Failed to get a response from the AI service.');
    }
  }
}