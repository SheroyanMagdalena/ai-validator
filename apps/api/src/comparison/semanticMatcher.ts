import { FieldDescriptor, MatchReason, PrimitiveType } from './types';
import { isLikelyDate, jaccard, jaroWinkler } from './normalization';

function typeCompatible(a: PrimitiveType, b: PrimitiveType): boolean {
  if (a === 'unknown' || b === 'unknown') return true; // don't block on unknown
  if (a === b) return true;
  if ((a === 'integer' && b === 'number') || (a === 'number' && b === 'integer')) return true;
  if ((a === 'date' || a === 'datetime') && b === 'string') return true;
  if ((b === 'date' || b === 'datetime') && a === 'string') return true;
  return false;
}

export function scorePair(api: FieldDescriptor, model: FieldDescriptor): MatchReason {
  const jwName = jaroWinkler(api.leaf.toLowerCase(), model.leaf.toLowerCase());

  const tokenJaccard = jaccard(api.coreTokens, model.coreTokens);

  const typeCompat = typeCompatible(api.type, model.type);
  const typeBonus = typeCompat ? 0.08 : -0.25;

  const apiDate = isLikelyDate(api.coreTokens, api.format);
  const modelDate = isLikelyDate(model.coreTokens, model.format);
  const dateBias = apiDate && modelDate ? 0.07 : 0;

  // Mild synonyms boost whenever tokens intersect via expansions
  const synonymsBoost = tokenJaccard > 0 && tokenJaccard < 1 ? 0.03 : 0;

  // Blend: name similarity is primary, then tokens, with bonuses
  let finalScore = 0.58 * jwName + 0.32 * tokenJaccard + typeBonus + dateBias + synonymsBoost;

  // Clamp
  finalScore = Math.max(0, Math.min(1, finalScore));

  const notes: string[] = [];
  if (!typeCompat) notes.push(`types differ (${api.type} vs ${model.type})`);
  if (apiDate && modelDate) notes.push('date bias applied');
  if (synonymsBoost > 0) notes.push('synonym expansion contributed');

  return {
    modelField: model.path,
    apiField: api.path,
    jwName,
    tokenJaccard,
    typeBonus,
    dateBias,
    synonymsBoost,
    finalScore,
    typeCompatible: typeCompat,
    notes,
    tokensCompared: { api: api.coreTokens, model: model.coreTokens }
  };
}
