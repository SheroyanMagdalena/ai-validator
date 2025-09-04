import OpenAI from 'openai';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

interface ValidationResult {
  api_name: string;
  validation_date: string;
  total_fields_compared: number;
  matched_fields: number;
  unresolved_fields: number;
  extra_fields: number;
  missing_fields: number;
  accuracy_score: number;
  fields: FieldComparison[];
  schema_errors: SchemaValidationError[];
  structural_analysis: StructuralAnalysis;
  ai_suggestions?: AISuggestion[];
  summary_recommendation: string;
}

interface FieldComparison {
  field_name: string;
  status: 'matched' | 'unresolved' | 'extra' | 'missing' | 'type_mismatch' | 'constraint_violation';
  expected_type?: string;
  actual_type?: string;
  expected_format?: string;
  actual_format?: string;
  issue: string;
  suggestion: string;
  confidence: number;
  api_value?: any;
  schema_constraints?: any;
}

interface SchemaValidationError {
  field_path: string;
  error_type: string;
  message: string;
  expected_value?: any;
  actual_value?: any;
}

interface StructuralAnalysis {
  api_structure: ObjectStructure;
  schema_structure: ObjectStructure;
  structural_mismatches: string[];
  nesting_comparison: {
    api_depth: number;
    schema_depth: number;
    depth_match: boolean;
  };
}

interface ObjectStructure {
  total_fields: number;
  required_fields: string[];
  optional_fields: string[];
  nested_objects: string[];
  array_fields: string[];
  field_types: Record<string, string>;
}

interface AISuggestion {
  type: 'field_mapping' | 'transformation' | 'structural' | 'general';
  description: string;
  confidence: number;
  action_required?: string;
}

@Injectable()
export class ProperComparisonService {
  private openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  private ajv: Ajv;

  constructor() {
    this.ajv = new Ajv({ 
      allErrors: true, 
      verbose: true,
      strict: false 
    });
    addFormats(this.ajv);
  }

  async compareWithValidation(apiJsonString: string, schemaJsonString: string): Promise<ValidationResult> {
    console.log('🚀 Starting programmatic comparison...');
    
    // Step 1: Parse and validate JSON inputs
    const { apiData, schemaData } = this.parseInputs(apiJsonString, schemaJsonString);
    
    // Step 2: Perform actual JSON Schema validation
    const schemaValidation = this.performSchemaValidation(apiData, schemaData);
    
    // Step 3: Deep structural analysis
    const structuralAnalysis = this.analyzeStructure(apiData, schemaData);
    
    // Step 4: Field-by-field programmatic comparison
    const fieldComparisons = this.compareFields(apiData, schemaData, schemaValidation.errors);
    
    // Step 5: Calculate metrics
    const metrics = this.calculateMetrics(fieldComparisons);
    
    // Step 6: Use AI only for intelligent suggestions (optional)
    const aiSuggestions = await this.getAIEnhancements(fieldComparisons, schemaValidation.errors);
    
    // Step 7: Compile final result
    return {
      api_name: this.extractApiName(schemaData) || 'API Comparison',
      validation_date: new Date().toISOString(),
      ...metrics,
      fields: fieldComparisons,
      schema_errors: schemaValidation.errors,
      structural_analysis: structuralAnalysis,
      ai_suggestions: aiSuggestions,
      summary_recommendation: this.generateSummary(metrics, schemaValidation, structuralAnalysis)
    };
  }

  private parseInputs(apiJsonString: string, schemaJsonString: string) {
    let apiData: any;
    let schemaData: any;

    try {
      apiData = JSON.parse(apiJsonString);
    } catch (error) {
      throw new Error(`Invalid API JSON: ${error.message}`);
    }

    try {
      schemaData = JSON.parse(schemaJsonString);
    } catch (error) {
      throw new Error(`Invalid Schema JSON: ${error.message}`);
    }

    // Validate that schema looks like a JSON Schema
    if (!schemaData.type && !schemaData.properties && !schemaData.$schema) {
      console.warn('⚠️ Schema may not be a valid JSON Schema format');
    }

    return { apiData, schemaData };
  }

