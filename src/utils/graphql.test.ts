import { test } from "node:test";
import assert from "node:assert/strict";
import { isGraphQLRequest, parseGraphQLOperation } from "./graphql";

test("isGraphQLRequest detects by URL", () => {
  assert.equal(isGraphQLRequest("https://api.example.com/graphql", undefined), true);
  assert.equal(isGraphQLRequest("https://api.example.com/users", undefined), false);
});

test("isGraphQLRequest detects by body shape on a non-/graphql URL", () => {
  const body = { query: "query GetUser { me { id } }" };
  assert.equal(isGraphQLRequest("https://api.example.com/api", body), true);
});

test("parseGraphQLOperation extracts a named operation", () => {
  const info = parseGraphQLOperation({
    operationName: "GetUser",
    query: "query GetUser { me { id } }",
    variables: {},
  });
  assert.equal(info?.operationName, "GetUser");
});

test("parseGraphQLOperation falls back to a stable hash for anonymous queries", () => {
  const a = parseGraphQLOperation({ query: "query { me { id } }" });
  const b = parseGraphQLOperation({ query: "query { me { id } }" });
  assert.ok(a?.operationName.startsWith("anonymous_"));
  assert.equal(a?.operationName, b?.operationName, "same query text should hash to the same key");
});

test("parseGraphQLOperation handles batched requests via the first operation", () => {
  const info = parseGraphQLOperation([
    { operationName: "First", query: "query First { a }" },
    { operationName: "Second", query: "query Second { b }" },
  ]);
  assert.equal(info?.operationName, "First");
});
