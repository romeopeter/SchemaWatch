/**
 * Path templating: collapses dynamic URL segments (`/users/42`) into a
 * stable placeholder (`/users/:id`) so requests against the same endpoint
 * group under one schema instead of one-per-resource-id.
 *
 * This is a heuristic, not a parser — there is no way to know from a URL
 * alone whether a segment is a resource id or a meaningful static word
 * (consider `/v1/orders` vs `/orders/9310`). We bias toward *not*
 * templating unless a segment matches a strong, low-false-positive shape.
 * Anything the heuristic gets wrong is fixable per-endpoint via the manual
 * override map applied on top (see `applyOverride`).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Mongo ObjectId and other common 24-hex-char identifiers.
const HEX24_RE = /^[0-9a-f]{24}$/i;

// Pure integer or bigint-looking ids ("42", "0", "9007199254740993").
const NUMERIC_RE = /^\d+$/;

// Generic long hex/opaque token (hashes, short ids, session-ish tokens).
// Threshold of 12 keeps it above things like a 4-6 char hex color or unit
// code that could plausibly be a real path segment, while still catching
// typical hash-based ids.
const LONG_HEX_RE = /^[0-9a-f]{12,}$/i;

// Segments like "user_5f3a" or "order-99231" — a static word glued to a
// numeric/hex suffix by `_` or `-`. We templatize only the dynamic tail so
// `/report_2024` doesn't collapse into `/:id` (four digits alone is too
// common a *meaningful* segment — years, zip-like codes — to safely
// templatize on its own), but `/user_5f3a91` (word + long token) does.
const SUFFIXED_ID_RE = /^([a-zA-Z]+[_-])([0-9a-f]{6,}|\d{5,})$/i;

function templateSegment(segment: string): string {
  if (segment === "") return segment;
  if (UUID_RE.test(segment)) return ":id";
  if (HEX24_RE.test(segment)) return ":id";
  if (NUMERIC_RE.test(segment)) return ":id";
  if (LONG_HEX_RE.test(segment)) return ":id";

  const suffixMatch = segment.match(SUFFIXED_ID_RE);
  if (suffixMatch) return `${suffixMatch[1]}:id`;

  return segment;
}

/** Reduces a URL pathname to a templated form, e.g. `/users/42/orders/9c1f...` → `/users/:id/orders/:id`. */
export function templatePath(pathname: string): string {
  const segments = pathname.split("/");
  return segments.map(templateSegment).join("/");
}

/**
 * Applies a user-defined correction on top of the heuristic result.
 * Overrides are keyed by the auto-generated template so a user can fix a
 * single misgrouped endpoint without hand-writing a regex.
 */
export function applyOverride(
  autoTemplate: string,
  overrides: Record<string, string>,
): string {
  return overrides[autoTemplate] ?? autoTemplate;
}