  private performSchemaValidation(apiData: any, schemaData: any) {
    console.log('🔍 Performing JSON Schema validation...');
    
    const validate = this.ajv.compile(schemaData);
    const isValid = validate(apiData);
    
    const errors: SchemaValidationError[] = [];
    
    if (!isValid && validate.errors) {
      for (const error of validate.errors) {
        errors.push({
          field_path: error.instancePath || error.schemaPath || 'root',
          error_type: error.keyword || 'unknown',
          message: error.message || 'Validation failed',
          expected_value: error.schema,
          actual_value: error.data
        });
      }
    }

    console.log(`✅ Schema validation complete. Found ${errors.length} errors.`);
    
    return {
      is_valid: isValid,
      errors,
      total_errors: errors.length
    };
  }

  private analyzeStructure(apiData: any, schemaData: any): StructuralAnalysis {
    console.log('🏗️ Analyzing object structures...');
    
    const apiStructure = this.extractObjectStructure(apiData, 'api');
    const schemaStructure = this.extractSchemaStructure(schemaData);
    
    const apiDepth = this.calculateDepth(apiData);
    const schemaDepth = this.calculateDepth(schemaData.properties || schemaData);
    
    const structuralMismatches: string[] = [];
    
    // Compare field counts
    if (apiStructure.total_fields !== schemaStructure.total_fields) {
      structuralMismatches.push(
        `Field count mismatch: API has ${apiStructure.total_fields} fields, Schema defines ${schemaStructure.total_fields} fields`
      );
    }
    
    // Compare required fields
    const missingRequired = schemaStructure.required_fields.filter(
      field => !apiStructure.required_fields.includes(field) && !apiStructure.optional_fields.includes(field)
    );
    
    if (missingRequired.length > 0) {
      structuralMismatches.push(`Missing required fields: ${missingRequired.join(', ')}`);
    }
    
    // Compare nesting depth
    if (Math.abs(apiDepth - schemaDepth) > 1) {
      structuralMismatches.push(
        `Significant nesting depth difference: API depth ${apiDepth}, Schema depth ${schemaDepth}`
      );
    }

    return {
      api_structure: apiStructure,
      schema_structure: schemaStructure,
      structural_mismatches,
      nesting_comparison: {
        api_depth: apiDepth,
        schema_depth: schemaDepth,
        depth_match: Math.abs(apiDepth - schemaDepth) <= 1
      }
    };
  }

  private compareFields(apiData: any, schemaData: any, schemaErrors: SchemaValidationError[]): FieldComparison[] {
    console.log('🔬 Performing field-by-field comparison...');
    
    const comparisons: FieldComparison[] = [];
    const apiFields = this.flattenObject(apiData);
    const schemaFields = this.extractSchemaFields(schemaData);
    const requiredFields = schemaData.required || [];
    
    // Get all unique field paths
    const allFieldPaths = new Set([
      ...Object.keys(apiFields),
      ...Object.keys(schemaFields)
    ]);

    for (const fieldPath of allFieldPaths) {
      const apiValue = apiFields[fieldPath];
      const schemaField = schemaFields[fieldPath];
      const hasApiValue = fieldPath in apiFields;
      const hasSchemaField = fieldPath in schemaFields;
      
      let status: FieldComparison['status'] = 'matched';
      let issue = '';
      let suggestion = '';
      let confidence = 1.0;

      // Determine field status
      if (!hasApiValue && hasSchemaField) {
        if (requiredFields.includes(fieldPath) || schemaField.required) {
          status = 'missing';
          issue = 'Required field is missing from API response';
          suggestion = `Add field '${fieldPath}' to API response`;
          confidence = 1.0;
        } else {
          status = 'missing';
          issue = 'Optional field is missing from API response';
          suggestion = `Consider adding field '${fieldPath}' or mark as optional in schema`;
          confidence = 0.8;
        }
      } else if (hasApiValue && !hasSchemaField) {
        status = 'extra';
        issue = 'Field exists in API but not defined in schema';
        suggestion = `Add field '${fieldPath}' to schema or remove from API response`;
        confidence = 0.9;
      } else if (hasApiValue && hasSchemaField) {
        // Both exist - validate type and constraints
        const apiType = this.getDetailedType(apiValue);
        const schemaType = schemaField.type;
        
        if (!this.areTypesCompatible(apiType, schemaType)) {
          status = 'type_mismatch';
          issue = `Type mismatch: expected '${schemaType}', got '${apiType}'`;
          suggestion = `Convert field '${fieldPath}' to type '${schemaType}'`;
          confidence = 1.0;
        } else {
          // Check constraints
          const constraintViolation = this.checkConstraints(apiValue, schemaField);
          if (constraintViolation) {
            status = 'constraint_violation';
            issue = constraintViolation;
            suggestion = `Ensure field '${fieldPath}' meets schema constraints`;
            confidence = 1.0;
          }
        }
      }

      comparisons.push({
        field_name: fieldPath,
        status,
        expected_type: schemaField?.type,
        actual_type: hasApiValue ? this.getDetailedType(apiValue) : undefined,
        expected_format: schemaField?.format,
        actual_format: hasApiValue ? this.detectFormat(apiValue) : undefined,
        issue,
        suggestion,
        confidence,
        api_value: hasApiValue ? apiValue : undefined,
        schema_constraints: schemaField
      });
    }

    console.log(`✅ Field comparison complete. Analyzed ${comparisons.length} fields.`);
    return comparisons;
  }

