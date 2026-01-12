importScripts('utils/analytics.js', 'speed-test.js', 'services/ai-analysis.js');

const speedTest = new self.SpeedTest();
const aiAnalysis = new self.NetworkAIAnalysis();

let lastTestResult = {
    downloadSpeed: 0,
    uploadSpeed: 0,
    networkInfo: {},
    timestamp: null
};

// Function to update the badge with current download speed
function updateBadge(speedMbps) {
    let displaySpeed = Math.min(999, Math.round(speedMbps)).toString();

    chrome.action.setBadgeText({
        text: displaySpeed
    });

    chrome.action.setBadgeBackgroundColor({
        color: speedMbps > 100 ? '#4CAF50' : speedMbps > 50 ? '#FFC107' : '#F44336'
    });
}

// Function to send progress updates
// In your service-worker.js
function sendProgress(message, speeds, networkInfo = null) {
    // Check if online before proceeding
    if (!navigator.onLine) {
        chrome.runtime.sendMessage({
            type: 'speedUpdate',
            downloadSpeed: 0,
            uploadSpeed: 0,
            error: 'No internet connection'
        }).catch(() => {
            // Silent catch for when popup is closed
        });
        return;
    }

    // Send normal progress if online
    chrome.runtime.sendMessage({
        type: 'testProgress',
        message: message,
        downloadSpeed: speeds?.downloadSpeed || 0,
        uploadSpeed: speeds?.uploadSpeed || 0,
        networkInfo: networkInfo
    }).catch(() => {
        // Silent catch for when popup is closed
    });
}

