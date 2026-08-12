import type { DiffResult, SchemaChange } from "../schema/diff";
import { isNullableField, isOptionalField, MIN_SAMPLES_FOR_BASELINE, type SchemaNode } from "../schema/types";
import type { EndpointStatus } from "../types";
import type { EndpointRecord } from "../storage/types";
import { overrideKeyFor } from "../utils/endpoint-key";

// All DOM construction goes through this helper rather than innerHTML —
// field names, example values, and diff messages ultimately come from
// third-party API responses, and `.textContent` (used throughout) never
// interprets that data as markup.
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const STATUS_LABEL: Record<EndpointStatus, string> = {
  learning: "Learning",
  stable: "Stable",
  changed: "Changed",
};

export interface EndpointListCallbacks {
  onSelect: (key: string) => void;
}

export function renderEndpointList(
  container: HTMLElement,
  endpoints: EndpointRecord[],
  selectedKey: string | undefined,
  callbacks: EndpointListCallbacks,
): void {
  container.replaceChildren();

  if (endpoints.length === 0) {
    const empty = el("div", "empty-state", "No requests captured yet. Trigger some API calls on the inspected tab.");
    container.append(empty);
    return;
  }

  const sorted = [...endpoints].sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  for (const record of sorted) {
    const item = el("button", "endpoint-item");
    item.classList.add(`status-${record.status}`);
    if (record.identity.key === selectedKey) item.classList.add("selected");

    const dot = el("span", `status-dot status-dot-${record.status}`);
    const label = el("span", "endpoint-label");
    const methodBadge = el("span", "method-badge", record.identity.method);
    label.append(methodBadge, document.createTextNode(" " + record.identity.label));

    const meta = el(
      "span",
      "endpoint-meta",
      `${STATUS_LABEL[record.status]} · ${record.sampleCount} sample${record.sampleCount === 1 ? "" : "s"}`,
    );

    item.append(dot, label, meta);
    item.addEventListener("click", () => callbacks.onSelect(record.identity.key));
    container.append(item);
  }
}

function typeSummary(node: SchemaNode): string {
  const core = node.types.filter((t) => t !== "null");
  return core.length > 0 ? core.join(" | ") : "null";
}

function renderSchemaNode(node: SchemaNode, name: string, parentSampleCount: number): HTMLElement {
  const row = el("div", "schema-row");
  if (name) {
    row.append(el("span", "field-name", name));
  }
  row.append(el("span", "type-badge", typeSummary(node)));

  if (name && isOptionalField(node, parentSampleCount)) {
    row.append(el("span", "flag-pill flag-optional", "optional"));
  }
  if (isNullableField(node)) {
    row.append(el("span", "flag-pill flag-nullable", "nullable"));
  }
  if (node.example !== undefined) {
    row.append(el("span", "example-value", node.example));
  }

  const wrapper = el("div", "schema-node");
  wrapper.append(row);

  if (node.properties) {
    const children = el("div", "schema-children");
    for (const [key, child] of Object.entries(node.properties)) {
      children.append(renderSchemaNode(child, key, node.sampleCount));
    }
    wrapper.append(children);
  } else if (node.items) {
    const children = el("div", "schema-children");
    children.append(renderSchemaNode(node.items, "[]", node.items.sampleCount));
    wrapper.append(children);
  }

  return wrapper;
}

export function renderSchemaTree(root: SchemaNode | undefined): HTMLElement {
  if (!root) return el("div", "empty-state", "No schema yet.");
  return renderSchemaNode(root, "", root.sampleCount);
}

const SEVERITY_LABEL: Record<SchemaChange["severity"], string> = {
  safe: "Additive",
  breaking: "Breaking",
  ambiguous: "Needs review",
};

export function renderDiffList(diff: DiffResult): HTMLElement {
  const list = el("div", "diff-list");
  const bySeverity = [...diff.changes].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  for (const change of bySeverity) {
    const row = el("div", `diff-row severity-${change.severity}`);
    row.append(el("span", "severity-pill", SEVERITY_LABEL[change.severity]));
    row.append(el("span", "diff-path", change.path));
    row.append(el("span", "diff-message", change.message));
    list.append(row);
  }
  return list;
}

function severityRank(severity: SchemaChange["severity"]): number {
  return severity === "breaking" ? 0 : severity === "ambiguous" ? 1 : 2;
}

