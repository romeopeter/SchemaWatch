import { diffSchemas } from "../schema/diff";
import { mergeValueIntoNode } from "../schema/infer";
import { MIN_SAMPLES_FOR_BASELINE } from "../schema/types";
import type { EndpointIdentity } from "../types";
import { createEmptyState, type EndpointRecord, type SchemaWatchState } from "./types";

const STORAGE_KEY = "schemawatch_state_v1";

export async function loadState(): Promise<SchemaWatchState> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const stored = result[STORAGE_KEY] as SchemaWatchState | undefined;
  return stored ?? createEmptyState();
}

export async function saveState(state: SchemaWatchState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

/**
 * Re-reads the latest persisted state, applies `mutator`, and writes the
 * result back. This is a stateless-service-worker-friendly pattern per
 * the MV3 constraint in the brief: nothing here depends on in-memory
 * state surviving between calls, so it's safe even if multiple panel
 * instances (different tabs' DevTools) are writing independently. It is
 * not fully race-proof against two near-simultaneous writers — an
 * accepted limitation for a single-profile, low-write-frequency tool.
 */
export async function updateState(
  mutator: (state: SchemaWatchState) => SchemaWatchState,
): Promise<SchemaWatchState> {
  const current = await loadState();
  const next = mutator(current);
  await saveState(next);
  return next;
}

/**
 * Folds one observed response into the endpoint's record, advancing it
 * through the learning → stable → changed lifecycle:
 *  - `learning`: accumulate samples into the baseline-in-progress until
 *    `MIN_SAMPLES_FOR_BASELINE` is reached (one response is not a
 *    reliable contract to diff against).
 *  - `stable`: diff each new sample against the frozen baseline; a
 *    schema-level change moves the endpoint to `changed` and stores a
 *    pending candidate baseline for the user to accept or ignore.
 *  - `changed`: keep re-diffing against the *original* baseline (not the
 *    pending candidate) so the pending diff always reflects "baseline vs.
 *    latest", and stays live until the user explicitly accepts.
 */
export function recordObservation(
  state: SchemaWatchState,
  identity: EndpointIdentity,
  responseBody: unknown,
  statusCode: number,
  now: number = Date.now(),
): SchemaWatchState {
  const existing = state.endpoints[identity.key];
  const sampleSchema = mergeValueIntoNode(undefined, responseBody);

  let record: EndpointRecord;

  if (!existing) {
    record = {
      identity,
      status: "learning",
      sampleCount: 1,
      baseline: sampleSchema,
      createdAt: now,
      lastSeenAt: now,
      lastStatusCode: statusCode,
    };
  } else if (existing.status === "learning") {
    const sampleCount = existing.sampleCount + 1;
    record = {
      ...existing,
      identity,
      sampleCount,
      baseline: mergeValueIntoNode(existing.baseline, responseBody),
      status: sampleCount >= MIN_SAMPLES_FOR_BASELINE ? "stable" : "learning",
      lastSeenAt: now,
      lastStatusCode: statusCode,
    };
  } else {
    const baseline = existing.baseline as NonNullable<EndpointRecord["baseline"]>;
    const diff = diffSchemas(baseline, sampleSchema);
    if (diff.changes.length === 0) {
      record = {
        ...existing,
        identity,
        sampleCount: existing.sampleCount + 1,
        lastSeenAt: now,
        lastStatusCode: statusCode,
      };
    } else {
      record = {
        ...existing,
        identity,
        sampleCount: existing.sampleCount + 1,
        status: "changed",
        pending: {
          schema: mergeValueIntoNode(baseline, responseBody),
          diff,
          observedAt: now,
        },
        lastSeenAt: now,
        lastStatusCode: statusCode,
      };
    }
  }

  return {
    ...state,
    endpoints: { ...state.endpoints, [identity.key]: record },
  };
}

/** Promotes the pending candidate schema to the new baseline, clearing the change flag. */
export function acceptBaseline(state: SchemaWatchState, endpointKey: string): SchemaWatchState {
  const existing = state.endpoints[endpointKey];
  if (!existing?.pending) return state;

  const record: EndpointRecord = {
    ...existing,
    baseline: existing.pending.schema,
    status: "stable",
    pending: undefined,
  };
  return { ...state, endpoints: { ...state.endpoints, [endpointKey]: record } };
}

/** Forgets an endpoint entirely so it re-enters the `learning` phase from scratch on its next request. */
export function resetBaseline(state: SchemaWatchState, endpointKey: string): SchemaWatchState {
  const remaining = { ...state.endpoints };
  delete remaining[endpointKey];
  return { ...state, endpoints: remaining };
}

/** Forgets every endpoint baseline while preserving user path overrides. */
export function clearBaselines(state: SchemaWatchState): SchemaWatchState {
  return { ...state, endpoints: {} };
}

export function setPathOverride(
  state: SchemaWatchState,
  overrideKey: string,
  correctedTemplate: string,
): SchemaWatchState {
  return {
    ...state,
    pathOverrides: { ...state.pathOverrides, [overrideKey]: correctedTemplate },
  };
}
