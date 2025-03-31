document.addEventListener('DOMContentLoaded', function () {
    const elements = {
        downloadSpeed: document.getElementById('download-speed'),
        uploadSpeedDisplay: document.getElementById('upload-speed-display'),
        ipAddress: document.getElementById('ip-address'),
        dns: document.getElementById('dns'),
        signalStrength: document.getElementById('signal-strength'),
        connectionType: document.getElementById('connection-type'),
        latency: document.getElementById('latency'),
        downloadNeedle: document.getElementById('download-needle'),
        uploadNeedle: document.getElementById('upload-needle'),
        runTestBtn: document.getElementById('run-test-btn'),
        testStatus: document.getElementById('test-status'),
        downloadMeter: document.querySelector('#download-speedometer .meter-arc'),
        uploadMeter: document.querySelector('#upload-speedometer .meter-arc'),
        settingsIcon: document.getElementById('settings-icon'),
        settingsModal: document.getElementById('settings-modal'),
        closeModal: document.querySelector('.close'),
        testInterval: document.getElementById('test-interval'),
        saveSettings: document.getElementById('save-settings'),
        networkInfoContainer: document.getElementById('network-info-container') || document.createElement('div') // Fallback if not found
    };

    // Speedometer configuration
    const downloadMaxSpeed = 300; // 300 Mbps max
    const uploadMaxSpeed = 100;   // 100 Mbps max
    const minRotation = -90;     // Starting position
    const maxRotation = 90;      // Maximum position

    // Cache for network info
    let networkInfoCache = {
        ipAddress: 'Unavailable',
        dns: 'Unavailable',
        signalStrength: 'Unavailable',
        connectionType: 'Unavailable',
        latency: 'Unavailable',
        timestamp: 0
    };

    // Initialize settings
    chrome.storage.sync.get(['testInterval'], function (result) {
        elements.testInterval.value = result.testInterval || '30';
    });

    // Settings modal handlers
    elements.settingsIcon.addEventListener('click', function () {
        elements.settingsModal.style.display = 'block';
    });

    elements.closeModal.addEventListener('click', function () {
        elements.settingsModal.style.display = 'none';
    });

    elements.saveSettings.addEventListener('click', function () {
        const interval = elements.testInterval.value;
        chrome.storage.sync.set({ testInterval: interval }, function () {
            chrome.alarms.clear('nextSpeedTest');
            if (interval !== '0') {
                chrome.alarms.create('nextSpeedTest', { periodInMinutes: parseInt(interval) });
            }
            elements.settingsModal.style.display = 'none';
        });
    });

    window.addEventListener('click', function (event) {
        if (event.target === elements.settingsModal) {
            elements.settingsModal.style.display = 'none';
        }
    });

    // Speedometer functions (unchanged)
    function updateSpeedometer(type, speedMbps) {
        const isDownload = type === 'download';
        const maxSpeed = isDownload ? downloadMaxSpeed : uploadMaxSpeed;
        const needle = isDownload ? elements.downloadNeedle : elements.uploadNeedle;
        const meter = isDownload ? elements.downloadMeter : elements.uploadMeter;
        const display = isDownload ? elements.downloadSpeed : elements.uploadSpeedDisplay;

        const clampedSpeed = Math.min(speedMbps, maxSpeed);
        display.textContent = clampedSpeed.toFixed(1);

        const rotation = minRotation + (clampedSpeed / maxSpeed * (maxRotation - minRotation));
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

    // Improved network info display function with caching
    function updateNetworkInfo(info) {
        if (!info) {
            info = networkInfoCache; // Use cached info if none provided
        } else {
            // Update cache if we got fresh info
            networkInfoCache = {
                ...info,
                timestamp: Date.now()
            };
        }

        // Update individual elements
        elements.ipAddress.textContent = info.ipAddress || 'Unavailable';
        elements.dns.textContent = info.dns || 'Unavailable';
        elements.signalStrength.textContent = info.signalStrength || 'Unavailable';
        elements.connectionType.textContent = info.connectionType || 'Unavailable';
        elements.latency.textContent = info.latency || 'Unavailable';

        // Only try to modify container if it exists
        if (elements.networkInfoContainer && elements.networkInfoContainer.style) {
            if (info.status === 'error') {
                elements.networkInfoContainer.innerHTML = `
                    <div class="network-error">
                        Network information unavailable: ${info.error || 'Unknown error'}
                    </div>
                `;
            } else if (info.ipAddress !== 'Unavailable' || info.connectionType !== 'Unavailable') {
                elements.networkInfoContainer.style.display = 'block';
            } else {
                elements.networkInfoContainer.style.display = 'none';
            }
        }
    }

    // Get initial data with cache support
    function getInitialData() {
        chrome.runtime.sendMessage({ type: 'getSpeed' }, function (response) {
            if (response) {
                const downloadSpeedMbps = (response.downloadSpeed || 0) / 1000000;
                const uploadSpeedMbps = (response.uploadSpeed || 0) / 1000000;

                updateSpeedometer('download', downloadSpeedMbps);
                updateSpeedometer('upload', uploadSpeedMbps);

                // Use cached network info if no fresh data available
                const networkInfo = response.networkInfo || networkInfoCache;
                updateNetworkInfo(networkInfo);

                elements.testStatus.textContent = response.timestamp ?
                    'Last test: ' + new Date(response.timestamp).toLocaleTimeString() : 
                    'No test data available';
            }
        });
    }

    // Improved message listener with caching
    chrome.runtime.onMessage.addListener(function (request) {
        if (request.type === 'speedUpdate') {
            if (request.error) {
                // Handle error state using cached info
                elements.testStatus.textContent = request.error;
                updateSpeedometer('download', 0);
                updateSpeedometer('upload', 0);
                updateNetworkInfo({
                    ...networkInfoCache,
                    status: 'error',
                    error: request.error
                });
            } else {
                // Normal update
                const downloadSpeedMbps = (request.downloadSpeed || 0) / 1000000;
                const uploadSpeedMbps = (request.uploadSpeed || 0) / 1000000;
                
                animateSpeedometer('download', downloadSpeedMbps);
                animateSpeedometer('upload', uploadSpeedMbps);
                
                // Use fresh network info if available, otherwise cached
                const networkInfo = request.networkInfo || networkInfoCache;
                updateNetworkInfo(networkInfo);
                
                elements.testStatus.textContent = 'Last test: ' + new Date().toLocaleTimeString();
            }
        } else if (request.type === 'testProgress') {
            // Update during test
            const downloadSpeedMbps = (request.downloadSpeed || 0) / 1000000;
            const uploadSpeedMbps = (request.uploadSpeed || 0) / 1000000;

            updateSpeedometer('download', downloadSpeedMbps);
            updateSpeedometer('upload', uploadSpeedMbps);

            elements.testStatus.textContent = request.message || 'Testing...';
        }
    });

    // Handle manual test button click with better state management
    elements.runTestBtn.addEventListener('click', function () {
        elements.testStatus.textContent = 'Starting test...';
        elements.runTestBtn.disabled = true;
        elements.runTestBtn.textContent = 'Testing...';

        // Show cached network info during test
        updateNetworkInfo({
            ...networkInfoCache,
            ipAddress: 'Testing...',
            dns: 'Testing...',
            signalStrength: 'Testing...',
            connectionType: 'Testing...',
            latency: 'Testing...'
        });

        chrome.runtime.sendMessage({ type: 'runTest' }, function (response) {
            setTimeout(() => {
                elements.runTestBtn.disabled = false;
                elements.runTestBtn.textContent = 'Run Speed Test';
                
                // If test failed, restore cached values
                if (response && response.error) {
                    updateNetworkInfo(networkInfoCache);
                }
            }, 15000);
        });
    });

    // Add gradient definitions to SVGs
    function addGradientDefs() {
        const downloadSVG = document.getElementById('download-speedometer');
        if (downloadSVG) {
            let defsDownload = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            defsDownload.innerHTML = `
                <linearGradient id="download-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#f44336" />
                    <stop offset="50%" stop-color="#ff9800" />
                    <stop offset="100%" stop-color="#4caf50" />
                </linearGradient>
            `;
            downloadSVG.insertBefore(defsDownload, downloadSVG.firstChild);
        }

        const uploadSVG = document.getElementById('upload-speedometer');
        if (uploadSVG) {
            let defsUpload = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
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

    // Initialize
    addGradientDefs();
    updateSpeedometer('download', 0);
    updateSpeedometer('upload', 0);
    getInitialData(); // Load initial data
});