export interface DetailCallbacks {
  onAccept: (key: string) => void;
  onReset: (key: string) => void;
  onSaveOverride: (overrideKey: string, newTemplate: string) => void;
}

export function renderDetailPane(
  container: HTMLElement,
  record: EndpointRecord | undefined,
  callbacks: DetailCallbacks,
): void {
  container.replaceChildren();

  if (!record) {
    container.append(el("div", "empty-state", "Select an endpoint to see its schema."));
    return;
  }

  const header = el("div", "detail-header");
  header.append(el("span", "method-badge", record.identity.method));
  header.append(el("span", "detail-title", record.identity.label));
  header.append(el("span", `status-pill status-pill-${record.status}`, STATUS_LABEL[record.status]));
  container.append(header);

  const subhead = el(
    "div",
    "detail-subhead",
    `${record.identity.host} · ${record.sampleCount} sample${record.sampleCount === 1 ? "" : "s"} · last seen ${new Date(record.lastSeenAt).toLocaleTimeString()}`,
  );
  container.append(subhead);

  const actions = el("div", "detail-actions");
  if (record.identity.kind === "rest") {
    actions.append(renderOverrideEditor(record, callbacks));
  }
  const resetBtn = el("button", "btn btn-danger", "Reset baseline");
  resetBtn.addEventListener("click", () => {
    if (confirm(`Forget the learned schema for "${record.identity.label}"? It will start learning again from the next request.`)) {
      callbacks.onReset(record.identity.key);
    }
  });
  actions.append(resetBtn);
  container.append(actions);

  if (record.status === "learning") {
    container.append(
      el(
        "div",
        "notice notice-info",
        `Learning: ${record.sampleCount}/${MIN_SAMPLES_FOR_BASELINE} samples observed before a baseline is established.`,
      ),
    );
    container.append(el("h3", "section-title", "Schema so far (preview)"));
    container.append(renderSchemaTree(record.baseline));
    return;
  }

  if (record.status === "changed" && record.pending) {
    const breakingCount = record.pending.diff.changes.filter((c) => c.severity === "breaking").length;
    const noticeClass = breakingCount > 0 ? "notice-breaking" : "notice-ambiguous";
    container.append(
      el(
        "div",
        `notice ${noticeClass}`,
        breakingCount > 0
          ? `${breakingCount} breaking change${breakingCount === 1 ? "" : "s"} detected since the last accepted baseline.`
          : "Changes detected that need review.",
      ),
    );

    const acceptBtn = el("button", "btn btn-primary", "Accept as new baseline");
    acceptBtn.addEventListener("click", () => callbacks.onAccept(record.identity.key));
    container.append(acceptBtn);

    container.append(el("h3", "section-title", "Diff (baseline → latest)"));
    container.append(renderDiffList(record.pending.diff));

    container.append(el("h3", "section-title", "Current baseline"));
    container.append(renderSchemaTree(record.baseline));
    return;
  }

  container.append(el("h3", "section-title", "Baseline schema"));
  container.append(renderSchemaTree(record.baseline));
}

function renderOverrideEditor(record: EndpointRecord, callbacks: DetailCallbacks): HTMLElement {
  const wrapper = el("div", "override-editor");
  const editBtn = el("button", "btn btn-secondary", "Fix path template");
  wrapper.append(editBtn);

  editBtn.addEventListener("click", () => {
    wrapper.replaceChildren();
    const input = document.createElement("input");
    input.type = "text";
    input.className = "override-input";
    input.value = record.identity.label;
    const saveBtn = el("button", "btn btn-primary btn-small", "Save");
    const cancelBtn = el("button", "btn btn-secondary btn-small", "Cancel");

    saveBtn.addEventListener("click", () => {
      const overrideKey = overrideKeyFor(record.identity.host, record.identity.method, record.identity.label);
      const newTemplate = input.value.trim();
      if (newTemplate && newTemplate !== record.identity.label) {
        callbacks.onSaveOverride(overrideKey, newTemplate);
      }
    });
    cancelBtn.addEventListener("click", () => {
      wrapper.replaceChildren();
      wrapper.append(editBtn);
    });

    wrapper.append(input, saveBtn, cancelBtn);
    input.focus();
  });

  return wrapper;
}
