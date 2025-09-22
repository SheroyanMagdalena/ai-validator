import { Injectable } from '@nestjs/common';
import { CompareOptions, CompareResult, CompareResultField, FieldDescriptor, FieldMatch } from './types';
import { flattenOpenApiToLeafMap } from './openapiFlatten';
import { flattenModelToLeafMap } from './modelFlatten';
import { normalizeForEquality, toCoreTokensFromName } from './normalization';
import { scorePair } from './semanticMatcher';
import { AiHintsProvider } from './aiHints';

@Injectable()
export class ComparisonService {
  /**
   * Public entry: compare OpenAPI spec to data model and produce human-aligned mapping with reasoning.
   * Two chained steps:
   *  1) Strict normalized equality & token containment (high-precision)
   *  2) Semantic fuzzy matching (Jaro-Winkler + tokens + type/date biases)
   */
  async compare(apiDoc: any, modelSchema: any, options: CompareOptions = {}): Promise<CompareResult> {
    const fuzzyThreshold = options.fuzzyThreshold ?? 0.76;
    const ai = new AiHintsProvider(!!options.aiHints, options.aiConfig);

    const apiMap = this.flattenOpenApiToLeafMap(apiDoc);
    const modelMap = this.flattenModelToLeafMap(modelSchema);

    const apiFields = [...apiMap.values()];
    const modelFields = [...modelMap.values()];

    // === Step 0: Optional AI token hints (future: use to augment core tokens)
    // (Not used to modify tokens by default, but can be logged/applied if you turn it on.)
    const _aiHints = await ai.proposeTokenHints(apiFields, modelFields);
    // (You can inject hints into scoring if desired.)

    // === Step 1: High-precision: exact normalized equality OR core-token containment
    const takenModel = new Set<string>();
    const matches: FieldMatch[] = [];
    for (const a of apiFields) {
      const exact = this.findExactOrContained(a, modelFields, takenModel);
      if (exact) {
        takenModel.add(exact.model.path);
        matches.push(exact);
      }
    }

    // === Step 2: Semantic match for remaining
    const remApi = apiFields.filter(a => !matches.some(m => m.api.path === a.path));
    const remModel = modelFields.filter(m => !takenModel.has(m.path));

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

    // Build field-level results
    const matchedApiPaths = new Set(matches.map(m => m.api.path));
    const matchedModelPaths = new Set(matches.map(m => m.model.path));

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
        rationale: this.renderRationale(m)
      } as CompareResultField);
    }

    // Extra (API leaves not matched)
    for (const a of apiFields) {
      if (!matchedApiPaths.has(a.path)) {
        fields.push({
          field_name: a.leaf,
          status: 'extra',
          expected_type: '',
          actual_type: a.type,
          expected_format: null,
          actual_format: a.format ?? null,
          issue: `Field '${a.leaf}' appears only in API (ignored containers & $ref).`,
          suggestion: 'Consider mapping or marking as non-essential.',
          confidence: 0.5,
          rationale: 'No compatible model field above threshold.'
        });
      }
    }

    // Missing (model leaves not matched)
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
          rationale: 'No API field matched.'
        });
      }
    }

    // Unmatched (strict sense = extras + missings)
    const extra = apiFields.length - matchedApiPaths.size;
    const missing = modelFields.length - matchedModelPaths.size;
    const matched = matches.length;
    const total = matched + extra + missing;
    const accuracy = total === 0 ? 1 : matched / total;

    // Sort for stable output: matched (desc score), then extra, then missing
    fields.sort((a, b) => {
      const rank = (s: CompareResultField['status']) =>
        s === 'matched' ? 0 : s === 'extra' ? 1 : 2;
      const dr = rank(a.status) - rank(b.status);
      if (dr !== 0) return dr;
      if (a.status === 'matched' && b.status === 'matched') return b.confidence - a.confidence;
      return a.field_name.localeCompare(b.field_name);
    });

    return {
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
        .map(m => ({
          api_field: m.api.path,
          model_field: m.model.path,
          score: Number(m.score.toFixed(3)),
          reason: m.reason
        }))
    };
  }

  /** Exposed for other modules/tests */
  flattenOpenApiToLeafMap(doc: any) {
    return flattenOpenApiToLeafMap(doc);
  }
  flattenModelToLeafMap(model: any) {
    return flattenModelToLeafMap(model);
  }

  // ===== Internals

  private detectApiName(doc: any): string | null {
    return doc?.info?.title ?? null;
  }

  private findExactOrContained(a: FieldDescriptor, models: FieldDescriptor[], taken: Set<string>): import('./types').FieldMatch | null {
    // Exact normalized equality on leaf name
    const eq = models.find(m => !taken.has(m.path) && a.norm === m.norm);
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
        tokensCompared: { api: a.coreTokens, model: eq.coreTokens }
      };
      return { api: a, model: eq, score: 1, reason };
    }

    // Core-token containment (e.g., api: [birth, date] vs model: [date])
    const aSet = new Set(a.coreTokens);
    const candidates = models
      .filter(m => !taken.has(m.path))
      .map(m => {
        const mSet = new Set(m.coreTokens);
        let contained = true;
        for (const tok of mSet) if (!aSet.has(tok)) { contained = false; break; }
        return { m, contained };
      })
      .filter(x => x.contained)
      .map(x => x.m);

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
        tokensCompared: { api: a.coreTokens, model: m.coreTokens }
      };
      return { api: a, model: m, score: 0.97, reason };
    }

    return null;
  }

  private renderRationale(m: import('./types').FieldMatch): string {
    const r = m.reason;
    const bits = [
      `Matched API '${m.api.path}' → Model '${m.model.path}'.`,
      `Name JW=${r.jwName.toFixed(2)}, Tokens Jaccard=${r.tokenJaccard.toFixed(2)}, TypeBonus=${r.typeBonus.toFixed(2)}, DateBias=${r.dateBias.toFixed(2)}.`,
      r.typeCompatible ? 'Types compatible.' : 'Types NOT compatible.',
      r.notes.length ? `Notes: ${r.notes.join('; ')}` : '',
      `Tokens (api↔model): ${r.tokensCompared.api.join('+')} ↔ ${r.tokensCompared.model.join('+')}`
    ].filter(Boolean);
    return bits.join(' ');
  }
}
