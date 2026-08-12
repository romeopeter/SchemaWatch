/**
 * GraphQL requests all hit one URL (typically `/graphql`), so the normal
 * "group by templated path" strategy collapses every distinct operation
 * into a single bucket. We instead key GraphQL requests by operation name
 * — parsed out of the POST body — falling back to a hash of the query
 * text for anonymous operations that omit `operationName`.
 */

export interface GraphQLRequestInfo {
  operationName: string;
  queryHash: string;
}

interface GraphQLBodyShape {
  query?: unknown;
  operationName?: unknown;
}

/** Cheap, dependency-free string hash (djb2) — good enough to key a query, not for security use. */
function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

function parseSingleOperation(body: GraphQLBodyShape): GraphQLRequestInfo | undefined {
  const query = typeof body.query === "string" ? body.query : "";
  if (!query && typeof body.operationName !== "string") return undefined;

  const namedOp = typeof body.operationName === "string" && body.operationName.length > 0
    ? body.operationName
    : undefined;

  // Anonymous queries (`query { me { id } }`) have no operationName; a
  // hash of the normalized query text is the next best stable key so
  // repeated calls to the same anonymous operation still group together.
  const normalizedQuery = query.replace(/\s+/g, " ").trim();
  const queryHash = hashString(normalizedQuery);

  return {
    operationName: namedOp ?? `anonymous_${queryHash}`,
    queryHash,
  };
}

/** Detects a GraphQL request by URL shape or a `query`/`operationName` field in the JSON body. */
export function isGraphQLRequest(url: string, parsedBody: unknown): boolean {
  if (/\/graphql\/?($|\?)/i.test(url)) return true;
  if (parsedBody && typeof parsedBody === "object") {
    if (Array.isArray(parsedBody)) {
      return parsedBody.some(
        (entry) => entry && typeof entry === "object" && "query" in entry,
      );
    }
    return "query" in (parsedBody as Record<string, unknown>);
  }
  return false;
}

/**
 * Extracts operation identity from a parsed GraphQL request body.
 * Batched requests (an array of operations) are keyed by their first
 * operation — full per-operation fan-out for batches is a future
 * extension, not needed for v1's single-endpoint-at-a-time UI.
 */
export function parseGraphQLOperation(parsedBody: unknown): GraphQLRequestInfo | undefined {
  if (!parsedBody || typeof parsedBody !== "object") return undefined;

  const body = Array.isArray(parsedBody) ? parsedBody[0] : parsedBody;
  if (!body || typeof body !== "object") return undefined;

  return parseSingleOperation(body as GraphQLBodyShape);
}
