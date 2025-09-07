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
  unmatched_fields: number;
  extra_fields: number;
  missing_fields: number;
  accuracy_score: number;
  fields: FieldAnalysis[];
}

interface SchemaField {
  type?: string;
  properties?: Record<string, SchemaField>;
  required?: string[];
  enum?: any[];
  minLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  format?: string;
  [key: string]: any;
}

interface SchemaObject {
  properties?: Record<string, SchemaField>;
  required?: string[];
  type?: string;
  [key: string]: any;
}

@Injectable()
export class ComparisonService {
  private openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  async compareWithAI(apiJson: string, modelJson: string): Promise<ComparisonResult> {
    let apiData = this.parseAndValidate(apiJson, 'API');
    let schemaData = this.parseAndValidate(modelJson, 'Schema');

    // Extract data fields from both API and Schema
    const apiDataFields = this.extractDataFields(apiData);
    const schemaDataFields = this.extractDataFields(schemaData);

    const structuralAnalysis = this.analyzeStructure(apiDataFields, schemaDataFields);
    const rawFieldAnalysis = this.performDeepFieldComparison(apiDataFields, schemaDataFields);
    const constraintValidation = this.validateSchemaConstraints(apiDataFields, schemaDataFields);
    const aiAnalysis = await this.getAISemanticAnalysis(rawFieldAnalysis, constraintValidation);
    const result = this.compileResults(rawFieldAnalysis, constraintValidation, structuralAnalysis, aiAnalysis);

    console.log('ComparisonService result:', JSON.stringify(result, null, 2));
    return result;
  }

  /**
   * Extract data fields from JSON, handling both schema definitions and actual data
   */
  private extractDataFields(data: any): any {
    const schemaKeys = ['$schema', 'title', 'description', 'type', 'properties', 'required', 'oneOf', 'anyOf', 'allOf'];
    
    // If it's a schema definition with properties, return the properties object
    if (data && typeof data === 'object' && data.properties && typeof data.properties === 'object') {
      return data.properties;
    }
    
    // If it has schema-like keys but no properties, return empty object
    if (data && typeof data === 'object' && 
        Object.keys(data).some(key => schemaKeys.includes(key))) {
      return {};
    }
    
    // Otherwise, return the data as-is (actual data structure)
    return data;
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
      analysis.confidence = 0.3;
    }
    
    if (apiField && !schemaField) {
      analysis.validationErrors.push(`Field '${analysis.path}' is extra in API response`);
      analysis.confidence = 0.5;
    }
    
    if (!apiField || !schemaField) return;

    if (analysis.apiType && analysis.schemaType) {
      if (!this.areTypesCompatible(analysis.apiType, analysis.schemaType)) {
        analysis.validationErrors.push(
          `Type mismatch for '${analysis.path}': expected ${analysis.schemaType}, got ${analysis.apiType}`
        );
        analysis.confidence = 0.7;
      }
    }

    if (schemaField.constraints) {
      this.validateConstraints(analysis, apiField.value, schemaField.constraints);
    }
  }

  private validateSchemaConstraints(apiData: any, schemaData: any): { violations: string[]; validatedFields: string[] } {
    const violations: string[] = [];
    const validatedFields: string[] = [];
    
    // If schemaData is a schema definition, check required fields
    if (schemaData && typeof schemaData === 'object' && Array.isArray((schemaData as SchemaObject).required)) {
      for (const field of (schemaData as SchemaObject).required!) {
        if (!(field in apiData)) {
          violations.push(`Required field '${field}' is missing`);
        }
      }
    }
    
    // Validate individual field constraints if schema has properties
    if (schemaData && typeof schemaData === 'object' && (schemaData as SchemaObject).properties) {
      const props = (schemaData as SchemaObject).properties!;
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
      unmatched_fields: unresolved,
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
        
        // Only add leaf nodes (non-object, non-array values) to avoid double-counting
        if (v === null || typeof v !== 'object' || Array.isArray(v)) {
          map.set(path, { value: v, type: this.detectFormatType(v) });
        } else if (typeof v === 'object' && v !== null) {
          // For objects, recursively process but don't add the object itself as a field
          this.getAllFieldPaths(v, path).forEach((info, p) => map.set(p, info));
        }
      }
    }
    return map;
  }

  private getAllSchemaFieldPaths(schema: any, prefix = ''): Map<string, { type?: string; constraints?: any; required?: boolean }> {
    const map = new Map<string, any>();
    
    if (schema && typeof schema === 'object') {
      for (const [k, v] of Object.entries(schema)) {
        const path = prefix ? `${prefix}.${k}` : k;
        
        if (v && typeof v === 'object') {
          // Use type assertions to access the properties safely
          const schemaField = v as SchemaField;
          
          if (schemaField.type && schemaField.type !== 'object') {
            map.set(path, {
              type: schemaField.type,
              constraints: schemaField,
              required: Array.isArray((schema as SchemaObject).required) && 
                       (schema as SchemaObject).required!.includes(k),
            });
          } else if (schemaField.type === 'object' && schemaField.properties) {
            // For nested objects, process recursively
            this.getAllSchemaFieldPaths(schemaField.properties, path).forEach((info, p) => map.set(p, info));
          } else {
            // For regular objects without schema info, treat as data
            this.getAllSchemaFieldPaths(v, path).forEach((info, p) => map.set(p, info));
          }
        } else {
          // For primitive values
          map.set(path, {
            type: typeof v,
            constraints: {},
            required: false,
          });
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
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';
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
    const compatibilityMap: Record<string, string[]> = {
      string: ['string', 'datetime', 'uuid', 'date', 'date-time'],
      number: ['number', 'integer', 'float'],
      integer: ['number', 'integer'],
      boolean: ['boolean'],
      array: ['array'],
      object: ['object'],
      null: ['null'],
    };
    
    // Allow any type to match if schema type is not specified
    if (!schemaType) return true;
    if (!apiType) return true;
    
    return (compatibilityMap[apiType] || []).includes(schemaType) || 
           (compatibilityMap[schemaType] || []).includes(apiType) ||
           apiType === schemaType;
  }

  private validateConstraints(analysis: any, value: any, constraints: any): void {
    const constraint = constraints as SchemaField;
    
    if (constraint.enum && Array.isArray(constraint.enum) && !constraint.enum.includes(value)) {
      analysis.validationErrors.push(`Value '${value}' not in enum [${constraint.enum.join(', ')}]`);
    }
    if (constraint.minLength && typeof value === 'string' && value.length < constraint.minLength) {
      analysis.validationErrors.push(`String too short (minLength: ${constraint.minLength})`);
    }
    if (constraint.maximum !== undefined && typeof value === 'number' && value > constraint.maximum) {
      analysis.validationErrors.push(`Number too large (max: ${constraint.maximum})`);
    }
    if (constraint.pattern && typeof value === 'string' && !new RegExp(constraint.pattern).test(value)) {
      analysis.validationErrors.push(`String does not match pattern ${constraint.pattern}`);
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