import { Injectable, Inject } from '@nestjs/common';
import { Db } from 'mongodb';
import {
  CompareOptions,
  CompareResult,
  CompareResultField,
  FieldDescriptor,
  FieldMatch,
} from './types';
import { flattenOpenApiToLeafMap } from './openapiFlatten';
import { flattenModelToLeafMap } from './modelFlatten';
import { scorePair } from './semanticMatcher';
import { AiHintsProvider } from './aiHints';
import { CacheService } from '../cache/cache.service';
import { PerformanceService } from '../cache/performance.service';

@Injectable()
export class ComparisonService {
  constructor(
    private readonly cacheService: CacheService,
    private readonly performanceService: PerformanceService,

    @Inject('DATABASE_CONNECTION')
    private readonly db: Db,
  ) {}

  /**
   * Compare OpenAPI spec against all models in DB.
   * Will filter models that match by title/description.
   */
  async compare(apiDoc: any, options: CompareOptions = {}): Promise<any> {
    const models = await this.db.collection('data').find().toArray();
    if (!models || models.length === 0) {
      throw new Error('No data models found in database');
    }

    // Pick relevant models
    const chosenModels = this.filterMatchingModels(apiDoc, models);
    if (chosenModels.length === 0) {
      return { success: false, message: 'No matching models found for given API' };
    }

    // Run full comparison for each chosen model
    const results: CompareResult[] = [];
    for (const model of chosenModels) {
      const result = await this.compareAgainstModel(apiDoc, model, options);
      results.push(result);
    }

    return {
      success: true,
      api_name: this.detectApiName(apiDoc) ?? 'API Comparison',
      compared_models: results,
      total_models: models.length,
      chosen_count: chosenModels.length,
    };
  }

  /**
   * Internal: run the existing comparison pipeline for one API vs one model
   */
  private async compareAgainstModel(
    apiDoc: any,
    modelSchema: any,
    options: CompareOptions = {},
  ): Promise<CompareResult> {
    const startTime = Date.now();

    // Cache lookup
    const cachedResult = await this.cacheService.getComparisonResult(
      apiDoc,
      modelSchema,
      options,
    );
    if (cachedResult) {
      this.performanceService.recordCacheHit();
      const executionTime = Date.now() - startTime;
      this.performanceService.recordComparison(executionTime);
      return cachedResult;
    }

    this.performanceService.recordCacheMiss();

    const fuzzyThreshold = options.fuzzyThreshold ?? 0.76;
    const ai = new AiHintsProvider(!!options.aiHints, options.aiConfig);

    // Flatten API
    let apiMap = await this.cacheService.getFlattenedApi(apiDoc);
    if (!apiMap) {
      apiMap = this.flattenOpenApiToLeafMap(apiDoc);
      await this.cacheService.cacheFlattenedApi(apiDoc, apiMap);
    }

    // Flatten Model
    let modelMap = await this.cacheService.getFlattenedModel(modelSchema);
    if (!modelMap) {
      modelMap = this.flattenModelToLeafMap(modelSchema);
      await this.cacheService.cacheFlattenedModel(modelSchema, modelMap);
    }

    const apiFields = [...(apiMap?.values() ?? [])];
    const modelFields = [...(modelMap?.values() ?? [])];

    // === Step 0: AI hints
    let _aiHints: any = null;
    if (options.aiHints) {
      _aiHints = await this.cacheService.getAiHints(apiFields, modelFields);
      if (!_aiHints) {
        _aiHints = await ai.proposeTokenHints(apiFields, modelFields);
        await this.cacheService.cacheAiHints(apiFields, modelFields, _aiHints);
      }
    }

    // === Step 1: exact matches
    const takenModel = new Set<string>();
    const matches: FieldMatch[] = [];
    for (const a of apiFields) {
      const exact = this.findExactOrContained(a, modelFields, takenModel);
      if (exact) {
        takenModel.add(exact.model.path);
        matches.push(exact);
      }
    }

    // === Step 2: fuzzy matches
    const remApi = apiFields.filter(
      (a) => !matches.some((m) => m.api.path === a.path),
    );
    const remModel = modelFields.filter((m) => !takenModel.has(m.path));

    for (const a of remApi) {
      let best: FieldMatch | null = null;
      for (const m of remModel) {
        const reason = scorePair(a, m);
        if (reason.finalScore >= fuzzyThreshold && reason.typeCompatible) {
          if (!best || reason.finalScore > best.score) {
            best = { api: a, model: m, score: reason.finalScore, reason };
          }
        }
      }
      if (best) {
        takenModel.add(best.model.path);
        matches.push(best);
      }
    }

    // === Build results
    const matchedApiPaths = new Set(matches.map((m) => m.api.path));
    const matchedModelPaths = new Set(matches.map((m) => m.model.path));
    const fields: CompareResultField[] = [];

    // Matched
    for (const m of matches) {
      fields.push({
        field_name: m.api.leaf,
        status: 'matched',
        expected_type: m.model.type,
        actual_type: m.api.type,
        expected_format: m.model.format ?? null,
        actual_format: m.api.format ?? null,
        issue: '',
        suggestion: '',
        confidence: Number(m.score.toFixed(3)),
        rationale: this.renderRationale(m),
      });
    }

    // Extra
    for (const a of apiFields) {
      if (!matchedApiPaths.has(a.path)) {
        fields.push({
          field_name: a.leaf,
          status: 'extra',
          expected_type: '',
          actual_type: a.type,
          expected_format: null,
          actual_format: a.format ?? null,
          issue: `Field '${a.leaf}' appears only in API.`,
          suggestion: 'Consider mapping or marking as non-essential.',
          confidence: 0.5,
          rationale: 'No compatible model field above threshold.',
        });
      }
    }

    // Missing
    for (const m of modelFields) {
      if (!matchedModelPaths.has(m.path)) {
        fields.push({
          field_name: m.leaf,
          status: 'missing',
          expected_type: m.type,
          actual_type: '',
          expected_format: m.format ?? null,
          actual_format: null,
          issue: `Model field '${m.leaf}' has no API counterpart.`,
          suggestion: 'Check upstream API or adjust mapping rules.',
          confidence: 0.0,
          rationale: 'No API field matched.',
        });
      }
    }

    const extra = apiFields.length - matchedApiPaths.size;
    const missing = modelFields.length - matchedModelPaths.size;
    const matched = matches.length;
    const total = matched + extra + missing;
    const accuracy = total === 0 ? 100 : (matched / total) * 100;

    fields.sort((a, b) => {
      const rank = (s: CompareResultField['status']) =>
        s === 'matched' ? 0 : s === 'extra' ? 1 : 2;
      const dr = rank(a.status) - rank(b.status);
      if (dr !== 0) return dr;
      if (a.status === 'matched' && b.status === 'matched')
        return b.confidence - a.confidence;
      return a.field_name.localeCompare(b.field_name);
    });

    const result: CompareResult = {
      api_name: this.detectApiName(apiDoc) ?? 'API Comparison',
      validation_date: new Date().toISOString(),
      total_fields_compared: apiFields.length + modelFields.length,
      matched_fields: matched,
      unmatched_fields: extra + missing,
      extra_fields: extra,
      missing_fields: missing,
      accuracy_score: Number(accuracy.toFixed(3)),
      fields,
      matches: matches
        .sort((x, y) => y.score - x.score)
        .map((m) => ({
          api_field: m.api.path,
          model_field: m.model.path,
          score: Number(m.score.toFixed(3)),
          reason: m.reason,
        })),
    };

    await this.cacheService.cacheComparisonResult(
      apiDoc,
      modelSchema,
      options,
      result,
    );
    const executionTime = Date.now() - startTime;
    this.performanceService.recordComparison(executionTime);

    return result;
  }

