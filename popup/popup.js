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
        timestamp: document.getElementById('timestamp')
    };

    // Speedometer configuration
    const config = {
        downloadMaxSpeed: 300, // 300 Mbps max
        uploadMaxSpeed: 100,   // 100 Mbps max
        minRotation: -90,     // Starting position
        maxRotation: 90,      // Maximum position
        refreshInterval: 30000 // 30 seconds refresh interval
    };

    // Network info cache
    let networkInfoCache = {
        ipAddress: 'Unavailable',
        localAddress: 'Unavailable',
        dns: 'Unavailable',
        signalStrength: 'Unavailable',
        connectionType: 'Unavailable',
        networkName: 'Unavailable',
        latency: 'Unavailable',
        isp: 'Unavailable',
        location: {
            country: 'Unavailable',
            city: 'Unavailable',
            region: 'Unavailable',
            timezone: 'Unavailable'
        },
        serverInfo: {
            name: 'Unavailable',
            organization: 'Unavailable'
        },
        status: 'detecting',
        timestamp: new Date().toISOString(),
        lastUpdate: Date.now()
    };

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
        if (!info) {
            info = networkInfoCache;
        } else {
            networkInfoCache = {
                ...networkInfoCache,
                ...info,
                location: {
                    ...networkInfoCache.location,
                    ...(info.location || {})
                },
                serverInfo: {
                    ...networkInfoCache.serverInfo,
                    ...(info.serverInfo || {})
                },
                lastUpdate: Date.now()
            };
        }

        // Update basic network information
        elements.ipAddress.textContent = info.ipAddress || 'Unavailable';
        elements.localAddress.textContent = info.localAddress || 'Unavailable';
        elements.dns.textContent = info.dns || 'Unavailable';
        elements.signalStrength.textContent = info.signalStrength || 'Unavailable';
        elements.connectionType.textContent = info.connectionType || 'Unavailable';
        elements.networkName.textContent = info.networkName || 'Unavailable';
        elements.latency.textContent = info.latency || 'Unavailable';
        elements.isp.textContent = info.isp || 'Unavailable';

        // Update location information
        if (info.location) {
            elements.locationCountry.textContent = info.location.country || 'Unavailable';
            elements.locationCity.textContent = info.location.city || 'Unavailable';
            elements.locationRegion.textContent = info.location.region || 'Unavailable';
            elements.locationTimezone.textContent = info.location.timezone || 'Unavailable';
        }

        // Update server information
        if (info.serverInfo) {
            elements.serverName.textContent = info.serverInfo.name || 'Unavailable';
            elements.serverOrganization.textContent = info.serverInfo.organization || 'Unavailable';
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
                    (info.ipAddress !== 'Unavailable' || info.connectionType !== 'Unavailable') ? 'block' : 'none';
            }
        }
    }

    // Event handlers
    function handleSpeedTest() {
        elements.testStatus.textContent = 'Starting test...';
        elements.runTestBtn.disabled = true;
        elements.runTestBtn.textContent = 'Testing...';

        updateNetworkInfo({
            ...networkInfoCache,
            ipAddress: 'Testing...',
            localAddress: 'Testing...',
            dns: 'Testing...',
            signalStrength: 'Testing...',
            connectionType: 'Testing...',
            networkName: 'Testing...',
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
        addGradientDefs();
        updateSpeedometer('download', 0);
        updateSpeedometer('upload', 0);
        initializeSettings();
        getInitialData();
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