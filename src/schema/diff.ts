import { isOptionalField, type PrimitiveType, type SchemaNode } from "./types";

export type ChangeSeverity = "safe" | "breaking" | "ambiguous";

export type ChangeKind =
  | "field-added"
  | "field-removed"
  | "type-changed"
  | "possibly-renamed"
  | "became-null";

export interface SchemaChange {
  /** Dotted path to the affected field, e.g. `user.address.city` or `items[].id`. */
  path: string;
  kind: ChangeKind;
  severity: ChangeSeverity;
  message: string;
  from?: string;
  to?: string;
}

export interface DiffResult {
  changes: SchemaChange[];
  hasBreaking: boolean;
  hasAmbiguous: boolean;
}

const ROOT_PATH = "$";

function typeLabel(types: PrimitiveType[]): string {
  const core = types.filter((t) => t !== "null");
  return core.length > 0 ? core.join("|") : "null";
}

function childPath(parentPath: string, key: string): string {
  return parentPath === ROOT_PATH ? key : `${parentPath}.${key}`;
}

/**
 * Diffs one object-shaped level of the tree. Field-level add/remove is
 * schema-aware, not a raw key-set diff: a field the baseline already
 * treats as optional (absent in some past samples) simply not appearing
 * in this one sample is expected behavior, not a contract change — only
 * a field that was *always* present before and now is missing counts as
 * a breaking removal.
 */
function diffObjectLevel(
  baseNode: SchemaNode,
  sampleNode: SchemaNode,
  path: string,
  changes: SchemaChange[],
): void {
  const baseFields = baseNode.properties ?? {};
  const sampleFields = sampleNode.properties ?? {};
  const baseSampleCount = baseNode.sampleCount;

  const removed: Array<{ key: string; node: SchemaNode }> = [];
  const added: Array<{ key: string; node: SchemaNode }> = [];

  const allKeys = new Set([...Object.keys(baseFields), ...Object.keys(sampleFields)]);
  for (const key of allKeys) {
    const baseField = baseFields[key];
    const sampleField = sampleFields[key];

    if (baseField && !sampleField) {
      if (!isOptionalField(baseField, baseSampleCount)) {
        removed.push({ key, node: baseField });
      }
      continue;
    }
    if (!baseField && sampleField) {
      added.push({ key, node: sampleField });
      continue;
    }
    if (baseField && sampleField) {
      diffField(baseField, sampleField, childPath(path, key), changes);
    }
  }

  // Rename heuristic: a same-type-shape add+remove pair at the same
  // nesting level in a single diff is far more likely to be one renamed
  // field than two independent unrelated changes landing simultaneously.
  // This is a heuristic, not proof — the UI still lets a reviewer treat
  // it as two separate changes if that's what actually happened.
  if (
    removed.length === 1 &&
    added.length === 1 &&
    typeLabel(removed[0]!.node.types) === typeLabel(added[0]!.node.types)
  ) {
    const removedField = removed[0]!;
    const addedField = added[0]!;
    changes.push({
      path: childPath(path, addedField.key),
      kind: "possibly-renamed",
      severity: "breaking",
      message: `"${removedField.key}" appears renamed to "${addedField.key}" (both ${typeLabel(addedField.node.types)})`,
      from: removedField.key,
      to: addedField.key,
    });
    return;
  }

  for (const { key, node } of removed) {
    changes.push({
      path: childPath(path, key),
      kind: "field-removed",
      severity: "breaking",
      message: `Field "${key}" (${typeLabel(node.types)}) is no longer present`,
      from: typeLabel(node.types),
    });
  }
  for (const { key, node } of added) {
    changes.push({
      path: childPath(path, key),
      kind: "field-added",
      severity: "safe",
      message: `New field "${key}" (${typeLabel(node.types)})`,
      to: typeLabel(node.types),
    });
  }
}

/**
 * Compares one field's schema across baseline vs. the incoming sample.
 * A bare `present → null` transition is deliberately classified as
 * "ambiguous" rather than breaking: it might be a legitimate empty state
 * the client already handles, or it might be a backend regression — we
 * can't tell from shape alone, so it's flagged for a human instead of
 * auto-classified either way.
 */
function diffField(
  baseField: SchemaNode,
  sampleField: SchemaNode,
  path: string,
  changes: SchemaChange[],
): void {
  const sampleIsPureNull = sampleField.types.length === 1 && sampleField.types[0] === "null";
  if (sampleIsPureNull) {
    if (!baseField.types.includes("null")) {
      changes.push({
        path,
        kind: "became-null",
        severity: "ambiguous",
        message: `"${path}" was always ${typeLabel(baseField.types)} before, now observed as null`,
        from: typeLabel(baseField.types),
        to: "null",
      });
    }
    return;
  }

  const baseCore = baseField.types.filter((t) => t !== "null");
  const sampleCore = sampleField.types.filter((t) => t !== "null");
  const sampleType = sampleCore[0];

  if (baseCore.length > 0 && sampleType && !baseCore.includes(sampleType)) {
    changes.push({
      path,
      kind: "type-changed",
      severity: "breaking",
      message: `"${path}" changed type from ${baseCore.join("|")} to ${sampleType}`,
      from: baseCore.join("|"),
      to: sampleType,
    });
    return;
  }

  if (sampleType === "object") {
    diffObjectLevel(baseField, sampleField, path, changes);
  } else if (sampleType === "array" && baseField.items && sampleField.items) {
    diffField(baseField.items, sampleField.items, `${path}[]`, changes);
  }
}

/** Diffs an incoming sample's inferred schema against the stored baseline. Root-level type changes (e.g. baseline was an object, sample is an array) surface at path `$`. */
export function diffSchemas(baseline: SchemaNode, sample: SchemaNode): DiffResult {
  const changes: SchemaChange[] = [];
  diffField(baseline, sample, ROOT_PATH, changes);
  return {
    changes,
    hasBreaking: changes.some((c) => c.severity === "breaking"),
    hasAmbiguous: changes.some((c) => c.severity === "ambiguous"),
  };
}
