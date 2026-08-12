import type { EndpointIdentity, HttpMethod } from "../types";
import { applyOverride, templatePath } from "./path-template";
import { isGraphQLRequest, parseGraphQLOperation } from "./graphql";

export interface IdentifyEndpointInput {
  url: string;
  method: HttpMethod;
  /** Raw request body text, if any — used only to detect/parse GraphQL operations. */
  requestBody: string | undefined;
}

function safeParseJson(text: string | undefined): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Resolves a captured exchange to the endpoint bucket it belongs to.
 * REST requests are grouped by host + method + templated path; GraphQL
 * requests (all sharing one URL) are grouped by host + operation name
 * instead, since the path carries no distinguishing information for them.
 */
export function identifyEndpoint(
  input: IdentifyEndpointInput,
  pathOverrides: Record<string, string> = {},
): EndpointIdentity {
  const parsedUrl = new URL(input.url);
  const parsedRequestBody = safeParseJson(input.requestBody);

  if (isGraphQLRequest(input.url, parsedRequestBody)) {
    const op = parseGraphQLOperation(parsedRequestBody);
    const label = op?.operationName ?? "unknown_operation";
    return {
      key: `graphql:${parsedUrl.host}:${label}`,
      kind: "graphql",
      method: input.method.toUpperCase(),
      label,
      host: parsedUrl.host,
    };
  }

  const method = input.method.toUpperCase();
  const autoTemplate = templatePath(parsedUrl.pathname);
  // Overrides are looked up per host+method+auto-template rather than by
  // template alone, so fixing `/orders/:id` on api.example.com can't
  // accidentally also remap an unrelated `/orders/:id` on another host.
  const overrideLookupKey = `${parsedUrl.host}:${method}:${autoTemplate}`;
  const template = applyOverride(overrideLookupKey, pathOverrides);

  return {
    key: `rest:${parsedUrl.host}:${method}:${template}`,
    kind: "rest",
    method,
    label: template,
    host: parsedUrl.host,
  };
}

/** Builds the override lookup key for a REST endpoint's auto-generated template — used by the UI when saving a manual correction. */
export function overrideKeyFor(host: string, method: HttpMethod, autoTemplate: string): string {
  return `${host}:${method.toUpperCase()}:${autoTemplate}`;
}
