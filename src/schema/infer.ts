import { previewFieldValue } from "../utils/redact";
import type { PrimitiveType, SchemaNode } from "./types";

function typeOfValue(value: unknown): PrimitiveType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return t;
  return "object";
}

function mergeTypes(existing: PrimitiveType[], observed: PrimitiveType): PrimitiveType[] {
  return existing.includes(observed) ? existing : [...existing, observed];
}

/**
 * Folds one more observed value into a schema node, returning a *new* node
 * rather than mutating `existing`. Immutability matters here: callers
 * build a tentative "what would the baseline look like if we accepted
 * this sample" schema to diff against, and must be able to discard it
 * without corrupting the real baseline if the change is rejected.
 *
 * `fieldName` is only used to build a redacted example preview — it does
 * not affect merge behavior.
 */
export function mergeValueIntoNode(
  existing: SchemaNode | undefined,
  value: unknown,
  fieldName = "",
): SchemaNode {
  const type = typeOfValue(value);
  const base: SchemaNode = existing
    ? { ...existing, types: [...existing.types] }
    : { types: [], sampleCount: 0, nullCount: 0 };

  base.sampleCount += 1;
  base.types = mergeTypes(base.types, type);

  if (type === "null") {
    base.nullCount += 1;
    return base;
  }

  if (type === "array") {
    let itemsNode = base.items;
    for (const item of value as unknown[]) {
      itemsNode = mergeValueIntoNode(itemsNode, item, `${fieldName}[]`);
    }
    base.items = itemsNode;
    return base;
  }

  if (type === "object") {
    const properties: Record<string, SchemaNode> = { ...base.properties };
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      properties[key] = mergeValueIntoNode(properties[key], val, key);
    }
    base.properties = properties;
    return base;
  }

  // Primitive: keep a small redacted preview for the UI's diff/schema view.
  base.example = previewFieldValue(fieldName, value);
  return base;
}

/** Builds a fresh schema node tree from a single sample — a convenience wrapper over `mergeValueIntoNode`. */
export function inferSchemaFromValue(value: unknown): SchemaNode {
  return mergeValueIntoNode(undefined, value, "");
}
