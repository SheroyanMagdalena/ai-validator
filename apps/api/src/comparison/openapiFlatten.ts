import { FieldDescriptor, PrimitiveType } from './types';
import { inferPrimitiveType, normalizeForEquality, normalizeLeaf, toCoreTokensFromName } from './normalization';

/**
 * Flattens an OpenAPI 3.x doc to only **leaf** fields.
 * - Ignores containers (objects, arrays) and pure $ref stubs.
 * - Does NOT resolve $ref (per request).
 * Produces FieldDescriptor map keyed by original path.
 */
export function flattenOpenApiToLeafMap(doc: any): Map<string, FieldDescriptor> {
  const out = new Map<string, FieldDescriptor>();

  const visitSchema = (
    schema: any,
    path: string[],
  ) => {
    if (!schema || typeof schema !== 'object') return;

    // Skip pure $ref containers or composition containers
    if (schema.$ref) {
      // per requirement: ignore $ref containers
      return;
    }

    // Handle oneOf/allOf/anyOf: ignore containers; keep direct primitives if any
    const composite = schema.oneOf || schema.allOf || schema.anyOf;
    if (Array.isArray(composite)) {
      // if any member is direct primitive, include it, else skip (container)
      for (const member of composite) {
        if (!member || member.$ref) continue;
        const t: PrimitiveType = inferPrimitiveType(member.type, member.format);
        if (t !== 'unknown' && member.type !== 'object' && member.type !== 'array') {
          const pstr = path.join('.');
          pushLeaf(pstr, member.type, member.format, member);
        }
      }
      return;
    }

    if (schema.type === 'object' && schema.properties) {
      for (const [k, v] of Object.entries<any>(schema.properties)) {
        visitSchema(v, [...path, k]);
      }
      return;
    }

    if (schema.type === 'array' && schema.items) {
      // Array container → check item primitive; else skip
      const item = schema.items;
      if (item && !item.$ref && item.type && item.type !== 'object' && item.type !== 'array') {
        const pstr = path.join('.');
        pushLeaf(pstr, item.type, item.format, schema);
      }
      return;
    }

    // Primitive leaf
    if (schema.type && schema.type !== 'object' && schema.type !== 'array') {
      const pstr = path.join('.');
      pushLeaf(pstr, schema.type, schema.format, schema);
    }

    function pushLeaf(p: string, type?: string, format?: string, meta?: any) {
      const leaf = normalizeLeaf(p);
      const fdesc: FieldDescriptor = {
        path: p,
        leaf,
        norm: normalizeForEquality(leaf),
        coreTokens: toCoreTokensFromName(leaf),
        type: inferPrimitiveType(type, format),
        format: (format ?? null),
        meta
      };
      out.set(p, fdesc);
    }
  };

  // Explore paths -> responses -> content -> schema
  if (doc?.paths) {
    for (const [, pathItem] of Object.entries<any>(doc.paths)) {
      for (const [, op] of Object.entries<any>(pathItem || {})) {
        const responses = op?.responses;
        if (!responses) continue;
        for (const [, resp] of Object.entries<any>(responses)) {
          const content = resp?.content;
          if (!content) continue;
          for (const [, media] of Object.entries<any>(content)) {
            const schema = media?.schema;
            if (schema) visitSchema(schema, []);
          }
        }
      }
    }
  }

  // Also scan components.schemas if present
  if (doc?.components?.schemas) {
    for (const [name, schema] of Object.entries<any>(doc.components.schemas)) {
      visitSchema(schema, [String(name)]);
    }
  }

  return out;
}