// Function to run speed test and update results
async function runSpeedTest(isAutomated = false) {
    // Helper for conditional logging
    const log = (level, msg, data) => {
        if (!isAutomated) {
            // Remote logging (calls pushLog)
            if (logger && logger[level]) {
                logger[level](msg, data);
            }
        } else {
            // Local logging only for automated tests
            const consoleMethod = level === 'error' ? console.error : console.log;
            consoleMethod(`[${level.toUpperCase()}] ${msg}`, data);
        }
    };

    try {
        log('info', 'Starting speed test run');
        sendProgress('Preparing test...', { downloadSpeed: 0, uploadSpeed: 0 });

        // Set up progress callback
        speedTest.setProgressCallback((speeds) => {
            const downloadMbps = speeds.downloadSpeed / 1000000;
            const uploadMbps = speeds.uploadSpeed / 1000000;
            updateBadge(downloadMbps);
            sendProgress('Testing in progress...', {
                downloadSpeed: speeds.downloadSpeed,
                uploadSpeed: speeds.uploadSpeed
            });
        });

        // Get network info before running tests
        sendProgress('Gathering network info...', { downloadSpeed: 0, uploadSpeed: 0 });
        const networkInfo = await speedTest.getNetworkInfo();
        log('info', 'Network information fetched', {
            ip: networkInfo.ipAddress,
            isp: networkInfo.isp,
            location: networkInfo.location?.city + ', ' + networkInfo.location?.country
        });

        sendProgress('Starting download test...', { downloadSpeed: 0, uploadSpeed: 0 }, networkInfo);
        log('info', 'Download test started');
        await speedTest.testDownloadSpeed();
        log('info', 'Download test finished', { speed: speedTest.downloadSpeed / 1000000 });

        sendProgress('Starting upload test...',
            { downloadSpeed: speedTest.downloadSpeed, uploadSpeed: 0 }, networkInfo);
        log('info', 'Upload test started');
        await speedTest.testUploadSpeed();
        log('info', 'Upload test finished', { speed: speedTest.uploadSpeed / 1000000 });

        lastTestResult = {
            downloadSpeed: speedTest.downloadSpeed,
            uploadSpeed: speedTest.uploadSpeed,
            networkInfo: networkInfo,
            timestamp: Date.now()
        };

        log('info', 'Speed test completed', {
            download: lastTestResult.downloadSpeed / 1000000,
            upload: lastTestResult.uploadSpeed / 1000000,
            ping: networkInfo.latency
        });

        // Update badge with final download speed
        updateBadge(speedTest.downloadSpeed / 1000000);

        // Add AI analysis
        sendProgress('Generating AI insights...', {
            downloadSpeed: speedTest.downloadSpeed,
            uploadSpeed: speedTest.uploadSpeed
        });

        log('info', 'AI analysis lifecycle started');
        let analysis = null;
        try {
            analysis = await aiAnalysis.analyzeSpeedTest(lastTestResult);
            log('info', 'AI analysis lifecycle completed', {
                source: analysis.meta.summarySource,
                llmUsed: analysis.meta.llmUsed,
                model: analysis.meta.llmModel
            });
        } catch (error) {
            log('error', 'AI analysis lifecycle failed', { error: error.message });
            console.error('AI analysis failed:', error);
        }
        lastTestResult.aiAnalysis = analysis;

        // Send final update with network info and AI analysis
        chrome.runtime.sendMessage({
            type: 'speedUpdate',
            ...lastTestResult,
            aiAnalysis: analysis
        }).catch(() => {
            // Silent catch for when popup is closed
        });

        const historyItem = {
            downloadSpeed: speedTest.downloadSpeed,
            uploadSpeed: speedTest.uploadSpeed,
            timestamp: Date.now()
        };

        chrome.storage.local.get(['speedTestHistory'], function (result) {
            const history = result.speedTestHistory || [];
            history.unshift(historyItem);
            // Keep only last 10 items in storage (we'll display last 3)
            const trimmedHistory = history.slice(0, 10);
            chrome.storage.local.set({ speedTestHistory: trimmedHistory });
        });

        return lastTestResult;
    } catch (error) {
        log('error', 'Speed test failed', { error: error.message, stack: error.stack });
        console.error('Speed test failed:', error);
        sendProgress('Test failed: ' + error.message,
            { downloadSpeed: speedTest.downloadSpeed, uploadSpeed: speedTest.uploadSpeed });

        // Send error with whatever info we have
        chrome.runtime.sendMessage({
            type: 'speedUpdate',
            downloadSpeed: speedTest.downloadSpeed || 0,
            uploadSpeed: speedTest.uploadSpeed || 0,
            networkInfo: {
                status: 'error',
                error: error.message
            },
            timestamp: Date.now()
        }).catch(() => { });

        return null;
    }
}

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
    chrome.action.setBadgeText({ text: '0' });
    chrome.storage.sync.get(['testInterval'], function (result) {
        const interval = result.testInterval || '30';
        if (interval !== '0') {
            chrome.alarms.create('initialSpeedTest', { delayInMinutes: 0.1 });
            chrome.alarms.create('nextSpeedTest', { periodInMinutes: parseInt(interval) });
        }
    });
});

// Handle alarms for periodic testing
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'initialSpeedTest' || alarm.name === 'nextSpeedTest') {
        runSpeedTest(true); // Pass true for automated tests
    }
});

// Update message handler to send AI analysis
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'getSpeed') {
        chrome.storage.local.get(['speedTestHistory'], function (result) {
            sendResponse({
                ...lastTestResult,
                history: result.speedTestHistory || [],
                aiAnalysis: lastTestResult.aiAnalysis // Send AI analysis
            });
        });
        return true;
    } else if (request.type === 'runTest') {
        // Start the test and send immediate response
        sendResponse({ status: 'started' });
        // Then run the test
        runSpeedTest();
        return true; // Required for async response
    } else if (request.type === 'updateInterval') {
        chrome.alarms.clear('nextSpeedTest');
        if (request.interval > 0) {
            chrome.alarms.create('nextSpeedTest', { periodInMinutes: parseInt(request.interval) });
        }
        sendResponse({ status: 'updated' });
        return true;
    }
});