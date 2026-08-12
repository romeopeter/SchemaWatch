import { startCapture } from "../capture/network-capture";
import { downloadSnapshot, mergeSnapshotIntoState, parseSnapshot } from "../storage/export-import";
import {
  acceptBaseline,
  loadState,
  recordObservation,
  resetBaseline,
  setPathOverride,
  updateState,
} from "../storage/baseline-store";
import type { SchemaWatchState } from "../storage/types";
import { identifyEndpoint } from "../utils/endpoint-key";
import { renderDetailPane, renderEndpointList } from "./view";

const app = document.getElementById("app");
if (!app) throw new Error("panel.html is missing #app");

const toolbar = document.createElement("header");
toolbar.className = "toolbar";
const title = document.createElement("h1");
title.textContent = "SchemaWatch";
const actions = document.createElement("div");
actions.className = "toolbar-actions";
const exportBtn = document.createElement("button");
exportBtn.className = "btn btn-secondary";
exportBtn.textContent = "Export baselines";
const importBtn = document.createElement("button");
importBtn.className = "btn btn-secondary";
importBtn.textContent = "Import baselines";
const importInput = document.createElement("input");
importInput.type = "file";
importInput.accept = "application/json";
importInput.hidden = true;
const statusMsg = document.createElement("span");
statusMsg.className = "status-msg";
actions.append(exportBtn, importBtn, importInput, statusMsg);
toolbar.append(title, actions);

const main = document.createElement("div");
main.className = "main";
const endpointList = document.createElement("aside");
endpointList.className = "endpoint-list";
const detailPane = document.createElement("section");
detailPane.className = "detail-pane";
main.append(endpointList, detailPane);

app.append(toolbar, main);

let currentState: SchemaWatchState | undefined;
let selectedKey: string | undefined;

function showStatus(message: string): void {
  statusMsg.textContent = message;
  window.setTimeout(() => {
    if (statusMsg.textContent === message) statusMsg.textContent = "";
  }, 4000);
}

function render(): void {
  if (!currentState) return;
  const endpoints = Object.values(currentState.endpoints);
  renderEndpointList(endpointList, endpoints, selectedKey, {
    onSelect: (key) => {
      selectedKey = key;
      render();
    },
  });
  const selectedRecord = selectedKey ? currentState.endpoints[selectedKey] : undefined;
  renderDetailPane(detailPane, selectedRecord, {
    onAccept: async (key) => {
      currentState = await updateState((state) => acceptBaseline(state, key));
      render();
    },
    onReset: async (key) => {
      currentState = await updateState((state) => resetBaseline(state, key));
      if (selectedKey === key) selectedKey = undefined;
      render();
    },
    onSaveOverride: async (overrideKey, newTemplate) => {
      currentState = await updateState((state) => setPathOverride(state, overrideKey, newTemplate));
      selectedKey = undefined;
      render();
      showStatus("Path template updated — it applies to new requests from now on.");
    },
  });
}

async function init(): Promise<void> {
  currentState = await loadState();
  render();

  startCapture((exchange) => {
    void handleExchange(exchange);
  });

  // Keeps this panel in sync if baselines change from another DevTools
  // panel instance (a second tab's SchemaWatch panel) or an import —
  // `chrome.storage.local` writes fire this event for every listener,
  // including other extension pages, not just the one that wrote.
  chrome.storage.onChanged.addListener((_changes, areaName) => {
    if (areaName !== "local") return;
    void loadState().then((state) => {
      currentState = state;
      render();
    });
  });
}

async function handleExchange(exchange: {
  url: string;
  method: string;
  requestBody: string | undefined;
  responseBody: unknown;
  status: number;
}): Promise<void> {
  const overrides = currentState?.pathOverrides ?? {};
  const identity = identifyEndpoint(
    { url: exchange.url, method: exchange.method, requestBody: exchange.requestBody },
    overrides,
  );
  currentState = await updateState((state) =>
    recordObservation(state, identity, exchange.responseBody, exchange.status),
  );
  render();
}

exportBtn.addEventListener("click", () => {
  if (!currentState) return;
  downloadSnapshot(currentState);
  showStatus("Baselines exported.");
});

importBtn.addEventListener("click", () => importInput.click());

importInput.addEventListener("change", () => {
  const file = importInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    void (async () => {
      try {
        const text = typeof reader.result === "string" ? reader.result : "";
        const snapshot = parseSnapshot(text);
        currentState = await updateState((state) => mergeSnapshotIntoState(state, snapshot));
        render();
        showStatus(`Imported ${Object.keys(snapshot.endpoints).length} endpoint baseline(s).`);
      } catch (err) {
        showStatus(err instanceof Error ? err.message : "Import failed.");
      } finally {
        importInput.value = "";
      }
    })();
  };
  reader.readAsText(file);
});

void init();
