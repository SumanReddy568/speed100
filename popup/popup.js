/**
 * Speed Tester Popup - Main Entry Point
 * Coordinates all modules and initializes the application
 */

document.addEventListener('DOMContentLoaded', function () {
    logger.info('Popup opened');

    // Initialize core application
    window.PopupApp.initializeElements();
    const { elements, state } = window.PopupApp;

    // Initialize modules
    window.PopupNetwork.initializeInfo();
    window.PopupSpeedometer.addGradientDefs();
    window.PopupSpeedometer.update('download', 0);
    window.PopupSpeedometer.update('upload', 0);

    // Initialize state from storage
    chrome.storage.local.get(['speedTestHistory', 'loadTestHistory', 'openRouterApiKey', 'testInterval', 'llmModel'], function (result) {
        // Load histories
        if (result.speedTestHistory) {
            state.speedTestHistory = result.speedTestHistory;
            window.PopupCharts.updateHistoryGraph();
        }
        if (result.loadTestHistory) {
            state.loadTestHistory = result.loadTestHistory;
            window.PopupCharts.updateLoadHistory();
        }

        // Initialize settings UI
        elements.testInterval.value = result.testInterval || '30';
        if (elements.llmModelInput) {
            elements.llmModelInput.value = result.llmModel || 'kwaipilot/kat-coder-pro:free';
        }
        if (elements.openRouterApiKeyInput) {
            elements.openRouterApiKeyInput.value = result.openRouterApiKey || '';
        }

        // Initial data fetch
        window.PopupNetwork.getInitialData();
        window.PopupNetwork.checkOutages();
        window.PopupApp.updateTimestamp();
    });

    // Setup visual observers and handlers
    window.PopupCharts.initializeGraphObserver();
    window.PopupEvents.initialize();

    logger.info('Popup initialized');
});