/** Core data shapes shared across capture, schema, storage, and UI layers. */

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS"
  | string;

export interface HeaderEntry {
  name: string;
  value: string;
}

/** One request/response pair as captured off `chrome.devtools.network`. */
export interface CapturedExchange {
  id: string;
  tabUrl: string;
  url: string;
  method: HttpMethod;
  status: number;
  startedAt: number;
  durationMs: number;
  requestHeaders: HeaderEntry[];
  responseHeaders: HeaderEntry[];
  requestBody: string | undefined;
  /** Parsed JSON response body, or undefined if absent/non-JSON. */
  responseBody: unknown;
  mimeType: string;
}

export type EndpointKind = "rest" | "graphql";

/** A request pattern grouped across many samples, e.g. `GET /users/:id`. */
export interface EndpointIdentity {
  key: string;
  kind: EndpointKind;
  method: HttpMethod;
  /** Human-readable label: templated path for REST, operation name for GraphQL. */
  label: string;
  host: string;
}

export type EndpointStatus = "learning" | "stable" | "changed";
