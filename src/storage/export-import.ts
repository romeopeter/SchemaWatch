import type { SchemaWatchState } from "./types";

/**
 * Portable snapshot format — deliberately just the endpoint schemas and
 * path overrides, never raw traffic (there is none in `SchemaWatchState` to
 * begin with; only inferred shapes and pre-redacted examples are ever
 * persisted). Plain, versioned JSON so it can be committed to a repo,
 * diffed in a PR, or fed into a future CI check without a rewrite.
 */
export interface SchemaWatchSnapshot {
  formatVersion: 1;
  exportedAt: string;
  endpoints: SchemaWatchState["endpoints"];
  pathOverrides: SchemaWatchState["pathOverrides"];
}

export function buildSnapshot(state: SchemaWatchState): SchemaWatchSnapshot {
  return {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    endpoints: state.endpoints,
    pathOverrides: state.pathOverrides,
  };
}

export function serializeSnapshot(state: SchemaWatchState): string {
  return JSON.stringify(buildSnapshot(state), null, 2);
}

/** Triggers a browser download of the current baselines as a `.json` file, via an in-page Blob URL (no `downloads` permission needed). */
export function downloadSnapshot(
  state: SchemaWatchState,
  filename = `schemawatch-baselines-${Date.now()}.json`,
): void {
  const blob = new Blob([serializeSnapshot(state)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function parseSnapshot(text: string): SchemaWatchSnapshot {
  const data = JSON.parse(text) as Partial<SchemaWatchSnapshot>;
  if (data.formatVersion !== 1 || typeof data.endpoints !== "object" || data.endpoints === null) {
    throw new Error("Unrecognized SchemaWatch snapshot file — expected formatVersion 1.");
  }
  return {
    formatVersion: 1,
    exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : new Date().toISOString(),
    endpoints: data.endpoints,
    pathOverrides: (data.pathOverrides as SchemaWatchState["pathOverrides"] | undefined) ?? {},
  };
}

/** Merges an imported snapshot into local state. Imported records win on key collisions — import is an explicit "adopt this baseline" action (e.g. pulling a teammate's or CI's committed snapshot). */
export function mergeSnapshotIntoState(
  state: SchemaWatchState,
  snapshot: SchemaWatchSnapshot,
): SchemaWatchState {
  return {
    ...state,
    endpoints: { ...state.endpoints, ...snapshot.endpoints },
    pathOverrides: { ...state.pathOverrides, ...snapshot.pathOverrides },
  };
}
