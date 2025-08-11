//ChatGPT API call
import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class ComparisonService {
  private openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  async compareWithAI(apiJson: string, modelJson: string) {
    const prompt = `
You are given:
1) API JSON response or spec:
${apiJson}

2) Data model JSON schema:
${modelJson}

Compare them by:
- Matching fields (direct name or via x-system-mappings.SPR)
- API fields missing in model
- Model fields missing in API

Return the result as JSON:
{
  "matches": [{ "apiField": "...", "modelField": "..." }],
  "apiOnly": ["..."],
  "modelOnly": ["..."]
}
`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o', // or gpt-4o-mini for cheaper
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
    });

    const raw = completion.choices[0].message?.content;
    try {
      return JSON.parse(raw || '{}');
    } catch {
      return { raw };
    }
  }
}
