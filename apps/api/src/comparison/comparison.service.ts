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

    // Extract relevant parts based on our updated focus
    const apiSchemas = this.extractApiSchemas(apiData);
    const modelProperties = this.extractModelProperties(schemaData);

    const structuralAnalysis = this.analyzeStructure(apiSchemas, modelProperties);
    const rawFieldAnalysis = this.performDeepFieldComparison(apiSchemas, modelProperties);
    const constraintValidation = this.validateSchemaConstraints(apiSchemas, modelProperties);
    const aiAnalysis = await this.getAISemanticAnalysis(rawFieldAnalysis, constraintValidation, apiSchemas, modelProperties);
    const result = this.compileResults(rawFieldAnalysis, constraintValidation, structuralAnalysis, aiAnalysis);

    console.log('ComparisonService result:', JSON.stringify(result, null, 2));
    return result;
  }

  /**
   * Extract only components.schemas from API data
   */
  private extractApiSchemas(apiData: any): any {
    if (apiData && apiData.components && apiData.components.schemas) {
      return apiData.components.schemas;
    }
    return {};
  }

  /**
   * Extract only properties from data model
   */
  private extractModelProperties(modelData: any): any {
    if (modelData && modelData.properties) {
      return modelData.properties;
    }
    return {};
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
    const apiPaths = this.getAllSchemaFieldPaths(apiData);
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
    
    // Validate individual field constraints if schema has properties
    if (schemaData && typeof schemaData === 'object') {
      for (const [fname, fSchema] of Object.entries(schemaData)) {
        validatedFields.push(fname);
        const val = apiData[fname];
        if (val !== undefined) {
          const fieldSchema = fSchema as SchemaField;
          if (Array.isArray(fieldSchema.enum) && !fieldSchema.enum.includes(val)) {
            violations.push(`Field '${fname}' with value '${val}' not in enum: ${fieldSchema.enum.join(', ')}`);
          }
          if (fieldSchema.minLength && typeof val === 'string' && val.length < fieldSchema.minLength) {
            violations.push(`Field '${fname}' too short (minLength: ${fieldSchema.minLength})`);
          }
          if (fieldSchema.minimum !== undefined && typeof val === 'number' && val < fieldSchema.minimum) {
            violations.push(`Field '${fname}' below minimum (${fieldSchema.minimum})`);
          }
          if (fieldSchema.pattern && typeof val === 'string' && !new RegExp(fieldSchema.pattern).test(val)) {
            violations.push(`Field '${fname}' does not match pattern: ${fieldSchema.pattern}`);
          }
        }
      }
    }
    
    return { violations, validatedFields };
  }

  private async getAISemanticAnalysis(
    raw: any[], 
    constraints: any, 
    apiSchemas: any, 
    modelProperties: any
  ): Promise<any> {
    // Prepare the input for AI analysis using our updated prompt structure
    const aiInput = {
      api: { components: { schemas: apiSchemas } },
      dataModel: { properties: modelProperties }
    };

    const semanticPrompt = `
### Role
You are an AI Validation Engine specialized in comparing an API's data structures to a canonical data model. Your goal is to identify discrepancies and provide actionable recommendations for alignment.

### Input Structure
Here is the input data structured according to your requirements:

\`\`\`json
${JSON.stringify(aiInput, null, 2)}
\`\`\`

### Core Directive: Field Mapping
Your primary task is to use the \`x-system-mappings\` property within the \`dataModel\` to find the correct field names for comparison. For each property in the \`dataModel\`:
1. Find its \`x-system-mappings\` object.
2. Identify the correct system code (e.g., \`"SPR"\` for this API).
3. Extract the field name(s) from the mapping value (e.g., \`"Anun"\` for \`"firstName"\`).
4. Locate this mapped field name within the relevant API schema.

### Validation Results for Analysis:

Field Analysis (up to 20 entries):
${JSON.stringify(raw.slice(0, 20), null, 2)}

Constraint Violations:
${JSON.stringify(constraints.violations || [], null, 2)}

### Output Format
You MUST return ONLY a valid JSON object with the following structure. Do not add any other text or commentary.

`;

    try {
      const resp = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: semanticPrompt }],
        temperature: 0.3,
        response_format: { type: "json_object" }
      });
      
      const content = resp.choices[0].message?.content ?? '{}';
      const parsed = JSON.parse(this.cleanJsonResponse(content));
      
      return parsed;
    } catch (error) {
      console.error('AI analysis failed:', error);
      return { 
        summary: {
          total_fields_compared: 0,
          matched_count: 0,
          unresolved_count: 0,
          api_only_count: 0,
          model_only_count: 0
        },
        suggestions: [] 
      };
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

      // Find AI suggestion for this field
      const aiSuggestion = ai?.suggestions?.find((s: any) => s.field === f.path);

      return {
        field_name: f.path,
        status,
        expected_type: f.schemaType || '',
        actual_type: f.apiType || '',
        expected_format: f.schemaConstraints?.format ?? null,
        actual_format: this.detectFormat(f.apiValue),
        issue: f.validationErrors.join('; ') || (aiSuggestion?.issue || ''),
        suggestion: aiSuggestion?.recommendation || '',
        confidence: f.confidence || 1.0,
        rationale: aiSuggestion?.mapped_api_field ? `Maps to API field: ${aiSuggestion.mapped_api_field}` : '',
      };
    });

    const matched = fields.filter(x => x.status === 'matched').length;
    const unresolved = fields.filter(x => x.status === 'unresolved').length;
    const extra = fields.filter(x => x.status === 'extra').length;
    const missing = fields.filter(x => x.status === 'missing').length;

    // Use AI summary if available, otherwise calculate from fields
    const summary = ai?.summary || {
      total_fields_compared: fields.length,
      matched_count: matched,
      unresolved_count: unresolved,
      api_only_count: extra,
      model_only_count: missing
    };

    return {
      api_name: 'API Comparison',
      validation_date: new Date().toISOString(),
      total_fields_compared: summary.total_fields_compared,
      matched_fields: summary.matched_count,
      unmatched_fields: summary.unresolved_count,
      extra_fields: summary.api_only_count,
      missing_fields: summary.model_only_count,
      accuracy_score: summary.total_fields_compared ? 
        Math.round((summary.matched_count / summary.total_fields_compared) * 100) : 0,
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

  private getAllSchemaFieldPaths(schema: any, prefix = ''): Map<string, { type?: string; constraints?: any; required?: boolean; value?: any }> {
    const map = new Map<string, any>();
    
    if (schema && typeof schema === 'object') {
      for (const [k, v] of Object.entries(schema)) {
        const path = prefix ? `${prefix}.${k}` : k;
        
        if (v && typeof v === 'object') {
          const schemaField = v as SchemaField;
          
          if (schemaField.type && schemaField.type !== 'object') {
            map.set(path, {
              type: schemaField.type,
              constraints: schemaField,
              required: false,
              value: undefined
            });
          } else if (schemaField.type === 'object' && schemaField.properties) {
            this.getAllSchemaFieldPaths(schemaField.properties, path).forEach((info, p) => map.set(p, info));
          } else if (schemaField.properties) {
            this.getAllSchemaFieldPaths(schemaField.properties, path).forEach((info, p) => map.set(p, info));
          } else {
            map.set(path, {
              type: 'object',
              constraints: {},
              required: false,
              value: v
            });
          }
        } else {
          map.set(path, {
            type: typeof v,
            constraints: {},
            required: false,
            value: v
          });
        }
      }
    }
    return map;
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