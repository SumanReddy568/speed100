document.addEventListener('DOMContentLoaded', function () {
    logger.info('Popup opened');

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
        openRouterApiKeyInput: document.getElementById('openrouter-api-key'),
        llmModelInput: document.getElementById('llm-model'), // Add this input in your settings modal HTML
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

    // Speedometer configuration
    const config = {
        downloadMaxSpeed: 300, // 300 Mbps max
        uploadMaxSpeed: 300,   // 100 Mbps max
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
    };

    // Initialize network info fields with "-"
    function initializeNetworkInfo() {
        const networkInfoIds = [
            'ip-address', 'local-address', 'dns', 'signal-strength',
            'connection-type', 'network-name', 'latency', 'isp',
            'location-country', 'location-city', 'location-region',
            'location-timezone', 'server-name', 'server-organization',
            'detection-status', 'ping-value', 'jitter-value', 'loss-value'
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
        chrome.storage.local.get(['historyCollapsed'], function (result) {
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

        const escapeHtml = (text) => {
            if (typeof text !== 'string') return '';
            return text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        const overallScore = typeof analysis?.performance?.rating?.overall === 'number'
            ? analysis.performance.rating.overall
            : null;
        const issues = Array.isArray(analysis?.performance?.issues) ? analysis.performance.issues : [];
        const strengths = Array.isArray(analysis?.performance?.strengths) ? analysis.performance.strengths : [];
        const summaryText = typeof analysis?.performance?.summary === 'string'
            ? analysis.performance.summary
            : (typeof analysis?.llmSummary === 'string' ? analysis.llmSummary : '');

        // Performance Analysis
        let performanceHTML = `<div class="ai-performance-rating">
            <span class="rating-score">${overallScore !== null ? overallScore.toFixed(1) : '–'}</span>
            <span>Overall Rating</span>
        </div>`;

        if (summaryText) {
            const lines = summaryText.split('\n').map(line => line.trim()).filter(Boolean);
            const bulletLines = [];
            const proseLines = [];

            lines.forEach(line => {
                if (line.startsWith('-')) {
                    bulletLines.push(line.replace(/^-+/, '').trim());
                } else {
                    proseLines.push(line);
                }
            });

            proseLines.forEach(line => {
                performanceHTML += `<p class="ai-summary-text">${escapeHtml(line)}</p>`;
            });

            if (bulletLines.length > 0) {
                performanceHTML += `<ul class="ai-summary-list">${bulletLines.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
            }
        }

        if (issues.length > 0) {
            issues.forEach(issue => {
                performanceHTML += `<p><i class="fas fa-exclamation-triangle"></i> ${escapeHtml(issue.message)}</p>`;
            });
        }

        if (strengths.length > 0) {
            strengths.forEach(strength => {
                performanceHTML += `<p><i class="fas fa-check-circle"></i> ${escapeHtml(strength.message)}</p>`;
            });
        }

        if (analysis.meta?.llmUsed) {
            const modelName = analysis.meta.llmModel ? escapeHtml(analysis.meta.llmModel) : 'OpenRouter';
            const message = analysis.meta?.summarySource === 'openrouter'
                ? `AI summary generated with ${modelName}.`
                : `AI-assisted insights generated with ${modelName}.`;
            performanceHTML += `<p class="ai-meta">${escapeHtml(message)}</p>`;
        }

        if (analysis.meta?.llmError) {
            performanceHTML += `<p class="ai-meta ai-meta-warning">${escapeHtml(analysis.meta.llmError)}</p>`;
        }

        elements.aiPerformance.innerHTML = performanceHTML;

        // Recommendations
        let recommendationsHTML = '';
        if (Array.isArray(analysis.recommendations) && analysis.recommendations.length > 0) {
            analysis.recommendations.forEach(rec => {
                recommendationsHTML += `
                    <div class="ai-recommendation">
                        <h5>
                            <i class="fas fa-lightbulb"></i>
                            ${escapeHtml(rec.title)}
                        </h5>
                        <ul>
                            ${Array.isArray(rec.steps) ? rec.steps.map(step => `<li>${escapeHtml(step)}</li>`).join('') : ''}
                        </ul>
                    </div>`;
            });
        } else {
            recommendationsHTML = '<p>No recommendations available at this time.</p>';
        }
        elements.aiRecommendations.innerHTML = recommendationsHTML;

        // Predictions
        let predictionsHTML = '';
        if (analysis.prediction) {
            const hasDownload = typeof analysis.prediction.downloadSpeed === 'number';
            const hasUpload = typeof analysis.prediction.uploadSpeed === 'number';
            const hasNotes = typeof analysis.prediction.notes === 'string' && analysis.prediction.notes.trim().length > 0;

            if (hasDownload || hasUpload) {
                const predictionLines = [];
                if (hasDownload) {
                    predictionLines.push(`<p>Predicted Download: ${(analysis.prediction.downloadSpeed / 1000000).toFixed(1)} Mbps</p>`);
                }
                if (hasUpload) {
                    predictionLines.push(`<p>Predicted Upload: ${(analysis.prediction.uploadSpeed / 1000000).toFixed(1)} Mbps</p>`);
                }

                const confidenceValue = typeof analysis.prediction.confidence === 'string'
                    ? analysis.prediction.confidence.toLowerCase()
                    : '';
                const allowedConfidence = ['low', 'medium', 'high'];
                const confidenceClass = allowedConfidence.includes(confidenceValue) ? confidenceValue : 'medium';
                if (confidenceValue) {
                    const confidenceLabel = confidenceValue.charAt(0).toUpperCase() + confidenceValue.slice(1);
                    predictionLines.push(`
                        <span class="prediction-confidence confidence-${confidenceClass}">
                            ${escapeHtml(confidenceLabel)} confidence
                        </span>`);
                }

                if (hasNotes) {
                    predictionLines.push(`<p class="prediction-note">${escapeHtml(analysis.prediction.notes)}</p>`);
                }

                predictionsHTML = predictionLines.join('\n');
            } else if (hasNotes) {
                predictionsHTML = `<p class="prediction-note">${escapeHtml(analysis.prediction.notes)}</p>`;
            }
        }

        if (!predictionsHTML) {
            predictionsHTML = '<p>Not enough data for predictions</p>';
        }
        elements.aiPredictions.innerHTML = predictionsHTML;
    }

    const loaderHTML = `
        <div class="ai-loader">
            <div class="ai-spinner"></div>
        </div>
    `;

    function showAIError(message) {
        const errorHTML = `<div class="ai-error-message"><i class="fas fa-exclamation-circle"></i> ${message}</div>`;
        if (elements.aiPerformance) elements.aiPerformance.innerHTML = errorHTML;
        if (elements.aiRecommendations) elements.aiRecommendations.innerHTML = errorHTML;
        if (elements.aiPredictions) elements.aiPredictions.innerHTML = errorHTML;
    }

    function updateAIInsightsContent() {
        // Track AI insights event
        if (window.Analytics?.trackAIInsights) {
            window.Analytics.trackAIInsights();
        }

        // Show loader immediately
        if (elements.aiPerformance) elements.aiPerformance.innerHTML = loaderHTML;
        if (elements.aiRecommendations) elements.aiRecommendations.innerHTML = loaderHTML;
        if (elements.aiPredictions) elements.aiPredictions.innerHTML = loaderHTML;

        chrome.runtime.sendMessage({ type: 'getSpeed' }, function (response) {
            if (chrome.runtime.lastError) {
                showAIError('Connection failed: ' + chrome.runtime.lastError.message);
                return;
            }
            if (response && response.aiAnalysis) {
                updateAIInsights(response.aiAnalysis);
            } else if (response && (!response.timestamp || response.downloadSpeed === 0)) {
                showAIError('Please run a speed test first to see AI insights');
            } else {
                showAIError('AI analysis is not available for this test result');
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
            },
            {
                id: 'additional-tools-header',
                element: document.querySelector('.additional-tools'),
                storageKey: 'additionalToolsCollapsed'
            }
        ];

        sections.forEach(section => {
            const header = document.getElementById(section.id);
            if (header && section.element) {
                header.addEventListener('click', () => {
                    const isNowCollapsed = section.element.classList.toggle('collapsed');

                    // Track expansion events
                    if (!isNowCollapsed) {
                        const sectionName = section.storageKey.replace('Collapsed', '').replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
                        if (window.Analytics?.trackSectionExpand) {
                            window.Analytics.trackSectionExpand(sectionName);
                        }
                    }

                    if (!isNowCollapsed && section.updateFn) {
                        setTimeout(section.updateFn, 300);
                    }

                    chrome.storage.local.set({
                        [section.storageKey]: isNowCollapsed
                    });
                });
            }
        });

        // Initialize collapsed states
        chrome.storage.local.get(sections.map(s => s.storageKey), function (result) {
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
                ping: (info.ping !== undefined && info.ping !== null) ? info.ping : (info.latency ? info.latency.replace(' ms', '') : '-'),
                jitter: (info.jitter !== undefined && info.jitter !== null) ? info.jitter : '-',
                packetLoss: (info.packetLoss !== undefined && info.packetLoss !== null) ? info.packetLoss : '-',
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

        // Update new metrics grid
        if (elements.pingValue) elements.pingValue.textContent = (info.ping !== undefined && info.ping !== null && info.ping !== '-') ? info.ping : '-';
        if (elements.jitterValue) elements.jitterValue.textContent = (info.jitter !== undefined && info.jitter !== null && info.jitter !== '-') ? info.jitter : '-';
        if (elements.lossValue) elements.lossValue.textContent = (info.packetLoss !== undefined && info.packetLoss !== null && info.packetLoss !== '-') ? info.packetLoss : '-';

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
        // Track speed test event
        if (window.Analytics?.trackSpeedTest) {
            window.Analytics.trackSpeedTest();
        }

        elements.testStatus.textContent = 'Starting test...';
        elements.runTestBtn.disabled = true;
        elements.runTestBtn.textContent = 'Testing...';

        logger.info('User initiated speed test');


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
            status: 'testing',
            ping: '...',
            jitter: '...',
            packetLoss: '...'
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

            if (request.networkInfo) {
                updateNetworkInfo(request.networkInfo);
            }

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

    elements.saveSettings.addEventListener('click', async () => {
        const interval = elements.testInterval.value;
        const apiKey = elements.openRouterApiKeyInput ? elements.openRouterApiKeyInput.value.trim() : '';
        const llmModel = elements.llmModelInput ? elements.llmModelInput.value.trim() : '';

        const storagePromises = [
            chrome.storage.sync.set({ testInterval: interval })
        ];

        if (elements.openRouterApiKeyInput) {
            if (apiKey) {
                storagePromises.push(chrome.storage.local.set({ openRouterApiKey: apiKey }));
            } else {
                storagePromises.push(chrome.storage.local.remove('openRouterApiKey'));
            }
        }

        // Save LLM model to both local and sync for compatibility
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
            logger.info('Settings saved', { interval, hasApiKey: !!apiKey, llmModel });
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

        logger.info('Starting load test', { size: elements.loadSizeSelect.value });

        // Track load test event
        if (window.Analytics?.trackLoadTest) {
            window.Analytics.trackLoadTest();
        }

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

    // Promotional Banner Management
    const promoBanner = document.getElementById('promotional-banner');
    const promoClose = document.getElementById('promo-close');
    const rateUsLink = document.querySelector('.promo-link.rate');
    const aiAgentsLink = document.querySelector('.promo-link.ai');

    // Check promotional banner status
    function checkPromoBannerStatus() {
        const rateUsClicked = localStorage.getItem('promoRateUsClicked') === 'true';
        const aiAgentsClicked = localStorage.getItem('promoAiAgentsClicked') === 'true';
        const bannerClosed = localStorage.getItem('promoBannerClosed') === 'true';

        // Update visual state of links
        if (rateUsClicked && rateUsLink) {
            rateUsLink.classList.add('clicked');
        }
        if (aiAgentsClicked && aiAgentsLink) {
            aiAgentsLink.classList.add('clicked');
        }

        // Only hide permanently if both links were clicked
        // Ignore manual close - always show banner unless both links clicked
        if (rateUsClicked && aiAgentsClicked) {
            promoBanner.classList.add('hidden');
        } else {
            promoBanner.classList.remove('hidden');
            // Clear the manual close flag so banner shows again
            localStorage.removeItem('promoBannerClosed');
        }

        // Update banner message if one link is clicked
        const bannerTitle = promoBanner.querySelector('h4');
        if (bannerTitle) {
            if (rateUsClicked && !aiAgentsClicked) {
                bannerTitle.textContent = '🤖 Check out our AI agents too!';
            } else if (aiAgentsClicked && !rateUsClicked) {
                bannerTitle.textContent = '⭐ Don\'t forget to rate us!';
            } else if (!rateUsClicked && !aiAgentsClicked) {
                bannerTitle.textContent = '✨ Help us improve & discover more!';
            }
        }
    }

    // Initialize banner status
    checkPromoBannerStatus();

    // Handle rate us link click
    if (rateUsLink) {
        rateUsLink.addEventListener('click', function (e) {
            localStorage.setItem('promoRateUsClicked', 'true');
            rateUsLink.classList.add('clicked');

            // Track rate us event
            if (window.Analytics?.trackRateUsClick) {
                window.Analytics.trackRateUsClick('promo_banner');
            }

            // Update banner message
            const aiAgentsClicked = localStorage.getItem('promoAiAgentsClicked') === 'true';
            const bannerTitle = promoBanner.querySelector('h4');

            if (!aiAgentsClicked) {
                bannerTitle.textContent = '🤖 Check out our AI agents too!';
            } else {
                // Both clicked - hide banner
                setTimeout(() => {
                    promoBanner.style.opacity = '0';
                    promoBanner.style.transform = 'translateY(-10px)';
                    setTimeout(() => {
                        promoBanner.classList.add('hidden');
                    }, 300);
                }, 1000);
            }
        });
    }

    // Handle AI agents link click
    if (aiAgentsLink) {
        aiAgentsLink.addEventListener('click', function (e) {
            localStorage.setItem('promoAiAgentsClicked', 'true');
            aiAgentsLink.classList.add('clicked');

            // Track AI Agent Hub event
            if (window.Analytics?.trackAIAgentHubClick) {
                window.Analytics.trackAIAgentHubClick('promo_banner');
            }

            // Update banner message
            const rateUsClicked = localStorage.getItem('promoRateUsClicked') === 'true';
            const bannerTitle = promoBanner.querySelector('h4');

            if (!rateUsClicked) {
                bannerTitle.textContent = '⭐ Don\'t forget to rate us!';
            } else {
                // Both clicked - hide banner
                setTimeout(() => {
                    promoBanner.style.opacity = '0';
                    promoBanner.style.transform = 'translateY(-10px)';
                    setTimeout(() => {
                        promoBanner.classList.add('hidden');
                    }, 300);
                }, 1000);
            }
        });
    }

    // Handle close button click (manual close)
    if (promoClose) {
        promoClose.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            // Hide banner with animation (temporarily)
            promoBanner.style.opacity = '0';
            promoBanner.style.transform = 'translateY(-10px)';

            setTimeout(() => {
                promoBanner.classList.add('hidden');
                // Store temporary close preference (will be cleared on next popup open)
                localStorage.setItem('promoBannerClosed', 'true');
            }, 300);
        });
    }

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
        checkOutages();

        // Load test histories
        chrome.storage.local.get(['speedTestHistory', 'loadTestHistory'], function (result) {
            if (result.speedTestHistory) {
                speedTestHistory = result.speedTestHistory;
                updateHistoryGraph();
            }
            if (result.loadTestHistory) {
                loadTestHistory = result.loadTestHistory;
                updateLoadHistory();
            }
        });

        // Add tracking for Additional Tools links
        const toolsLinks = document.querySelectorAll('.additional-tools .tool-link');
        toolsLinks.forEach(link => {
            link.addEventListener('click', () => {
                const text = link.textContent.trim().toLowerCase();
                const isAI = text.includes('ai');
                if (isAI) {
                    if (window.Analytics?.trackAIAgentHubClick) {
                        window.Analytics.trackAIAgentHubClick('additional_tools');
                    }
                } else {
                    if (window.Analytics?.trackMultiWebSpeedTestClick) {
                        window.Analytics.trackMultiWebSpeedTestClick('additional_tools');
                    }
                }
            });
        });
    }

    // Initialize network info collapsed state
    function initializeNetworkInfoState() {
        chrome.storage.local.get(['networkInfoCollapsed'], function (result) {
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

    // Real-time Service Status Checking
    function checkOutages() {
        if (!elements.serviceStatusList) return;

        elements.serviceStatusList.innerHTML = `
            <div style="padding: 5px 0; text-align: center;">
                <p style="font-size: 11px; color: #888; margin-bottom: 12px; margin-top: 0;">Detect and track service outages in real-time</p>
                <a href="https://downdetector.in/" target="_blank" class="status-badge" 
                   style="background: rgba(66, 133, 244, 0.1); color: #4285f4; border: 1px solid rgba(66, 133, 244, 0.2); text-decoration: none; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; padding: 12px 20px; font-size: 14px; border-radius: 12px; transition: all 0.3s ease; width: 100%; justify-content: center; box-sizing: border-box; font-weight: 500;">
                   <i class="fas fa-search-location"></i> Check On Downdetector
                </a>
            </div>
        `;

        const link = elements.serviceStatusList.querySelector('.status-badge');
        if (link) {
            link.addEventListener('click', () => {
                if (window.Analytics?.trackDowndetectorClick) {
                    window.Analytics.trackDowndetectorClick();
                }
            });
            link.addEventListener('mouseenter', () => {
                link.style.background = 'rgba(66, 133, 244, 0.2)';
                link.style.transform = 'translateY(-1px)';
            });
            link.addEventListener('mouseleave', () => {
                link.style.background = 'rgba(66, 133, 244, 0.1)';
                link.style.transform = 'translateY(0)';
            });
        }
    }

    // Initialize the popup
    initialize();
});

// Initialize settings
function initializeSettings(elements) {
    chrome.storage.sync.get(['testInterval', 'llmModel'], function (result) {
        elements.testInterval.value = result.testInterval || '30';
        if (elements.llmModelInput) {
            elements.llmModelInput.value = result.llmModel || 'kwaipilot/kat-coder-pro:free';
        }
        updateTimestamp(elements);
    });

    if (elements.openRouterApiKeyInput) {
        chrome.storage.local.get(['openRouterApiKey'], function (result) {
            if (result && typeof result.openRouterApiKey === 'string') {
                elements.openRouterApiKeyInput.value = result.openRouterApiKey;
            } else {
                elements.openRouterApiKeyInput.value = '';
            }
        });
    }
}

// Update timestamp
function updateTimestamp(elements) {
    if (elements.timestamp) {
        const now = new Date();
        elements.timestamp.textContent = now.toISOString().replace('T', ' ').substr(0, 19) + ' UTC';
    }
}