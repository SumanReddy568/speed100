/**
 * Popup UI Manager
 * Handles DOM element references and basic state
 */

window.PopupApp = {
    elements: {},
    config: {
        downloadMaxSpeed: 300,
        uploadMaxSpeed: 300,
        minRotation: -90,
        maxRotation: 90,
        refreshInterval: 30000,
        maxHistoryItems: 3
    },
    state: {
        speedTestHistory: [],
        loadTestHistory: [],
        isLoadTestRunning: false,
        networkInfoCache: {
            ipAddress: '-',
            localAddress: '-',
            dns: '-',
            signalStrength: '-',
            connectionType: '-',
            networkName: '-',
            latency: '-',
            ping: '-',
            jitter: '-',
            packetLoss: '-',
            isp: '-',
            location: {
                country: '-',
                city: '-',
                region: '-',
                timezone: '-'
            },
            serverInfo: {
                name: '-',
                organization: '-'
            },
            status: 'not started',
            timestamp: new Date().toISOString(),
            lastUpdate: Date.now()
        }
    },

    initializeElements() {
        this.elements = {
            // Speed test elements
            downloadSpeed: document.getElementById('download-speed'),
            uploadSpeedDisplay: document.getElementById('upload-speed-display'),
            downloadNeedle: document.getElementById('download-needle'),
            uploadNeedle: document.getElementById('upload-needle'),
            downloadMeter: document.querySelector('#download-speedometer .meter-arc'),
            uploadMeter: document.querySelector('#upload-speedometer .meter-arc'),
            runTestBtn: document.getElementById('run-test-btn'),
            testStatus: document.getElementById('test-status'),

            // Basic network info elements
            ipAddress: document.getElementById('ip-address'),
            dns: document.getElementById('dns'),
            signalStrength: document.getElementById('signal-strength'),
            connectionType: document.getElementById('connection-type'),
            latency: document.getElementById('latency'),
            networkName: document.getElementById('network-name'),
            localAddress: document.getElementById('local-address'),
            isp: document.getElementById('isp'),

            // Location elements
            locationCountry: document.getElementById('location-country'),
            locationCity: document.getElementById('location-city'),
            locationRegion: document.getElementById('location-region'),
            locationTimezone: document.getElementById('location-timezone'),

            // Server info elements
            serverName: document.getElementById('server-name'),
            serverOrganization: document.getElementById('server-organization'),
            detectionStatus: document.getElementById('detection-status'),

            // Settings elements
            settingsIcon: document.getElementById('settings-icon'),
            settingsModal: document.getElementById('settings-modal'),
            closeModal: document.querySelector('#settings-modal .close'),
            testInterval: document.getElementById('test-interval'),
            openRouterApiKeyInput: document.getElementById('openrouter-api-key'),
            llmModelInput: document.getElementById('llm-model'),
            saveSettings: document.getElementById('save-settings'),

            // Container elements
            networkInfoContainer: document.getElementById('network-info-container') || document.createElement('div'),
            errorMessage: document.getElementById('error-message'),
            errorContainer: document.querySelector('.error-message'),

            // Timestamp element
            timestamp: document.getElementById('timestamp'),

            graphBarsContainer: document.querySelector('.graph-bars'),
            graphTimeLabels: document.querySelector('.graph-time-labels'),

            // Load test elements
            runLoadTestBtn: document.getElementById('run-load-test-btn'),
            loadTestModal: document.getElementById('load-test-modal'),
            startLoadTest: document.getElementById('start-load-test'),
            loadSizeSelect: document.getElementById('load-size-select'),
            loadTestStatus: document.getElementById('load-test-status'),
            progressFill: document.querySelector('.progress-fill'),

            // Load history elements
            loadHistoryList: document.getElementById('load-history-list'),
            loadHistoryGraph: document.querySelector('.load-history-graph'),

            // AI Insights elements
            aiPerformance: document.getElementById('ai-performance'),
            aiRecommendations: document.getElementById('ai-recommendations'),
            aiPredictions: document.getElementById('ai-predictions'),
            aiInsightsHeader: document.getElementById('ai-insights-header'),
            aiInsights: document.querySelector('.ai-insights'),

            // metric elements
            pingValue: document.getElementById('ping-value'),
            jitterValue: document.getElementById('jitter-value'),
            lossValue: document.getElementById('loss-value'),
            serviceStatusList: document.getElementById('service-status-list')
        };
    },

    updateTimestamp() {
        if (this.elements.timestamp) {
            const now = new Date();
            this.elements.timestamp.textContent = now.toISOString().replace('T', ' ').substr(0, 19) + ' UTC';
        }
    }
};
