import { test } from "node:test";
import assert from "node:assert/strict";
import { inferSchemaFromValue, mergeValueIntoNode } from "./infer";
import { isNullableField, isOptionalField } from "./types";

test("inferSchemaFromValue builds an object schema from one sample", () => {
  const node = inferSchemaFromValue({ id: 1, name: "Ada" });
  assert.deepEqual(node.types, ["object"]);
  assert.equal(node.sampleCount, 1);
  assert.deepEqual(node.properties?.id?.types, ["number"]);
  assert.deepEqual(node.properties?.name?.types, ["string"]);
});

test("a field missing in a later sample becomes optional, not lost", () => {
  let node = mergeValueIntoNode(undefined, { id: 1, name: "Ada" });
  node = mergeValueIntoNode(node, { id: 2 }); // no `name` this time

  const nameField = node.properties?.name;
  assert.ok(nameField);
  assert.equal(isOptionalField(nameField!, node.sampleCount), true);

  const idField = node.properties?.id;
  assert.ok(idField);
  assert.equal(isOptionalField(idField!, node.sampleCount), false);
});

test("a field observed as null at least once is nullable", () => {
  let node = mergeValueIntoNode(undefined, { avatar: "url.png" });
  node = mergeValueIntoNode(node, { avatar: null });

  const avatarField = node.properties?.avatar;
  assert.ok(avatarField);
  assert.equal(isNullableField(avatarField!), true);
  // Presence in both samples means it is NOT optional, just nullable.
  assert.equal(isOptionalField(avatarField!, node.sampleCount), false);
});

test("array items merge into one item schema across entries", () => {
  const node = inferSchemaFromValue({ tags: ["a", "b", "c"] });
  const items = node.properties?.tags?.items;
  assert.ok(items);
  assert.deepEqual(items!.types, ["string"]);
  assert.equal(items!.sampleCount, 3);
});

test("merging is immutable — the original node is untouched", () => {
  const original = inferSchemaFromValue({ id: 1 });
  const merged = mergeValueIntoNode(original, { id: 2, extra: true });

  assert.equal(original.sampleCount, 1);
  assert.equal(original.properties?.extra, undefined);
  assert.equal(merged.sampleCount, 2);
  assert.ok(merged.properties?.extra);
});
