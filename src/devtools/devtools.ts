// Registers the "SchemaWatch" DevTools panel. This file runs in the
// invisible `devtools_page` context (see manifest.json) — it never
// touches the DOM itself, it just tells Chrome where the panel's own
// document (panel.html) lives.
chrome.devtools.panels.create("SchemaWatch", "icons/icon48.png", "panel.html");

