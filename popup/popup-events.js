/**
 * Event Handlers and Listeners
 * Handles user interactions, messaging, and collapsible sections
 */

window.PopupEvents = {
    initialize() {
        this.setupSpeedTestHandlers();
        this.setupSettingsHandlers();
        this.setupLoadTestHandlers();
        this.setupCollapsibleHandlers();
        this.setupMessageListener();
        this.setupPromoBannerHandlers();
        this.setupAdditionalToolsHandlers();
        this.setupModalCloseHandlers();
    },

    setupSpeedTestHandlers() {
        const { elements, state } = window.PopupApp;
        elements.runTestBtn.addEventListener('click', () => {
            if (window.Analytics?.trackSpeedTest) window.Analytics.trackSpeedTest();

            elements.testStatus.textContent = 'Starting test...';
            elements.runTestBtn.disabled = true;
            elements.runTestBtn.textContent = 'Testing...';

            // Initial UI update for testing state
            window.PopupNetwork.updateInfo({
                ...state.networkInfoCache,
                status: 'testing',
                ipAddress: 'Testing...',
                dns: 'Testing...',
                latency: 'Testing...',
                isp: 'Testing...',
                ping: '...',
                jitter: '...',
                packetLoss: '...'
            });

            chrome.runtime.sendMessage({ type: 'runTest' }, (response) => {
                setTimeout(() => {
                    elements.runTestBtn.disabled = false;
                    elements.runTestBtn.textContent = 'Run Speed Test';
                    if (response && response.error) {
                        window.PopupNetwork.updateInfo(state.networkInfoCache);
                    }
                }, 15000);
            });
        });
    },

    setupSettingsHandlers() {
        const { elements } = window.PopupApp;

        elements.settingsIcon.addEventListener('click', () => {
            elements.settingsModal.style.display = 'block';
        });

        elements.saveSettings.addEventListener('click', async () => {
            const interval = elements.testInterval.value;
            const apiKey = elements.openRouterApiKeyInput ? elements.openRouterApiKeyInput.value.trim() : '';
            const llmModel = elements.llmModelInput ? elements.llmModelInput.value.trim() : '';

            const storagePromises = [chrome.storage.sync.set({ testInterval: interval })];

            if (elements.openRouterApiKeyInput) {
                if (apiKey) storagePromises.push(chrome.storage.local.set({ openRouterApiKey: apiKey }));
                else storagePromises.push(chrome.storage.local.remove('openRouterApiKey'));
            }

            if (elements.llmModelInput) {
                if (llmModel) {
                    storagePromises.push(chrome.storage.local.set({ llmModel }));
                    storagePromises.push(chrome.storage.sync.set({ llmModel }));
                } else {
                    storagePromises.push(chrome.storage.local.remove('llmModel'));
                    storagePromises.push(chrome.storage.sync.remove('llmModel'));
                }
            }

            try {
                await Promise.all(storagePromises);
                chrome.alarms.clear('nextSpeedTest');
                if (interval !== '0') {
                    chrome.alarms.create('nextSpeedTest', { periodInMinutes: parseInt(interval, 10) });
                }
                elements.settingsModal.style.display = 'none';
            } catch (error) {
                console.error('Failed to save settings:', error);
            }
        });

        window.addEventListener('click', (event) => {
            if (event.target === elements.settingsModal) elements.settingsModal.style.display = 'none';
            if (event.target === elements.loadTestModal && !window.PopupApp.state.isLoadTestRunning) {
                elements.loadTestModal.style.display = 'none';
            }
        });
    },

    setupLoadTestHandlers() {
        const { elements, state } = window.PopupApp;

        elements.runLoadTestBtn.addEventListener('click', () => {
            if (!state.isLoadTestRunning) {
                elements.loadTestModal.style.display = 'block';
                elements.startLoadTest.textContent = 'Start Load Test';
                elements.progressFill.style.width = '0';
                elements.loadTestStatus.textContent = '';
            }
        });

        elements.startLoadTest.addEventListener('click', async () => {
            if (state.isLoadTestRunning) return;

            if (window.Analytics?.trackLoadTest) window.Analytics.trackLoadTest();

            const fileSizeMB = parseInt(elements.loadSizeSelect.value, 10);
            const speedTest = new window.SpeedTest();

            state.isLoadTestRunning = true;
            elements.startLoadTest.disabled = true;
            elements.startLoadTest.textContent = 'Testing...';
            elements.runTestBtn.disabled = true;
            elements.runLoadTestBtn.disabled = true;
            document.body.classList.add('test-running');

            try {
                const result = await speedTest.runLoadTest(fileSizeMB, (progress) => {
                    elements.progressFill.style.width = `${progress.progress * 100}%`;
                    window.PopupSpeedometer.update('download', progress.speedMbps);
                    elements.loadTestStatus.textContent =
                        `Speed: ${progress.speedMbps.toFixed(2)} Mbps | ` +
                        `${(progress.bytesReceived / 1024 / 1024).toFixed(0)}MB of ${fileSizeMB}MB | ` +
                        `Time: ${progress.elapsedSeconds.toFixed(1)}s`;
                });

                if (result.success) {
                    const historyEntry = {
                        timestamp: Date.now(),
                        fileSizeMB,
                        averageSpeedMbps: result.averageSpeedMbps,
                        totalTime: result.totalTime
                    };
                    state.loadTestHistory.unshift(historyEntry);
                    state.loadTestHistory = state.loadTestHistory.slice(0, 3);
                    chrome.storage.local.set({ loadTestHistory: state.loadTestHistory });
                    window.PopupCharts.updateLoadHistory();
                    elements.loadTestStatus.textContent =
                        `Complete! Average Speed: ${result.averageSpeedMbps.toFixed(2)} Mbps | ` +
                        `Total Time: ${result.totalTime.toFixed(1)}s`;
                } else {
                    elements.loadTestStatus.textContent = `Error: ${result.error}`;
                }
            } catch (error) {
                elements.loadTestStatus.textContent = `Error: ${error.message}`;
            } finally {
                state.isLoadTestRunning = false;
                elements.startLoadTest.disabled = false;
                elements.startLoadTest.textContent = 'Start Load Test';
                elements.runTestBtn.disabled = false;
                elements.runLoadTestBtn.disabled = false;
                document.body.classList.remove('test-running');
                setTimeout(() => window.PopupSpeedometer.update('download', 0), 2000);
            }
        });
    },

    setupCollapsibleHandlers() {
        const sections = [
            { id: 'speed-history-header', elementSelector: '.speed-history-graph', storageKey: 'speedHistoryCollapsed', updateFn: () => window.PopupCharts.updateHistoryGraph() },
            { id: 'load-history-header', elementSelector: '.load-history-graph', storageKey: 'loadHistoryCollapsed', updateFn: () => window.PopupCharts.updateLoadHistory() },
            { id: 'network-info-header', elementSelector: '.network-info', storageKey: 'networkInfoCollapsed' },
            { id: 'ai-insights-header', elementSelector: '.ai-insights', storageKey: 'aiInsightsCollapsed', updateFn: () => window.PopupAI.updateContent() },
            { id: 'additional-tools-header', elementSelector: '.additional-tools', storageKey: 'additionalToolsCollapsed' }
        ];

        sections.forEach(section => {
            const header = document.getElementById(section.id);
            const contentElement = document.querySelector(section.elementSelector);
            if (header && contentElement) {
                header.addEventListener('click', () => {
                    const isNowCollapsed = contentElement.classList.toggle('collapsed');
                    if (!isNowCollapsed && section.updateFn) {
                        setTimeout(section.updateFn, 300);
                    }
                    chrome.storage.local.set({ [section.storageKey]: isNowCollapsed });
                });
            }
        });

        // Initialize collapsed states
        chrome.storage.local.get(sections.map(s => s.storageKey), (result) => {
            sections.forEach(section => {
                const contentElement = document.querySelector(section.elementSelector);
                if (contentElement && result[section.storageKey]) {
                    contentElement.classList.add('collapsed');
                }
            });
        });
    },

    setupMessageListener() {
        const { state, elements } = window.PopupApp;
        chrome.runtime.onMessage.addListener((request) => {
            if (request.type === 'speedUpdate') {
                if (request.error) {
                    elements.testStatus.textContent = request.error;
                    window.PopupSpeedometer.update('download', 0);
                    window.PopupSpeedometer.update('upload', 0);
                    window.PopupNetwork.updateInfo({ ...state.networkInfoCache, status: 'error', error: request.error });
                } else {
                    const downloadSpeedMbps = (request.downloadSpeed || 0) / 1000000;
                    const uploadSpeedMbps = (request.uploadSpeed || 0) / 1000000;
                    window.PopupSpeedometer.animate('download', downloadSpeedMbps);
                    window.PopupSpeedometer.animate('upload', uploadSpeedMbps);
                    window.PopupNetwork.updateInfo(request.networkInfo || state.networkInfoCache);
                    elements.testStatus.textContent = 'Last test: ' + new Date().toLocaleTimeString();

                    const historyItem = { downloadSpeed: request.downloadSpeed, uploadSpeed: request.uploadSpeed, timestamp: Date.now() };
                    state.speedTestHistory.unshift(historyItem);
                    state.speedTestHistory = state.speedTestHistory.slice(0, 3);
                    window.PopupCharts.updateHistoryGraph();
                    chrome.storage.local.set({ speedTestHistory: state.speedTestHistory });
                }
            } else if (request.type === 'testProgress') {
                const downloadMbps = (request.downloadSpeed || 0) / 1000000;
                const uploadMbps = (request.uploadSpeed || 0) / 1000000;
                window.PopupSpeedometer.update('download', downloadMbps);
                window.PopupSpeedometer.update('upload', uploadMbps);
                if (request.networkInfo) window.PopupNetwork.updateInfo(request.networkInfo);
                elements.testStatus.textContent = request.message || 'Testing...';
            }

            if (request.aiAnalysis) window.PopupAI.updateInsights(request.aiAnalysis);
        });
    },

    setupPromoBannerHandlers() {
        const rateUsLink = document.querySelector('.promo-link.rate');
        const aiAgentsLink = document.querySelector('.promo-link.ai');
        const promoBanner = document.getElementById('promotional-banner');
        const promoClose = document.getElementById('promo-close');

        const updateStatus = () => {
            const rateUsClicked = localStorage.getItem('promoRateUsClicked') === 'true';
            const aiAgentsClicked = localStorage.getItem('promoAiAgentsClicked') === 'true';
            if (rateUsClicked && rateUsLink) rateUsLink.classList.add('clicked');
            if (aiAgentsClicked && aiAgentsLink) aiAgentsLink.classList.add('clicked');

            if (rateUsClicked && aiAgentsClicked) promoBanner.classList.add('hidden');
            else promoBanner.classList.remove('hidden');

            const bannerTitle = promoBanner.querySelector('h4');
            if (bannerTitle) {
                if (rateUsClicked && !aiAgentsClicked) bannerTitle.textContent = '🤖 Check out our AI agents too!';
                else if (aiAgentsClicked && !rateUsClicked) bannerTitle.textContent = '⭐ Don\'t forget to rate us!';
                else if (!rateUsClicked && !aiAgentsClicked) bannerTitle.textContent = '✨ Help us improve & discover more!';
            }
        };

        updateStatus();

        if (rateUsLink) {
            rateUsLink.addEventListener('click', () => {
                localStorage.setItem('promoRateUsClicked', 'true');
                if (window.Analytics?.trackRateUsClick) window.Analytics.trackRateUsClick('promo_banner');
                updateStatus();
            });
        }

        if (aiAgentsLink) {
            aiAgentsLink.addEventListener('click', () => {
                localStorage.setItem('promoAiAgentsClicked', 'true');
                if (window.Analytics?.trackAIAgentHubClick) window.Analytics.trackAIAgentHubClick('promo_banner');
                updateStatus();
            });
        }

        if (promoClose) {
            promoClose.addEventListener('click', (e) => {
                e.preventDefault();
                promoBanner.classList.add('hidden');
                localStorage.setItem('promoBannerClosed', 'true');
            });
        }
    },

    setupAdditionalToolsHandlers() {
        const toolsLinks = document.querySelectorAll('.additional-tools .tool-link');
        toolsLinks.forEach(link => {
            link.addEventListener('click', () => {
                const text = link.textContent.trim().toLowerCase();
                if (text.includes('ai')) {
                    if (window.Analytics?.trackAIAgentHubClick) window.Analytics.trackAIAgentHubClick('additional_tools');
                } else {
                    if (window.Analytics?.trackMultiWebSpeedTestClick) window.Analytics.trackMultiWebSpeedTestClick('additional_tools');
                }
            });
        });
    },

    setupModalCloseHandlers() {
        const { state } = window.PopupApp;
        document.querySelectorAll('.modal .close').forEach(closeBtn => {
            closeBtn.addEventListener('click', () => {
                if (closeBtn.closest('#load-test-modal')) {
                    if (!state.isLoadTestRunning) {
                        closeBtn.closest('.modal').style.display = 'none';
                    }
                } else {
                    closeBtn.closest('.modal').style.display = 'none';
                }
            });
        });
    }
};
