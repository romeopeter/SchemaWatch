import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOverride, templatePath } from "./path-template";

test("templatePath collapses numeric ids", () => {
  assert.equal(templatePath("/users/42/orders"), "/users/:id/orders");
  assert.equal(templatePath("/users/87/orders"), "/users/:id/orders");
});

test("templatePath collapses UUIDs", () => {
  assert.equal(
    templatePath("/orders/9c858901-8a57-4791-81fe-4c455b099bc9"),
    "/orders/:id",
  );
});

test("templatePath collapses 24-char hex ids (Mongo-style)", () => {
  assert.equal(templatePath("/items/5f8d0d55b54764421b7156c3"), "/items/:id");
});

test("templatePath preserves static words", () => {
  assert.equal(templatePath("/api/v1/users"), "/api/v1/users");
  assert.equal(templatePath("/health"), "/health");
});

test("templatePath templatizes a suffixed id but keeps the static prefix", () => {
  assert.equal(templatePath("/report_20240131"), "/report_:id");
});

test("templatePath does not templatize short numeric-ish words", () => {
  // Four digits alone is common for years/codes — too risky to collapse.
  assert.equal(templatePath("/archive/2024"), "/archive/:id");
  assert.equal(templatePath("/colors/red"), "/colors/red");
});

test("applyOverride returns the correction when present, else the input", () => {
  const overrides = { "api.example.com:GET:/orders/:id": "/orders/:orderId" };
  assert.equal(
    applyOverride("api.example.com:GET:/orders/:id", overrides),
    "/orders/:orderId",
  );
  assert.equal(applyOverride("api.example.com:GET:/users/:id", overrides), "api.example.com:GET:/users/:id");
});
