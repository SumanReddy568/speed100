// Loaded first before any consumer — as a classic <script> in the HTML pages
// (popup.html / login.html / logout.html / signup.html / index.html) and as
// the first importScripts() entry in background.js — so every other script in
// the extension can read WORKER_BASE without duplicating the host literal.
//
// Use `self` (not `window`) so this works in both the popup pages and the
// background service worker, which has no `window` object. In a window page
// `self === window`, and assigning a property on the global object exposes it
// as a bare global (WORKER_BASE) to scripts loaded afterwards.
self.WORKER_BASE = "https://open-api-worker.sumanreddy568.workers.dev";
