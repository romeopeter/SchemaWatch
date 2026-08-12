import type { HeaderEntry } from "../types";

/**
 * Data-safety boundary: nothing captured off the wire should be persisted
 * to `chrome.storage` or written into an export file without passing
 * through here first. We redact headers and body field *values* — field
 * *names* and inferred *types* are kept, since the whole point of the tool
 * is tracking shape, not content.
 */

const REDACTED = "[REDACTED]";

// Exact header names are the reliable signal for auth material.
const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "proxy-authorization",
]);

// Broader pattern for the long tail of vendor-specific API key headers
// (`X-Api-Key`, `Api-Key`, `X-Auth-Token`, `X-Access-Token`, ...).
const SENSITIVE_HEADER_PATTERN = /api[-_]?key|auth[-_]?token|access[-_]?token|x-secret/i;

export function isSensitiveHeaderName(name: string): boolean {
  const lower = name.toLowerCase();
  return SENSITIVE_HEADER_NAMES.has(lower) || SENSITIVE_HEADER_PATTERN.test(lower);
}

export function redactHeaders(headers: HeaderEntry[]): HeaderEntry[] {
  return headers.map((h) =>
    isSensitiveHeaderName(h.name) ? { name: h.name, value: REDACTED } : h,
  );
}

// Substring match against a normalized (lowercased, separators stripped)
// key name. Substring rather than exact match deliberately: it catches
// `userPassword`, `user_password`, and `password` alike, at the cost of
// occasionally over-redacting a field like `tokenizerVersion`. For a tool
// whose job is leaking *less* data, that tradeoff is the right one.
const SENSITIVE_FIELD_KEYWORDS = [
  "password",
  "passwd",
  "secret",
  "token",
  "ssn",
  "apikey",
  "accesskey",
  "creditcard",
  "cardnumber",
  "cvv",
  "authorization",
  "sessionid",
];

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isSensitiveFieldName(key: string): boolean {
  const normalized = normalizeKey(key);
  if (normalized === "ssn") return true;
  return SENSITIVE_FIELD_KEYWORDS.some((kw) => normalized.includes(kw));
}

/** Deep-clones a parsed JSON value, replacing sensitive field values with a redaction marker. */
export function redactBody(value: unknown): unknown {
  return redactValue(value);
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveFieldName(key) ? REDACTED : redactValue(val);
    }
    return out;
  }
  return value;
}

/** Produces a short, redaction-aware preview string for display in the UI (never persisted raw). */
export function previewFieldValue(key: string, value: unknown): string {
  if (isSensitiveFieldName(key)) return REDACTED;
  const str = typeof value === "string" ? value : JSON.stringify(value);
  if (str === undefined) return "undefined";
  return str.length > 60 ? `${str.slice(0, 57)}...` : str;
}
