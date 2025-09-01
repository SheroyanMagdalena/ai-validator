//ChatGPT API call
import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class ComparisonService {
  private openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  async compareWithAI(apiJson: string, modelJson: string) {
    const prompt = `
You are an expert API vs Data Model Validation Bot. Your job is to compare an API response/specification against a data model
 schema and generate a detailed, accurate, and thorough validation report.

INPUTS:
1. API JSON (response or spec):
${apiJson}
2. Data Model JSON Schema:
${modelJson}

TASKS:
- For every field in both the API and the model, perform a deep comparison:
  • Check for presence, type, format, and value/enum consistency.
  • Consider semantic equivalence (e.g., "user_id" ≈ "id" if contextually justified).
  • Identify and explain all mismatches, missing fields, extra fields, and type/format/value issues.
  • For each field, provide a confidence score (0–1) and a short rationale for your decision.
- Provide actionable suggestions for every issue found.
- Ensure all counts and lists are consistent and correct.

OUTPUT FORMAT (STRICT):
Return ONLY a valid JSON object with these exact properties (no markdown, no extra text):

{
  "api_name": string,
  "validation_date": string (RFC3339/ISO-8601, e.g., "2025-08-15T14:30:00Z"),
  "total_fields_compared": integer >= 0,
  "matched_fields": integer >= 0,
  "unresolved_fields": integer >= 0,
  "extra_fields": integer >= 0,
  "missing_fields": integer >= 0,
  "accuracy_score": integer (0–100),
  "fields": [
    {
      "field_name": string,
      "status": "matched" | "unresolved" | "extra" | "missing",
      "expected_type": string,
      "actual_type": string | null,
      "expected_format": string | null,
      "actual_format": string | null,
      "issue": string,
      "suggestion": string,
      "confidence": number (0–1),
      "rationale": string
    }
  ],
  "summary_recommendation": string
}

VALIDATION RULES:
- "validation_date" MUST be RFC3339/ISO-8601 with a timezone.
- "status" must be exactly one of: matched, unresolved, extra, missing.
- All counts must match the "fields" array.
- Every field object MUST include all properties above.
- Use "" (empty string) where a text field has no issue/suggestion/rationale; use null for unknown types/formats.
- DO NOT include markdown, explanations, or any text outside the JSON.
`;

  let lastRaw: any = null;
  let lastError: any = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const completion = await this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0,
        });
        let raw = completion.choices[0].message?.content;
        lastRaw = raw;
        console.log(`[OpenAI attempt ${attempt}] raw response:`, raw);
        // Remove triple backticks and optional 'json' language tag
        if (raw) {
          raw = raw.trim();
          if (raw.startsWith('```json')) {
            raw = raw.replace(/^```json/, '').replace(/```$/, '').trim();
          } else if (raw.startsWith('```')) {
            raw = raw.replace(/^```/, '').replace(/```$/, '').trim();
          }
        }
        const parsed = JSON.parse(raw || '{}');
        // Map fields to frontend arrays
        if (parsed && Array.isArray(parsed.fields)) {
          parsed.matches = parsed.fields.filter(f => f.status === 'matched').map(f => ({
            apiField: f.field_name,
            modelField: f.field_name, // You may want to adjust this if you have a mapping
            confidence: f.confidence,
            reason: f.rationale
          }));
          // Accept both 'unresolved' and 'unmatched' for compatibility
          parsed.unresolved = parsed.fields.filter(f => f.status === 'unresolved' || f.status === 'unmatched').map(f => ({
            apiField: f.field_name,
            modelField: f.field_name, // You may want to adjust this if you have a mapping
            confidence: f.confidence,
            reason: f.rationale
          }));
          parsed.apiOnly = parsed.fields.filter(f => f.status === 'extra').map(f => f.field_name);
          parsed.modelOnly = parsed.fields.filter(f => f.status === 'missing').map(f => f.field_name);
          // Only return if fields array is present and has at least one entry
          if (parsed.fields.length > 0) {
            console.log(`[OpenAI attempt ${attempt}] Returning parsed JSON to client:`, parsed);
            return parsed;
          }
        }
        lastError = `No valid fields array in response (attempt ${attempt})`;
      } catch (err) {
        lastError = err;
        console.log(`[OpenAI attempt ${attempt}] Error parsing response:`, err);
      }
    }
    // If all attempts fail, log and return last raw response
    console.log('Returning raw to client after 3 attempts:', lastRaw, 'Last error:', lastError);
    return { raw: lastRaw, error: lastError };
  }
}
