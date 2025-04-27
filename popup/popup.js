document.addEventListener('DOMContentLoaded', function () {
    // Elements object with all DOM references
    const elements = {
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
        closeModal: document.querySelector('.close'),
        testInterval: document.getElementById('test-interval'),
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
        aiInsights: document.querySelector('.ai-insights')
    };

    // Speedometer configuration
    const config = {
        downloadMaxSpeed: 300, // 300 Mbps max
        uploadMaxSpeed: 100,   // 100 Mbps max
        minRotation: -90,     // Starting position
        maxRotation: 90,      // Maximum position
        refreshInterval: 30000, // 30 seconds refresh interval
        maxHistoryItems: 3
    };

    let speedTestHistory = [];
    let loadTestHistory = [];
    let isLoadTestRunning = false;

    // Network info cache
    let networkInfoCache = {
        ipAddress: '-',
        localAddress: '-',
        dns: '-',
        signalStrength: '-',
        connectionType: '-',
        networkName: '-',
        latency: '-',
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
    };

    // Initialize network info fields with "-"
    function initializeNetworkInfo() {
        const networkInfoIds = [
            'ip-address', 'local-address', 'dns', 'signal-strength',
            'connection-type', 'network-name', 'latency', 'isp',
            'location-country', 'location-city', 'location-region',
            'location-timezone', 'server-name', 'server-organization',
            'detection-status'
        ];

        networkInfoIds.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = '-';
            }
        });
    }

    function updateHistoryGraph() {
        const canvas = document.querySelector('.graph-canvas');
        const container = document.querySelector('.graph-container');
        const timeLabels = document.querySelector('.graph-time-labels');
        const emptyState = document.getElementById('speed-history-empty-state');
        const graphContent = document.querySelector('.graph-content-data');
        
        if (!speedTestHistory || speedTestHistory.length === 0) {
            if (emptyState) emptyState.style.display = 'flex';
            if (graphContent) graphContent.style.display = 'none';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';
        if (graphContent) graphContent.style.display = 'block';
        
        if (!canvas || !container || !speedTestHistory || speedTestHistory.length === 0) return;
        
        // Clear existing content
        timeLabels.innerHTML = '';
        const ctx = canvas.getContext('2d');
        
        // Set canvas size
        const dpr = window.devicePixelRatio || 1;
        const rect = container.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
        ctx.scale(dpr, dpr);
        
        // Clear previous content
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const recentTests = speedTestHistory.slice(0, 3).reverse();
        const padding = { top: 30, right: 20, bottom: 30, left: 40 };
        const graphWidth = rect.width - padding.left - padding.right;
        const graphHeight = rect.height - padding.top - padding.bottom;

        // Find max speed for scaling
        const maxSpeed = Math.max(
            ...recentTests.map(test => 
                Math.max((test.downloadSpeed || 0) / 1000000, (test.uploadSpeed || 0) / 1000000)
            ),
            1 // Minimum scale
        );

        // Draw bars
        const barWidth = graphWidth / (recentTests.length * 3); // Space for both download and upload bars
        const barGap = barWidth / 2;

        recentTests.forEach((test, i) => {
            const x = padding.left + (i * barWidth * 3);
            const downloadHeight = (test.downloadSpeed / 1000000 / maxSpeed) * graphHeight;
            const uploadHeight = (test.uploadSpeed / 1000000 / maxSpeed) * graphHeight;

            // Draw download bar
            ctx.fillStyle = '#4caf50';
            ctx.fillRect(
                x,
                rect.height - padding.bottom - downloadHeight,
                barWidth,
                downloadHeight
            );

            // Draw upload bar
            ctx.fillStyle = '#2196f3';
            ctx.fillRect(
                x + barWidth + barGap,
                rect.height - padding.bottom - uploadHeight,
                barWidth,
                uploadHeight
            );

            // Add speed labels
            ctx.fillStyle = '#fff';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            
            // Download speed label
            ctx.fillText(
                `${(test.downloadSpeed / 1000000).toFixed(1)}`,
                x + barWidth / 2,
                rect.height - padding.bottom - downloadHeight - 5
            );

            // Upload speed label
            ctx.fillText(
                `${(test.uploadSpeed / 1000000).toFixed(1)}`,
                x + barWidth * 1.5 + barGap,
                rect.height - padding.bottom - uploadHeight - 5
            );

            // Time label
            const date = new Date(test.timestamp);
            const timeLabel = document.createElement('div');
            timeLabel.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            timeLabels.appendChild(timeLabel);
        });

        // Draw horizontal grid lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 5; i++) {
            const y = rect.height - padding.bottom - (i * graphHeight / 5);
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(rect.width - padding.right, y);
            ctx.stroke();
            
            // Add speed scale
            ctx.fillStyle = '#666';
            ctx.textAlign = 'right';
            ctx.fillText(
                `${(maxSpeed * i / 5).toFixed(0)}`,
                padding.left - 5,
                y + 4
            );
        }
    }

    function updateLoadHistory() {
        if (!elements.loadHistoryList) return;
        
        elements.loadHistoryList.innerHTML = '';
        
        if (!loadTestHistory || loadTestHistory.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.innerHTML = '<span class="no-data-message">No test history available</span>';
            elements.loadHistoryList.appendChild(emptyState);
            return;
        }
        
        loadTestHistory.slice(0, 3).forEach(test => {
            const item = document.createElement('div');
            item.className = 'load-history-item';
            
            const date = new Date(test.timestamp);
            item.innerHTML = `
                <span class="info-label">File Size:</span>
                <span class="info-value">${test.fileSizeMB} MB</span>
                <span class="info-label">Average Speed:</span>
                <span class="info-value">${test.averageSpeedMbps.toFixed(2)} Mbps</span>
                <span class="info-label">Duration:</span>
                <span class="info-value">${test.totalTime.toFixed(1)}s</span>
                <div class="load-history-time">${date.toLocaleString()}</div>
            `;
            
            elements.loadHistoryList.appendChild(item);
        });
    }

    // Initialize graph collapsed state from storage
    function initializeGraphState() {
        chrome.storage.local.get(['historyCollapsed'], function(result) {
            const graph = document.querySelector('.speed-history-graph');
            if (result.historyCollapsed) {
                graph.classList.add('collapsed');
            }
        });
    }

    // Add resize observer to handle container size changes
    function initializeGraphObserver() {
        const graphContainer = document.querySelector('.graph-container');
        if (!graphContainer) return;

        const resizeObserver = new ResizeObserver(entries => {
            // Only redraw if container is visible
            const graph = document.querySelector('.speed-history-graph');
            if (!graph.classList.contains('collapsed')) {
                updateHistoryGraph();
            }
        });

        resizeObserver.observe(graphContainer);
    }

    // Add function to update AI insights in UI
    function updateAIInsights(analysis) {
        if (!analysis || !elements.aiPerformance) {
            console.warn("AI analysis data is missing or AI elements are not initialized.");
            return;
        }

        // Performance Analysis
        let performanceHTML = `<div class="ai-performance-rating">
            <span class="rating-score">${analysis.performance.rating.overall.toFixed(1)}</span>
            <span>Overall Rating</span>
        </div>`;

        if (analysis.performance.issues && analysis.performance.issues.length > 0) {
            analysis.performance.issues.forEach(issue => {
                performanceHTML += `<p><i class="fas fa-exclamation-triangle"></i> ${issue.message}</p>`;
            });
        }

        if (analysis.performance.strengths && analysis.performance.strengths.length > 0) {
            analysis.performance.strengths.forEach(strength => {
                performanceHTML += `<p><i class="fas fa-check-circle"></i> ${strength.message}</p>`;
            });
        }

        elements.aiPerformance.innerHTML = performanceHTML;

        // Recommendations
        let recommendationsHTML = '';
        if (analysis.recommendations && analysis.recommendations.length > 0) {
            analysis.recommendations.forEach(rec => {
                recommendationsHTML += `
                    <div class="ai-recommendation">
                        <h5>
                            <i class="fas fa-lightbulb"></i>
                            ${rec.title}
                        </h5>
                        <ul>
                            ${rec.steps.map(step => `<li>${step}</li>`).join('')}
                        </ul>
                    </div>`;
            });
        } else {
            recommendationsHTML = '<p>No recommendations available at this time.</p>';
        }
        elements.aiRecommendations.innerHTML = recommendationsHTML;

        // Predictions
        let predictionsHTML = '';
        if (analysis.prediction && analysis.prediction.downloadSpeed) {
            predictionsHTML = `
                <p>Predicted Download: ${(analysis.prediction.downloadSpeed / 1000000).toFixed(1)} Mbps</p>
                <p>Predicted Upload: ${(analysis.prediction.uploadSpeed / 1000000).toFixed(1)} Mbps</p>
                <span class="prediction-confidence confidence-${analysis.prediction.confidence}">
                    ${analysis.prediction.confidence} confidence
                </span>`;
        } else {
            predictionsHTML = '<p>Not enough data for predictions</p>';
        }
        elements.aiPredictions.innerHTML = predictionsHTML;
    }

    function updateAIInsightsContent() {
        chrome.runtime.sendMessage({ type: 'getSpeed' }, function (response) {
            if (response && response.aiAnalysis) {
                updateAIInsights(response.aiAnalysis);
            }
        });
    }

    // Update the click handlers for collapsible sections
    function initializeCollapsibleSections() {
        const sections = [
            { 
                id: 'speed-history-header',
                element: document.querySelector('.speed-history-graph'),
                storageKey: 'speedHistoryCollapsed',
                updateFn: updateHistoryGraph
            },
            { 
                id: 'load-history-header',
                element: document.querySelector('.load-history-graph'),
                storageKey: 'loadHistoryCollapsed',
                updateFn: updateLoadHistory
            },
            { 
                id: 'network-info-header',
                element: document.querySelector('.network-info'),
                storageKey: 'networkInfoCollapsed'
            },
            {
                id: 'ai-insights-header',
                element: document.querySelector('.ai-insights'),
                storageKey: 'aiInsightsCollapsed',
                updateFn: updateAIInsightsContent
            }
        ];

        sections.forEach(section => {
            const header = document.getElementById(section.id);
            if (header && section.element) {
                header.addEventListener('click', () => {
                    section.element.classList.toggle('collapsed');
                    
                    if (!section.element.classList.contains('collapsed') && section.updateFn) {
                        setTimeout(section.updateFn, 300);
                    }
                    
                    chrome.storage.local.set({
                        [section.storageKey]: section.element.classList.contains('collapsed')
                    });
                });
            }
        });

        // Initialize collapsed states
        chrome.storage.local.get(sections.map(s => s.storageKey), function(result) {
            sections.forEach(section => {
                if (section.element && result[section.storageKey]) {
                    section.element.classList.add('collapsed');
                }
            });
        });
    }

    function updateNetworkInfo(info) {
        // Default empty values
        const emptyValues = {
            ipAddress: '-',
            localAddress: '-',
            dns: '-',
            signalStrength: '-',
            connectionType: '-',
            networkName: '-',
            latency: '-',
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
            status: 'waiting'
        };

        if (!info) {
            info = { ...emptyValues };
        } else {
            // Preserve network name and local address if they're not being updated
            info = {
                ...emptyValues,
                ...networkInfoCache,
                ...info,
                networkName: info.networkName || networkInfoCache.networkName || '-',
                localAddress: info.localAddress || networkInfoCache.localAddress || '-',
                lastUpdate: Date.now()
            };
        }

        networkInfoCache = info;

        // Update basic network information
        elements.ipAddress.textContent = info.ipAddress || '-';
        elements.localAddress.textContent = info.localAddress || '-';
        elements.dns.textContent = info.dns || '-';
        elements.signalStrength.textContent = info.signalStrength || '-';
        elements.connectionType.textContent = info.connectionType || '-';
        elements.networkName.textContent = info.networkName || '-';
        elements.latency.textContent = info.latency || '-';
        elements.isp.textContent = info.isp || '-';

        // Update location information
        if (info.location) {
            elements.locationCountry.textContent = info.location.country || '-';
            elements.locationCity.textContent = info.location.city || '-';
            elements.locationRegion.textContent = info.location.region || '-';
            elements.locationTimezone.textContent = info.location.timezone || '-';
        }

        // Update server information
        if (info.serverInfo) {
            elements.serverName.textContent = info.serverInfo.name || '-';
            elements.serverOrganization.textContent = info.serverInfo.organization || '-';
        }

        // Update status and error handling
        if (elements.detectionStatus) {
            elements.detectionStatus.textContent = info.status || 'detecting';
        }

        updateTimestamp(elements);

        // Handle error states
        if (elements.networkInfoContainer && elements.networkInfoContainer.style) {
            if (info.status === 'error') {
                if (elements.errorContainer) {
                    elements.errorMessage.textContent = info.error || 'Unknown error';
                    elements.errorContainer.style.display = 'block';
                }
                elements.networkInfoContainer.classList.add('error-state');
            } else {
                if (elements.errorContainer) {
                    elements.errorContainer.style.display = 'none';
                }
                elements.networkInfoContainer.classList.remove('error-state');
                elements.networkInfoContainer.style.display =
                    (info.ipAddress !== '-' || info.connectionType !== '-') ? 'block' : 'none';
            }
        }
    }

    // Speedometer functions
    function updateSpeedometer(type, speedMbps) {
        const isDownload = type === 'download';
        const maxSpeed = isDownload ? config.downloadMaxSpeed : config.uploadMaxSpeed;
        const needle = isDownload ? elements.downloadNeedle : elements.uploadNeedle;
        const meter = isDownload ? elements.downloadMeter : elements.uploadMeter;
        const display = isDownload ? elements.downloadSpeed : elements.uploadSpeedDisplay;

        const clampedSpeed = Math.min(speedMbps, maxSpeed);
        display.textContent = clampedSpeed.toFixed(1);

        const rotation = config.minRotation + (clampedSpeed / maxSpeed * (config.maxRotation - config.minRotation));
        needle.setAttribute('transform', `rotate(${rotation} 100 100)`);

        const arcFill = (clampedSpeed / maxSpeed) * 251;
        meter.style.strokeDasharray = `${arcFill} ${251 - arcFill}`;
    }

    function animateSpeedometer(type, targetSpeed) {
        const isDownload = type === 'download';
        const currentSpeed = isDownload ?
            parseFloat(elements.downloadSpeed.textContent) :
            parseFloat(elements.uploadSpeedDisplay.textContent);

        const duration = 1000;
        const startTime = performance.now();

        function animate(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const current = currentSpeed + (targetSpeed - currentSpeed) * progress;

            updateSpeedometer(type, current);

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        }

        requestAnimationFrame(animate);
    }

    // Event handlers
    function handleSpeedTest() {
        elements.testStatus.textContent = 'Starting test...';
        elements.runTestBtn.disabled = true;
        elements.runTestBtn.textContent = 'Testing...';

        // Get current network name before starting test
        if (navigator.connection) {
            const networkInfo = {
                ...networkInfoCache,
                networkName: navigator.connection.type === 'wifi' ?
                    (navigator.connection.ssid || '-') :
                    navigator.connection.type || '-',
                connectionType: navigator.connection.type || '-'
            };
            updateNetworkInfo(networkInfo);
        }

        // Set testing state for other fields
        updateNetworkInfo({
            ...networkInfoCache,
            ipAddress: 'Testing...',
            dns: 'Testing...',
            signalStrength: 'Testing...',
            latency: 'Testing...',
            isp: 'Testing...',
            location: {
                country: 'Testing...',
                city: 'Testing...',
                region: 'Testing...',
                timezone: 'Testing...'
            },
            serverInfo: {
                name: 'Testing...',
                organization: 'Testing...'
            },
            status: 'testing'
        });

        chrome.runtime.sendMessage({ type: 'runTest' }, function (response) {
            setTimeout(() => {
                elements.runTestBtn.disabled = false;
                elements.runTestBtn.textContent = 'Run Speed Test';

                if (response && response.error) {
                    updateNetworkInfo(networkInfoCache);
                }
            }, 15000);
        });
    }

    // Message listeners
    chrome.runtime.onMessage.addListener(function (request) {
        if (request.type === 'speedUpdate') {
            if (request.error) {
                elements.testStatus.textContent = request.error;
                updateSpeedometer('download', 0);
                updateSpeedometer('upload', 0);
                updateNetworkInfo({
                    ...networkInfoCache,
                    status: 'error',
                    error: request.error
                });
            } else {
                const downloadSpeedMbps = (request.downloadSpeed || 0) / 1000000;
                const uploadSpeedMbps = (request.uploadSpeed || 0) / 1000000;

                animateSpeedometer('download', downloadSpeedMbps);
                animateSpeedometer('upload', uploadSpeedMbps);

                updateNetworkInfo(request.networkInfo || networkInfoCache);
                elements.testStatus.textContent = 'Last test: ' + new Date().toLocaleTimeString();
            }
            if (request.downloadSpeed !== undefined && request.uploadSpeed !== undefined) {
                const newTest = {
                    downloadSpeed: request.downloadSpeed,
                    uploadSpeed: request.uploadSpeed,
                    timestamp: Date.now()
                };
                
                speedTestHistory.unshift(newTest);
                speedTestHistory = speedTestHistory.slice(0, 3);
                updateHistoryGraph();
                
                // Save to storage
                chrome.storage.local.set({ speedTestHistory: speedTestHistory });
            }
        } else if (request.type === 'testProgress') {
            const downloadSpeedMbps = (request.downloadSpeed || 0) / 1000000;
            const uploadSpeedMbps = (request.uploadSpeed || 0) / 1000000;

            updateSpeedometer('download', downloadSpeedMbps);
            updateSpeedometer('upload', uploadSpeedMbps);

            elements.testStatus.textContent = request.message || 'Testing...';
        }

        if (request.aiAnalysis) {
            updateAIInsights(request.aiAnalysis);
        }
    });

    // Settings modal handlers
    elements.settingsIcon.addEventListener('click', () => {
        elements.settingsModal.style.display = 'block';
    });

    elements.closeModal.addEventListener('click', () => {
        elements.settingsModal.style.display = 'none';
    });

    elements.saveSettings.addEventListener('click', () => {
        const interval = elements.testInterval.value;
        chrome.storage.sync.set({ testInterval: interval }, function () {
            chrome.alarms.clear('nextSpeedTest');
            if (interval !== '0') {
                chrome.alarms.create('nextSpeedTest', { periodInMinutes: parseInt(interval) });
            }
            elements.settingsModal.style.display = 'none';
        });
    });

    window.addEventListener('click', (event) => {
        if (event.target === elements.settingsModal) {
            elements.settingsModal.style.display = 'none';
        }
        if (event.target === elements.loadTestModal && !isLoadTestRunning) {
            elements.loadTestModal.style.display = 'none';
        }
    });

    // Load test modal handlers
    elements.runLoadTestBtn.addEventListener('click', () => {
        if (!isLoadTestRunning) {
            elements.loadTestModal.style.display = 'block';
            elements.startLoadTest.textContent = 'Start Load Test';
            elements.progressFill.style.width = '0';
            elements.loadTestStatus.textContent = '';
        }
    });

    document.querySelectorAll('.modal .close').forEach(closeBtn => {
        closeBtn.addEventListener('click', () => {
            if (!isLoadTestRunning) {
                closeBtn.closest('.modal').style.display = 'none';
            }
        });
    });

    elements.startLoadTest.addEventListener('click', async () => {
        if (isLoadTestRunning) return;
        
        const fileSizeMB = parseInt(elements.loadSizeSelect.value, 10);
        const speedTest = new window.SpeedTest();
        
        // Update UI for test start
        isLoadTestRunning = true;
        elements.startLoadTest.disabled = true;
        elements.startLoadTest.textContent = 'Testing...';
        elements.runTestBtn.disabled = true;
        elements.runLoadTestBtn.disabled = true;
        document.body.classList.add('test-running');
        
        try {
            const result = await speedTest.runLoadTest(fileSizeMB, (progress) => {
                elements.progressFill.style.width = `${progress.progress * 100}%`;
                updateSpeedometer('download', progress.speedMbps);
                elements.loadTestStatus.textContent = 
                    `Speed: ${progress.speedMbps.toFixed(2)} Mbps | ` +
                    `${(progress.bytesReceived / 1024 / 1024).toFixed(0)}MB of ${fileSizeMB}MB | ` +
                    `Time: ${progress.elapsedSeconds.toFixed(1)}s`;
            });

            if (result.success) {
                // Add to history
                const historyEntry = {
                    timestamp: Date.now(),
                    fileSizeMB,
                    averageSpeedMbps: result.averageSpeedMbps,
                    totalTime: result.totalTime
                };
                
                loadTestHistory.unshift(historyEntry);
                loadTestHistory = loadTestHistory.slice(0, 3); // Keep only last 3 tests
                
                // Save to storage
                chrome.storage.local.set({ loadTestHistory });
                
                // Update UI
                updateLoadHistory();
                elements.loadTestStatus.textContent = 
                    `Complete! Average Speed: ${result.averageSpeedMbps.toFixed(2)} Mbps | ` +
                    `Total Time: ${result.totalTime.toFixed(1)}s`;
            } else {
                elements.loadTestStatus.textContent = `Error: ${result.error}`;
            }
        } catch (error) {
            elements.loadTestStatus.textContent = `Error: ${error.message}`;
        } finally {
            // Reset UI
            isLoadTestRunning = false;
            elements.startLoadTest.disabled = false;
            elements.startLoadTest.textContent = 'Start Load Test';
            elements.runTestBtn.disabled = false;
            elements.runLoadTestBtn.disabled = false;
            document.body.classList.remove('test-running');
            
            setTimeout(() => {
                updateSpeedometer('download', 0);
            }, 2000);
        }
    });

    // Initialize
    function initialize() {
        initializeNetworkInfo();
        addGradientDefs();
        updateSpeedometer('download', 0);
        updateSpeedometer('upload', 0);
        initializeSettings(elements);
        getInitialData();
        initializeCollapsibleSections();
        initializeGraphObserver();
        initializeNetworkInfoState();

        // Load test histories
        chrome.storage.local.get(['speedTestHistory', 'loadTestHistory'], function(result) {
            if (result.speedTestHistory) {
                speedTestHistory = result.speedTestHistory;
                updateHistoryGraph();
            }
            if (result.loadTestHistory) {
                loadTestHistory = result.loadTestHistory;
                updateLoadHistory();
            }
        });
    }

    // Initialize network info collapsed state
    function initializeNetworkInfoState() {
        chrome.storage.local.get(['networkInfoCollapsed'], function(result) {
            const networkInfo = document.querySelector('.network-info');
            if (result.networkInfoCollapsed) {
                networkInfo.classList.add('collapsed');
            }
        });
    }

    function saveHistory() {
        chrome.storage.local.set({ speedTestHistory: speedTestHistory });
    }

    // Add gradient definitions
    function addGradientDefs() {
        const downloadSVG = document.getElementById('download-speedometer');
        const uploadSVG = document.getElementById('upload-speedometer');

        if (downloadSVG) {
            const defsDownload = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            defsDownload.innerHTML = `
                <linearGradient id="download-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#f44336" />
                    <stop offset="50%" stop-color="#ff9800" />
                    <stop offset="100%" stop-color="#4caf50" />
                </linearGradient>
            `;
            downloadSVG.insertBefore(defsDownload, downloadSVG.firstChild);
        }

        if (uploadSVG) {
            const defsUpload = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            defsUpload.innerHTML = `
                <linearGradient id="upload-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#2196f3" />
                    <stop offset="50%" stop-color="#03a9f4" />
                    <stop offset="100%" stop-color="#00bcd4" />
                </linearGradient>
            `;
            uploadSVG.insertBefore(defsUpload, uploadSVG.firstChild);
        }
    }

    // Get initial data
    function getInitialData() {
        chrome.runtime.sendMessage({ type: 'getSpeed' }, function (response) {
            if (response) {
                const downloadSpeedMbps = (response.downloadSpeed || 0) / 1000000;
                const uploadSpeedMbps = (response.uploadSpeed || 0) / 1000000;

                updateSpeedometer('download', downloadSpeedMbps);
                updateSpeedometer('upload', uploadSpeedMbps);
                updateNetworkInfo(response.networkInfo || networkInfoCache);

                elements.testStatus.textContent = response.timestamp ?
                    'Last test: ' + new Date(response.timestamp).toLocaleTimeString() :
                    'No test data available';
            }
        });
    }

    // Add event listener for test button
    elements.runTestBtn.addEventListener('click', handleSpeedTest);

    // Initialize the popup
    initialize();
});

// Initialize settings
function initializeSettings(elements) {
    chrome.storage.sync.get(['testInterval'], function (result) {
        elements.testInterval.value = result.testInterval || '30';
        updateTimestamp(elements);
    });
}

// Update timestamp
function updateTimestamp(elements) {
    if (elements.timestamp) {
        const now = new Date();
        elements.timestamp.textContent = now.toISOString().replace('T', ' ').substr(0, 19) + ' UTC';
    }
}