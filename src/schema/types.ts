/** Minimal JSON-Schema-like structural model used for inference and diffing. */

export type PrimitiveType = "string" | "number" | "boolean" | "null" | "object" | "array";

/**
 * One node in the inferred schema tree — could represent the whole
 * response body, an object field, or an array's item type.
 *
 * `sampleCount` is the number of samples in which this node's *parent*
 * had this key present at all (for the root node, it's the number of
 * responses merged in total). Comparing a field's `sampleCount` against
 * its parent object's `sampleCount` is how optionality is derived —
 * see `schema/infer.ts`.
 */
export interface SchemaNode {
  types: PrimitiveType[];
  sampleCount: number;
  nullCount: number;
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  /** Redaction-safe example value, kept for the UI — never the raw sensitive value. */
  example?: string;
}

/** Samples required before a `learning` endpoint's schema is frozen as a baseline. One response is not a reliable contract. */
export const MIN_SAMPLES_FOR_BASELINE = 3;

export function isOptionalField(field: SchemaNode, parentSampleCount: number): boolean {
  return field.sampleCount < parentSampleCount;
}

export function isNullableField(field: SchemaNode): boolean {
  return field.nullCount > 0;
}
