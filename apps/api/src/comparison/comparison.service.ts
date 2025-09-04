import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

export interface FieldAnalysis {
  field_name: string;
  status: 'matched' | 'unresolved' | 'extra' | 'missing';
  expected_type: string;
  actual_type: string;
  expected_format: string | null;
  actual_format: string | null;
  issue: string;
  suggestion: string;
  confidence: number;
  rationale: string;
}

export interface ComparisonResult {
  api_name: string;
  validation_date: string;
  total_fields_compared: number;
  matched_fields: number;
  unresolved_fields: number;
  extra_fields: number;
  missing_fields: number;
  accuracy_score: number;
  fields: FieldAnalysis[];
}

@Injectable()
export class ComparisonService {
  private openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  async compareWithAI(apiJson: string, modelJson: string): Promise<ComparisonResult> {
    const apiData = this.parseAndValidate(apiJson, 'API');
    const schemaData = this.parseAndValidate(modelJson, 'Schema');

    const structuralAnalysis = this.analyzeStructure(apiData, schemaData);
    const rawFieldAnalysis = this.performDeepFieldComparison(apiData, schemaData);
    const constraintValidation = this.validateSchemaConstraints(apiData, schemaData);
    const aiAnalysis = await this.getAISemanticAnalysis(rawFieldAnalysis, constraintValidation);

    return this.compileResults(rawFieldAnalysis, constraintValidation, structuralAnalysis, aiAnalysis);
  }

