// Tokenization + normalization + core-token reduction

const LANG_PREFIXES = new Set([
  'en','eng','ru','rus','hy','arm','am','ka','geo','ge','de','fr','es','ar','fa','tr'
]);

const GENERIC_TOKENS = new Set([
  'name','code','type','id','identifier','no','num','number',
  'desc','description','value','val','field','data','info'
]);

const DATE_TOKENS = new Set(['date','dob','birth','birthday','birthdate','timestamp','ts']);

const SYNONYM_EXPAND: Record<string, string[]> = {
  dob: ['date','birth'],
  ssn: ['social','security','number'],
  psn: ['personal','serial','number'],
  pin: ['personal','identification','number'],
  uuid: ['id'],
  guid: ['id'],
  surname: ['last','name'],
  forename: ['first','name'],
  patronymic: ['middle','name']
};

export function isLikelyDate(tokens: string[], format?: string | null): boolean {
  if (format && (format === 'date' || format === 'date-time')) return true;
  return tokens.some(t => DATE_TOKENS.has(t));
}

export function splitTokens(raw: string): string[] {
  if (!raw) return [];
  // Split camelCase and non-alphanumeric boundaries
  const step1 = raw.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return step1
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);
}

export function normalizeLeaf(path: string): string {
  // Parent.Child -> Child; A.B.C -> C
  if (!path) return path;
  const parts = path.split('.');
  return parts[parts.length - 1];
}

export function normalizeForEquality(s: string): string {
  return s.toLowerCase().replace(/[\s._\-]+/g, '');
}

export function reduceToCoreTokens(tokens: string[]): string[] {
  if (tokens.length === 0) return tokens;

  let t = [...tokens];

  // Drop 1st token if language prefix
  if (t.length > 1 && LANG_PREFIXES.has(t[0])) {
    t = t.slice(1);
  }

  // Remove generic tokens anywhere (acts like affix trimmer)
  t = t.filter(tok => !GENERIC_TOKENS.has(tok));

  // Expand synonyms to improve intersection
  const expanded: string[] = [];
  for (const tok of t) {
    expanded.push(tok);
    if (SYNONYM_EXPAND[tok]) expanded.push(...SYNONYM_EXPAND[tok]);
  }

  // De-duplicate while preserving order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tok of expanded) {
    if (!seen.has(tok)) {
      seen.add(tok);
      out.push(tok);
    }
  }
  return out;
}

export function jaroWinkler(a: string, b: string): number {
  // Standard JW implementation for shortish field names
  if (a === b) return 1;
  const m = Math.floor(Math.max(a.length, b.length) / 2) - 1;
  const matchesA = new Array(a.length).fill(false);
  const matchesB = new Array(b.length).fill(false);
  let matches = 0;

  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - m);
    const end = Math.min(b.length - 1, i + m);
    for (let j = start; j <= end; j++) {
      if (!matchesB[j] && a[i] === b[j]) {
        matchesA[i] = true;
        matchesB[j] = true;
        matches++;
        break;
      }
    }
  }
  if (matches === 0) return 0;

  let t = 0; // transpositions
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (matchesA[i]) {
      while (!matchesB[k]) k++;
      if (a[i] !== b[k]) t++;
      k++;
    }
  }
  const jaro = (matches / a.length + matches / b.length + (matches - t / 2) / matches) / 3;

  // Winkler prefix scale
  let l = 0;
  while (l < 4 && a[l] === b[l]) l++;
  const p = 0.1;
  return jaro + l * p * (1 - jaro);
}

export function jaccard(a: string[], b: string[]): number {
  if (!a.length && !b.length) return 1;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function toCoreTokensFromName(name: string): string[] {
  return reduceToCoreTokens(splitTokens(name));
}

export function inferPrimitiveType(openapiType?: string, format?: string | null): import('./types').PrimitiveType {
  const t = (openapiType || '').toLowerCase();
  const f = (format || '').toLowerCase();
  if (f === 'date') return 'date';
  if (f === 'date-time' || f === 'datetime') return 'datetime';
  if (t === 'integer') return 'integer';
  if (t === 'number') return 'number';
  if (t === 'boolean') return 'boolean';
  if (t === 'string' || f) return 'string';
  return 'unknown';
}
