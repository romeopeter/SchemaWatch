# SchemaWatch

**The Breaking API Sentinel**

A Chromium-based DevTools panel extension that watches the API traffic your app actually makes, learns a lightweight schema per endpoint from what it observes, and flags the moment a response's shape changes — new fields, removed fields, type changes, or fields that suddenly went `null`. Built for developers and QA who are tired of discovering backend contract breakage by debugging a broken UI instead of by reading a diff log.

## Why a DevTools panel, not a background extension

Built on `chrome.devtools.network` (`onRequestFinished` + `request.getContent()`). 
This is deliberately **not** a background `chrome.webRequest` listener. `chrome.webRequest` 
can see request headers and timing, but it cannot read response *bodies* for security reasons.

The tradeoff: capture only runs while DevTools is open on the tab. That's an
accepted limitation, not an oversight — it matches how the target users
(devs/QA actively poking at network traffic) already work.

## How it works

1. **Capture** (`src/capture/`) — listens for finished network requests on
   the inspected tab, filters to JSON-shaped fetch/XHR/GraphQL traffic, and
   pulls the response body via `getContent()`.
2. **Normalize** (`src/utils/endpoint-key.ts`, `path-template.ts`,
   `graphql.ts`) — groups requests into endpoints. REST requests are grouped
   by templating dynamic path segments (`/users/42` → `/users/:id`);
   GraphQL requests (which all share one URL) are grouped by operation name
   instead. Misgrouped endpoints can be corrected per-endpoint from the UI.
3. **Infer** (`src/schema/infer.ts`) — incrementally builds a minimal
   structural schema (field names, types, optional/nullable) from multiple
   response samples. An endpoint needs `MIN_SAMPLES_FOR_BASELINE` (3) samples
   before its schema is frozen as a baseline — one response isn't a
   reliable contract.
4. **Diff** (`src/schema/diff.ts`) — once an endpoint has a baseline, every
   new response's shape is diffed against it, schema-to-schema (not a raw
   JSON diff, which would drown real breakage in payload noise). Changes are
   classified:
   - **Additive / safe** — a new field appeared.
   - **Breaking** — a field that was always present is gone, a field's type
     changed, or (best-effort heuristic) a field looks renamed.
   - **Ambiguous** — a field that was always non-null came back `null`.
     Flagged for human review rather than auto-classified either way.
5. **Storage** (`src/storage/`) — baselines persist to `chrome.storage.local`
   and can be exported/imported as portable JSON snapshots, so a baseline
   can be committed to a repo or shared with teammates instead of living
   only in one person's browser.
6. **UI** (`src/devtools/`) — the "SchemaWatch" panel: an endpoint list
   (learning / stable / changed), a schema view, a before/after diff view
   with breaking changes visually distinct from additive ones, and
   accept/reset controls.

## Data safety

Before anything is persisted or exported (`src/utils/redact.ts`):
- Sensitive headers (`Authorization`, `Cookie`, `Set-Cookie`, common
  `*-Api-Key`/`*-Auth-Token` patterns) are redacted.
- Body fields whose name suggests sensitive content (`token`, `password`,
  `secret`, `ssn`, `apiKey`, `cvv`, etc.) are redacted.
- The schema itself never stores full response bodies — only field names,
  inferred types, and a short, redaction-aware example preview per field.

## v1 scope boundaries

- REST/JSON and GraphQL only. WebSocket and gRPC-web are out of scope for
  v1 (see the comment in `src/capture/network-capture.ts` — the resource-type
  filter is the extension point for adding them later).
- Single tab, single browser profile. No cross-device sync.
- No CI integration yet, but the export format (`src/storage/export-import.ts`)
  is plain versioned JSON specifically so a future `schemawatch diff-ci
  baseline.json response.json` style check doesn't require a rewrite.

## Getting started

```sh
npm install
npm run build      # outputs the unpacked extension to dist/
npm test           # unit tests for the pure logic (infer/diff/templating/graphql)
npm run typecheck
```

Load it in Chrome:

1. Go to `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select the `dist/` folder.
3. Open DevTools on any page making API calls → a **SchemaWatch** tab
   appears alongside Elements/Console/Network.
4. Trigger some requests. Endpoints show as *Learning* until 3 samples are
   in, then *Stable*. If a later response's shape changes, the endpoint
   flips to *Changed* with a diff — accept it as the new baseline, or reset
   the endpoint to relearn from scratch.

`npm run dev` runs the same build in `--watch` mode; reload the unpacked
extension in `chrome://extensions` after each rebuild.

<!-- ## Project structure

```
src/
  devtools/   panel registration (devtools.ts) + panel UI (panel.ts, view.ts, panel.css)
  capture/    chrome.devtools.network integration
  schema/     schema inference + diffing engine (pure, unit-tested)
  storage/    chrome.storage.local persistence + export/import
  utils/      redaction, path templating, GraphQL op parsing, endpoint keying
manifest.json Manifest V3, devtools_page-only (no background service worker —
              nothing here needs cross-context coordination beyond what
              chrome.storage.onChanged already provides for free)
``` -->
