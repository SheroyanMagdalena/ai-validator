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
import { toCoreTokensFromName } from './normalization';

type XSystemMappings = Record<string, Record<string, string>>;

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
  async compare(apiDoc: any, options: CompareOptions = {}): Promise<CompareResult> {
    const models = await this.db.collection('data').find().toArray();
    if (!models || models.length === 0) {
      throw new Error('No data models found in database');
    }

    // Pick relevant models
    const chosenModels = this.filterMatchingModels(apiDoc, models);

    const comparedMeta = chosenModels.map((m: any) => ({      
      id: m?._id ? String(m._id) : (m?.id ? String(m.id) : null),
      title: m?.title ?? m?.name ?? null,
      level: (m.__matchLevel as 'HIGH' | 'HM' | 'legacy' | 'all') ?? undefined,
    }));
    if (chosenModels.length === 0) {
      return {
        api_name: this.detectApiName(apiDoc) ?? 'API Comparison',
        validation_date: new Date().toISOString(),
        total_fields_compared: 0,
        matched_fields: 0,
        unmatched_fields: 0,
        extra_fields: 0,
        missing_fields: 0,
        accuracy_score: 0,
        fields: [],
        matches: [],
      };
    }

    // Run full comparison for each chosen model
    const results: CompareResult[] = [];
    for (const model of chosenModels) {
      const result = await this.compareAgainstModel(apiDoc, model, options);
      results.push(result);
    }

    // Return the result with the highest accuracy score
    const bestResult = results.reduce((best, current) => 
      current.accuracy_score > best.accuracy_score ? current : best
    );

    bestResult.models_compared_count = comparedMeta.length;
    bestResult.models_compared = comparedMeta;
    return bestResult;
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
            best = { api: a, model: m, score: reason.finalScore, reason, kind: 'fuzzy' };
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

    const modelId = modelSchema?._id ? String(modelSchema._id) : (modelSchema?.id ? String(modelSchema.id) : null);
    const modelTitle = modelSchema?.title ?? modelSchema?.name ?? null;
    const modelSystemCode = modelSchema?.['x-system-code'] ?? modelSchema?.systemCode ?? null;

    // Matched
for (const m of matches) {
  fields.push({
    field_name: m.api.leaf,
    status: 'matched',
    api_path: m.api.path,
    model_path: m.model.path,
    resolution: m.kind ?? 'fuzzy',
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
      api_path: a.path,
      model_path: null,
      resolution: null,
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
      api_path: null,
      model_path: m.path,
      resolution: null,
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
  model_id: modelId,
  model_title: modelTitle,
  model_system_code: modelSystemCode,

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
      match_type: m.kind ?? 'fuzzy',
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
  // SYSTEM/MATCHING THRESHOLDS — tune these to be more/less selective
  const SYSTEM_CODE = 'AVV' as const;

  // HIGH match: clearly relevant models
  const HIGH_MIN_HITS = 5;       // at least 5 token intersections
  const HIGH_MIN_JACCARD = 0.20; // or >= 0.20 token-set overlap

  // HIGH/MEDIUM match: still relevant, a bit looser
  const HM_MIN_HITS = 3;         // at least 3 token intersections
  const HM_MIN_JACCARD = 0.14;   // or >= 0.14 overlap

  // 1) Build API token bag (title, tags, schema names, and leaf fields)
  const apiTokens = this.buildApiTokenSet(apiDoc);

  // 2) Score every model by overlap with x-system-mappings[AVV]
  type Scored = { model: any; hits: number; jaccard: number; level: 'HIGH' | 'HM' | 'NONE' };
  const scored: Scored[] = models.map((m) => {
    const sys: XSystemMappings | undefined = m['x-system-mappings'];
    const avv = sys?.[SYSTEM_CODE];

    if (!avv) {
      return { model: m, hits: 0, jaccard: 0, level: 'NONE' };
    }

    // Gather model tokens from all mapping values (split on commas, normalize)
    const modelTokens = new Set<string>();
    for (const raw of Object.values(avv)) {
      String(raw)
        .split(',')
        .map((s) => s.trim())
        .forEach((piece) => {
          for (const t of toCoreTokensFromName(piece)) modelTokens.add(t);
        });
    }

    // Intersections & Jaccard
    let hits = 0;
    for (const t of modelTokens) if (apiTokens.has(t)) hits++;
    const denom = modelTokens.size + apiTokens.size - hits;
    const jaccard = denom <= 0 ? 0 : hits / denom;

    // Classify level
    let level: Scored['level'] = 'NONE';
    if (hits >= HIGH_MIN_HITS || jaccard >= HIGH_MIN_JACCARD) {
      level = 'HIGH';
    } else if (hits >= HM_MIN_HITS || jaccard >= HM_MIN_JACCARD) {
      level = 'HM';
    }

    return { model: m, hits, jaccard, level };
  });

  // 3) Keep HIGH first; if none, keep HIGH/MEDIUM; if still none — fallback to legacy substring check, else all
  let kept = scored
    .filter((s) => s.level === 'HIGH')
    .sort((a, b) => (b.hits - a.hits) || (b.jaccard - a.jaccard))
    .map((s) => s.model);

  if (kept.length === 0) {
    kept = scored
      .filter((s) => s.level === 'HM')
      .sort((a, b) => (b.hits - a.hits) || (b.jaccard - a.jaccard))
      .map((s) => s.model);
  }

  if (kept.length > 0) return kept;

  // 4) Graceful fallback to your legacy behavior (so nothing breaks)
  const apiText = JSON.stringify(apiDoc).toLowerCase();
  const legacy = models.filter(
    (m) =>
      (m.title && apiText.includes(String(m.title).toLowerCase())) ||
      (m.description && apiText.includes(String(m.description).toLowerCase())),
  );

  return legacy.length > 0 ? legacy : models;
}

/**
 * Build a normalized token set from API title, tags, schema names, and leaf fields.
 * Uses your existing flattener + normalization for consistency.
 */
private buildApiTokenSet(apiDoc: any): Set<string> {
  const tokens = new Set<string>();
  const pushTokens = (s?: string) => {
    if (!s) return;
    for (const t of toCoreTokensFromName(String(s))) tokens.add(t);
  };

  // info.title
  pushTokens(apiDoc?.info?.title);

  // tags
  if (Array.isArray(apiDoc?.tags)) {
    for (const t of apiDoc.tags) {
      pushTokens(t?.name);
      pushTokens(t?.description);
    }
  }

  // components.schemas names
  const schemas = apiDoc?.components?.schemas || {};
  for (const k of Object.keys(schemas)) pushTokens(k);

  // leaf fields (use cache if you already have it; here we reuse your cache service)
  let apiMap = flattenOpenApiToLeafMap(apiDoc);
  if (!apiMap) {
    apiMap = flattenOpenApiToLeafMap(apiDoc);
    // best-effort cache without awaiting (if you want)
    this.cacheService?.cacheFlattenedApi?.(apiDoc, apiMap).catch(() => void 0);
  }

  for (const leaf of (apiMap ? Array.from(apiMap.values()) : [])) {
    pushTokens(leaf.leaf);
    for (const ct of leaf.coreTokens) tokens.add(ct);
  }

  return tokens;
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
    return { api: a, model: eq, score: 1, reason, kind: 'exact' };
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
    return { api: a, model: m, score: 0.97, reason, kind: 'containment' };
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
