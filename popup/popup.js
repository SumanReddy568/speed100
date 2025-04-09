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
        graphTimeLabels: document.querySelector('.graph-time-labels')
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
        
        // Clear previous canvas content and labels
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        container.querySelectorAll('.speed-label').forEach(el => el.remove());

        const recentTests = speedTestHistory.slice(0, 3).reverse();
        const padding = { top: 30, right: 20, bottom: 20, left: 40 };
        const graphWidth = rect.width - padding.left - padding.right;
        const graphHeight = rect.height - padding.top - padding.bottom;

        // Find max speed for scaling
        const maxSpeed = Math.max(
            ...recentTests.map(test => 
                Math.max((test.downloadSpeed || 0) / 1000000, (test.uploadSpeed || 0) / 1000000)
            ),
             1 // Minimum scale
        );

        // Draw grid and labels
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        
        // Draw data points and lines
        const points = {
            download: [],
            upload: []
        };

        recentTests.forEach((test, i) => {
            const x = padding.left + (i * (graphWidth / (recentTests.length - 1)));
            const downloadY = rect.height - padding.bottom - 
                ((test.downloadSpeed / 1000000 / maxSpeed) * graphHeight);
            const uploadY = rect.height - padding.bottom - 
                ((test.uploadSpeed / 1000000 / maxSpeed) * graphHeight);

            points.download.push({ x, y: downloadY });
            points.upload.push({ x, y: uploadY });

            // Add speed labels
            const downloadLabel = document.createElement('div');
            const uploadLabel = document.createElement('div');
            downloadLabel.className = 'speed-label download';
            uploadLabel.className = 'speed-label upload';
            
            downloadLabel.textContent = `${(test.downloadSpeed / 1000000).toFixed(1)}`;
            uploadLabel.textContent = `${(test.uploadSpeed / 1000000).toFixed(1)}`;
            
            downloadLabel.style.left = `${x}px`;
            uploadLabel.style.left = `${x}px`;
            
            // Adjust vertical position to prevent overlap
            const labelGap = 20;
            if (Math.abs(downloadY - uploadY) < labelGap) {
                downloadLabel.style.top = `${Math.min(downloadY, uploadY) - labelGap}px`;
                uploadLabel.style.top = `${Math.max(downloadY, uploadY)}px`;
            } else {
                downloadLabel.style.top = `${downloadY}px`;
                uploadLabel.style.top = `${uploadY}px`;
            }

            container.appendChild(downloadLabel);
            container.appendChild(uploadLabel);

            // Add time label
            const timeLabel = document.createElement('div');
            const date = new Date(test.timestamp);
            timeLabel.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            timeLabels.appendChild(timeLabel);
        });

        // Draw lines
        [
            { points: points.download, color: '#4caf50' },
            { points: points.upload, color: '#2196f3' }
        ].forEach(({ points, color }) => {
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            points.forEach((point, i) => {
                if (i === 0) ctx.moveTo(point.x, point.y);
                else ctx.lineTo(point.x, point.y);
            });
            ctx.stroke();

            // Draw points
            points.forEach(point => {
                ctx.beginPath();
                ctx.fillStyle = color;
                ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
                ctx.fill();
            });
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

    // Save collapsed state
    document.querySelector('.history-header').addEventListener('click', () => {
        const graph = document.querySelector('.speed-history-graph');
        graph.classList.toggle('collapsed');
        
        if (!graph.classList.contains('collapsed')) {
            setTimeout(updateHistoryGraph, 300);
        }
    });

    // Initialize settings
    function initializeSettings() {
        chrome.storage.sync.get(['testInterval'], function (result) {
            elements.testInterval.value = result.testInterval || '30';
            updateTimestamp();
        });
    }

    // Update timestamp
    function updateTimestamp() {
        if (elements.timestamp) {
            const now = new Date();
            elements.timestamp.textContent = now.toISOString().replace('T', ' ').substr(0, 19) + ' UTC';
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

    // Network info functions
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

        updateTimestamp();

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
    });

    // Initialize
    function initialize() {
        initializeNetworkInfo();
        addGradientDefs();
        updateSpeedometer('download', 0);
        updateSpeedometer('upload', 0);
        initializeSettings();
        getInitialData();
        initializeGraphState();
        initializeGraphObserver();

        // Load speed test history
        chrome.storage.local.get(['speedTestHistory'], function(result) {
            if (result.speedTestHistory) {
                speedTestHistory = result.speedTestHistory;
                updateHistoryGraph();
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