  private calculateMetrics(fieldComparisons: FieldComparison[]) {
    const total = fieldComparisons.length;
    const matched = fieldComparisons.filter(f => f.status === 'matched').length;
    const unresolved = fieldComparisons.filter(f => 
      f.status === 'unresolved' || f.status === 'type_mismatch' || f.status === 'constraint_violation'
    ).length;
    const extra = fieldComparisons.filter(f => f.status === 'extra').length;
    const missing = fieldComparisons.filter(f => f.status === 'missing').length;

    return {
      total_fields_compared: total,
      matched_fields: matched,
      unresolved_fields: unresolved,
      extra_fields: extra,
      missing_fields: missing,
      accuracy_score: total > 0 ? Math.round((matched / total) * 100) : 0
    };
  }

  private async getAIEnhancements(fieldComparisons: FieldComparison[], schemaErrors: SchemaValidationError[]): Promise<AISuggestion[]> {
    console.log('🤖 Getting AI enhancement suggestions...');
    
    const issues = fieldComparisons.filter(f => f.status !== 'matched').slice(0, 10); // Limit to avoid token limits
    const criticalErrors = schemaErrors.slice(0, 5);

    const prompt = `
As an API integration expert, analyze these specific validation issues and provide actionable suggestions:

VALIDATION ISSUES:
${JSON.stringify(issues, null, 2)}

SCHEMA ERRORS:
${JSON.stringify(criticalErrors, null, 2)}

Provide intelligent suggestions for:
1. Field mapping recommendations (e.g., user_id ↔ userId)
2. Data transformation needs
3. Schema adjustments
4. Integration patterns

Return a JSON array of suggestions with type, description, confidence, and action_required fields.
`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1000
      });

      const response = completion.choices[0].message?.content;
      if (response) {
        const cleaned = this.cleanJsonResponse(response);
        const suggestions = JSON.parse(cleaned);
        console.log(`✅ AI provided ${suggestions.length} suggestions.`);
        return Array.isArray(suggestions) ? suggestions : [];
      }
    } catch (error) {
      console.warn('⚠️ AI enhancement failed:', error.message);
    }

    return [];
  }

  // Helper methods
  private extractObjectStructure(obj: any, type: string): ObjectStructure {
    const fields = this.flattenObject(obj);
    const fieldNames = Object.keys(fields);
    
    return {
      total_fields: fieldNames.length,
      required_fields: fieldNames, // In API response, all present fields are "required"
      optional_fields: [],
      nested_objects: fieldNames.filter(name => typeof fields[name] === 'object' && fields[name] !== null),
      array_fields: fieldNames.filter(name => Array.isArray(fields[name])),
      field_types: Object.fromEntries(
        fieldNames.map(name => [name, this.getDetailedType(fields[name])])
      )
    };
  }

  private extractSchemaStructure(schema: any): ObjectStructure {
    const properties = schema.properties || {};
    const required = schema.required || [];
    const fieldNames = Object.keys(properties);
    
    return {
      total_fields: fieldNames.length,
      required_fields: required,
      optional_fields: fieldNames.filter(name => !required.includes(name)),
      nested_objects: fieldNames.filter(name => properties[name]?.type === 'object'),
      array_fields: fieldNames.filter(name => properties[name]?.type === 'array'),
      field_types: Object.fromEntries(
        fieldNames.map(name => [name, properties[name]?.type || 'unknown'])
      )
    };
  }

  private flattenObject(obj: any, prefix = '', result: Record<string, any> = {}): Record<string, any> {
    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}.${key}` : key;
      
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        // Recursively flatten nested objects
        this.flattenObject(value, newKey, result);
      } else {
        result[newKey] = value;
      }
    }
    return result;
  }

  private extractSchemaFields(schema: any, prefix = '', result: Record<string, any> = {}): Record<string, any> {
    const properties = schema.properties || {};
    const required = schema.required || [];
    
    for (const [key, fieldSchema] of Object.entries(properties)) {
      const newKey = prefix ? `${prefix}.${key}` : key;
      const fieldSchemaObj = fieldSchema as any;
      
      result[newKey] = {
        type: fieldSchemaObj.type,
        format: fieldSchemaObj.format,
        required: required.includes(key),
        enum: fieldSchemaObj.enum,
        minimum: fieldSchemaObj.minimum,
        maximum: fieldSchemaObj.maximum,
        minLength: fieldSchemaObj.minLength,
        maxLength: fieldSchemaObj.maxLength,
        pattern: fieldSchemaObj.pattern
      };
      
      // Handle nested objects
      if (fieldSchemaObj.type === 'object' && fieldSchemaObj.properties) {
        this.extractSchemaFields(fieldSchemaObj, newKey, result);
      }
    }
    
    return result;
  }

  private calculateDepth(obj: any, depth = 0): number {
    if (!obj || typeof obj !== 'object') return depth;
    
    let maxDepth = depth;
    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        maxDepth = Math.max(maxDepth, this.calculateDepth(value, depth + 1));
      }
    }
    return maxDepth;
  }

  private getDetailedType(value: any): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (value instanceof Date) return 'string'; // Dates are usually strings in JSON
    
    const type = typeof value;
    if (type === 'string') {
      // Detect common string formats
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return 'string';
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return 'string';
    }
    
    return type;
  }

  private areTypesCompatible(apiType: string, schemaType: string): boolean {
    if (apiType === schemaType) return true;
    
    const compatibilityMap: Record<string, string[]> = {
      'number': ['integer', 'number'],
      'integer': ['number', 'integer'],
      'string': ['string'],
      'boolean': ['boolean'],
      'array': ['array'],
      'object': ['object'],
      'null': ['null']
    };
    
    return compatibilityMap[apiType]?.includes(schemaType) || false;
  }

  private checkConstraints(value: any, schemaField: any): string | null {
    if (!schemaField) return null;
    
    // Enum validation
    if (schemaField.enum && !schemaField.enum.includes(value)) {
      return `Value '${value}' not in allowed enum: [${schemaField.enum.join(', ')}]`;
    }
    
    // String constraints
    if (typeof value === 'string') {
      if (schemaField.minLength && value.length < schemaField.minLength) {
        return `String too short: ${value.length} < ${schemaField.minLength}`;
      }
      if (schemaField.maxLength && value.length > schemaField.maxLength) {
        return `String too long: ${value.length} > ${schemaField.maxLength}`;
      }
      if (schemaField.pattern && !new RegExp(schemaField.pattern).test(value)) {
        return `String doesn't match pattern: ${schemaField.pattern}`;
      }
    }
    
    // Number constraints
    if (typeof value === 'number') {
      if (schemaField.minimum && value < schemaField.minimum) {
        return `Number too small: ${value} < ${schemaField.minimum}`;
      }
      if (schemaField.maximum && value > schemaField.maximum) {
        return `Number too large: ${value} > ${schemaField.maximum}`;
      }
    }
    
    return null;
  }

  private detectFormat(value: any): string | undefined {
    if (typeof value !== 'string') return undefined;
    
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return 'date-time';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'email';
    if (/^https?:\/\//.test(value)) return 'uri';
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return 'uuid';
    
    return undefined;
  }

  private extractApiName(schema: any): string | null {
    return schema.title || schema.$id || schema.name || null;
  }

  private generateSummary(metrics: any, schemaValidation: any, structuralAnalysis: StructuralAnalysis): string {
    const issues = [];
    
    if (metrics.accuracy_score < 80) {
      issues.push('Low field matching accuracy');
    }
    
    if (schemaValidation.total_errors > 0) {
      issues.push(`${schemaValidation.total_errors} schema validation errors`);
    }
    
    if (structuralAnalysis.structural_mismatches.length > 0) {
      issues.push('Structural inconsistencies detected');
    }
    
    if (issues.length === 0) {
      return 'API response validates successfully against schema with high accuracy.';
    }
    
    return `Issues found: ${issues.join(', ')}. Review field mappings and schema constraints.`;
  }

  private cleanJsonResponse(response: string): string {
    return response.replace(/```json\n?|\n?```/g, '').trim();
  }
}