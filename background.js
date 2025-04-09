importScripts('speed-test.js');

const speedTest = new self.SpeedTest();

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
function sendProgress(message, speeds) {
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
        uploadSpeed: speeds?.uploadSpeed || 0
    }).catch(() => {
        // Silent catch for when popup is closed
    });
}

// Function to run speed test and update results
async function runSpeedTest() {
    try {
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

        sendProgress('Starting download test...', { downloadSpeed: 0, uploadSpeed: 0 });
        await speedTest.testDownloadSpeed();

        sendProgress('Starting upload test...', 
            { downloadSpeed: speedTest.downloadSpeed, uploadSpeed: 0 });
        await speedTest.testUploadSpeed();

        lastTestResult = {
            downloadSpeed: speedTest.downloadSpeed,
            uploadSpeed: speedTest.uploadSpeed,
            networkInfo: networkInfo,
            timestamp: Date.now()
        };

        // Update badge with final download speed
        updateBadge(speedTest.downloadSpeed / 1000000);

        // Send final update with network info
        chrome.runtime.sendMessage({
            type: 'speedUpdate',
            ...lastTestResult
        }).catch(() => {
            // Silent catch for when popup is closed
        });

        const historyItem = {
            downloadSpeed: speedTest.downloadSpeed,
            uploadSpeed: speedTest.uploadSpeed,
            timestamp: Date.now()
        };
        
        chrome.storage.local.get(['speedTestHistory'], function(result) {
            const history = result.speedTestHistory || [];
            history.unshift(historyItem);
            // Keep only last 10 items in storage (we'll display last 3)
            const trimmedHistory = history.slice(0, 10);
            chrome.storage.local.set({ speedTestHistory: trimmedHistory });
        });

        return lastTestResult;
    } catch (error) {
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
        }).catch(() => {});
        
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
        runSpeedTest();
    }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'getSpeed') {
        sendResponse(lastTestResult);
        chrome.storage.local.get(['speedTestHistory'], function(result) {
            const response = {
                ...lastTestResult,
                history: result.speedTestHistory || []
            };
            sendResponse(response);
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
            chrome.alarms.create('nextSpeedTest', { periodInMinutes: request.interval });
        }
        sendResponse({ status: 'updated' });
        return true;
    }
});