  // === Helpers

  private detectApiName(doc: any): string | null {
    return doc?.info?.title ?? null;
  }

  private filterMatchingModels(apiDoc: any, models: any[]): any[] {
    const apiText = JSON.stringify(apiDoc).toLowerCase();
    return models.filter(
      (m) =>
        (m.title && apiText.includes(m.title.toLowerCase())) ||
        (m.description && apiText.includes(m.description.toLowerCase())),
    );
  }

  flattenOpenApiToLeafMap(doc: any) {
    return flattenOpenApiToLeafMap(doc);
  }
  flattenModelToLeafMap(model: any) {
    return flattenModelToLeafMap(model);
  }

  private findExactOrContained(
    a: FieldDescriptor,
    models: FieldDescriptor[],
    taken: Set<string>,
  ): FieldMatch | null {
    const eq = models.find((m) => !taken.has(m.path) && a.norm === m.norm);
    if (eq) {
      const reason = {
        modelField: eq.path,
        apiField: a.path,
        jwName: 1,
        tokenJaccard: 1,
        typeBonus: 0.08,
        dateBias: 0,
        synonymsBoost: 0,
        finalScore: 1,
        typeCompatible: true,
        notes: ['normalized leaf equality'],
        tokensCompared: { api: a.coreTokens, model: eq.coreTokens },
      };
      return { api: a, model: eq, score: 1, reason };
    }

    const aSet = new Set(a.coreTokens);
    const candidates = models
      .filter((m) => !taken.has(m.path))
      .map((m) => {
        const mSet = new Set(m.coreTokens);
        let contained = true;
        for (const tok of mSet)
          if (!aSet.has(tok)) {
            contained = false;
            break;
          }
        return { m, contained };
      })
      .filter((x) => x.contained)
      .map((x) => x.m);

    if (candidates.length === 1) {
      const m = candidates[0];
      const reason = {
        modelField: m.path,
        apiField: a.path,
        jwName: 0.9,
        tokenJaccard: 1,
        typeBonus: 0.08,
        dateBias: 0,
        synonymsBoost: 0.03,
        finalScore: 0.97,
        typeCompatible: true,
        notes: ['core-token containment'],
        tokensCompared: { api: a.coreTokens, model: m.coreTokens },
      };
      return { api: a, model: m, score: 0.97, reason };
    }

    return null;
  }

  private renderRationale(m: FieldMatch): string {
    const r = m.reason;
    const bits = [
      `Matched API '${m.api.path}' → Model '${m.model.path}'.`,
      `Name JW=${r.jwName.toFixed(2)}, Tokens Jaccard=${r.tokenJaccard.toFixed(
        2,
      )}, TypeBonus=${r.typeBonus.toFixed(2)}, DateBias=${r.dateBias.toFixed(
        2,
      )}.`,
      r.typeCompatible ? 'Types compatible.' : 'Types NOT compatible.',
      r.notes.length ? `Notes: ${r.notes.join('; ')}` : '',
      `Tokens (api↔model): ${r.tokensCompared.api.join('+')} ↔ ${
        r.tokensCompared.model.join('+')
      }`,
    ].filter(Boolean);
    return bits.join(' ');
  }
}
