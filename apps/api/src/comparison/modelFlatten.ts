// apps/api/src/comparison/modelFlatten.ts
import { FieldDescriptor } from './types';
import {
  inferPrimitiveType,
  normalizeForEquality,
  normalizeLeaf,
  toCoreTokensFromName,
} from './normalization';

const JSON_SCHEMA_META_KEYS = new Set([
  '$schema',
  '$id',
  'title',
  'description',
  'default',
  'examples',
  'deprecated',
  'readOnly',
  'writeOnly',
  'nullable',
  'enum',
  'const',
  'required',       // <— important: skip
  'additionalProperties',
  'patternProperties',
  'allOf',
  'anyOf',
  'oneOf',
  'not',
]);

/**
 * Flattens a data model schema to leaf fields (leaf = primitives only).
 * Supports:
 *  - JSON Schema (type: object + properties): ONLY walks `properties`, skips meta & `required`.
 *  - OpenAPI-like objects (components.schemas) — unchanged.
 *  - Plain POJO or array-of-strings (paths) — unchanged, but array indices are NOT emitted as leaves.
 */
export function flattenModelToLeafMap(
  model: any,
  typeHints?: Record<string, { type?: string; format?: string | null }>
): Map<string, FieldDescriptor> {
  const out = new Map<string, FieldDescriptor>();

  const pushLeaf = (p: string, type?: string, format?: string | null, meta?: any) => {
    const leaf = normalizeLeaf(p);
    out.set(p, {
      path: p,
      leaf,
      norm: normalizeForEquality(leaf),
      coreTokens: toCoreTokensFromName(leaf),
      type: inferPrimitiveType(type, format ?? null),
      format: format ?? null,
      meta,
    });
  };

  const visitJsonSchema = (node: any, path: string[]) => {
    if (!node || typeof node !== 'object') return;

    // Only honor JSON Schema shape
    // 1) Dive into "properties" (objects)
    if (node.type === 'object' && node.properties && typeof node.properties === 'object') {
      for (const [k, v] of Object.entries<any>(node.properties)) {
        visitJsonSchema(v, [...path, k]);
      }
      return;
    }

    // 2) If array of primitives, we treat the parent as leaf (arrays are containers)
    if (node.type === 'array' && node.items && typeof node.items === 'object') {
      const it = node.items;
      if (it.type && it.type !== 'object' && it.type !== 'array') {
        pushLeaf(path.join('.'), it.type, it.format, node);
      }
      return;
    }

    // 3) Primitive leaf
    if (node.type && node.type !== 'object' && node.type !== 'array') {
      pushLeaf(path.join('.'), node.type, node.format, node);
      return;
    }

    // Skip JSON-Schema meta keys (including "required") if we ever get here with raw objects
    for (const [k, v] of Object.entries<any>(node)) {
      if (JSON_SCHEMA_META_KEYS.has(k) || k.startsWith('x-')) continue; // ignore metadata & vendor ext
      // If the child is a schema-like object, keep visiting; NEVER descend into arrays of strings (like required)
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        visitJsonSchema(v, [...path, k]);
      }
      // Arrays here are treated as metadata unless the parent declared `type: array` above (already handled)
    }
  };

  // === Case 1: OpenAPI-ish (unchanged)
  if (model?.components?.schemas) {
    const visit = (node: any, path: string[]) => {
      if (!node || typeof node !== 'object') return;
      if (node.$ref) return;
      if (node.type === 'object' && node.properties) {
        for (const [k, v] of Object.entries<any>(node.properties)) {
          visit(v, [...path, k]);
        }
        return;
      }
      if (node.type === 'array' && node.items) {
        const it = node.items;
        if (it && !it.$ref && it.type && it.type !== 'object' && it.type !== 'array') {
          pushLeaf(path.join('.'), it.type, it.format, node);
        }
        return;
      }
      if (node.type && node.type !== 'object' && node.type !== 'array') {
        pushLeaf(path.join('.'), node.type, node.format, node);
      }
    };

    for (const [name, schema] of Object.entries<any>(model.components.schemas)) {
      visit(schema, [String(name)]);
    }
    return out;
  }

  // === Case 1b: JSON Schema root (your uploaded file)
  if (model && typeof model === 'object' && model.type === 'object' && model.properties) {
    visitJsonSchema(model, []); // start at root; path will be each property name
    return out;
  }

  // === Case 2: Generic POJO model (not JSON Schema)
  if (model && typeof model === 'object' && !Array.isArray(model)) {
    const walk = (obj: any, trail: string[]) => {
      if (!obj || typeof obj !== 'object') return;

      // Do NOT descend into arrays here; treat arrays as containers only
      if (Array.isArray(obj)) return;

      // Typed leaf
      if (obj.type && obj.type !== 'object' && obj.type !== 'array') {
        pushLeaf(trail.join('.'), obj.type, obj.format ?? null, obj);
        return;
      }

      // Object → walk children
      for (const [k, v] of Object.entries<any>(obj)) {
        if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
          walk(v, [...trail, k]);
        } else {
          // Fallback to typeHints only; do NOT emit bare scalars from arbitrary POJOs
          const keyPath = [...trail, k].join('.');
          const hint = typeHints?.[keyPath];
          if (hint) {
            pushLeaf(keyPath, hint.type ?? 'string', hint.format ?? null, { hint: true });
          }
        }
      }
    };
    walk(model, []);
    return out;
  }

  // === Case 3: Array of strings = explicit leaf paths
  if (Array.isArray(model)) {
    for (const p of model) {
      if (typeof p !== 'string') continue;
      const hint = typeHints?.[p];
      pushLeaf(String(p), hint?.type ?? 'string', hint?.format ?? null, { hint: true });
    }
    return out;
  }

  return out;
}
