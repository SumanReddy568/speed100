// Loaded as a classic script before any consumer (see <script> order in
// popup.html / login.html / logout.html / signup.html / index.html), so
// every other script in the extension can read window.WORKER_BASE without
// duplicating the host literal.
window.WORKER_BASE = "https://open-api-worker.sumanreddy568.workers.dev";
