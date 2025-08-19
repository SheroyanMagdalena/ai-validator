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

Perform a field-by-field comparison between the API response fields and the model fields.

Consider not only exact name matches, but also semantic equivalence (e.g., user_id vs id if they refer to the same concept).

For each field, identify issues such as:

Missing fields (in the model but not in the API, or vice versa).

Extra fields (present only in one side).

Type mismatches (expected vs actual type).

Other inconsistencies (e.g., enum mismatches, naming conventions).

Provide clear suggestions for resolution.

At the end, include a summary recommendation based on your findings.

Return the results only in valid JSON, strictly following this schema:
{
  "title": "API Validation Report Input",
  "type": "object",
  "properties": {
    "api_name": { "type": "string" },
    "validation_date": { "type": "string", "format": "date-time" },
    "total_fields_compared": { "type": "integer", "minimum": 0 },
    "matched_fields": { "type": "integer", "minimum": 0 },
    "unmatched_fields": { "type": "integer", "minimum": 0 },
    "extra_fields": { "type": "integer", "minimum": 0 },
    "missing_fields": { "type": "integer", "minimum": 0 },
    "accuracy_score": { "type": ["number", "string"] },
    "fields": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "field_name": { "type": "string" },
          "status": { "type": "string" },
          "issue": { "type": "string" },
          "expected_type": { "type": "string" },
          "actual_type": { "type": ["string", "null"] },
          "suggestion": { "type": "string" }
        },
        "required": ["field_name", "status"]
      }
    },
    "summary_recommendation": { "type": "string" }
  },
  "additionalProperties": true
}

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
