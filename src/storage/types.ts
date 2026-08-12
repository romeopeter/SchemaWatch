import type { DiffResult } from "../schema/diff";
import type { SchemaNode } from "../schema/types";
import type { EndpointIdentity, EndpointStatus } from "../types";

export interface PendingChange {
  /** The schema that would become the new baseline if this change is accepted (baseline merged with the sample that triggered it). */
  schema: SchemaNode;
  diff: DiffResult;
  observedAt: number;
}

export interface EndpointRecord {
  identity: EndpointIdentity;
  status: EndpointStatus;
  sampleCount: number;
  /** Established contract once `status` leaves `learning`; during `learning` this is the accumulating (not-yet-frozen) schema. */
  baseline?: SchemaNode;
  pending?: PendingChange;
  createdAt: number;
  lastSeenAt: number;
  lastStatusCode: number;
}

export interface SchemaWatchState {
  version: 1;
  endpoints: Record<string, EndpointRecord>;
  /** User corrections to the auto path-templating heuristic, keyed via `utils/endpoint-key.ts#overrideKeyFor`. */
  pathOverrides: Record<string, string>;
}

export function createEmptyState(): SchemaWatchState {
  return { version: 1, endpoints: {}, pathOverrides: {} };
}
