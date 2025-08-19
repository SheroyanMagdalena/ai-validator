//ChatGPT API call
import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class ComparisonService {
  private openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  async compareWithAI(apiJson: string, modelJson: string) {
    const prompt = `
You are an AI API vs Model Validation Report Generator.
Your goal is to analyze an API specification against a data model and produce a structured validation report.
1) API JSON response or spec:
${apiJson}
2) Data model JSON schema:
${modelJson}

TASK
- Do a field-by-field comparison (consider semantic equivalents like "user_id" ≈ "id" if they represent the same concept).
- Identify:
  • Missing fields (present in the model but not the API)  
  • Extra fields (present in the API but not the model)  
  • Type mismatches (expected vs actual)  
  • Other inconsistencies (e.g., enum/name/format)  
- Provide concrete, actionable suggestions per field.
- Compute counts and ensure they are self-consistent with the "fields" array.

OUTPUT FORMAT (STRICT)
Return ONLY a JSON object with these exact properties:
{
  "api_name": string,
  "validation_date": string (RFC3339/ISO-8601, e.g., "2025-08-15T14:30:00Z"),
  "total_fields_compared": integer >= 0,
  "matched_fields": integer >= 0,
  "unmatched_fields": integer >= 0,
  "extra_fields": integer >= 0,
  "missing_fields": integer >= 0,
  "accuracy_score": integer (0–100),
  "fields": [
    {
      "field_name": string,
      "status": string ∈ {"matched","unmatched","extra","missing"},
      "issue": string,
      "expected_type": string,
      "actual_type": string OR null,
      "suggestion": string
    }
  ],
  "summary_recommendation": string
}

VALIDATION & CONSISTENCY RULES
- "validation_date" MUST be RFC3339/ISO-8601 with a timezone.
- "status" must be exactly one of: matched, unmatched, extra, missing.
- Counts must align with the "fields" array.
- Every field object MUST include at least "field_name" and "status".
- Use "" (empty string) where a text field has no issue/suggestion; use null for unknown "actual_type".
- Do NOT include markdown, explanations, or any text outside the JSON.

`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o', 
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
