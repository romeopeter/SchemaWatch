import type { Header as HarHeader } from "har-format";
import type { CapturedExchange, HeaderEntry } from "../types";

type DevtoolsRequest = chrome.devtools.network.Request;

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `xchg_${Date.now()}_${idCounter}`;
}

function toHeaderEntries(headers: HarHeader[] | undefined): HeaderEntry[] {
  return (headers ?? []).map((h) => ({ name: h.name, value: h.value }));
}

// Chrome exposes the resource type via the HAR entry's response content
// mime type, which is more reliable than sniffing a `Content-Type` header
// (some backends omit it, or set it loosely). Scope is explicitly
// fetch/XHR/GraphQL JSON traffic per the brief — not images, scripts,
// stylesheets, or documents — so anything that isn't JSON-shaped is
// dropped before we ever call the (relatively expensive) `getContent`.
function isJsonLike(mimeType: string): boolean {
  return mimeType.includes("json") || mimeType.includes("graphql") || mimeType.includes("+json");
}

function getContent(request: DevtoolsRequest): Promise<string | undefined> {
  return new Promise((resolve) => {
    request.getContent((content, encoding) => {
      // Binary/base64-encoded bodies aren't something we can treat as
      // JSON text; skip rather than risk misinterpreting bytes.
      if (!content || encoding === "base64") {
        resolve(undefined);
        return;
      }
      resolve(content);
    });
  });
}

function safeParseJson(text: string | undefined): unknown {
  if (text === undefined || text === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function toCapturedExchange(
  request: DevtoolsRequest,
  tabUrl: string,
): Promise<CapturedExchange | undefined> {
  const mimeType = request.response.content.mimeType ?? "";
  if (!isJsonLike(mimeType)) return undefined;

  const responseBodyText = await getContent(request);
  const responseBody = safeParseJson(responseBodyText);
  // A JSON-typed response that fails to parse (truncated, HTML error
  // page served with a JSON content-type, etc.) can't feed the schema
  // engine — nothing meaningful to diff against.
  if (responseBody === undefined) return undefined;

  return {
    id: nextId(),
    tabUrl,
    url: request.request.url,
    method: request.request.method,
    status: request.response.status,
    startedAt: new Date(request.startedDateTime).getTime(),
    durationMs: request.time,
    requestHeaders: toHeaderEntries(request.request.headers),
    responseHeaders: toHeaderEntries(request.response.headers),
    requestBody: request.request.postData?.text,
    responseBody,
    mimeType,
  };
}

export interface CaptureHandle {
  stop: () => void;
}

/**
 * Wires up `chrome.devtools.network.onRequestFinished` for the inspected
 * tab. This is the core non-negotiable architecture choice for this
 * extension: a background `chrome.webRequest` listener can see headers
 * and timing but has no access to response *bodies*, which this tool's
 * entire feature set depends on. The DevTools Network API can read
 * bodies via `request.getContent()` without attaching `chrome.debugger`
 * (which would surface Chrome's "this extension is debugging this
 * browser" banner). The tradeoff — capture only runs while DevTools is
 * open on the tab — is acceptable because that's already how the target
 * users (devs/QA actively debugging network traffic) work.
 */
export function startCapture(onExchange: (exchange: CapturedExchange) => void): CaptureHandle {
  let currentTabUrl = "";
  chrome.devtools.inspectedWindow.eval("location.href", (result) => {
    if (typeof result === "string") currentTabUrl = result;
  });

  const navigationListener = (url: string): void => {
    currentTabUrl = url;
  };
  chrome.devtools.network.onNavigated.addListener(navigationListener);

  const requestListener = (request: DevtoolsRequest): void => {
    void toCapturedExchange(request, currentTabUrl).then((exchange) => {
      if (exchange) onExchange(exchange);
    });
  };
  chrome.devtools.network.onRequestFinished.addListener(requestListener);

  return {
    stop: () => {
      chrome.devtools.network.onRequestFinished.removeListener(requestListener);
      chrome.devtools.network.onNavigated.removeListener(navigationListener);
    },
  };
}