  private parseAndValidate(jsonString: string, type: string): any {
    try {
      const parsed = JSON.parse(jsonString);
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error(`${type} must be a valid JSON object`);
      }
      return parsed;
    } catch (err: any) {
      throw new Error(`Invalid ${type} JSON: ${err.message}`);
    }
  }

  private analyzeStructure(apiData: any, schemaData: any): {
    apiDepth: number;
    schemaDepth: number;
    structuralMismatches: string[];
  } {
    const analysis = {
      apiDepth: this.calculateNestingDepth(apiData),
      schemaDepth: this.calculateNestingDepth(schemaData),
      structuralMismatches: [] as string[],
    };
    if (analysis.apiDepth !== analysis.schemaDepth) {
      analysis.structuralMismatches.push(
        `Nesting depth mismatch: API has ${analysis.apiDepth} levels, Schema expects ${analysis.schemaDepth}`
      );
    }
    return analysis;
  }

  private performDeepFieldComparison(apiData: any, schemaData: any): any[] {
    const results: any[] = [];
    const apiPaths = this.getAllFieldPaths(apiData);
    const schemaPaths = this.getAllSchemaFieldPaths(schemaData);
    const allPaths = new Set([...apiPaths.keys(), ...schemaPaths.keys()]);

    for (const path of allPaths) {
      const apiField = apiPaths.get(path);
      const schemaField = schemaPaths.get(path);

      const analysis: any = {
        path,
        apiType: apiField?.type,
        schemaType: schemaField?.type,
        isRequired: !!schemaField?.required,
        validationErrors: [] as string[],
        apiValue: apiField?.value,
        schemaConstraints: schemaField?.constraints,
        confidence: 1.0,
      };

      this.validateFieldMatch(analysis, apiField, schemaField);
      results.push(analysis);
    }

    return results;
  }

  private validateFieldMatch(analysis: any, apiField: any, schemaField: any): void {
    if (!apiField && schemaField?.required) {
      analysis.validationErrors.push(`Field '${analysis.path}' is required but missing`);
    }
    if (apiField && !schemaField) {
      analysis.validationErrors.push(`Field '${analysis.path}' is extra in API response`);
    }
    if (!apiField || !schemaField) return;

    if (analysis.apiType && analysis.schemaType) {
      if (!this.areTypesCompatible(analysis.apiType, analysis.schemaType)) {
        analysis.validationErrors.push(
          `Type mismatch for '${analysis.path}': expected ${analysis.schemaType}, got ${analysis.apiType}`
        );
      }
    }

    if (schemaField.constraints) {
      this.validateConstraints(analysis, apiField.value, schemaField.constraints);
    }
  }

  private validateSchemaConstraints(apiData: any, schemaData: any): { violations: string[]; validatedFields: string[] } {
    const violations: string[] = [];
    const validatedFields: string[] = [];
    
    if (Array.isArray(schemaData.required)) {
      for (const field of schemaData.required) {
        if (!(field in apiData)) {
          violations.push(`Required field '${field}' is missing`);
        }
      }
    }
    
    if (schemaData.properties && typeof schemaData.properties === 'object') {
      const props = schemaData.properties as Record<string, any>;
      for (const [fname, fSchema] of Object.entries(props)) {
        validatedFields.push(fname);
        const val = apiData[fname];
        if (val !== undefined) {
          if (Array.isArray(fSchema.enum) && !fSchema.enum.includes(val)) {
            violations.push(`Field '${fname}' with value '${val}' not in enum: ${fSchema.enum.join(', ')}`);
          }
          if (fSchema.minLength && typeof val === 'string' && val.length < fSchema.minLength) {
            violations.push(`Field '${fname}' too short (minLength: ${fSchema.minLength})`);
          }
          if (fSchema.minimum !== undefined && typeof val === 'number' && val < fSchema.minimum) {
            violations.push(`Field '${fname}' below minimum (${fSchema.minimum})`);
          }
          if (fSchema.pattern && typeof val === 'string' && !new RegExp(fSchema.pattern).test(val)) {
            violations.push(`Field '${fname}' does not match pattern: ${fSchema.pattern}`);
          }
        }
      }
    }
    
    return { violations, validatedFields };
  }

  private async getAISemanticAnalysis(raw: any[], constraints: any): Promise<any> {
    const semanticPrompt = `
You are an expert in API data modeling and JSON Schema analysis.

Analyze these field comparison results (including nested paths) and provide intelligent suggestions.

Inputs:

Field Analysis (up to 20 entries):
${JSON.stringify(raw.slice(0, 20), null, 2)}

Constraint Violations:
${JSON.stringify(constraints.violations || [], null, 2)}

Match Categorization Rules:
1. Matched Field: exists in both, types match, no errors.
2. Unresolved Field: exists in both but with validation errors.
3. API Only: exists in API, not Schema.
4. Model Only: required in schema but missing from API.

Include nested field paths like 'user.profile.name'. Also compute total_fields_compared (unique paths).

Your tasks:
1. Identify **likely semantic field matches** (such as user_id ↔ userId, or created_at ↔ createdDate).
2. Recommend **field mappings or transformations** where names, types, or formats differ but are likely equivalent.
3. Flag any **structural issues** that suggest mismatches in nesting, missing parents, or unexpected arrays/objects.
4. Provide **intelligent suggestions** for improving API responses or schema definitions to ensure alignment.
5. Highlight **fields that require transformation** (e.g., date formatting, enum mapping, string-to-integer conversions).

Return ONLY a valid JSON object with a "suggestions" array containing objects with "field" and "recommendation" properties.

`;

    try {
      const resp = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: semanticPrompt }],
        temperature: 0.3,
      });
      const content = resp.choices[0].message?.content ?? '{}';
      const parsed = JSON.parse(this.cleanJsonResponse(content));
      
      // Ensure the response has a suggestions array
      return {
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : []
      };
    } catch {
      return { suggestions: [] };
    }
  }

  private compileResults(
    raw: any[],
    constraints: { violations: string[]; validatedFields: string[] },
    structure: any,
    ai: any
  ): ComparisonResult {
    const fields: FieldAnalysis[] = raw.map(f => {
      const status = !f.apiType && f.isRequired ? 'missing'
                    : f.apiType && !f.schemaType ? 'extra'
                    : f.validationErrors.length ? 'unresolved'
                    : 'matched';

      return {
        field_name: f.path,
        status,
        expected_type: f.schemaType || '',
        actual_type: f.apiType || '',
        expected_format: f.schemaConstraints?.format ?? null,
        actual_format: this.detectFormat(f.apiValue),
        issue: f.validationErrors.join('; '),
        suggestion: this.findAISuggestion(ai?.suggestions, f.path),
        confidence: f.confidence || 1.0,
        rationale: '',
      };
    });

    const matched = fields.filter(x => x.status === 'matched').length;
    const unresolved = fields.filter(x => x.status === 'unresolved').length;
    const extra = fields.filter(x => x.status === 'extra').length;
    const missing = fields.filter(x => x.status === 'missing').length;

    return {
      api_name: 'API Comparison',
      validation_date: new Date().toISOString(),
      total_fields_compared: fields.length,
      matched_fields: matched,
      unresolved_fields: unresolved,
      extra_fields: extra,
      missing_fields: missing,
      accuracy_score: fields.length ? Math.round((matched / fields.length) * 100) : 0,
      fields,
    };
  }

  /** Helper Methods **/

  private calculateNestingDepth(obj: Record<string, any>, depth = 0): number {
    if (typeof obj !== 'object' || obj === null) return depth;
    return Object.values(obj).reduce((max, v: any) =>
      Math.max(max, this.calculateNestingDepth(v, depth + 1)),
      depth
    );
  }

  private getAllFieldPaths(obj: any, prefix = ''): Map<string, { value: any; type: string }> {
    const map = new Map<string, any>();
    if (obj && typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${k}` : k;
        map.set(path, { value: v, type: this.detectFormatType(v) });
        if (v && typeof v === 'object') {
          this.getAllFieldPaths(v, path).forEach((info, p) => map.set(p, info));
        }
      }
    }
    return map;
  }

  private getAllSchemaFieldPaths(schema: any, prefix = ''): Map<string, { type?: string; constraints?: any; required?: boolean }> {
    const map = new Map<string, any>();
    if (schema?.properties && typeof schema.properties === 'object') {
      const props = schema.properties as Record<string, any>;
      for (const key of Object.keys(props)) {
        const s = props[key];
        const path = prefix ? `${prefix}.${key}` : key;
        map.set(path, {
          type: s.type,
          constraints: s,
          required: Array.isArray(schema.required) && schema.required.includes(key),
        });
        if (s.type === 'object') {
          this.getAllSchemaFieldPaths(s, path).forEach((info, p) => map.set(p, info));
        }
      }
    }
    return map;
  }

  private detectFormatType(value: any): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return 'datetime';
    if (typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value)) return 'uuid';
    return typeof value;
  }

  private detectFormat(value: any): string | null {
    if (typeof value === 'string') {
      if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return 'date-time';
      if (/^[a-f0-9-]{36}$/i.test(value)) return 'uuid';
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';
    }
    return null;
  }

  private areTypesCompatible(apiType: string, schemaType: string): boolean {
    const map: Record<string, string[]> = {
      string: ['string', 'datetime', 'uuid'],
      number: ['number', 'integer'],
      integer: ['number', 'integer'],
      boolean: ['boolean'],
      array: ['array'],
      object: ['object'],
      null: ['null'],
    };
    return (map[apiType] ?? []).includes(schemaType);
  }

  private validateConstraints(analysis: any, value: any, constraints: any): void {
    if (constraints.enum && !constraints.enum.includes(value)) {
      analysis.validationErrors.push(`Value '${value}' not in enum [${constraints.enum.join(', ')}]`);
    }
    if (constraints.minLength && typeof value === 'string' && value.length < constraints.minLength) {
      analysis.validationErrors.push(`String too short (minLength: ${constraints.minLength})`);
    }
    if (constraints.maximum !== undefined && typeof value === 'number' && value > constraints.maximum) {
      analysis.validationErrors.push(`Number too large (max: ${constraints.maximum})`);
    }
    if (constraints.pattern && typeof value === 'string' && !new RegExp(constraints.pattern).test(value)) {
      analysis.validationErrors.push(`String does not match pattern ${constraints.pattern}`);
    }
  }

  private findAISuggestion(suggestions: any[] | undefined, fieldPath: string): string {
    if (!suggestions || !Array.isArray(suggestions)) {
      return '';
    }
    const item = suggestions.find((s: any) => s.field === fieldPath);
    return item ? item.recommendation : '';
  }

  private cleanJsonResponse(str: string): string {
    return str.replace(/```json\n?|```/g, '');
  }
}