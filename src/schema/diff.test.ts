import { test } from "node:test";
import assert from "node:assert/strict";
import { diffSchemas } from "./diff";
import { inferSchemaFromValue, mergeValueIntoNode } from "./infer";

function baselineFrom(samples: unknown[]) {
  let node = mergeValueIntoNode(undefined, samples[0]);
  for (const sample of samples.slice(1)) {
    node = mergeValueIntoNode(node, sample);
  }
  return node;
}

test("identical shape produces no changes", () => {
  const baseline = baselineFrom([{ id: 1, name: "Ada" }, { id: 2, name: "Bob" }]);
  const sample = inferSchemaFromValue({ id: 3, name: "Cy" });
  const diff = diffSchemas(baseline, sample);
  assert.deepEqual(diff.changes, []);
  assert.equal(diff.hasBreaking, false);
});

test("a brand-new field is additive/safe", () => {
  const baseline = baselineFrom([{ id: 1 }, { id: 2 }]);
  const sample = inferSchemaFromValue({ id: 3, email: "a@b.com" });
  const diff = diffSchemas(baseline, sample);
  assert.equal(diff.changes.length, 1);
  assert.equal(diff.changes[0]?.kind, "field-added");
  assert.equal(diff.changes[0]?.severity, "safe");
  assert.equal(diff.hasBreaking, false);
});

test("a field that was always present and is now missing is breaking", () => {
  const baseline = baselineFrom([{ id: 1, name: "Ada" }, { id: 2, name: "Bob" }]);
  const sample = inferSchemaFromValue({ id: 3 });
  const diff = diffSchemas(baseline, sample);
  assert.equal(diff.changes.length, 1);
  assert.equal(diff.changes[0]?.kind, "field-removed");
  assert.equal(diff.changes[0]?.severity, "breaking");
  assert.equal(diff.hasBreaking, true);
});

test("a field that was already optional missing from one sample is not reported", () => {
  const baseline = baselineFrom([{ id: 1, nickname: "A" }, { id: 2 }]); // nickname already optional
  const sample = inferSchemaFromValue({ id: 3 });
  const diff = diffSchemas(baseline, sample);
  assert.deepEqual(diff.changes, []);
});

test("a type change (string -> number) is breaking", () => {
  const baseline = baselineFrom([{ id: "42" }, { id: "43" }]);
  const sample = inferSchemaFromValue({ id: 44 });
  const diff = diffSchemas(baseline, sample);
  assert.equal(diff.changes.length, 1);
  assert.equal(diff.changes[0]?.kind, "type-changed");
  assert.equal(diff.changes[0]?.severity, "breaking");
  assert.equal(diff.changes[0]?.from, "string");
  assert.equal(diff.changes[0]?.to, "number");
});

test("a previously always-non-null field observed as null is ambiguous, not breaking", () => {
  const baseline = baselineFrom([{ avatar: "a.png" }, { avatar: "b.png" }]);
  const sample = inferSchemaFromValue({ avatar: null });
  const diff = diffSchemas(baseline, sample);
  assert.equal(diff.changes.length, 1);
  assert.equal(diff.changes[0]?.kind, "became-null");
  assert.equal(diff.changes[0]?.severity, "ambiguous");
  assert.equal(diff.hasAmbiguous, true);
  assert.equal(diff.hasBreaking, false);
});

test("a field already known nullable observed as null again is not a new change", () => {
  const baseline = baselineFrom([{ avatar: "a.png" }, { avatar: null }]);
  const sample = inferSchemaFromValue({ avatar: null });
  const diff = diffSchemas(baseline, sample);
  assert.deepEqual(diff.changes, []);
});

test("a same-type add+remove pair at one level is flagged as a possible rename", () => {
  const baseline = baselineFrom([{ id: 1, fullName: "Ada Lovelace" }, { id: 2, fullName: "Bob" }]);
  const sample = inferSchemaFromValue({ id: 3, displayName: "Cy" });
  const diff = diffSchemas(baseline, sample);
  assert.equal(diff.changes.length, 1);
  assert.equal(diff.changes[0]?.kind, "possibly-renamed");
  assert.equal(diff.changes[0]?.severity, "breaking");
  assert.equal(diff.changes[0]?.from, "fullName");
  assert.equal(diff.changes[0]?.to, "displayName");
});

test("nested object field changes are reported with a dotted path", () => {
  const baseline = baselineFrom([
    { user: { address: { city: "NYC" } } },
    { user: { address: { city: "LA" } } },
  ]);
  const sample = inferSchemaFromValue({ user: { address: {} } });
  const diff = diffSchemas(baseline, sample);
  assert.equal(diff.changes.length, 1);
  assert.equal(diff.changes[0]?.path, "user.address.city");
  assert.equal(diff.changes[0]?.severity, "breaking");
});

test("array item type changes are reported with a []-suffixed path", () => {
  const baseline = baselineFrom([{ tags: ["a", "b"] }, { tags: ["c"] }]);
  const sample = inferSchemaFromValue({ tags: [1, 2] });
  const diff = diffSchemas(baseline, sample);
  assert.equal(diff.changes.length, 1);
  assert.equal(diff.changes[0]?.path, "tags[]");
  assert.equal(diff.changes[0]?.kind, "type-changed");
});
