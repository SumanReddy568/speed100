/**
 * Speed Tester Popup - Main Entry Point
 * Coordinates all modules and initializes the application
 */

document.addEventListener("DOMContentLoaded", function () {
  logger.info("Popup opened");

  // Initialize core application
  window.PopupApp.initializeElements();
  const { elements, state } = window.PopupApp;

  // Initialize modules
  window.PopupNetwork.initializeInfo();
  window.PopupSpeedometer.addGradientDefs();
  window.PopupSpeedometer.update("download", 0);
  window.PopupSpeedometer.update("upload", 0);

  // Initialize state from storage
  chrome.storage.local.get(
    [
      "speedTestHistory",
      "loadTestHistory",
      "openRouterApiKey",
      "llmModel",
      "feedbackSubmitted",
      "hasRunFirstTest",
      "lastSkipReason",
    ],
    function (result) {
      // Load histories
      if (result.speedTestHistory) {
        state.speedTestHistory = result.speedTestHistory;
        window.PopupCharts.updateHistoryGraph();
      }
      if (result.loadTestHistory) {
        state.loadTestHistory = result.loadTestHistory;
        window.PopupCharts.updateLoadHistory();
      }

      // Load feedback state - only set when user explicitly submits feedback
      // Don't auto-load from storage to prevent "auto-submission" appearance
      // if (result.feedbackSubmitted) {
      //   state.feedbackSubmitted = true;
      // }

      // Load first test status
      if (result.hasRunFirstTest) {
        state.hasRunFirstTest = true;
      }
      
      // Initialize settings UI. testInterval is persisted to chrome.storage.sync
      // (see the save handler and background.js), so it must be read from sync —
      // reading it from local left the dropdown stuck at the default 30.
      chrome.storage.sync.get(["testInterval"], (sync) => {
        elements.testInterval.value = sync.testInterval || "30";
      });
        if (elements.llmModelInput) {
          elements.llmModelInput.value =
            result.llmModel || "kwaipilot/kat-coder-pro:free";
        }
        if (elements.openRouterApiKeyInput) {
          elements.openRouterApiKeyInput.value = result.openRouterApiKey || "";
        }

        // Initial data fetch
        window.PopupNetwork.getInitialData();
        window.PopupNetwork.checkOutages();
        window.PopupApp.updateTimestamp();

        // Show initial message
        elements.testStatus.textContent =
          "Run your first speed test to get started!";
        elements.testStatus.style.color = "#666";

        // If the most recent background event was a skipped automatic test
        // (metered connection / data cap), surface why — even though the popup
        // was closed when it happened. Only show it if it's newer than the last
        // successful test, so a stale reason doesn't override fresh results.
        if (result.lastSkipReason && result.lastSkipReason.message) {
          const lastTestTs =
            result.speedTestHistory && result.speedTestHistory[0]
              ? result.speedTestHistory[0].timestamp
              : 0;
          if (result.lastSkipReason.timestamp > lastTestTs) {
            elements.testStatus.textContent = result.lastSkipReason.message;
            elements.testStatus.style.color = "#FFC107";
          }
        }
      }
  );

  // Setup visual observers and handlers
  window.PopupCharts.initializeGraphObserver();
  window.PopupEvents.initialize();
  
  // Initialize version check
  if (window.VersionService) {
      window.VersionService.initialize();
  }

  logger.info("Popup initialized");
});